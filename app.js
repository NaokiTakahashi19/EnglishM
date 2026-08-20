const audio = document.querySelector("#audio");
const fileInput = document.querySelector("#file-input");
const fileAction = document.querySelector("#file-action");
const filePickerLabel = document.querySelector("#file-picker-label");
const trackTitle = document.querySelector("#track-title");
const trackDetail = document.querySelector("#track-detail");
const seek = document.querySelector("#seek");
const currentTimeLabel = document.querySelector("#current-time");
const durationLabel = document.querySelector("#duration");
const playButton = document.querySelector("#play-button");
const previousButton = document.querySelector("#previous-button");
const nextButton = document.querySelector("#next-button");
const backButton = document.querySelector("#back-button");
const forwardButton = document.querySelector("#forward-button");
const rateSelect = document.querySelector("#playback-rate");
const repeatButton = document.querySelector("#repeat-button");
const manualNextModeButton = document.querySelector("#manual-next-mode-button");
const autoNextModeButton = document.querySelector("#auto-next-mode-button");
const pauseRatioSelect = document.querySelector("#pause-ratio");
const practiceStatus = document.querySelector("#practice-status");
const transcribeButton = document.querySelector("#transcribe-button");
const transcriptOutput = document.querySelector("#transcript-output");
const saveTranscriptButton = document.querySelector("#save-transcript-button");
const deleteTranscriptButton = document.querySelector("#delete-transcript-button");
const transcriptStatus = document.querySelector("#transcript-status");
const setAButton = document.querySelector("#set-a-button");
const setBButton = document.querySelector("#set-b-button");
const clearLoopButton = document.querySelector("#clear-loop-button");
const loopToggleButton = document.querySelector("#loop-toggle-button");
const pointALabel = document.querySelector("#point-a");
const pointBLabel = document.querySelector("#point-b");
const trackList = document.querySelector("#track-list");
const emptyLibrary = document.querySelector("#empty-library");
const libraryCount = document.querySelector("#library-count");
const statusMessage = document.querySelector("#status-message");
const connectionStatus = document.querySelector("#connection-status");
const installButton = document.querySelector("#install-button");

const SETTINGS_KEY = "listening-desk:settings";
const POSITIONS_KEY = "listening-desk:positions";
const LOOPS_KEY = "listening-desk:loops";
const TRANSCRIPT_DB_NAME = "listening-desk";
const TRANSCRIPT_STORE_NAME = "transcripts";
const AUDIO_EXTENSIONS = /\.(mp3|m4a|aac|wav|ogg|opus|flac)$/i;

let tracks = [];
let currentIndex = -1;
let pendingAutoplay = false;
let deferredInstallPrompt = null;
let wakeLock = null;
let statusTimer = null;
let lastPositionSave = 0;
let practicePauseTimer = null;
let practiceCountdownTimer = null;
let practicePauseUntil = 0;
let isPracticePause = false;
let pendingPracticeNextIndex = -1;
let transcriptionWorker = null;
let transcribingTrackId = null;
let transcriptSaveTimer = null;

const settings = {
  rate: 1,
  repeatOne: false,
  practiceMode: "manual",
  pauseRatio: 1.2,
  ...readStored(SETTINGS_KEY, {}),
};
const positions = readStored(POSITIONS_KEY, {});
const loops = readStored(LOOPS_KEY, {});

rateSelect.value = String(settings.rate);
pauseRatioSelect.value = String(settings.pauseRatio);
audio.playbackRate = settings.rate;
syncConnectionState();
syncControls();
syncPracticeUi();

function readStored(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value && typeof value === "object" ? value : fallback;
  } catch {
    return fallback;
  }
}

function writeStored(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    showStatus("設定をこのブラウザに保存できませんでした。再生は続けられます。", "error");
  }
}

function openTranscriptDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(TRANSCRIPT_DB_NAME, 1);
    request.addEventListener("upgradeneeded", () => {
      if (!request.result.objectStoreNames.contains(TRANSCRIPT_STORE_NAME)) {
        request.result.createObjectStore(TRANSCRIPT_STORE_NAME, { keyPath: "id" });
      }
    });
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
  });
}

async function runTranscriptTransaction(mode, operation) {
  const database = await openTranscriptDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(TRANSCRIPT_STORE_NAME, mode);
    const store = transaction.objectStore(TRANSCRIPT_STORE_NAME);
    const request = operation(store);
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
    transaction.addEventListener("complete", () => database.close());
    transaction.addEventListener("abort", () => database.close());
  });
}

function getStoredTranscript(id) {
  return runTranscriptTransaction("readonly", (store) => store.get(id));
}

function putStoredTranscript(record) {
  return runTranscriptTransaction("readwrite", (store) => store.put(record));
}

function deleteStoredTranscript(id) {
  return runTranscriptTransaction("readwrite", (store) => store.delete(id));
}

function fileId(file) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function isAudioFile(file) {
  return file.type.startsWith("audio/") || AUDIO_EXTENSIONS.test(file.name);
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const remainingSeconds = whole % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`
    : `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function showStatus(message, tone = "info") {
  window.clearTimeout(statusTimer);
  statusMessage.textContent = message;
  statusMessage.dataset.tone = tone;
  statusMessage.dataset.visible = "true";
  statusTimer = window.setTimeout(() => {
    statusMessage.dataset.visible = "false";
  }, tone === "error" ? 6000 : 3200);
}

function setImportState(state) {
  fileAction.dataset.state = state;
  filePickerLabel.dataset.state = state;
  if (state === "loading") filePickerLabel.setAttribute("aria-busy", "true");
  else filePickerLabel.removeAttribute("aria-busy");
  window.setTimeout(() => {
    if (fileAction.dataset.state === state) delete fileAction.dataset.state;
    if (filePickerLabel.dataset.state === state) delete filePickerLabel.dataset.state;
  }, state === "error" ? 3000 : 1200);
}

async function addFiles(fileList) {
  setImportState("loading");
  const candidates = [...fileList].filter(isAudioFile);

  if (candidates.length === 0) {
    setImportState("error");
    showStatus("再生できる音声ファイルが見つかりませんでした。MP3やM4Aを選んでください。", "error");
    return;
  }

  const existingIds = new Set(tracks.map((track) => track.id));
  const added = candidates
    .filter((file) => !existingIds.has(fileId(file)))
    .map((file) => ({
      id: fileId(file),
      file,
      url: URL.createObjectURL(file),
      duration: null,
    }));

  if (added.length === 0) {
    setImportState("error");
    showStatus("選択した音声は、すでに再生リストにあります。", "error");
    return;
  }

  const firstAddedIndex = tracks.length;
  tracks.push(...added);
  renderLibrary();
  added.forEach(readTrackDuration);

  if (currentIndex === -1) selectTrack(firstAddedIndex);

  setImportState("success");
}

function readTrackDuration(track) {
  const probe = new Audio();
  probe.preload = "metadata";
  probe.addEventListener(
    "loadedmetadata",
    () => {
      track.duration = probe.duration;
      renderLibrary();
      probe.removeAttribute("src");
    },
    { once: true },
  );
  probe.addEventListener(
    "error",
    () => {
      track.duration = 0;
      renderLibrary();
    },
    { once: true },
  );
  probe.src = track.url;
}

function selectTrack(index, autoplay = false) {
  if (!tracks[index]) return;
  cancelPracticePause(false);
  saveCurrentPosition();
  audio.pause();
  currentIndex = index;
  pendingAutoplay = autoplay;
  const track = tracks[index];

  audio.src = track.url;
  audio.playbackRate = Number(rateSelect.value);
  audio.load();
  trackTitle.textContent = track.file.name.replace(/\.[^.]+$/, "");
  trackDetail.textContent = `${track.file.name.split(".").pop()?.toUpperCase() || "AUDIO"} · ${formatBytes(track.file.size)}`;
  updateMediaSession(track);
  renderLibrary();
  syncLoopUi();
  syncControls();
  syncPracticeUi();
  loadTranscript(track);
}

function removeTrack(index) {
  const removingCurrent = index === currentIndex;
  const track = tracks[index];
  if (!track) return;

  if (removingCurrent) {
    saveCurrentPosition();
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }

  URL.revokeObjectURL(track.url);
  tracks.splice(index, 1);

  if (tracks.length === 0) {
    currentIndex = -1;
    resetPlayer();
  } else if (removingCurrent) {
    currentIndex = -1;
    selectTrack(Math.min(index, tracks.length - 1));
  } else if (index < currentIndex) {
    currentIndex -= 1;
  }

  renderLibrary();
  syncControls();
}

function resetPlayer() {
  cancelPracticePause(false);
  trackTitle.textContent = "音声を選んでください";
  trackDetail.textContent = "MP3、M4A、WAVなどを複数選べます";
  seek.value = "0";
  seek.max = "0";
  seek.style.setProperty("--progress", "0%");
  currentTimeLabel.textContent = "0:00";
  durationLabel.textContent = "0:00";
  playButton.dataset.playing = "false";
  playButton.setAttribute("aria-label", "再生");
  syncLoopUi();
  syncPracticeUi();
  resetTranscriptPanel();
}

function renderLibrary() {
  trackList.replaceChildren();
  libraryCount.textContent = `${tracks.length}件`;
  emptyLibrary.hidden = tracks.length > 0;

  tracks.forEach((track, index) => {
    const item = document.createElement("li");
    item.className = "track-row";
    item.dataset.current = String(index === currentIndex);

    const selectButton = document.createElement("button");
    selectButton.className = "track-select";
    selectButton.type = "button";
    selectButton.setAttribute("aria-label", `${track.file.name}を再生`);
    if (index === currentIndex) selectButton.setAttribute("aria-current", "true");
    selectButton.addEventListener("click", () => selectTrack(index, true));

    const name = document.createElement("span");
    name.className = "track-select__name";
    name.textContent = track.file.name.replace(/\.[^.]+$/, "");

    const meta = document.createElement("span");
    meta.className = "track-select__meta";
    meta.textContent = track.duration ? formatTime(track.duration) : "長さを確認中";

    selectButton.append(name, meta);

    const removeButton = document.createElement("button");
    removeButton.className = "track-remove";
    removeButton.type = "button";
    removeButton.setAttribute("aria-label", `${track.file.name}をリストから外す`);
    removeButton.innerHTML = `
      <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 12h14" />
      </svg>`;
    removeButton.addEventListener("click", () => removeTrack(index));

    item.append(selectButton, removeButton);
    trackList.append(item);
  });
}

function syncControls() {
  const hasTrack = currentIndex >= 0;
  const controls = [
    playButton,
    previousButton,
    nextButton,
    backButton,
    forwardButton,
    repeatButton,
    setAButton,
    setBButton,
  ];
  controls.forEach((control) => {
    control.disabled = !hasTrack;
  });
  seek.disabled = !hasTrack;

  const loop = currentLoop();
  clearLoopButton.disabled = !hasTrack || (!Number.isFinite(loop.a) && !Number.isFinite(loop.b));
  loopToggleButton.disabled = !hasTrack || !validLoop(loop);

  repeatButton.setAttribute("aria-pressed", String(settings.repeatOne));
  repeatButton.textContent = `1曲リピート：${settings.repeatOne ? "入" : "切"}`;
}

function syncPracticeUi() {
  const mode = settings.practiceMode;
  manualNextModeButton.setAttribute("aria-pressed", String(mode === "manual"));
  autoNextModeButton.setAttribute("aria-pressed", String(mode === "auto"));
  pauseRatioSelect.disabled = mode !== "auto";

  if (isPracticePause) {
    practiceStatus.dataset.state = "paused";
    updatePracticeCountdown();
    return;
  }

  delete practiceStatus.dataset.state;
  if (settings.repeatOne) {
    practiceStatus.textContent = "1曲リピートが入っている間は、同じ音声を繰り返します。";
  } else if (mode === "auto") {
    practiceStatus.textContent = `ファイル終了後、実際の再生時間の${settings.pauseRatio}倍待って次の音声を自動再生します。`;
  } else {
    practiceStatus.textContent = "ファイル終了後、次の音声を選んだ状態で再生ボタンを待ちます。";
  }
}

function setPracticeMode(mode) {
  cancelPracticePause(false);
  settings.practiceMode = mode;
  settings.repeatOne = false;
  writeStored(SETTINGS_KEY, settings);
  syncControls();
  syncPracticeUi();
}

function startAutoNextPause() {
  if (isPracticePause || currentIndex >= tracks.length - 1) return;
  const playedSeconds = audio.duration / Math.max(audio.playbackRate, 0.1);
  const pauseSeconds = Math.max(1, playedSeconds * Number(settings.pauseRatio));
  isPracticePause = true;
  pendingPracticeNextIndex = currentIndex + 1;
  practicePauseUntil = Date.now() + pauseSeconds * 1000;
  updatePracticeCountdown();
  practiceCountdownTimer = window.setInterval(updatePracticeCountdown, 250);
  practicePauseTimer = window.setTimeout(() => {
    const nextIndex = pendingPracticeNextIndex;
    cancelPracticePause(false);
    if (tracks[nextIndex]) selectTrack(nextIndex, true);
  }, pauseSeconds * 1000);
}

function updatePracticeCountdown() {
  const remaining = Math.max(0, Math.ceil((practicePauseUntil - Date.now()) / 1000));
  practiceStatus.dataset.state = "paused";
  practiceStatus.textContent = `リピーティング中 — あと${remaining}秒で次の音声を再生します。`;
}

function cancelPracticePause(updateUi = true) {
  window.clearTimeout(practicePauseTimer);
  window.clearInterval(practiceCountdownTimer);
  practicePauseTimer = null;
  practiceCountdownTimer = null;
  isPracticePause = false;
  pendingPracticeNextIndex = -1;
  if (updateUi) syncPracticeUi();
}

function resetTranscriptPanel() {
  window.clearTimeout(transcriptSaveTimer);
  transcriptOutput.value = "";
  delete transcriptOutput.dataset.state;
  transcriptOutput.disabled = true;
  transcribeButton.disabled = true;
  saveTranscriptButton.disabled = true;
  deleteTranscriptButton.disabled = true;
  delete transcriptStatus.dataset.state;
  transcriptStatus.textContent = "音声を選ぶと、保存済みスクリプトを確認できます。";
}

async function loadTranscript(track) {
  transcriptOutput.value = "";
  transcriptOutput.dataset.state = "loading";
  transcriptOutput.disabled = false;
  transcribeButton.disabled = transcribingTrackId !== null;
  saveTranscriptButton.disabled = true;
  deleteTranscriptButton.disabled = true;
  transcriptStatus.dataset.state = "loading";
  transcriptStatus.textContent = "保存済みスクリプトを確認しています。";

  try {
    const record = await getStoredTranscript(track.id);
    if (currentTrack()?.id !== track.id) return;
    if (record?.text) {
      transcriptOutput.value = record.text;
      transcriptOutput.dataset.state = "success";
      saveTranscriptButton.disabled = false;
      deleteTranscriptButton.disabled = false;
      transcriptStatus.dataset.state = "success";
      transcriptStatus.textContent = "この音声の保存済みスクリプトを表示しています。";
    } else {
      delete transcriptOutput.dataset.state;
      delete transcriptStatus.dataset.state;
      transcriptStatus.textContent = "まだスクリプトはありません。初回生成時は約100MBの認識モデルを取得します。";
    }
  } catch {
    if (currentTrack()?.id !== track.id) return;
    transcriptOutput.dataset.state = "error";
    transcriptStatus.dataset.state = "error";
    transcriptStatus.textContent = "保存領域を読み込めませんでした。ブラウザのプライベートモードを解除してください。";
  }
}

function getTranscriptionWorker() {
  if (transcriptionWorker) return transcriptionWorker;
  transcriptionWorker = new Worker("./transcription-worker.js", { type: "module" });
  transcriptionWorker.addEventListener("message", handleTranscriptionMessage);
  transcriptionWorker.addEventListener("error", () => {
    finishTranscriptionWithError("文字起こし処理を開始できませんでした。通信状態を確認してください。");
  });
  return transcriptionWorker;
}

async function decodeForTranscription(file) {
  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  const OfflineAudioContextConstructor = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!AudioContextConstructor || !OfflineAudioContextConstructor) {
    throw new Error("Web Audio is not supported");
  }

  const context = new AudioContextConstructor();
  try {
    const sourceBuffer = await context.decodeAudioData(await file.arrayBuffer());
    const sampleRate = 16000;
    const frameCount = Math.ceil(sourceBuffer.duration * sampleRate);
    const offlineContext = new OfflineAudioContextConstructor(1, frameCount, sampleRate);
    const source = offlineContext.createBufferSource();
    source.buffer = sourceBuffer;
    source.connect(offlineContext.destination);
    source.start(0);
    const rendered = await offlineContext.startRendering();
    return rendered.getChannelData(0).slice();
  } finally {
    await context.close();
  }
}

async function startTranscription() {
  const track = currentTrack();
  if (!track || transcribingTrackId) return;

  transcribingTrackId = track.id;
  transcribeButton.disabled = true;
  transcribeButton.dataset.state = "loading";
  transcribeButton.setAttribute("aria-busy", "true");
  transcriptOutput.dataset.state = "loading";
  transcriptStatus.dataset.state = "loading";
  transcriptStatus.textContent = "音声を認識用データへ変換しています。";

  try {
    const audioData = await decodeForTranscription(track.file);
    if (audioData.length > 16000 * 60 * 30) {
      throw new Error("Audio is longer than 30 minutes");
    }
    transcriptStatus.textContent = "英語認識モデルを準備しています。初回は時間がかかります。";
    getTranscriptionWorker().postMessage(
      { type: "transcribe", id: track.id, audio: audioData.buffer },
      [audioData.buffer],
    );
  } catch (error) {
    console.error("Audio preparation failed:", error);
    const message = error?.message === "Audio is longer than 30 minutes"
      ? "30分を超える音声は、短く分けてから生成してください。"
      : "音声を文字起こし用に変換できませんでした。別の音声形式を試してください。";
    finishTranscriptionWithError(message);
  }
}

async function handleTranscriptionMessage(event) {
  const message = event.data;
  if (message.type === "progress") {
    const rawProgress = Number(message.progress);
    const percent = Number.isFinite(rawProgress)
      ? Math.round(rawProgress <= 1 ? rawProgress * 100 : rawProgress)
      : null;
    transcriptStatus.dataset.state = "loading";
    transcriptStatus.textContent = percent === null
      ? "英語認識モデルを読み込んでいます。"
      : `英語認識モデルを読み込んでいます — ${percent}%`;
    return;
  }

  if (message.type === "device") {
    transcriptStatus.dataset.state = "loading";
    transcriptStatus.textContent = message.device === "webgpu"
      ? "端末のGPUで英文を生成しています。"
      : "互換モードで英文を生成しています。しばらくお待ちください。";
    return;
  }

  if (message.type === "error") {
    console.error("Transcription worker error:", message.message);
    finishTranscriptionWithError("英文を生成できませんでした。通信状態と端末の空き容量を確認してください。");
    return;
  }

  if (message.type !== "result") return;
  const text = String(message.text || "").trim();
  if (!text) {
    finishTranscriptionWithError("英語を検出できませんでした。音量を確認してもう一度試してください。");
    return;
  }

  const track = tracks.find((candidate) => candidate.id === message.id);
  try {
    await putStoredTranscript({
      id: message.id,
      text,
      source: "whisper-tiny.en",
      updatedAt: new Date().toISOString(),
    });
    if (currentTrack()?.id === message.id) {
      transcriptOutput.value = text;
      transcriptOutput.dataset.state = "success";
      saveTranscriptButton.disabled = false;
      deleteTranscriptButton.disabled = false;
      transcriptStatus.dataset.state = "success";
      transcriptStatus.textContent = "英文を生成し、このブラウザに保存しました。必要なら修正できます。";
    } else if (track) {
      showStatus(`${track.file.name}の英語スクリプトを保存しました。`);
    }
  } catch {
    if (currentTrack()?.id === message.id) {
      transcriptOutput.value = text;
      transcriptOutput.dataset.state = "error";
      transcriptStatus.dataset.state = "error";
      transcriptStatus.textContent = "英文は生成できましたが、保存できませんでした。ブラウザの空き容量を確認してください。";
    }
  } finally {
    finishTranscription();
  }
}

function finishTranscription() {
  transcribingTrackId = null;
  transcribeButton.disabled = !currentTrack();
  delete transcribeButton.dataset.state;
  transcribeButton.removeAttribute("aria-busy");
}

function finishTranscriptionWithError(message) {
  finishTranscription();
  transcriptOutput.dataset.state = "error";
  transcriptStatus.dataset.state = "error";
  transcriptStatus.textContent = message;
}

async function saveTranscript() {
  const track = currentTrack();
  const text = transcriptOutput.value.trim();
  if (!track || !text) return;
  try {
    await putStoredTranscript({
      id: track.id,
      text,
      source: "edited",
      updatedAt: new Date().toISOString(),
    });
    saveTranscriptButton.dataset.state = "success";
    transcriptOutput.dataset.state = "success";
    deleteTranscriptButton.disabled = false;
    transcriptStatus.dataset.state = "success";
    transcriptStatus.textContent = "修正したスクリプトを保存しました。";
    window.setTimeout(() => delete saveTranscriptButton.dataset.state, 1200);
  } catch {
    transcriptOutput.dataset.state = "error";
    transcriptStatus.dataset.state = "error";
    transcriptStatus.textContent = "スクリプトを保存できませんでした。ブラウザの空き容量を確認してください。";
  }
}

async function removeStoredTranscript() {
  const track = currentTrack();
  if (!track) return;
  try {
    await deleteStoredTranscript(track.id);
    transcriptOutput.value = "";
    delete transcriptOutput.dataset.state;
    saveTranscriptButton.disabled = true;
    deleteTranscriptButton.disabled = true;
    delete transcriptStatus.dataset.state;
    transcriptStatus.textContent = "保存済みスクリプトを削除しました。音声から再生成できます。";
  } catch {
    transcriptOutput.dataset.state = "error";
    transcriptStatus.dataset.state = "error";
    transcriptStatus.textContent = "保存済みスクリプトを削除できませんでした。";
  }
}

function currentTrack() {
  return tracks[currentIndex] || null;
}

function currentLoop() {
  const track = currentTrack();
  return track ? loops[track.id] || {} : {};
}

function validLoop(loop) {
  return Number.isFinite(loop.a) && Number.isFinite(loop.b) && loop.b > loop.a + 0.2;
}

function syncLoopUi() {
  const loop = currentLoop();
  pointALabel.textContent = Number.isFinite(loop.a) ? formatTime(loop.a) : "—";
  pointBLabel.textContent = Number.isFinite(loop.b) ? formatTime(loop.b) : "—";
  setAButton.dataset.set = String(Number.isFinite(loop.a));
  setBButton.dataset.set = String(Number.isFinite(loop.b));
  const enabled = validLoop(loop) && loop.enabled === true;
  loopToggleButton.setAttribute("aria-pressed", String(enabled));
  loopToggleButton.textContent = `区間リピート：${enabled ? "入" : "切"}`;
  syncControls();
}

function setLoopPoint(point) {
  const track = currentTrack();
  if (!track || !Number.isFinite(audio.duration)) return;
  const loop = loops[track.id] || {};

  if (point === "b" && Number.isFinite(loop.a) && audio.currentTime <= loop.a + 0.2) {
    showStatus("B点はA点より後ろの位置で設定してください。", "error");
    return;
  }

  loop[point] = audio.currentTime;
  if (point === "a" && Number.isFinite(loop.b) && loop.b <= loop.a + 0.2) {
    delete loop.b;
    loop.enabled = false;
  }
  loops[track.id] = loop;
  writeStored(LOOPS_KEY, loops);
  syncLoopUi();
}

function clearLoop() {
  const track = currentTrack();
  if (!track) return;
  delete loops[track.id];
  writeStored(LOOPS_KEY, loops);
  syncLoopUi();
}

function toggleLoop() {
  const track = currentTrack();
  const loop = currentLoop();
  if (!track || !validLoop(loop)) return;
  loop.enabled = !loop.enabled;
  loops[track.id] = loop;
  writeStored(LOOPS_KEY, loops);
  if (loop.enabled && (audio.currentTime < loop.a || audio.currentTime >= loop.b)) {
    audio.currentTime = loop.a;
  }
  syncLoopUi();
}

async function togglePlayback() {
  if (!currentTrack()) return;
  if (audio.paused) {
    if (isPracticePause && pendingPracticeNextIndex >= 0) {
      const nextIndex = pendingPracticeNextIndex;
      cancelPracticePause(false);
      selectTrack(nextIndex, true);
      return;
    }
    cancelPracticePause();
    try {
      await audio.play();
    } catch {
      showStatus("音声を再生できませんでした。別のファイル形式を試してください。", "error");
    }
  } else {
    cancelPracticePause();
    audio.pause();
  }
}

function skipBy(seconds) {
  if (!currentTrack() || !Number.isFinite(audio.duration)) return;
  audio.currentTime = Math.min(audio.duration, Math.max(0, audio.currentTime + seconds));
}

function goToPrevious() {
  if (!currentTrack()) return;
  if (audio.currentTime > 3 || currentIndex === 0) {
    audio.currentTime = 0;
    return;
  }
  selectTrack(currentIndex - 1, !audio.paused);
}

function goToNext(autoplay = !audio.paused) {
  if (currentIndex < tracks.length - 1) selectTrack(currentIndex + 1, autoplay);
  else if (tracks.length > 0) selectTrack(0, autoplay);
}

function updateTimeline() {
  const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
  seek.max = String(duration);
  seek.value = String(Math.min(audio.currentTime, duration));
  const progress = duration > 0 ? (audio.currentTime / duration) * 100 : 0;
  seek.style.setProperty("--progress", `${progress}%`);
  currentTimeLabel.textContent = formatTime(audio.currentTime);
  durationLabel.textContent = formatTime(duration);

  const loop = currentLoop();
  if (loop.enabled && validLoop(loop) && audio.currentTime >= loop.b - 0.04) {
    audio.currentTime = loop.a;
  }

  if (Date.now() - lastPositionSave > 3000) {
    saveCurrentPosition();
    lastPositionSave = Date.now();
  }
}

function saveCurrentPosition() {
  const track = currentTrack();
  if (!track || !Number.isFinite(audio.currentTime)) return;
  positions[track.id] = Math.max(0, audio.currentTime);
  const keys = Object.keys(positions);
  if (keys.length > 40) delete positions[keys[0]];
  writeStored(POSITIONS_KEY, positions);
}

function updateMediaSession(track) {
  if (!("mediaSession" in navigator) || !("MediaMetadata" in window)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.file.name.replace(/\.[^.]+$/, ""),
    artist: "Listening Desk",
    album: "英語学習",
    artwork: [
      { src: new URL("./icons/app-icon-192.png", location.href).href, sizes: "192x192", type: "image/png" },
      { src: new URL("./icons/app-icon-512.png", location.href).href, sizes: "512x512", type: "image/png" },
    ],
  });
}

async function requestWakeLock() {
  if (!("wakeLock" in navigator) || document.visibilityState !== "visible") return;
  try {
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLock.addEventListener("release", () => {
      wakeLock = null;
    });
  } catch {
    wakeLock = null;
  }
}

async function releaseWakeLock() {
  if (!wakeLock) return;
  await wakeLock.release();
  wakeLock = null;
}

function syncConnectionState() {
  connectionStatus.textContent = navigator.onLine ? "オンライン" : "オフラインで利用中";
}

fileInput.addEventListener("change", async (event) => {
  await addFiles(event.target.files);
  event.target.value = "";
});

playButton.addEventListener("click", togglePlayback);
previousButton.addEventListener("click", goToPrevious);
nextButton.addEventListener("click", () => goToNext());
backButton.addEventListener("click", () => skipBy(-10));
forwardButton.addEventListener("click", () => skipBy(5));
setAButton.addEventListener("click", () => setLoopPoint("a"));
setBButton.addEventListener("click", () => setLoopPoint("b"));
clearLoopButton.addEventListener("click", clearLoop);
loopToggleButton.addEventListener("click", toggleLoop);
manualNextModeButton.addEventListener("click", () => setPracticeMode("manual"));
autoNextModeButton.addEventListener("click", () => setPracticeMode("auto"));

pauseRatioSelect.addEventListener("change", () => {
  settings.pauseRatio = Number(pauseRatioSelect.value);
  writeStored(SETTINGS_KEY, settings);
  if (isPracticePause) {
    cancelPracticePause();
  }
  syncPracticeUi();
});

transcribeButton.addEventListener("click", startTranscription);
saveTranscriptButton.addEventListener("click", saveTranscript);
deleteTranscriptButton.addEventListener("click", removeStoredTranscript);
transcriptOutput.addEventListener("input", () => {
  delete transcriptOutput.dataset.state;
  saveTranscriptButton.disabled = transcriptOutput.value.trim().length === 0;
});

repeatButton.addEventListener("click", () => {
  settings.repeatOne = !settings.repeatOne;
  cancelPracticePause(false);
  writeStored(SETTINGS_KEY, settings);
  syncControls();
  syncPracticeUi();
});

rateSelect.addEventListener("change", () => {
  settings.rate = Number(rateSelect.value);
  audio.playbackRate = settings.rate;
  writeStored(SETTINGS_KEY, settings);
});

seek.addEventListener("input", () => {
  if (Number.isFinite(audio.duration)) audio.currentTime = Number(seek.value);
});

audio.addEventListener("loadedmetadata", () => {
  const track = currentTrack();
  if (!track) return;
  track.duration = audio.duration;
  const savedPosition = Number(positions[track.id]);
  if (Number.isFinite(savedPosition) && savedPosition < audio.duration - 2) {
    audio.currentTime = savedPosition;
  }
  updateTimeline();
  renderLibrary();
  if (pendingAutoplay) {
    pendingAutoplay = false;
    togglePlayback();
  }
});

audio.addEventListener("timeupdate", updateTimeline);
audio.addEventListener("durationchange", updateTimeline);
audio.addEventListener("ratechange", () => {
  if (audio.playbackRate !== settings.rate) audio.playbackRate = settings.rate;
});

audio.addEventListener("play", () => {
  playButton.dataset.playing = "true";
  playButton.setAttribute("aria-label", "一時停止");
  if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "playing";
  requestWakeLock();
  syncPracticeUi();
});

audio.addEventListener("pause", () => {
  playButton.dataset.playing = "false";
  playButton.setAttribute("aria-label", "再生");
  if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused";
  saveCurrentPosition();
  releaseWakeLock();
});

audio.addEventListener("ended", () => {
  cancelPracticePause(false);
  if (settings.repeatOne) {
    audio.currentTime = 0;
    audio.play();
  } else if (currentIndex >= tracks.length - 1) {
    practiceStatus.dataset.state = "paused";
    practiceStatus.textContent = "再生リストの最後まで終わりました。";
  } else if (settings.practiceMode === "manual") {
    selectTrack(currentIndex + 1, false);
    practiceStatus.dataset.state = "paused";
    practiceStatus.textContent = "次の音声を選びました。再生ボタンを押すまで待機します。";
  } else {
    startAutoNextPause();
  }
});

audio.addEventListener("error", () => {
  showStatus("この音声を読み込めませんでした。対応形式か、ファイルが壊れていないか確認してください。", "error");
});

document.addEventListener("keydown", (event) => {
  const target = event.target;
  const isTyping = target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement;
  if (isTyping || event.metaKey || event.ctrlKey || event.altKey) return;

  if (event.code === "Space") {
    event.preventDefault();
    togglePlayback();
  } else if (event.key === "ArrowLeft") {
    event.preventDefault();
    skipBy(-10);
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    skipBy(5);
  } else if (event.key.toLowerCase() === "a") {
    setLoopPoint("a");
  } else if (event.key.toLowerCase() === "b") {
    setLoopPoint("b");
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && !audio.paused) requestWakeLock();
});

window.addEventListener("beforeunload", () => {
  cancelPracticePause(false);
  saveCurrentPosition();
  tracks.forEach((track) => URL.revokeObjectURL(track.url));
});
window.addEventListener("online", syncConnectionState);
window.addEventListener("offline", syncConnectionState);

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  installButton.hidden = false;
});

installButton.addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  installButton.dataset.state = "loading";
  await deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  installButton.hidden = true;
  delete installButton.dataset.state;
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  installButton.hidden = true;
  showStatus("ホーム画面に追加しました。オフラインでも起動できます。");
});

if ("mediaSession" in navigator) {
  const handlers = {
    play: togglePlayback,
    pause: () => audio.pause(),
    seekbackward: (details) => skipBy(-(details.seekOffset || 10)),
    seekforward: (details) => skipBy(details.seekOffset || 5),
    previoustrack: goToPrevious,
    nexttrack: () => goToNext(true),
    seekto: (details) => {
      if (Number.isFinite(details.seekTime)) audio.currentTime = details.seekTime;
    },
  };

  Object.entries(handlers).forEach(([action, handler]) => {
    try {
      navigator.mediaSession.setActionHandler(action, handler);
    } catch {
      // Unsupported Media Session actions are safe to ignore.
    }
  });
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      await navigator.serviceWorker.register("./sw.js", { scope: "./" });
    } catch {
      showStatus("オフライン機能を準備できませんでした。HTTPSまたはlocalhostで開いてください。", "error");
    }
  });
}

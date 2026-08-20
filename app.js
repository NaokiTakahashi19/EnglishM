const audio = document.querySelector("#audio");
const fileInput = document.querySelector("#file-input");
const fileAction = document.querySelector("#file-action");
const filePickerLabel = document.querySelector("#file-picker-label");
const seek = document.querySelector("#seek");
const currentTimeLabel = document.querySelector("#current-time");
const durationLabel = document.querySelector("#duration");
const playButton = document.querySelector("#play-button");
const previousButton = document.querySelector("#previous-button");
const nextButton = document.querySelector("#next-button");
const backButton = document.querySelector("#back-button");
const forwardButton = document.querySelector("#forward-button");
const rateSelect = document.querySelector("#playback-rate");
const playbackModeSelect = document.querySelector("#playback-mode");
const repeatCountGroup = document.querySelector("#repeat-count-group");
const repeatCountInput = document.querySelector("#repeat-count");
const playbackSettingsStatus = document.querySelector("#playback-settings-status");
const playbackSettingsButton = document.querySelector("#playback-settings-button");
const playbackSettingsDialog = document.querySelector("#playback-settings-dialog");
const playbackSettingsClose = document.querySelector("#playback-settings-close");
const manualNextModeButton = document.querySelector("#manual-next-mode-button");
const autoNextModeButton = document.querySelector("#auto-next-mode-button");
const pauseRatioSelect = document.querySelector("#pause-ratio");
const practiceStatus = document.querySelector("#practice-status");
const practiceSettingsButton = document.querySelector("#practice-settings-button");
const practiceSettingsDialog = document.querySelector("#practice-settings-dialog");
const practiceSettingsClose = document.querySelector("#practice-settings-close");
const transcribeButton = document.querySelector("#transcribe-button");
const transcriptOutput = document.querySelector("#transcript-output");
const transcriptContent = document.querySelector("#transcript-content");
const transcriptDisplayStatus = document.querySelector("#transcript-display-status");
const transcriptSettingsButton = document.querySelector("#transcript-settings-button");
const transcriptSettingsDialog = document.querySelector("#transcript-settings-dialog");
const transcriptSettingsClose = document.querySelector("#transcript-settings-close");
const transcriptDisplayModeSelect = document.querySelector("#transcript-display-mode");
const transcriptShowFromGroup = document.querySelector("#transcript-show-from-group");
const transcriptShowFromInput = document.querySelector("#transcript-show-from");
const saveTranscriptButton = document.querySelector("#save-transcript-button");
const deleteTranscriptButton = document.querySelector("#delete-transcript-button");
const transcriptStatus = document.querySelector("#transcript-status");
const syncScript = document.querySelector("#sync-script");
const syncTranscript = document.querySelector("#sync-transcript");
const translationPanel = document.querySelector("#translation-panel");
const translationOutput = document.querySelector("#translation-output");
const translationStatus = document.querySelector("#translation-status");
const translateButton = document.querySelector("#translate-button");
const translationSettingsButton = document.querySelector("#translation-settings-button");
const translationSettingsDialog = document.querySelector("#translation-settings-dialog");
const translationSettingsForm = document.querySelector("#translation-settings-form");
const translationSettingsClose = document.querySelector("#translation-settings-close");
const translationAccessKeyInput = document.querySelector("#translation-access-key");
const wordDialog = document.querySelector("#word-dialog");
const wordDialogTitle = document.querySelector("#word-dialog-title");
const wordDialogTranslation = document.querySelector("#word-dialog-translation");
const playWordButton = document.querySelector("#play-word-button");
const setAButton = document.querySelector("#set-a-button");
const setBButton = document.querySelector("#set-b-button");
const clearLoopButton = document.querySelector("#clear-loop-button");
const loopToggleButton = document.querySelector("#loop-toggle-button");
const pointALabel = document.querySelector("#point-a");
const pointBLabel = document.querySelector("#point-b");
const loopStatus = document.querySelector("#loop-status");
const loopSettingsButton = document.querySelector("#loop-settings-button");
const loopSettingsDialog = document.querySelector("#loop-settings-dialog");
const loopSettingsClose = document.querySelector("#loop-settings-close");
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
const TRANSLATION_ACCESS_KEY = "listening-desk:translation-access-key";
const TRANSLATION_API_URL = window.location.hostname.endsWith(".vercel.app")
  ? new URL("/api/translate", window.location.origin).href
  : "https://english-m.vercel.app/api/translate";
const TRANSCRIPTION_API_URL = window.location.hostname.endsWith(".vercel.app")
  ? new URL("/api/transcribe", window.location.origin).href
  : "https://english-m.vercel.app/api/transcribe";
const AUDIO_EXTENSIONS = /\.(mp3|m4a|aac|wav|ogg|opus|flac)$/i;
const TRANSCRIPTION_EXTENSIONS = /\.(mp3|mp4|mpeg|mpga|m4a|wav|webm)$/i;
const MAX_TRANSCRIPTION_FILE_BYTES = 4 * 1024 * 1024;

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
let pendingPracticeTargetIndex = -1;
let completedPlaysForCurrentTrack = 0;
let transcribingTrackId = null;
let translatingTrackId = null;
const translatingWordKeys = new Set();
let transcriptSaveTimer = null;
let activeTranscriptRecord = null;
let syncWordButtons = [];
let activeSyncWordIndex = -1;
let selectedWord = null;

const storedSettings = readStored(SETTINGS_KEY, {});
const settings = {
  rate: 1,
  playbackMode: "sequence",
  repeatCount: 3,
  practiceMode: "manual",
  pauseRatio: 1.2,
  transcriptVisible: true,
  transcriptShowFrom: 1,
  ...storedSettings,
};
if (!["sequence", "count", "infinite"].includes(settings.playbackMode)) {
  settings.playbackMode = storedSettings.repeatOne ? "infinite" : "sequence";
}
settings.repeatCount = Math.min(99, Math.max(2, Math.round(Number(settings.repeatCount) || 3)));
settings.transcriptShowFrom = Math.min(99, Math.max(1, Math.round(Number(settings.transcriptShowFrom) || 1)));
delete settings.repeatOne;
const positions = readStored(POSITIONS_KEY, {});
const loops = readStored(LOOPS_KEY, {});

rateSelect.value = String(settings.rate);
playbackModeSelect.value = settings.playbackMode;
repeatCountInput.value = String(settings.repeatCount);
pauseRatioSelect.value = String(settings.pauseRatio);
audio.playbackRate = settings.rate;
syncConnectionState();
syncControls();
syncPracticeUi();
syncTranscriptVisibility();

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

function getTranslationAccessKey() {
  try {
    return localStorage.getItem(TRANSLATION_ACCESS_KEY)?.trim() || "";
  } catch {
    return "";
  }
}

function openTranslationSettings() {
  translationAccessKeyInput.value = getTranslationAccessKey();
  if (typeof translationSettingsDialog.showModal === "function") {
    if (!translationSettingsDialog.open) translationSettingsDialog.showModal();
  } else {
    translationSettingsDialog.setAttribute("open", "");
  }
  window.setTimeout(() => translationAccessKeyInput.focus(), 0);
}

function openSettingsDialog(dialog, preferredFocus) {
  if (typeof dialog.showModal === "function") {
    if (!dialog.open) dialog.showModal();
  } else {
    dialog.setAttribute("open", "");
  }
  window.setTimeout(() => {
    if (preferredFocus && !preferredFocus.disabled) preferredFocus.focus();
    else dialog.focus();
  }, 0);
}

function closeSettingsOnBackdrop(dialog) {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
}

function shouldShowTranscript(transcriptVisible, hasTrack, completedPlays, showFrom) {
  return transcriptVisible && hasTrack && completedPlays + 1 >= showFrom;
}

function syncTranscriptVisibility() {
  const enabled = settings.transcriptVisible !== false;
  const currentPlayNumber = completedPlaysForCurrentTrack + 1;
  const hasTrack = currentIndex >= 0;
  const visible = shouldShowTranscript(enabled, hasTrack, completedPlaysForCurrentTrack, settings.transcriptShowFrom);
  transcriptContent.hidden = !visible;
  transcriptDisplayModeSelect.value = enabled ? "show" : "hide";
  transcriptShowFromInput.value = String(settings.transcriptShowFrom);
  transcriptShowFromGroup.hidden = !enabled;
  transcriptShowFromInput.disabled = !enabled;

  if (!enabled) {
    transcriptDisplayStatus.textContent = "非表示";
  } else if (settings.playbackMode === "sequence" && settings.transcriptShowFrom > 1) {
    transcriptDisplayStatus.textContent = `表示：${settings.transcriptShowFrom}回目以降・繰り返しなし`;
  } else if (settings.playbackMode === "count" && settings.transcriptShowFrom > settings.repeatCount) {
    transcriptDisplayStatus.textContent = `表示：${settings.transcriptShowFrom}回目以降・再生${settings.repeatCount}回`;
  } else if (hasTrack && !visible) {
    transcriptDisplayStatus.textContent = `表示：${settings.transcriptShowFrom}回目以降・現在${currentPlayNumber}回目`;
  } else {
    transcriptDisplayStatus.textContent = `表示：${settings.transcriptShowFrom}回目以降`;
  }

  if (visible && activeSyncWordIndex >= 0) {
    window.requestAnimationFrame(() => keepActiveWordVisible(syncWordButtons[activeSyncWordIndex]));
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
  if (wordDialog.open) wordDialog.close();
  cancelPracticePause(false);
  saveCurrentPosition();
  audio.pause();
  currentIndex = index;
  completedPlaysForCurrentTrack = 0;
  pendingAutoplay = autoplay;
  const track = tracks[index];

  audio.src = track.url;
  audio.playbackRate = Number(rateSelect.value);
  audio.load();
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

  const currentRow = trackList.querySelector('.track-row[data-current="true"]');
  if (currentRow) window.requestAnimationFrame(() => keepCurrentTrackVisible(currentRow));
}

function keepCurrentTrackVisible(currentRow) {
  if (!currentRow || trackList.clientHeight === 0) return;
  const listRect = trackList.getBoundingClientRect();
  const rowRect = currentRow.getBoundingClientRect();
  const inset = 4;
  if (rowRect.top >= listRect.top + inset && rowRect.bottom <= listRect.bottom - inset) return;
  const offset = rowRect.top - listRect.top - (trackList.clientHeight - rowRect.height) / 2;
  trackList.scrollBy({
    top: offset,
    behavior: "auto",
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

  playbackModeSelect.value = settings.playbackMode;
  repeatCountInput.value = String(settings.repeatCount);
  repeatCountGroup.hidden = settings.playbackMode !== "count";
  repeatCountInput.disabled = settings.playbackMode !== "count";
  syncPlaybackSettingsUi();
}

function syncPlaybackSettingsUi() {
  const rateLabel = rateSelect.selectedOptions[0]?.textContent || `${settings.rate.toFixed(2)}×`;
  let modeLabel = "順番に次の音声へ";
  if (settings.playbackMode === "count") {
    modeLabel = `各音声${settings.repeatCount}回 → 次へ`;
  } else if (settings.playbackMode === "infinite") {
    modeLabel = "同じ音声を無限リピート";
  }
  playbackSettingsStatus.textContent = `${rateLabel}・${modeLabel}`;
  syncTranscriptVisibility();
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
  const countProgress = completedPlaysForCurrentTrack > 0
    ? ` 次は${Math.min(completedPlaysForCurrentTrack + 1, settings.repeatCount)}/${settings.repeatCount}回目です。`
    : "";
  if (mode === "auto" && settings.playbackMode === "infinite") {
    practiceStatus.textContent = `終了後、再生時間の${settings.pauseRatio}倍待って同じ音声を再生します。`;
  } else if (mode === "auto" && settings.playbackMode === "count") {
    practiceStatus.textContent = `各音声を${settings.repeatCount}回ずつ、間を空けて再生してから次へ進みます。${countProgress}`;
  } else if (mode === "auto") {
    practiceStatus.textContent = `終了後、再生時間の${settings.pauseRatio}倍待って次の音声を自動再生します。`;
  } else if (settings.playbackMode === "infinite") {
    practiceStatus.textContent = "終了後、再生ボタンを押すまで待ち、同じ音声を再生します。";
  } else if (settings.playbackMode === "count") {
    practiceStatus.textContent = `各音声を${settings.repeatCount}回ずつ再生してから次へ進みます。再生の間はボタンを押すまで待ちます。${countProgress}`;
  } else {
    practiceStatus.textContent = "ファイル終了後、次の音声を選んだ状態で再生ボタンを待ちます。";
  }
}

function setPracticeMode(mode) {
  cancelPracticePause(false);
  settings.practiceMode = mode;
  writeStored(SETTINGS_KEY, settings);
  syncControls();
  syncPracticeUi();
}

function startAutoNextPause(targetIndex) {
  if (isPracticePause || !tracks[targetIndex]) return;
  const playedSeconds = audio.duration / Math.max(audio.playbackRate, 0.1);
  const pauseSeconds = Math.max(1, playedSeconds * Number(settings.pauseRatio));
  isPracticePause = true;
  pendingPracticeTargetIndex = targetIndex;
  practicePauseUntil = Date.now() + pauseSeconds * 1000;
  updatePracticeCountdown();
  practiceCountdownTimer = window.setInterval(updatePracticeCountdown, 250);
  practicePauseTimer = window.setTimeout(() => {
    const nextIndex = pendingPracticeTargetIndex;
    cancelPracticePause(false);
    activatePracticeTarget(nextIndex, true);
  }, pauseSeconds * 1000);
}

function updatePracticeCountdown() {
  const remaining = Math.max(0, Math.ceil((practicePauseUntil - Date.now()) / 1000));
  const target = pendingPracticeTargetIndex === currentIndex ? "同じ音声" : "次の音声";
  practiceStatus.dataset.state = "paused";
  practiceStatus.textContent = `リピーティング中 — あと${remaining}秒で${target}を再生します。`;
}

function cancelPracticePause(updateUi = true) {
  window.clearTimeout(practicePauseTimer);
  window.clearInterval(practiceCountdownTimer);
  practicePauseTimer = null;
  practiceCountdownTimer = null;
  isPracticePause = false;
  pendingPracticeTargetIndex = -1;
  if (updateUi) syncPracticeUi();
}

function normalizeTimedWords(words) {
  if (!Array.isArray(words)) return [];
  return words
    .map((word) => {
      const rawStart = word.start ?? word.timestamp?.[0];
      const rawEnd = word.end ?? word.timestamp?.[1];
      return {
        text: String(word.text || "").trim(),
        start: rawStart == null ? Number.NaN : Number(rawStart),
        end: rawEnd == null ? Number.NaN : Number(rawEnd),
      };
    })
    .filter((word) => word.text && Number.isFinite(word.start));
}

function wordCacheKey(text) {
  return text.toLocaleLowerCase("en").replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, "") || text;
}

function renderSynchronizedTranscript(words) {
  const normalizedWords = normalizeTimedWords(words);
  syncTranscript.replaceChildren();
  syncWordButtons = [];
  activeSyncWordIndex = -1;
  syncScript.hidden = normalizedWords.length === 0;
  if (normalizedWords.length === 0) return;

  normalizedWords.forEach((word, index) => {
    const button = document.createElement("button");
    button.className = "sync-word";
    button.type = "button";
    button.textContent = word.text;
    button.dataset.start = String(word.start);
    if (Number.isFinite(word.end)) button.dataset.end = String(word.end);
    button.setAttribute("aria-label", `${word.text}、${formatTime(word.start)}から`);
    button.addEventListener("click", () => handleSynchronizedWord(word, button));
    syncWordButtons.push(button);
    syncTranscript.append(button);
  });
  updateTranscriptHighlight();
}

function renderTranslation(text) {
  const translation = String(text || "").trim();
  translationOutput.textContent = translation;
  translationPanel.hidden = !activeTranscriptRecord?.text;
  translateButton.disabled = !activeTranscriptRecord?.text || translatingTrackId !== null;
  translateButton.textContent = translation ? "日本語訳を再生成" : "日本語訳を生成";
  if (translation) {
    translationStatus.textContent = "日本語訳もこのブラウザに保存されています。";
    delete translationStatus.dataset.state;
  } else if (activeTranscriptRecord?.text && !getTranslationAccessKey()) {
    translationStatus.textContent = "OpenAI APIを使うには、最初にAPI設定から共通アクセスキーを保存してください。";
    delete translationStatus.dataset.state;
  } else {
    translationStatus.textContent = activeTranscriptRecord?.text
      ? "日本語訳はOpenAI APIで生成します。"
      : "";
    delete translationStatus.dataset.state;
  }
}

function updateTranscriptHighlight() {
  const words = normalizeTimedWords(activeTranscriptRecord?.words);
  if (words.length === 0 || syncWordButtons.length !== words.length) return;
  const time = audio.currentTime;
  let nextIndex = -1;
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    const nextStart = words[index + 1]?.start ?? Number.POSITIVE_INFINITY;
    const end = Number.isFinite(word.end) ? Math.max(word.end, word.start + 0.05) : nextStart;
    if (time >= word.start && time < Math.min(end, nextStart)) {
      nextIndex = index;
      break;
    }
  }
  if (nextIndex === activeSyncWordIndex) return;
  if (activeSyncWordIndex >= 0) {
    syncWordButtons[activeSyncWordIndex]?.removeAttribute("data-active");
    syncWordButtons[activeSyncWordIndex]?.removeAttribute("aria-current");
  }
  activeSyncWordIndex = nextIndex;
  if (nextIndex >= 0) {
    const activeButton = syncWordButtons[nextIndex];
    activeButton.dataset.active = "true";
    activeButton.setAttribute("aria-current", "true");
    keepActiveWordVisible(activeButton);
  }
}

function keepActiveWordVisible(activeButton) {
  if (!activeButton || syncTranscript.clientHeight === 0) return;
  const containerRect = syncTranscript.getBoundingClientRect();
  const wordRect = activeButton.getBoundingClientRect();
  const inset = 12;
  if (wordRect.top >= containerRect.top + inset && wordRect.bottom <= containerRect.bottom - inset) return;
  const offset = wordRect.top - containerRect.top - (syncTranscript.clientHeight - wordRect.height) / 2;
  syncTranscript.scrollBy({
    top: offset,
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
  });
}

function openWordDialog() {
  if (typeof wordDialog.showModal === "function") {
    if (!wordDialog.open) wordDialog.showModal();
  } else {
    wordDialog.setAttribute("open", "");
  }
}

function handleSynchronizedWord(word) {
  if (!audio.paused) {
    cancelPracticePause();
    audio.currentTime = Math.max(0, word.start);
    updateTimeline();
    return;
  }

  const key = wordCacheKey(word.text);
  selectedWord = { ...word, key, trackId: currentTrack()?.id };
  wordDialogTitle.textContent = word.text;
  const cachedTranslation = activeTranscriptRecord?.wordTranslations?.[key];
  wordDialogTranslation.textContent = cachedTranslation || "翻訳を準備しています。";
  openWordDialog();
  if (cachedTranslation || !selectedWord.trackId) return;
  if (!getTranslationAccessKey()) {
    wordDialogTranslation.textContent = "先にOpenAI APIの共通アクセスキー設定が必要です。";
    return;
  }
  requestOpenAITranslation({
    purpose: "word",
    id: selectedWord.trackId,
    key,
    text: word.text,
  });
}

function resolvePlaybackAfterEnd(playbackMode, index, trackCount, repeatCount, completedPlays) {
  if (playbackMode === "infinite") {
    return { targetIndex: index, completedPlays: completedPlays + 1 };
  }

  if (playbackMode === "count") {
    const nextCompletedPlays = completedPlays + 1;
    if (nextCompletedPlays < repeatCount) {
      return { targetIndex: index, completedPlays: nextCompletedPlays };
    }
    return {
      targetIndex: index < trackCount - 1 ? index + 1 : -1,
      completedPlays: 0,
    };
  }

  return {
    targetIndex: index < trackCount - 1 ? index + 1 : -1,
    completedPlays: 0,
  };
}

function nextTargetAfterEnded() {
  const result = resolvePlaybackAfterEnd(
    settings.playbackMode,
    currentIndex,
    tracks.length,
    settings.repeatCount,
    completedPlaysForCurrentTrack,
  );
  completedPlaysForCurrentTrack = result.completedPlays;
  syncTranscriptVisibility();
  return result.targetIndex;
}

async function activatePracticeTarget(targetIndex, autoplay) {
  if (!tracks[targetIndex]) return;
  if (targetIndex !== currentIndex) {
    selectTrack(targetIndex, autoplay);
    return;
  }

  audio.currentTime = 0;
  const track = currentTrack();
  if (track) {
    positions[track.id] = 0;
    writeStored(POSITIONS_KEY, positions);
  }
  updateTimeline();
  syncPracticeUi();
  syncTranscriptVisibility();
  if (!autoplay) return;

  try {
    await audio.play();
  } catch {
    showStatus("自動再生できませんでした。再生ボタンを押してください。", "error");
  }
}

function resetTranscriptPanel() {
  window.clearTimeout(transcriptSaveTimer);
  activeTranscriptRecord = null;
  transcriptOutput.value = "";
  delete transcriptOutput.dataset.state;
  transcriptOutput.disabled = true;
  transcribeButton.disabled = true;
  saveTranscriptButton.disabled = true;
  deleteTranscriptButton.disabled = true;
  delete transcriptStatus.dataset.state;
  transcriptStatus.textContent = "音声を選ぶと、保存済みスクリプトを確認できます。";
  renderSynchronizedTranscript([]);
  renderTranslation("");
}

async function loadTranscript(track) {
  activeTranscriptRecord = null;
  transcriptOutput.value = "";
  transcriptOutput.dataset.state = "loading";
  transcriptOutput.disabled = false;
  transcribeButton.disabled = transcribingTrackId !== null;
  saveTranscriptButton.disabled = true;
  deleteTranscriptButton.disabled = true;
  transcriptStatus.dataset.state = "loading";
  transcriptStatus.textContent = "保存済みスクリプトを確認しています。";
  renderSynchronizedTranscript([]);
  renderTranslation("");

  try {
    const record = await getStoredTranscript(track.id);
    if (currentTrack()?.id !== track.id) return;
    if (record?.text) {
      activeTranscriptRecord = record;
      transcriptOutput.value = record.text;
      transcriptOutput.dataset.state = "success";
      saveTranscriptButton.disabled = false;
      deleteTranscriptButton.disabled = false;
      transcriptStatus.dataset.state = "success";
      transcriptStatus.textContent = "この音声の保存済みスクリプトを表示しています。";
      renderSynchronizedTranscript(record.words || []);
      renderTranslation(record.translation || "");
      if (!record.translation && getTranslationAccessKey()) startTranslation(record);
    } else {
      activeTranscriptRecord = null;
      delete transcriptOutput.dataset.state;
      delete transcriptStatus.dataset.state;
      transcriptStatus.textContent = "まだスクリプトはありません。API設定の共通アクセスキーで生成できます。";
      renderSynchronizedTranscript([]);
      renderTranslation("");
    }
  } catch {
    if (currentTrack()?.id !== track.id) return;
    transcriptOutput.dataset.state = "error";
    transcriptStatus.dataset.state = "error";
    transcriptStatus.textContent = "保存領域を読み込めませんでした。ブラウザのプライベートモードを解除してください。";
  }
}

async function startTranscription() {
  const track = currentTrack();
  if (!track || transcribingTrackId) return;

  const accessKey = getTranslationAccessKey();
  if (!accessKey) {
    transcriptOutput.dataset.state = "error";
    transcriptStatus.dataset.state = "error";
    transcriptStatus.textContent = "英文生成にはAPI設定の共通アクセスキーが必要です。";
    if (transcriptSettingsDialog.open) transcriptSettingsDialog.close();
    openTranslationSettings();
    return;
  }
  if (!TRANSCRIPTION_EXTENSIONS.test(track.file.name)) {
    finishTranscriptionWithError("英文生成はMP3、M4A、WAV、WEBMなどの音声に対応しています。");
    return;
  }
  if (track.file.size > MAX_TRANSCRIPTION_FILE_BYTES) {
    finishTranscriptionWithError("英文生成できる音声は4MBまでです。短く分けてから試してください。");
    return;
  }

  transcribingTrackId = track.id;
  transcribeButton.disabled = true;
  transcribeButton.dataset.state = "loading";
  transcribeButton.setAttribute("aria-busy", "true");
  transcriptOutput.dataset.state = "loading";
  transcriptStatus.dataset.state = "loading";
  transcriptStatus.textContent = "OpenAI APIで英文と単語時刻を生成しています。";

  try {
    const response = await fetch(TRANSCRIPTION_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Translation-Key": accessKey,
        "X-Audio-Filename": encodeURIComponent(track.file.name),
        "X-Audio-Type": track.file.type || "application/octet-stream",
      },
      body: track.file,
    });
    let payload = {};
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }
    if (!response.ok) {
      const error = new Error(payload.error || "Transcription request failed");
      error.status = response.status;
      throw error;
    }
    const text = String(payload.text || "").trim();
    if (!text) {
      finishTranscriptionWithError("英語を検出できませんでした。音量を確認してもう一度試してください。");
      return;
    }

    const record = {
      id: track.id,
      text,
      words: normalizeTimedWords(payload.words),
      translation: "",
      wordTranslations: {},
      source: payload.source || "openai-whisper-1",
      updatedAt: new Date().toISOString(),
    };
    await putStoredTranscript(record);
    if (currentTrack()?.id === track.id) {
      activeTranscriptRecord = record;
      transcriptOutput.value = text;
      transcriptOutput.dataset.state = "success";
      saveTranscriptButton.disabled = false;
      deleteTranscriptButton.disabled = false;
      transcriptStatus.dataset.state = "success";
      transcriptStatus.textContent = "英文を生成し、このブラウザに保存しました。日本語訳も続けて生成します。";
      renderSynchronizedTranscript(record.words);
      renderTranslation("");
    } else {
      showStatus(`${track.file.name}の英語スクリプトを保存しました。`);
    }
    startTranslation(record);
  } catch (error) {
    console.error("OpenAI transcription failed:", error);
    finishTranscriptionWithError(transcriptionErrorMessage(error));
  } finally {
    if (transcribingTrackId === track.id) finishTranscription();
  }
}

function transcriptionErrorMessage(error) {
  if (error?.status === 401) return "共通アクセスキーが正しくありません。API設定を確認してください。";
  if (error?.status === 413) return "音声ファイルが大きすぎます。短く分けてから試してください。";
  if (error?.status === 429) return "英文生成の利用回数が上限に達しました。少し待ってから試してください。";
  if (error?.status === 503) return "サーバーのOpenAI API設定が完了していません。";
  return "OpenAI APIで英文を生成できませんでした。通信状態を確認してください。";
}

function startTranslation(record, force = false) {
  if (!record?.id || !record.text || translatingTrackId) return;
  if (record.translation && !force) {
    if (currentTrack()?.id === record.id) renderTranslation(record.translation);
    return;
  }
  if (!getTranslationAccessKey()) {
    if (currentTrack()?.id === record.id) {
      translationPanel.hidden = false;
      translationStatus.dataset.state = "error";
      translationStatus.textContent = "OpenAI APIを使うには、API設定から共通アクセスキーを保存してください。";
    }
    if (force) openTranslationSettings();
    return;
  }
  translatingTrackId = record.id;
  if (currentTrack()?.id === record.id) {
    translationPanel.hidden = false;
    translateButton.disabled = true;
    translationStatus.dataset.state = "loading";
    translationStatus.textContent = "OpenAI APIで日本語訳を生成しています。";
  }
  requestOpenAITranslation({ purpose: "full", id: record.id, text: record.text });
}

async function requestOpenAITranslation({ purpose, id, key = "", text }) {
  const accessKey = getTranslationAccessKey();
  const requestKey = `${id}:${key}`;
  if (!accessKey) return;
  if (purpose === "word") {
    if (translatingWordKeys.has(requestKey)) return;
    translatingWordKeys.add(requestKey);
  }

  try {
    const response = await fetch(TRANSLATION_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Translation-Key": accessKey,
      },
      body: JSON.stringify({ type: purpose, text }),
    });
    let payload = {};
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }
    if (!response.ok) {
      const error = new Error(payload.error || "Translation request failed");
      error.status = response.status;
      throw error;
    }
    const translation = String(payload.translation || "").trim();
    if (!translation) throw new Error("Empty translation");

    const existing = await getStoredTranscript(id);
    if (!existing?.text) return;
    const updatedRecord = purpose === "word"
      ? {
          ...existing,
          wordTranslations: {
            ...(existing.wordTranslations || {}),
            [key]: translation,
          },
        }
      : {
          ...existing,
          translation,
          translatedAt: new Date().toISOString(),
        };
    await putStoredTranscript(updatedRecord);
    if (currentTrack()?.id === id) activeTranscriptRecord = updatedRecord;

    if (purpose === "word") {
      if (selectedWord?.trackId === id && selectedWord.key === key) {
        wordDialogTranslation.textContent = translation;
      }
    } else if (currentTrack()?.id === id) {
      renderTranslation(translation);
    }
  } catch (error) {
    console.error("OpenAI translation failed:", error);
    if (purpose === "word") {
      if (selectedWord?.trackId === id && selectedWord.key === key) {
        wordDialogTranslation.textContent = translationErrorMessage(error);
      }
    } else {
      showTranslationError(id, translationErrorMessage(error));
    }
  } finally {
    if (purpose === "word") {
      translatingWordKeys.delete(requestKey);
    } else {
      translatingTrackId = null;
      if (currentTrack()?.id === id) translateButton.disabled = false;
      if (activeTranscriptRecord?.id !== id && activeTranscriptRecord?.text && !activeTranscriptRecord.translation) {
        startTranslation(activeTranscriptRecord);
      }
    }
  }
}

function translationErrorMessage(error) {
  if (error?.status === 401) return "共通アクセスキーが正しくありません。API設定を確認してください。";
  if (error?.status === 429) return "翻訳の利用回数が上限に達しました。少し待ってから試してください。";
  if (error?.status === 503) return "サーバーのOpenAI API設定が完了していません。";
  return "OpenAI APIで日本語訳を生成できませんでした。通信状態を確認してください。";
}

function showTranslationError(id, message = "OpenAI APIで日本語訳を生成できませんでした。") {
  if (currentTrack()?.id !== id) return;
  translationPanel.hidden = false;
  translateButton.disabled = false;
  translationStatus.dataset.state = "error";
  translationStatus.textContent = message;
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
  const textChanged = activeTranscriptRecord?.text !== text;
  const record = {
    ...(activeTranscriptRecord || {}),
    id: track.id,
    text,
    words: textChanged ? [] : (activeTranscriptRecord?.words || []),
    translation: textChanged ? "" : (activeTranscriptRecord?.translation || ""),
    wordTranslations: textChanged ? {} : (activeTranscriptRecord?.wordTranslations || {}),
    source: "edited",
    updatedAt: new Date().toISOString(),
  };
  try {
    await putStoredTranscript(record);
    activeTranscriptRecord = record;
    saveTranscriptButton.dataset.state = "success";
    transcriptOutput.dataset.state = "success";
    deleteTranscriptButton.disabled = false;
    transcriptStatus.dataset.state = "success";
    transcriptStatus.textContent = textChanged
      ? "修正したスクリプトを保存しました。単語同期は再生成すると利用できます。"
      : "スクリプトを保存しました。";
    renderSynchronizedTranscript(record.words);
    renderTranslation(record.translation);
    if (!record.translation && getTranslationAccessKey()) startTranslation(record);
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
    activeTranscriptRecord = null;
    transcriptOutput.value = "";
    delete transcriptOutput.dataset.state;
    saveTranscriptButton.disabled = true;
    deleteTranscriptButton.disabled = true;
    delete transcriptStatus.dataset.state;
    transcriptStatus.textContent = "保存済みスクリプトを削除しました。音声から再生成できます。";
    renderSynchronizedTranscript([]);
    renderTranslation("");
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
  if (!currentTrack()) {
    loopStatus.textContent = "音声を選ぶと区間を設定できます。";
  } else if (validLoop(loop)) {
    loopStatus.textContent = `A ${formatTime(loop.a)} 〜 B ${formatTime(loop.b)}・${enabled ? "リピート中" : "停止中"}`;
  } else if (Number.isFinite(loop.a) || Number.isFinite(loop.b)) {
    loopStatus.textContent = `A ${Number.isFinite(loop.a) ? formatTime(loop.a) : "—"}・B ${Number.isFinite(loop.b) ? formatTime(loop.b) : "—"}（区間未完成）`;
  } else {
    loopStatus.textContent = "区間は未設定です。";
  }
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
    if (isPracticePause && pendingPracticeTargetIndex >= 0) {
      const nextIndex = pendingPracticeTargetIndex;
      cancelPracticePause(false);
      activatePracticeTarget(nextIndex, true);
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
  updateTranscriptHighlight();

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
practiceSettingsButton.addEventListener("click", () => {
  const selectedModeButton = settings.practiceMode === "auto" ? autoNextModeButton : manualNextModeButton;
  openSettingsDialog(practiceSettingsDialog, selectedModeButton);
});
playbackSettingsButton.addEventListener("click", () => openSettingsDialog(playbackSettingsDialog, rateSelect));
playbackSettingsClose.addEventListener("click", () => playbackSettingsDialog.close());
practiceSettingsClose.addEventListener("click", () => practiceSettingsDialog.close());
loopSettingsButton.addEventListener("click", () => openSettingsDialog(loopSettingsDialog, setAButton));
loopSettingsClose.addEventListener("click", () => loopSettingsDialog.close());
closeSettingsOnBackdrop(practiceSettingsDialog);
closeSettingsOnBackdrop(loopSettingsDialog);
closeSettingsOnBackdrop(playbackSettingsDialog);

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
translateButton.addEventListener("click", () => startTranslation(activeTranscriptRecord, true));
translationSettingsButton.addEventListener("click", () => {
  if (transcriptSettingsDialog.open) transcriptSettingsDialog.close();
  openTranslationSettings();
});
translationSettingsClose.addEventListener("click", () => translationSettingsDialog.close());
translationSettingsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const accessKey = translationAccessKeyInput.value.trim();
  if (!accessKey) return;
  try {
    localStorage.setItem(TRANSLATION_ACCESS_KEY, accessKey);
  } catch {
    showStatus("共通アクセスキーをこのブラウザに保存できませんでした。", "error");
    return;
  }
  translationSettingsDialog.close();
  renderTranslation(activeTranscriptRecord?.translation || "");
  if (activeTranscriptRecord?.text && !activeTranscriptRecord.translation) {
    startTranslation(activeTranscriptRecord, true);
  }
});
transcriptSettingsButton.addEventListener("click", () => openSettingsDialog(transcriptSettingsDialog, transcriptDisplayModeSelect));
transcriptSettingsClose.addEventListener("click", () => transcriptSettingsDialog.close());
closeSettingsOnBackdrop(transcriptSettingsDialog);
transcriptDisplayModeSelect.addEventListener("change", () => {
  settings.transcriptVisible = transcriptDisplayModeSelect.value === "show";
  writeStored(SETTINGS_KEY, settings);
  syncTranscriptVisibility();
});

function updateTranscriptShowFrom(normalizeInput = false) {
  const enteredCount = Number(transcriptShowFromInput.value);
  if (!Number.isFinite(enteredCount) || enteredCount < 1) {
    if (normalizeInput) transcriptShowFromInput.value = String(settings.transcriptShowFrom);
    return;
  }
  settings.transcriptShowFrom = Math.min(99, Math.max(1, Math.round(enteredCount)));
  if (normalizeInput) transcriptShowFromInput.value = String(settings.transcriptShowFrom);
  writeStored(SETTINGS_KEY, settings);
  syncTranscriptVisibility();
}

transcriptShowFromInput.addEventListener("input", () => updateTranscriptShowFrom(false));
transcriptShowFromInput.addEventListener("change", () => updateTranscriptShowFrom(true));
transcriptOutput.addEventListener("input", () => {
  delete transcriptOutput.dataset.state;
  saveTranscriptButton.disabled = transcriptOutput.value.trim().length === 0;
  const unchanged = transcriptOutput.value.trim() === activeTranscriptRecord?.text;
  renderSynchronizedTranscript(unchanged ? activeTranscriptRecord?.words : []);
  renderTranslation(unchanged ? activeTranscriptRecord?.translation : "");
});

playWordButton.addEventListener("click", async () => {
  if (!selectedWord || !currentTrack()) return;
  if (wordDialog.open) wordDialog.close();
  cancelPracticePause();
  audio.currentTime = Math.max(0, selectedWord.start);
  updateTimeline();
  try {
    await audio.play();
  } catch {
    showStatus("この位置から再生できませんでした。再生ボタンを押してください。", "error");
  }
});

wordDialog.addEventListener("close", () => {
  selectedWord = null;
});

playbackModeSelect.addEventListener("change", () => {
  settings.playbackMode = playbackModeSelect.value;
  completedPlaysForCurrentTrack = 0;
  cancelPracticePause(false);
  writeStored(SETTINGS_KEY, settings);
  syncControls();
  syncPracticeUi();
  syncTranscriptVisibility();
});

function updateRepeatCount(normalizeInput = false) {
  const enteredCount = Number(repeatCountInput.value);
  if (!Number.isFinite(enteredCount) || enteredCount < 2) {
    if (normalizeInput) repeatCountInput.value = String(settings.repeatCount);
    return;
  }
  settings.repeatCount = Math.min(99, Math.max(2, Math.round(enteredCount)));
  if (normalizeInput) repeatCountInput.value = String(settings.repeatCount);
  completedPlaysForCurrentTrack = 0;
  cancelPracticePause(false);
  writeStored(SETTINGS_KEY, settings);
  syncPracticeUi();
  syncPlaybackSettingsUi();
}

repeatCountInput.addEventListener("input", () => updateRepeatCount(false));
repeatCountInput.addEventListener("change", () => updateRepeatCount(true));

rateSelect.addEventListener("change", () => {
  settings.rate = Number(rateSelect.value);
  audio.playbackRate = settings.rate;
  writeStored(SETTINGS_KEY, settings);
  syncPlaybackSettingsUi();
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
  const targetIndex = nextTargetAfterEnded();
  if (targetIndex < 0) {
    practiceStatus.dataset.state = "paused";
    practiceStatus.textContent = "再生リストの最後まで終わりました。";
  } else if (settings.practiceMode === "manual") {
    const repeatsSameTrack = targetIndex === currentIndex;
    activatePracticeTarget(targetIndex, false);
    practiceStatus.dataset.state = "paused";
    practiceStatus.textContent = repeatsSameTrack
      ? "同じ音声を先頭に戻しました。再生ボタンを押すまで待機します。"
      : "次の音声を選びました。再生ボタンを押すまで待機します。";
  } else {
    startAutoNextPause(targetIndex);
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

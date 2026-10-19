const sourceText = document.querySelector("#source-text");
const fieldMessage = document.querySelector("#field-message");
const characterCount = document.querySelector("#character-count");
const checkButton = document.querySelector("#check-button");
const checkButtonLabel = document.querySelector("#check-button-label");
const settingsButton = document.querySelector("#settings-button");
const requestStatus = document.querySelector("#request-status");
const emptyResult = document.querySelector("#empty-result");
const resultContent = document.querySelector("#result-content");
const resultCount = document.querySelector("#result-count");
const annotatedText = document.querySelector("#annotated-text");
const selectedIssue = document.querySelector("#selected-issue");
const selectedIssueCategory = document.querySelector("#selected-issue-category");
const selectedIssueTitle = document.querySelector("#selected-issue-title");
const selectedIssueExplanation = document.querySelector("#selected-issue-explanation");
const selectedIssueFix = document.querySelector("#selected-issue-fix");
const issueListSection = document.querySelector("#issue-list-section");
const issueList = document.querySelector("#issue-list");
const correctedText = document.querySelector("#corrected-text");
const issueTooltip = document.querySelector("#issue-tooltip");
const tooltipCategory = document.querySelector("#tooltip-category");
const tooltipBody = document.querySelector("#tooltip-body");
const tooltipFix = document.querySelector("#tooltip-fix");
const settingsDialog = document.querySelector("#settings-dialog");
const settingsForm = document.querySelector("#settings-form");
const settingsClose = document.querySelector("#settings-close");
const accessKeyInput = document.querySelector("#access-key");

const MAX_INPUT_LENGTH = 12_000;
const ACCESS_KEY_STORAGE = "grammar-checker:access-key";
const LEGACY_ACCESS_KEY_STORAGE = "listening-desk:translation-access-key";
const IS_FILE_PROTOCOL = window.location.protocol === "file:";
const USE_SAME_ORIGIN_API =
  window.location.hostname.endsWith(".vercel.app") ||
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1";
const GRAMMAR_API_URL = USE_SAME_ORIGIN_API
  ? new URL("/api/grammar-check", window.location.origin).href
  : "https://english-m.vercel.app/api/grammar-check";

const CATEGORY_META = {
  major_grammar: { label: "主要文法エラー", className: "major" },
  word_form: { label: "語形・品詞エラー", className: "word" },
  syntax: { label: "構文・接続のエラー", className: "syntax" },
  expression: { label: "語の選び方・表現ミス", className: "expression" },
  spelling: { label: "記号・スペル・形式ミス", className: "spelling" },
};

let sourceTouched = false;
let isChecking = false;
let tooltipTimer = null;
let activeMark = null;
let pinnedMark = null;

function getAccessKey() {
  try {
    return (
      localStorage.getItem(ACCESS_KEY_STORAGE)?.trim() ||
      localStorage.getItem(LEGACY_ACCESS_KEY_STORAGE)?.trim() ||
      ""
    );
  } catch {
    return "";
  }
}

function openSettings() {
  accessKeyInput.value = getAccessKey();
  if (typeof settingsDialog.showModal === "function") {
    if (!settingsDialog.open) settingsDialog.showModal();
  } else {
    settingsDialog.setAttribute("open", "");
  }
  window.setTimeout(() => accessKeyInput.focus(), 0);
}

function closeSettings() {
  if (typeof settingsDialog.close === "function") settingsDialog.close();
  else settingsDialog.removeAttribute("open");
}

function validateSource() {
  const value = sourceText.value.trim();
  const isEmpty = value.length === 0;
  const isTooLong = sourceText.value.length > MAX_INPUT_LENGTH;
  const invalid = isEmpty || isTooLong;

  checkButton.disabled = invalid || isChecking;
  if (!sourceTouched) {
    sourceText.removeAttribute("aria-invalid");
    fieldMessage.textContent = isEmpty
      ? "英文を1文字以上入力してください。"
      : "入力した英文だけを文法チェックに使用します。";
    delete fieldMessage.dataset.tone;
    return !invalid;
  }

  if (isEmpty) {
    sourceText.setAttribute("aria-invalid", "true");
    fieldMessage.textContent = "英文が入力されていません。確認したい英文を入力してください。";
    fieldMessage.dataset.tone = "error";
  } else if (isTooLong) {
    sourceText.setAttribute("aria-invalid", "true");
    fieldMessage.textContent = "英文が12,000文字を超えています。短くしてから、もう一度実行してください。";
    fieldMessage.dataset.tone = "error";
  } else {
    sourceText.removeAttribute("aria-invalid");
    fieldMessage.textContent = "入力した英文だけを文法チェックに使用します。";
    delete fieldMessage.dataset.tone;
  }
  return !invalid;
}

function setButtonState(state) {
  checkButton.dataset.state = state;
  const labels = {
    default: "文法チェック",
    loading: "チェック中…",
    error: "もう一度試す",
    success: "チェック完了",
  };
  checkButtonLabel.textContent = labels[state] || labels.default;
}

function setStatus(message, tone = "info") {
  requestStatus.textContent = message;
  requestStatus.dataset.tone = tone;
}

function correctionLabel(issue) {
  return issue.replacement || "削除";
}

function normalizeResult(data) {
  const original = String(data.original_text || "");
  const corrected = String(data.corrected_text || original);
  const issues = Array.isArray(data.issues)
    ? data.issues
        .map((issue) => ({
          id: String(issue.id || ""),
          category: CATEGORY_META[issue.category] ? issue.category : "expression",
          title_ja: String(issue.title_ja || "修正が必要です"),
          explanation_ja: String(issue.explanation_ja || "この表現を確認してください。"),
          original_text: String(issue.original_text || ""),
          replacement: String(issue.replacement || ""),
          start: Number(issue.start),
          end: Number(issue.end),
        }))
        .filter(
          (issue) =>
            Number.isInteger(issue.start) &&
            Number.isInteger(issue.end) &&
            issue.start >= 0 &&
            issue.end > issue.start &&
            issue.end <= original.length &&
            original.slice(issue.start, issue.end) === issue.original_text,
        )
        .sort((left, right) => left.start - right.start || left.end - right.end)
    : [];

  return { original_text: original, corrected_text: corrected, issues };
}

function createIssueMark(issue, index) {
  const meta = CATEGORY_META[issue.category];
  const explanationLabel = issue.explanation_ja.replace(/[。．.!！?？]+$/u, "");
  const mark = document.createElement("mark");
  mark.className = `issue-mark issue-mark--${meta.className}`;
  mark.textContent = issue.original_text;
  mark.tabIndex = 0;
  mark.setAttribute("role", "button");
  mark.setAttribute("aria-pressed", "false");
  mark.setAttribute(
    "aria-label",
    `${issue.original_text}。${meta.label}。${explanationLabel}。修正案：${correctionLabel(issue)}`,
  );
  mark.dataset.issueIndex = String(index);

  mark.addEventListener("pointerenter", () => {
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      window.clearTimeout(tooltipTimer);
      tooltipTimer = window.setTimeout(() => showTooltip(mark, issue), 850);
    }
  });
  mark.addEventListener("pointerleave", scheduleTooltipHide);
  mark.addEventListener("focus", () => {
    window.clearTimeout(tooltipTimer);
    showTooltip(mark, issue);
    showSelectedIssue(mark, issue);
  });
  mark.addEventListener("blur", scheduleTooltipHide);
  mark.addEventListener("click", () => togglePinnedIssue(mark, issue));
  mark.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      togglePinnedIssue(mark, issue);
    }
    if (event.key === "Escape") {
      pinnedMark = null;
      hideTooltip();
      mark.setAttribute("aria-pressed", "false");
    }
  });
  return mark;
}

function renderAnnotatedText(result) {
  annotatedText.replaceChildren();
  let cursor = 0;
  result.issues.forEach((issue, index) => {
    annotatedText.append(document.createTextNode(result.original_text.slice(cursor, issue.start)));
    annotatedText.append(createIssueMark(issue, index));
    cursor = issue.end;
  });
  annotatedText.append(document.createTextNode(result.original_text.slice(cursor)));
}

function renderIssueList(issues) {
  issueList.replaceChildren();
  issueListSection.hidden = issues.length === 0;
  issues.forEach((issue) => {
    const meta = CATEGORY_META[issue.category];
    const item = document.createElement("li");
    item.className = "issue-list__item";

    const body = document.createElement("div");
    body.className = "issue-list__body";
    const label = document.createElement("p");
    label.className = "issue-list__label";
    label.textContent = meta.label;
    const title = document.createElement("strong");
    title.textContent = issue.title_ja;
    const explanation = document.createElement("p");
    explanation.textContent = issue.explanation_ja;
    const change = document.createElement("p");
    change.className = "issue-list__change";
    change.textContent = `「${issue.original_text}」→「${correctionLabel(issue)}」`;

    body.append(label, title, explanation, change);
    item.append(body);
    issueList.append(item);
  });
}

function renderResult(data) {
  const result = normalizeResult(data);
  pinnedMark = null;
  activeMark = null;
  hideTooltip();

  emptyResult.hidden = true;
  resultContent.hidden = false;
  resultCount.textContent = result.issues.length === 0 ? "文法エラーは見つかりませんでした" : `${result.issues.length}件の修正候補`;

  renderAnnotatedText(result);
  renderIssueList(result.issues);
  correctedText.textContent = result.corrected_text;
  selectedIssue.hidden = true;

  if (result.issues.length === 0) {
    annotatedText.classList.add("no-issues");
    annotatedText.textContent = result.original_text;
  } else {
    annotatedText.classList.remove("no-issues");
  }
}

function fillTooltip(issue) {
  const meta = CATEGORY_META[issue.category];
  tooltipCategory.textContent = meta.label;
  tooltipBody.textContent = issue.explanation_ja;
  tooltipFix.textContent = `修正案：${correctionLabel(issue)}`;
}

function positionTooltip(mark) {
  const markRect = mark.getBoundingClientRect();
  const tooltipRect = issueTooltip.getBoundingClientRect();
  const gutter = 12;
  const maxX = window.innerWidth - tooltipRect.width - gutter;
  let x = markRect.left + markRect.width / 2 - tooltipRect.width / 2;
  x = Math.max(gutter, Math.min(maxX, x));
  let y = markRect.top - tooltipRect.height - gutter;
  if (y < gutter) y = markRect.bottom + gutter;
  issueTooltip.style.setProperty("--tooltip-x", `${Math.round(x)}px`);
  issueTooltip.style.setProperty("--tooltip-y", `${Math.round(y)}px`);
}

function showTooltip(mark, issue) {
  activeMark = mark;
  fillTooltip(issue);
  issueTooltip.hidden = false;
  issueTooltip.dataset.visible = "true";
  positionTooltip(mark);
}

function hideTooltip() {
  window.clearTimeout(tooltipTimer);
  if (pinnedMark) return;
  delete issueTooltip.dataset.visible;
  issueTooltip.hidden = true;
  activeMark = null;
}

function scheduleTooltipHide() {
  window.clearTimeout(tooltipTimer);
  tooltipTimer = window.setTimeout(hideTooltip, 140);
}

function showSelectedIssue(mark, issue) {
  document.querySelectorAll(".issue-mark[aria-pressed='true']").forEach((item) => {
    if (item !== mark) item.setAttribute("aria-pressed", "false");
  });
  const meta = CATEGORY_META[issue.category];
  selectedIssue.hidden = false;
  selectedIssueCategory.textContent = meta.label;
  selectedIssueTitle.textContent = issue.title_ja;
  selectedIssueExplanation.textContent = issue.explanation_ja;
  selectedIssueFix.textContent = `「${issue.original_text}」→「${correctionLabel(issue)}」`;
}

function togglePinnedIssue(mark, issue) {
  if (pinnedMark === mark) {
    mark.setAttribute("aria-pressed", "false");
    pinnedMark = null;
    hideTooltip();
    return;
  }
  if (pinnedMark) pinnedMark.setAttribute("aria-pressed", "false");
  pinnedMark = mark;
  mark.setAttribute("aria-pressed", "true");
  showTooltip(mark, issue);
  showSelectedIssue(mark, issue);
}

function errorMessageFor(status, code) {
  if (status === 401 || code === "invalid_access_key") {
    return "アクセスキーが正しくありません。接続設定を確認して、もう一度実行してください。";
  }
  if (status === 429) {
    return "利用が集中しています。少し待ってから、もう一度実行してください。";
  }
  if (status === 503) {
    return "文法チェックサーバーの設定が完了していません。管理者に確認してください。";
  }
  if (status === 403 || code === "origin_not_allowed") {
    return "この開き方では文法チェックを実行できません。公開版の英作文チェックを開いてください。";
  }
  if (status === 404) {
    return "文法チェックAPIが見つかりません。最新版が公開されているか確認してください。";
  }
  return "文法チェックを完了できませんでした。通信状態を確認して、もう一度実行してください。";
}

async function checkGrammar() {
  sourceTouched = true;
  if (!validateSource() || isChecking) return;
  if (IS_FILE_PROTOCOL) {
    setStatus(
      "このファイルは直接実行できません。https://english-m.vercel.app/grammar-checker/ を開いてください。",
      "error",
    );
    return;
  }
  const accessKey = getAccessKey();
  if (!accessKey) {
    setStatus("文法チェック用アクセスキーを設定してください。", "error");
    openSettings();
    return;
  }

  const submittedText = sourceText.value.trim();
  isChecking = true;
  checkButton.disabled = true;
  sourceText.dataset.state = "loading";
  setButtonState("loading");
  setStatus("英文を確認しています。しばらくお待ちください。");

  try {
    const response = await fetch(GRAMMAR_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Grammar-Key": accessKey,
      },
      body: JSON.stringify({ text: submittedText }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(data.error || "request_failed"), { status: response.status });

    renderResult(data);
    sourceText.dataset.state = "success";
    setButtonState("success");
    setStatus("文法チェックが完了しました。色の付いた箇所を選ぶと解説を確認できます。");
    resultContent.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    window.setTimeout(() => {
      if (!isChecking) setButtonState("default");
      if (sourceText.dataset.state === "success") delete sourceText.dataset.state;
    }, 1600);
  } catch (error) {
    const message = errorMessageFor(error.status, error.message);
    sourceText.dataset.state = "error";
    setButtonState("error");
    setStatus(message, "error");
    if (error.status === 401) openSettings();
  } finally {
    isChecking = false;
    if (sourceText.dataset.state === "loading") delete sourceText.dataset.state;
    validateSource();
  }
}

sourceText.addEventListener("input", () => {
  characterCount.textContent = `${sourceText.value.length.toLocaleString("ja-JP")} / ${MAX_INPUT_LENGTH.toLocaleString("ja-JP")}`;
  validateSource();
  if (!isChecking && checkButton.dataset.state !== "default") setButtonState("default");
  if (sourceText.dataset.state === "success" || sourceText.dataset.state === "error") delete sourceText.dataset.state;
});

sourceText.addEventListener("blur", () => {
  sourceTouched = true;
  validateSource();
});

checkButton.addEventListener("click", checkGrammar);
settingsButton.addEventListener("click", openSettings);
settingsClose.addEventListener("click", closeSettings);
settingsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const value = accessKeyInput.value.trim();
  if (!value) return;
  try {
    localStorage.setItem(ACCESS_KEY_STORAGE, value);
  } catch {
    setStatus("アクセスキーをこのブラウザに保存できませんでした。ブラウザの保存設定を確認してください。", "error");
    return;
  }
  closeSettings();
  setStatus("接続設定を保存しました。文法チェックを実行できます。");
});

settingsDialog.addEventListener("click", (event) => {
  if (event.target === settingsDialog) closeSettings();
});

issueTooltip.addEventListener("pointerenter", () => window.clearTimeout(tooltipTimer));
issueTooltip.addEventListener("pointerleave", scheduleTooltipHide);

document.addEventListener("pointerdown", (event) => {
  if (pinnedMark && !pinnedMark.contains(event.target) && !issueTooltip.contains(event.target)) {
    pinnedMark.setAttribute("aria-pressed", "false");
    pinnedMark = null;
    hideTooltip();
  }
});

window.addEventListener("resize", () => {
  if (activeMark && !issueTooltip.hidden) positionTooltip(activeMark);
});

window.addEventListener("scroll", () => {
  if (!pinnedMark) hideTooltip();
  else if (activeMark) positionTooltip(activeMark);
}, { passive: true });

setButtonState("default");
validateSource();
if (IS_FILE_PROTOCOL) {
  setStatus(
    "文法チェックには公開版を使用します：https://english-m.vercel.app/grammar-checker/",
    "error",
  );
}

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const [html, css, app] = await Promise.all([
  readFile(new URL("index.html", root), "utf8"),
  readFile(new URL("styles.css", root), "utf8"),
  readFile(new URL("app.js", root), "utf8"),
]);

assert(!html.includes("左へスワイプして削除"), "swipe deletion hint should not be visible");
assert(!html.includes("current-translation-button"), "translation modal trigger should be removed");
assert.match(html, /id="practice-status"[^>]*hidden/, "practice countdown should stay hidden");

const importStart = html.indexOf('id="import-dialog"');
const importEnd = html.indexOf("</dialog>", importStart);
const importMarkup = html.slice(importStart, importEnd);
assert(importStart >= 0 && importEnd > importStart, "import dialog should exist");
assert(importMarkup.includes('id="add-next-five-button"'), "next-five action should live in the import dialog");

const scriptStart = html.indexOf('id="sync-script"');
const scriptEnd = html.indexOf("</section>", scriptStart);
const scriptMarkup = html.slice(scriptStart, scriptEnd);
const englishIndex = scriptMarkup.indexOf('id="sync-transcript"');
const translationIndex = scriptMarkup.indexOf('id="current-sentence-translation"');
assert(scriptMarkup.includes('class="sync-script__scroll"'), "bilingual content should share one scroll surface");
assert(englishIndex >= 0 && translationIndex > englishIndex, "Japanese translation should follow the English transcript");

assert.match(css, /\.sync-script__scroll\s*\{[^}]*overflow-y:\s*auto;/s, "bilingual surface should scroll vertically");
assert.match(css, /\.current-sentence__translation\s*\{[^}]*border-block-start:/s, "translation should have a readable section boundary");
assert.match(css, /#current-time\[data-pause="true"\][^{]*\{[^}]*color:\s*var\(--color-error\)/s, "pause elapsed time should be red");
assert.match(app, /startPauseTimeline\("track", pauseSeconds\)/, "track pauses should show elapsed and total time");
assert.match(app, /startPauseTimeline\("sentence", pauseSeconds\)/, "sentence pauses should show elapsed and total time");
assert.match(app, /durationLabel\.textContent = Number\.isFinite\(pauseTimelineDuration\)[\s\S]*?: "∞";/, "manual pauses should show an infinite total");
assert.match(html, /Listening Desk v57/, "visible build should identify v57");

console.log("mobile-density tests: 13 passed");

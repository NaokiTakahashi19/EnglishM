import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
const helperStart = source.indexOf("function isRetryableTranscriptionError(");
const helperEnd = source.indexOf("\n\nasync function startTranscription(", helperStart);
assert.notEqual(helperStart, -1, "transcription retry helper was not found");
assert.notEqual(helperEnd, -1, "transcription retry helper could not be isolated");

const isRetryableTranscriptionError = new Function(
  `${source.slice(helperStart, helperEnd)}; return isRetryableTranscriptionError;`,
)();

assert.equal(isRetryableTranscriptionError({ status: 502 }, true), true);
assert.equal(isRetryableTranscriptionError({ status: 429 }, true), true);
assert.equal(isRetryableTranscriptionError({ code: "request_timeout" }, true), true);
assert.equal(isRetryableTranscriptionError(new TypeError("Network error"), true), true);
assert.equal(isRetryableTranscriptionError({ status: 401 }, true), false);
assert.equal(isRetryableTranscriptionError({ status: 413 }, true), false);
assert.equal(isRetryableTranscriptionError({ status: 502 }, false), false);
assert.equal(isRetryableTranscriptionError({ code: "storage_failed" }, true), false);

assert.match(source, /const TRANSCRIPTION_MAX_ATTEMPTS = 3;/);
assert.match(source, /通信が安定しないため自動で再試行します/);

console.log("transcription-retry tests: 10 passed");

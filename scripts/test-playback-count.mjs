import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
const functionStart = source.indexOf("function resolvePlaybackAfterEnd(");
const functionEnd = source.indexOf("\nfunction nextTargetAfterEnded()", functionStart);

assert.notEqual(functionStart, -1, "resolvePlaybackAfterEnd was not found");
assert.notEqual(functionEnd, -1, "resolvePlaybackAfterEnd could not be isolated");

const resolvePlaybackAfterEnd = new Function(
  `${source.slice(functionStart, functionEnd)}; return resolvePlaybackAfterEnd;`,
)();

assert.deepEqual(
  resolvePlaybackAfterEnd("count", 0, 2, 3, 0),
  { targetIndex: 0, completedPlays: 1 },
  "the first play should repeat the current track",
);
assert.deepEqual(
  resolvePlaybackAfterEnd("count", 0, 2, 3, 1),
  { targetIndex: 0, completedPlays: 2 },
  "the second play should repeat the current track",
);
assert.deepEqual(
  resolvePlaybackAfterEnd("count", 0, 2, 3, 2),
  { targetIndex: 1, completedPlays: 0 },
  "the configured final play should advance to the next track",
);
assert.deepEqual(
  resolvePlaybackAfterEnd("count", 1, 2, 2, 1),
  { targetIndex: 0, completedPlays: 0 },
  "the final track should wrap to the first track",
);
assert.deepEqual(
  resolvePlaybackAfterEnd("infinite", 1, 2, 3, 4),
  { targetIndex: 1, completedPlays: 5 },
  "infinite mode should always repeat the current track",
);

console.log("playback-count tests: 5 passed");

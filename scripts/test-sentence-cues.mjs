import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
const functionStart = source.indexOf("function normalizeTimedWords(");
const functionEnd = source.indexOf("\nfunction normalizeTranscriptRecord(", functionStart);
const normalizeEnd = source.indexOf("\nfunction sentenceCues(", functionEnd);

assert.notEqual(functionStart, -1, "normalizeTimedWords was not found");
assert.notEqual(functionEnd, -1, "sentence cue helpers could not be isolated");
assert.notEqual(normalizeEnd, -1, "normalizeTranscriptRecord could not be isolated");

const buildSentenceCues = new Function(
  `${source.slice(functionStart, functionEnd)}; return buildSentenceCues;`,
)();
const normalizeTranscriptRecord = new Function(
  "audio",
  `${source.slice(functionStart, normalizeEnd)}; return normalizeTranscriptRecord;`,
)({ duration: 20 });
const displayHelperStart = source.indexOf("function sentenceTerminalPunctuation(");
const displayHelperEnd = source.indexOf("\nfunction keepActiveSentenceVisible(", displayHelperStart);
assert.notEqual(displayHelperStart, -1, "sentence display helpers were not found");
assert.notEqual(displayHelperEnd, -1, "sentence display helpers could not be isolated");
const synchronizedWordText = new Function(
  `${source.slice(displayHelperStart, displayHelperEnd)}; return synchronizedWordText;`,
)();

function timedWords(text, step = 0.42) {
  return text.split(/\s+/).map((word, index) => ({
    text: word,
    start: index * step,
    end: index * step + step * 0.82,
  }));
}

const unpunctuated = timedWords(
  "At my school we start our day late in the morning but I've heard that many schools in Japan start very early How do you feel about this Do you think it's better to start school early in the morning or should the school day start later Please explain",
);
const inferredCues = buildSentenceCues(unpunctuated, [], "", 20);

assert.equal(inferredCues.length, 4, "capitalized question and request starts should form four cues");
assert.equal(
  inferredCues[0].text,
  "At my school we start our day late in the morning but I've heard that many schools in Japan start very early",
);
assert.equal(inferredCues[1].text, "How do you feel about this");
assert.equal(
  inferredCues[2].text,
  "Do you think it's better to start school early in the morning or should the school day start later",
);
assert.equal(inferredCues[3].text, "Please explain");

const punctuated = timedWords("This is the first sentence. This is the second sentence.");
const punctuatedCues = buildSentenceCues(punctuated, [], "", 6);
assert.equal(punctuatedCues.length, 2, "punctuation should remain the primary boundary");

const separatelyPunctuatedText = "This is the first sentence. This is the second sentence.";
const punctuationFreeWords = timedWords("This is the first sentence This is the second sentence");
const restoredPunctuationCues = buildSentenceCues(
  punctuationFreeWords,
  [],
  separatelyPunctuatedText,
  6,
);
assert.equal(restoredPunctuationCues.length, 2, "transcript punctuation should restore two sentence boundaries");
assert.equal(restoredPunctuationCues[0].text, "This is the first sentence.");
assert.equal(restoredPunctuationCues[1].text, "This is the second sentence.");

const properNoun = timedWords("Many schools in Japan start early How do you feel");
const properNounCues = buildSentenceCues(properNoun, [], "", 5);
assert.equal(properNounCues.length, 2, "a capitalized proper noun must not start a new cue");
assert.equal(properNounCues[0].text, "Many schools in Japan start early");

const upgradedRecord = normalizeTranscriptRecord({
  id: "existing-record",
  text: unpunctuated.map((word) => word.text).join(" "),
  words: unpunctuated,
  segments: [],
  sentences: [{ id: "sentence-1", text: "Previously stored as one sentence", start: 0, end: 20 }],
});
assert.equal(upgradedRecord.sentences.length, 4, "saved one-cue records should upgrade without retranscription");
assert.equal(upgradedRecord.sentenceCueVersion, 3, "upgraded records should use the current cue version");

const upgradedPunctuationRecord = normalizeTranscriptRecord({
  id: "punctuation-record",
  text: separatelyPunctuatedText,
  words: punctuationFreeWords,
  segments: [],
  sentences: [
    { id: "sentence-1", text: "This is the first sentence", translation: "これは最初の文です。", start: 0, end: 1.6 },
    { id: "sentence-2", text: "This is the second sentence", translation: "これは2番目の文です。", start: 1.68, end: 3.3 },
  ],
  sentenceCueVersion: 2,
});
assert.equal(upgradedPunctuationRecord.words[4].text, "sentence.");
assert.equal(upgradedPunctuationRecord.sentences[0].text, "This is the first sentence.");
assert.equal(upgradedPunctuationRecord.sentences[0].translation, "これは最初の文です。");
assert.equal(
  synchronizedWordText(
    { text: "sentence" },
    0,
    1,
    [{ text: "This is the first sentence." }, { text: "This is the second sentence." }],
  ),
  "sentence.",
  "the synchronized display should append the first sentence period",
);
assert.equal(
  synchronizedWordText(
    { text: "sentence." },
    0,
    1,
    [{ text: "This is the first sentence." }, { text: "This is the second sentence." }],
  ),
  "sentence.",
  "the synchronized display should not duplicate an existing period",
);

console.log("sentence-cue tests: 19 passed");

#!/usr/bin/env node

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_SOURCE = "chunks_120_examples.md";
const DEFAULT_OUTPUT_DIRECTORY = "chunk-audio";
const DEFAULT_MODEL = "gpt-4o-mini-tts";
const DEFAULT_VOICE = "marin";

function usage() {
  console.log(`Usage:
  OPENAI_API_KEY=... node scripts/generate-chunk-audio.mjs [options]

Options:
  --limit <number>       Generate only the first number of examples
  --output <directory>   Output directory (default: ${DEFAULT_OUTPUT_DIRECTORY})
  --source <file>        Source Markdown file (default: ${DEFAULT_SOURCE})
  --voice <name>         Voice (default: OPENAI_TTS_VOICE or ${DEFAULT_VOICE})
  --speed <number>       Speech speed, from 0.25 to 4 (default: 1)
  --expected-count <n>   Stop if the source does not contain exactly n examples
  --skip-existing        Leave existing MP3 files untouched
  --dry-run              List output files without calling the API
  --help                 Show this help
`);
}

function parseArguments(argv) {
  const options = { limit: Infinity, output: DEFAULT_OUTPUT_DIRECTORY, source: DEFAULT_SOURCE, dryRun: false, skipExisting: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help") return { help: true };
    if (argument === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (argument === "--skip-existing") {
      options.skipExisting = true;
      continue;
    }
    if (["--limit", "--output", "--source", "--voice", "--speed", "--expected-count"].includes(argument)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${argument} needs a value.`);
      index += 1;
      if (argument === "--limit") options.limit = Number(value);
      else if (argument === "--output") options.output = value;
      else if (argument === "--source") options.source = value;
      else if (argument === "--voice") options.voice = value;
      else if (argument === "--speed") options.speed = Number(value);
      else if (argument === "--expected-count") options.expectedCount = Number(value);
      continue;
    }
    throw new Error(`Unknown option: ${argument}`);
  }
  if (options.limit !== Infinity && (!Number.isInteger(options.limit) || options.limit < 1)) {
    throw new Error("--limit must be a positive integer.");
  }
  if (options.speed !== undefined && (!Number.isFinite(options.speed) || options.speed < 0.25 || options.speed > 4)) {
    throw new Error("--speed must be between 0.25 and 4.");
  }
  if (options.expectedCount !== undefined && (!Number.isInteger(options.expectedCount) || options.expectedCount < 1)) {
    throw new Error("--expected-count must be a positive integer.");
  }
  return options;
}

function textWithoutMarkdown(text) {
  return text.replace(/\*\*/g, "").replace(/`/g, "").trim();
}

function parseExamples(markdown) {
  const examples = [];
  let chunk = null;
  for (const line of markdown.split(/\r?\n/)) {
    const heading = line.match(/^###\s+(\d+)\.\s+(.+?)(?:（(.+)）)?$/);
    if (heading) {
      chunk = { number: Number(heading[1]), chunk: heading[2].trim(), meaning: (heading[3] || "").trim(), exampleNumber: 0 };
      continue;
    }
    const example = line.match(/^-\s+\(([DBEI])\)\s+(.+)$/);
    if (!chunk || !example) continue;
    chunk.exampleNumber += 1;
    examples.push({
      chunkNumber: chunk.number,
      chunk: chunk.chunk,
      meaning: chunk.meaning,
      category: ({ D: "daily", B: "business", E: "edtech", I: "it" })[example[1]],
      exampleNumber: chunk.exampleNumber,
      text: textWithoutMarkdown(example[2]),
    });
  }
  return examples;
}

function filenameFor(example) {
  return `${String(example.chunkNumber).padStart(3, "0")}-${String(example.exampleNumber).padStart(2, "0")}.mp3`;
}

async function generateAudio(apiKey, example, outputPath, { voice, speed }) {
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_TTS_MODEL || DEFAULT_MODEL,
      voice,
      input: example.text,
      instructions: "Read this English clearly and naturally at a moderate pace for a Japanese English learner.",
      response_format: "mp3",
      speed,
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`${filenameFor(example)}: OpenAI returned ${response.status}. ${detail.slice(0, 240)}`);
  }
  const audio = Buffer.from(await response.arrayBuffer());
  if (!audio.length) throw new Error(`${filenameFor(example)}: OpenAI returned empty audio.`);
  await writeFile(outputPath, audio);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) return usage();

  const examples = parseExamples(await readFile(options.source, "utf8"));
  if (options.expectedCount !== undefined && examples.length !== options.expectedCount) {
    throw new Error(`Expected ${options.expectedCount} examples but found ${examples.length}.`);
  }
  const selected = examples.slice(0, options.limit);
  const voice = options.voice || process.env.OPENAI_TTS_VOICE || DEFAULT_VOICE;
  const speed = options.speed ?? 1;
  let targets = selected;

  if (options.skipExisting) {
    let existingFiles = new Set();
    try {
      existingFiles = new Set(await readdir(options.output));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    targets = selected.filter((example) => !existingFiles.has(filenameFor(example)));
  }

  if (options.dryRun) {
    for (const example of targets) console.log(`${filenameFor(example)}\t${example.text}`);
    console.log(`\n${targets.length} files would be created in ${options.output}.`);
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set. Set it only for this command; do not put it in source code.");

  await mkdir(options.output, { recursive: true });
  for (const [index, example] of targets.entries()) {
    const outputPath = path.join(options.output, filenameFor(example));
    await generateAudio(apiKey, example, outputPath, { voice, speed });
    console.log(`[${index + 1}/${targets.length}] ${outputPath}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

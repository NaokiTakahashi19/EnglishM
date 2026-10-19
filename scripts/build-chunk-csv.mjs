#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";

const source = "chunks_120_examples.md";
const output = "../ChunkResponse/chunks_120_examples.csv";

function escapeCsv(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function parseRows(markdown) {
  const rows = [];
  let chunk = null;
  for (const line of markdown.split(/\r?\n/)) {
    const heading = line.match(/^###\s+(\d+)\.\s+(.+?)（(.+)）$/);
    if (heading) {
      chunk = { number: Number(heading[1]), text: heading[2].trim(), ja: heading[3].trim(), exampleNumber: 0 };
      continue;
    }
    const example = line.match(/^-\s+\(([DB])\)\s+(.+)$/);
    if (!chunk || !example) continue;
    chunk.exampleNumber += 1;
    const number = String(chunk.number).padStart(3, "0");
    const exampleNumber = String(chunk.exampleNumber).padStart(2, "0");
    rows.push({
      id: `${number}-${exampleNumber}`,
      category: example[1] === "D" ? "日常" : "ビジネス",
      chunk: chunk.text,
      chunkJa: chunk.ja,
      exampleNumber: chunk.exampleNumber,
      example: example[2].replaceAll("**", ""),
      exampleJa: "",
      audioFile: `chunk-audio/${number}-${exampleNumber}.mp3`,
    });
  }
  if (rows.length !== 360) throw new Error(`Expected 360 rows but found ${rows.length}.`);
  return rows;
}

const markdown = await readFile(source, "utf8");
const rows = parseRows(markdown);
const header = ["id", "区分", "チャンク", "チャンク日本語訳", "例文番号", "英文", "例文日本語訳", "音声ファイル"];
const csv = [header, ...rows.map((row) => [row.id, row.category, row.chunk, row.chunkJa, row.exampleNumber, row.example, row.exampleJa, row.audioFile])]
  .map((row) => row.map(escapeCsv).join(","))
  .join("\n");
await writeFile(output, `\uFEFF${csv}\n`, "utf8");
console.log(`Wrote ${rows.length} rows to ${output}`);

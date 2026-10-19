import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const outputRoot = resolve(projectRoot, "www");
const files = [
  "index.html",
  "app.js",
  "styles.css",
  "tokens.css",
  "manifest.webmanifest",
  "sw.js",
  "transcription-worker.js",
];

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });

await Promise.all(files.map((file) => (
  cp(resolve(projectRoot, file), resolve(outputRoot, file))
)));
await cp(resolve(projectRoot, "icons"), resolve(outputRoot, "icons"), { recursive: true });

console.log(`Android用Web資産を ${outputRoot} に作成しました。`);

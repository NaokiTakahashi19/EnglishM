const crypto = require("node:crypto");

const DEFAULT_ALLOWED_ORIGINS = [
  "https://naokitakahashi19.github.io",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "http://localhost:4174",
  "http://127.0.0.1:4174",
];
const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
const ALLOWED_EXTENSIONS = /\.(mp3|mp4|mpeg|mpga|m4a|wav|webm)$/i;

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function allowedOrigins() {
  const configured = String(process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...configured]);
}

function isAllowedOrigin(req, origin) {
  if (!origin) return true;
  if (allowedOrigins().has(origin)) return true;
  try {
    const requestHost = req.headers["x-forwarded-host"] || req.headers.host;
    return new URL(origin).host === requestHost;
  } catch {
    return false;
  }
}

function audioFilename(headerValue) {
  let decoded = "audio.mp3";
  try {
    decoded = decodeURIComponent(String(headerValue || "audio.mp3"));
  } catch {
    decoded = String(headerValue || "audio.mp3");
  }
  const basename = decoded.split(/[\\/]/).pop().replace(/[^a-zA-Z0-9._ -]/g, "_");
  return basename || "audio.mp3";
}

async function requestBuffer(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (req.body instanceof Uint8Array) return Buffer.from(req.body);
  if (typeof req.body === "string") return Buffer.from(req.body, "binary");

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_AUDIO_BYTES) {
      const error = new Error("Audio too large");
      error.status = 413;
      throw error;
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

module.exports = async function transcribe(req, res) {
  const origin = req.headers.origin;
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Vary", "Origin");

  if (!isAllowedOrigin(req, origin)) {
    return res.status(403).json({ error: "Origin not allowed" });
  }
  if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, X-Translation-Key, X-Audio-Filename, X-Audio-Type",
  );
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.OPENAI_API_KEY;
  const accessKey = process.env.TRANSLATION_ACCESS_KEY;
  if (!apiKey || !accessKey) {
    return res.status(503).json({ error: "OpenAI service is not configured" });
  }
  if (!safeEqual(req.headers["x-translation-key"], accessKey)) {
    return res.status(401).json({ error: "Invalid access key" });
  }

  const filename = audioFilename(req.headers["x-audio-filename"]);
  if (!ALLOWED_EXTENSIONS.test(filename)) {
    return res.status(400).json({ error: "Unsupported audio format" });
  }

  let audio;
  try {
    audio = await requestBuffer(req);
  } catch (error) {
    return res.status(error?.status === 413 ? 413 : 400).json({ error: "Invalid audio body" });
  }
  if (!audio.length) return res.status(400).json({ error: "Audio is empty" });
  if (audio.length > MAX_AUDIO_BYTES) return res.status(413).json({ error: "Audio too large" });

  const contentType = String(req.headers["x-audio-type"] || "application/octet-stream")
    .split(";", 1)[0]
    .trim();
  const form = new FormData();
  form.append("file", new Blob([audio], { type: contentType }), filename);
  form.append("model", "whisper-1");
  form.append("language", "en");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");

  try {
    const openAIResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!openAIResponse.ok) {
      console.error("OpenAI Audio API error", openAIResponse.status, await openAIResponse.text());
      const status = openAIResponse.status === 429 ? 429 : 502;
      return res.status(status).json({ error: "OpenAI request failed" });
    }

    const result = await openAIResponse.json();
    const text = String(result.text || "").trim();
    const words = Array.isArray(result.words)
      ? result.words
          .map((word) => ({
            text: String(word.word || "").trim(),
            start: Number(word.start),
            end: Number(word.end),
          }))
          .filter((word) => word.text && Number.isFinite(word.start))
      : [];
    if (!text) return res.status(502).json({ error: "OpenAI returned no transcript" });
    return res.status(200).json({ text, words, source: "openai-whisper-1" });
  } catch (error) {
    console.error("Transcription endpoint failed", error);
    return res.status(502).json({ error: "Transcription request failed" });
  }
};

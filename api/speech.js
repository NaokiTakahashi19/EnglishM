const crypto = require("node:crypto");

const DEFAULT_ALLOWED_ORIGINS = [
  "https://naokitakahashi19.github.io",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "http://localhost:4174",
  "http://127.0.0.1:4174",
];

const VOICES = new Set([
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "onyx",
  "nova",
  "sage",
  "shimmer",
  "verse",
  "marin",
  "cedar",
]);

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

function safeFilename(value) {
  const normalized = String(value || "english-practice")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return normalized || "english-practice";
}

module.exports = async function speech(req, res) {
  const origin = req.headers.origin;
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Vary", "Origin");

  if (!isAllowedOrigin(req, origin)) {
    return res.status(403).json({ error: "Origin not allowed" });
  }
  if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Translation-Key");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.OPENAI_API_KEY;
  const accessKey = process.env.TRANSLATION_ACCESS_KEY;
  if (!apiKey || !accessKey) {
    return res.status(503).json({ error: "Speech service is not configured" });
  }
  if (!safeEqual(req.headers["x-translation-key"], accessKey)) {
    return res.status(401).json({ error: "Invalid translation access key" });
  }

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
  } catch {
    return res.status(400).json({ error: "Invalid JSON" });
  }

  const text = String(body.text || "").trim();
  if (!text || text.length > 4096) {
    return res.status(400).json({ error: "Invalid text" });
  }

  const configuredVoice = String(process.env.OPENAI_TTS_VOICE || "marin").trim();
  const requestedVoice = String(body.voice || configuredVoice).trim();
  const voice = VOICES.has(requestedVoice) ? requestedVoice : configuredVoice;
  const requestedSpeed = Number(body.speed);
  const speed = Number.isFinite(requestedSpeed) && requestedSpeed >= 0.75 && requestedSpeed <= 1.25
    ? requestedSpeed
    : 1;

  try {
    const openAIResponse = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
        voice,
        input: text,
        instructions: "Read this English clearly and naturally at a moderate pace for a Japanese English learner.",
        response_format: "mp3",
        speed,
      }),
    });

    if (!openAIResponse.ok) {
      console.error("OpenAI speech API error", openAIResponse.status, await openAIResponse.text());
      const status = openAIResponse.status === 429 ? 429 : 502;
      return res.status(status).json({ error: "OpenAI speech request failed" });
    }

    const audio = Buffer.from(await openAIResponse.arrayBuffer());
    if (!audio.length) return res.status(502).json({ error: "OpenAI returned no audio" });

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", String(audio.length));
    res.setHeader("Content-Disposition", `inline; filename=\"${safeFilename(body.filename)}.mp3\"`);
    return res.status(200).send(audio);
  } catch (error) {
    console.error("Speech endpoint failed", error);
    return res.status(502).json({ error: "Speech request failed" });
  }
};

const crypto = require("node:crypto");

const DEFAULT_ALLOWED_ORIGINS = [
  "https://naokitakahashi19.github.io",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
];

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

function outputText(response) {
  return (response.output || [])
    .flatMap((item) => item.content || [])
    .filter((item) => item.type === "output_text")
    .map((item) => item.text || "")
    .join("\n")
    .trim();
}

module.exports = async function translate(req, res) {
  const origin = req.headers.origin;
  res.setHeader("Cache-Control", "no-store");
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
    return res.status(503).json({ error: "Translation service is not configured" });
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
  const type = body.type === "word" ? "word" : "full";
  const text = String(body.text || "").trim();
  const maximumLength = type === "word" ? 100 : 30_000;
  if (!text || text.length > maximumLength) {
    return res.status(400).json({ error: "Invalid text" });
  }

  const instructions = type === "word"
    ? "Translate the English word or short expression into concise, natural Japanese. Return only the Japanese meaning, without labels or explanation."
    : "Translate the English learning transcript into accurate, natural Japanese. Preserve paragraph breaks. Return only the Japanese translation, without labels, notes, or Markdown.";

  try {
    const openAIResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
        reasoning: { effort: "none" },
        instructions,
        input: text,
        store: false,
        max_output_tokens: type === "word" ? 120 : 12_000,
      }),
    });
    if (!openAIResponse.ok) {
      console.error("OpenAI Responses API error", openAIResponse.status, await openAIResponse.text());
      const status = openAIResponse.status === 429 ? 429 : 502;
      return res.status(status).json({ error: "OpenAI request failed" });
    }

    const translation = outputText(await openAIResponse.json());
    if (!translation) return res.status(502).json({ error: "OpenAI returned no translation" });
    return res.status(200).json({ translation });
  } catch (error) {
    console.error("Translation endpoint failed", error);
    return res.status(502).json({ error: "Translation request failed" });
  }
};

import { pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0";

const TRANSCRIPTION_MODEL_ID = "onnx-community/whisper-tiny.en_timestamped";
let transcriberPromise = null;
let transcriptionDevice = null;

function preferredDevice() {
  return "gpu" in self.navigator ? "webgpu" : "wasm";
}

function createTranscriber(device) {
  transcriptionDevice = device;
  return pipeline("automatic-speech-recognition", TRANSCRIPTION_MODEL_ID, {
    device,
    dtype: device === "webgpu" ? "q4" : "q8",
    progress_callback: (progress) => {
      self.postMessage({
        type: "progress",
        progress: progress.progress,
        status: progress.status,
        file: progress.file,
      });
    },
  });
}

function getTranscriber() {
  if (!transcriberPromise) {
    const device = preferredDevice();
    transcriberPromise = createTranscriber(device).catch((error) => {
      if (device !== "webgpu") throw error;
      return createTranscriber("wasm");
    });
  }
  return transcriberPromise;
}

self.addEventListener("message", async (event) => {
  const message = event.data;
  if (message.type !== "transcribe") return;

  try {
    const transcriber = await getTranscriber();
    self.postMessage({ type: "device", device: transcriptionDevice });
    const result = await transcriber(new Float32Array(message.audio), {
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: "word",
    });
    const words = Array.isArray(result.chunks)
      ? result.chunks.map((chunk) => ({ text: chunk.text, timestamp: chunk.timestamp }))
      : [];
    self.postMessage({ type: "result", id: message.id, text: result.text, words });
  } catch (error) {
    console.error("Transcription failed", error);
    self.postMessage({
      type: "error",
      id: message.id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

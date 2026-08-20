import { pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0";

const MODEL_ID = "onnx-community/whisper-tiny.en";
let transcriberPromise = null;
let activeDevice = null;

function createTranscriber(device) {
  activeDevice = device;
  return pipeline("automatic-speech-recognition", MODEL_ID, {
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
    const preferredDevice = "gpu" in self.navigator ? "webgpu" : "wasm";
    transcriberPromise = createTranscriber(preferredDevice).catch((error) => {
      if (preferredDevice !== "webgpu") throw error;
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
    self.postMessage({ type: "device", device: activeDevice });
    const result = await transcriber(new Float32Array(message.audio), {
      chunk_length_s: 30,
      stride_length_s: 5,
    });
    self.postMessage({ type: "result", id: message.id, text: result.text });
  } catch (error) {
    console.error("Transcription failed", error);
    self.postMessage({
      type: "error",
      id: message.id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

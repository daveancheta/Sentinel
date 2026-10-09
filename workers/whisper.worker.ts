import { env, pipeline } from "@huggingface/transformers";

let transcriber: any = null;
let loadedModel = "";
let busy = false;

async function load(model: string) {
  if (transcriber && loadedModel === model) return;
  transcriber = null;
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.localModelPath = "/models/";
  const webgpu = typeof navigator !== "undefined" && "gpu" in navigator;
  try {
    transcriber = await pipeline("automatic-speech-recognition", model, {
      device: webgpu ? "webgpu" : "wasm", dtype: "q8",
    });
  } catch (error) {
    if (!webgpu) throw error;
    transcriber = await pipeline("automatic-speech-recognition", model, { device: "wasm", dtype: "q8" });
  }
  loadedModel = model;
}

self.addEventListener("message", async (event: MessageEvent) => {
  const { type, id } = event.data;
  if (type === "init") {
    try { await load(event.data.model); self.postMessage({ type: "ready" }); }
    catch (error) { self.postMessage({ type: "error", error: String(error) }); }
    return;
  }
  if (type !== "transcribe" || busy) return;
  busy = true;
  try {
    await load(event.data.model);
    const audio = new Float32Array(event.data.audio);
    const result = await transcriber(audio, {
      sampling_rate: 16_000,
      return_timestamps: true,
      ...(event.data.language === "auto" ? {} : { language: event.data.language === "fil" ? "tagalog" : "english" }),
      task: "transcribe",
    });
    self.postMessage({ type: "transcript", id, text: String(result.text ?? "").trim() });
  } catch (error) { self.postMessage({ type: "error", id, error: String(error) }); }
  finally { busy = false; }
});

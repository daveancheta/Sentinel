import { env, pipeline } from "@huggingface/transformers";

let detector: any = null;
let busy = false;
const labels = ["door", "door handle", "glass door", "stairs", "elevator", "sign"];

async function init() {
  try {
    env.allowRemoteModels = false;
    env.allowLocalModels = true;
    env.localModelPath = "/models/";
    const useWebGPU = typeof navigator !== "undefined" && "gpu" in navigator;
    try {
      detector = await pipeline("zero-shot-object-detection", "Xenova/owlvit-base-patch32", {
        device: useWebGPU ? "webgpu" : "wasm",
        dtype: "q8",
      });
    } catch (gpuError) {
      if (!useWebGPU) throw gpuError;
      detector = await pipeline("zero-shot-object-detection", "Xenova/owlvit-base-patch32", { device: "wasm", dtype: "q8" });
    }
    self.postMessage({ type: "ready" });
  } catch (error) { self.postMessage({ type: "error", error: String(error) }); }
}

self.addEventListener("message", async (event: MessageEvent) => {
  if (event.data.type === "init") return init();
  if (event.data.type !== "frame") return;
  if (!detector || busy) { (event.data.bitmap as ImageBitmap).close(); return; }
  busy = true;
  const bitmap: ImageBitmap = event.data.bitmap;
  try {
    const results = await detector(bitmap, labels, { threshold: 0.12 });
    const detections = results.map((item: any) => ({
      label: String(item.label).toLowerCase(), score: item.score,
      bbox: { xMin: item.box.xmin / bitmap.width, yMin: item.box.ymin / bitmap.height,
        width: (item.box.xmax - item.box.xmin) / bitmap.width, height: (item.box.ymax - item.box.ymin) / bitmap.height },
    }));
    self.postMessage({ type: "detections", detections });
  } catch (error) { self.postMessage({ type: "error", error: String(error) }); }
  finally { bitmap.close(); busy = false; }
});

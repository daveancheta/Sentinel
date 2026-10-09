import { AutoModel, AutoProcessor, env } from "@huggingface/transformers";

let extractor: any = null;
let processor: any = null;
let busy = false;
self.addEventListener("message", async (event: MessageEvent) => {
  const { type, id, audio } = event.data;
  if (type !== "embed" || busy) return;
  busy = true;
  try {
    env.allowRemoteModels = false;
    env.allowLocalModels = true;
    env.localModelPath = "/models/";
    if (!extractor) {
      const webgpu = typeof navigator !== "undefined" && "gpu" in navigator;
      processor = await AutoProcessor.from_pretrained("Xenova/wavlm-base-plus-sv");
      try {
        extractor = await AutoModel.from_pretrained("Xenova/wavlm-base-plus-sv", { device: webgpu ? "webgpu" : "wasm", dtype: "q8" });
      } catch (error) {
        if (!webgpu) throw error;
        extractor = await AutoModel.from_pretrained("Xenova/wavlm-base-plus-sv", { device: "wasm", dtype: "q8" });
      }
    }
    const inputs = await processor(new Float32Array(audio));
    const result = await extractor(inputs);
    const embedding = new Float32Array(result.embeddings.data);
    (self as any).postMessage({ type: "embedding", id, embedding }, [embedding.buffer]);
  } catch (error) { (self as any).postMessage({ type: "error", id, error: String(error) }); }
  finally { busy = false; }
});

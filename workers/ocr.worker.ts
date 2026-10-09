import { createWorker, OEM } from "tesseract.js";

type Word = { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } };
let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
let busy = false;

async function init() {
  worker = await createWorker(["eng", "fil"], OEM.LSTM_ONLY, {
    workerPath: "/tesseract/worker.min.js",
    corePath: "/tesseract/tesseract-core.wasm.js",
    langPath: "/tesseract",
    gzip: true,
  });
  self.postMessage({ type: "ready" });
}

self.addEventListener("message", async (event: MessageEvent) => {
  if (event.data.type === "init") {
    try { await init(); } catch (error) { self.postMessage({ type: "error", error: String(error) }); }
    return;
  }
  if (event.data.type !== "frame") return;
  if (!worker || busy) { (event.data.bitmap as ImageBitmap).close(); return; }
  busy = true;
  const bitmap: ImageBitmap = event.data.bitmap;
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Hindi mabuksan ang larawan para sa OCR.");
    ctx.drawImage(bitmap, 0, 0);
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = image.data;
    // Grayscale and stretch contrast from the observed luminance range.
    let low = 255, high = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const gray = Math.round(pixels[i] * .299 + pixels[i + 1] * .587 + pixels[i + 2] * .114);
      pixels[i] = pixels[i + 1] = pixels[i + 2] = gray;
      low = Math.min(low, gray); high = Math.max(high, gray);
    }
    const scale = high > low ? 255 / (high - low) : 1;
    for (let i = 0; i < pixels.length; i += 4) {
      const value = Math.max(0, Math.min(255, (pixels[i] - low) * scale));
      pixels[i] = pixels[i + 1] = pixels[i + 2] = value;
    }
    ctx.putImageData(image, 0, 0);
    // Text is most likely on signs at eye level. Crop the central 70% vertically.
    const y = Math.round(canvas.height * .15);
    const crop = new OffscreenCanvas(canvas.width, Math.round(canvas.height * .7));
    const cropCtx = crop.getContext("2d");
    if (!cropCtx) throw new Error("Hindi ma-crop ang larawan.");
    cropCtx.drawImage(canvas, 0, y, canvas.width, crop.height, 0, 0, crop.width, crop.height);
    const result = await worker.recognize(crop);
    const words = (result.data.blocks ?? []).flatMap((block) => block.paragraphs.flatMap((paragraph) => paragraph.lines.flatMap((line) => line.words))).map((word) => ({
      text: word.text, confidence: word.confidence,
      bbox: { x0: word.bbox.x0 / crop.width, y0: (word.bbox.y0 + y) / canvas.height, x1: word.bbox.x1 / crop.width, y1: (word.bbox.y1 + y) / canvas.height },
    } satisfies Word));
    self.postMessage({ type: "words", words });
  } catch (error) { self.postMessage({ type: "error", error: String(error) }); }
  finally { bitmap.close(); busy = false; }
});

import { env, pipeline } from "@huggingface/transformers";
import * as ort from "onnxruntime-web";

let estimator: any = null;
let processing = false;

const GRID_COLS = 32;
const GRID_ROWS = 24;

function normalizeGrid(
  data: Float32Array,
  inputWidth: number,
  inputHeight: number,
): Float32Array {
  const grid = new Float32Array(GRID_COLS * GRID_ROWS);
  let max = 0;
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (v > max) max = v;
  }
  const scale = max > 0 ? 1 / max : 0;

  const cellW = inputWidth / GRID_COLS;
  const cellH = inputHeight / GRID_ROWS;

  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const y0 = Math.floor(r * cellH);
      const y1 = Math.floor((r + 1) * cellH);
      const x0 = Math.floor(c * cellW);
      const x1 = Math.floor((c + 1) * cellW);
      let sum = 0;
      let count = 0;
      for (let y = y0; y < y1 && y < inputHeight; y++) {
        for (let x = x0; x < x1 && x < inputWidth; x++) {
          sum += data[y * inputWidth + x];
          count++;
        }
      }
      const avg = count > 0 ? sum / count : 0;
      grid[r * GRID_COLS + c] = avg * scale;
    }
  }
  return grid;
}

async function init() {
  try {
    env.allowRemoteModels = false;
    env.allowLocalModels = true;
    env.localModelPath = "/models/";

    ort.env.wasm.wasmPaths = "/ort-wasm/";
    ort.env.wasm.numThreads = 1;

    const useWebGPU =
      typeof navigator !== "undefined" && "gpu" in navigator;

    try {
      estimator = await pipeline("depth-estimation", "onnx-community/depth-anything-v2-small", { device: useWebGPU ? "webgpu" : "wasm", dtype: "q8" });
    } catch (gpuError) {
      if (!useWebGPU) throw gpuError;
      estimator = await pipeline("depth-estimation", "onnx-community/depth-anything-v2-small", { device: "wasm", dtype: "q8" });
    }
    (self as any).postMessage({ type: "ready" });
  } catch (err) {
    (self as any).postMessage({ type: "error", error: String(err) });
  }
}

self.addEventListener("message", async (e: MessageEvent) => {
  const { type } = e.data;

  if (type === "init") {
    await init();
    return;
  }

  if (type === "frame") {
    if (!estimator || processing) return;
    processing = true;
    try {
      const bitmap: ImageBitmap = e.data.bitmap;
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("No 2d context");
      ctx.drawImage(bitmap, 0, 0);
      const { predicted_depth } = await estimator(canvas);
      const [height, width] = predicted_depth.dims.slice(-2);
      const data = predicted_depth.data as Float32Array;
      const grid = normalizeGrid(data, width, height);
      bitmap.close();
      (self as any).postMessage({
        type: "depth",
        grid,
        cols: GRID_COLS,
        rows: GRID_ROWS,
        frameTime: e.data.frameTime,
      });
    } catch (err) {
      (self as any).postMessage({ type: "error", error: String(err) });
    } finally {
      processing = false;
    }
  }
});

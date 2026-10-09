export interface DepthFrame {
  grid: Float32Array;
  cols: number;
  rows: number;
  frameTime: number;
}

export type DepthCallback = (frame: DepthFrame) => void;

let worker: Worker | null = null;
let callback: DepthCallback | null = null;
let readyResolve: (() => void) | null = null;
let readyReject: ((err: unknown) => void) | null = null;

export function initDepth(): Promise<void> {
  if (worker) {
    worker.terminate();
  }
  worker = new Worker(new URL("../workers/depth.worker.ts", import.meta.url));
  worker.onmessage = (e: MessageEvent) => {
    const { type } = e.data;
    if (type === "ready") {
      readyResolve?.();
      readyResolve = null;
    } else if (type === "error") {
      readyReject?.(e.data.error);
      readyReject = null;
    } else if (type === "depth") {
      callback?.(e.data);
    }
  };
  worker.onerror = (err) => {
    readyReject?.(err);
    readyReject = null;
  };
  worker.postMessage({ type: "init" });
  return new Promise<void>((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });
}

export function setDepthCallback(cb: DepthCallback | null) {
  callback = cb;
}

export function sendDepthFrame(bitmap: ImageBitmap, frameTime: number) {
  worker?.postMessage({ type: "frame", bitmap, frameTime }, [bitmap]);
}

export function stopDepth() {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  callback = null;
  readyResolve = null;
  readyReject = null;
}

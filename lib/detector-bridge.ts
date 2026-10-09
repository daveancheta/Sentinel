import type { BBox } from "./geometry";

export interface Detection {
  label: string;
  score: number;
  bbox: BBox;
}

export type DetectionCallback = (detections: Detection[], frameTime: number) => void;

let worker: Worker | null = null;
let callback: DetectionCallback | null = null;
let readyResolve: (() => void) | null = null;
let readyReject: ((err: unknown) => void) | null = null;

export function initDetector(model = "efficientdet_lite0"): Promise<void> {
  if (worker) {
    worker.terminate();
  }
  worker = new Worker(new URL("../workers/detector.worker.ts", import.meta.url));
  worker.onmessage = (e: MessageEvent) => {
    const { type } = e.data;
    if (type === "ready") {
      readyResolve?.();
      readyResolve = null;
    } else if (type === "error") {
      readyReject?.(e.data.error);
      readyReject = null;
    } else if (type === "detections") {
      callback?.(e.data.detections, e.data.frameTime ?? performance.now());
    }
  };
  worker.onerror = (err) => {
    readyReject?.(err);
    readyReject = null;
  };
  worker.postMessage({ type: "init", model });
  return new Promise<void>((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });
}

export function setDetectionCallback(cb: DetectionCallback | null) {
  callback = cb;
}

export function sendFrame(bitmap: ImageBitmap, frameTime: number) {
  worker?.postMessage({ type: "frame", bitmap, frameTime }, [bitmap]);
}

export function stopDetector() {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  callback = null;
  readyResolve = null;
  readyReject = null;
}

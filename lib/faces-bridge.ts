import type { BBox } from "./geometry";

export interface Face {
  bbox: BBox;
  confidence: number;
  embedding: number[];
  emotion: string;
  emotionScore: number;
}

export type FacesCallback = (faces: Face[], frameTime: number) => void;

let worker: Worker | null = null;
let callback: FacesCallback | null = null;
let readyResolve: (() => void) | null = null;
let readyReject: ((err: unknown) => void) | null = null;

export function initFaces(): Promise<void> {
  if (worker) {
    worker.terminate();
  }
  worker = new Worker(new URL("../workers/faces.worker.ts", import.meta.url));
  worker.onmessage = (e: MessageEvent) => {
    const { type } = e.data;
    if (type === "ready") {
      readyResolve?.();
      readyResolve = null;
    } else if (type === "error") {
      readyReject?.(e.data.error);
      readyReject = null;
    } else if (type === "faces") {
      callback?.(e.data.faces, e.data.frameTime ?? performance.now());
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

export function setFacesCallback(cb: FacesCallback | null) {
  callback = cb;
}

export function sendFacesFrame(bitmap: ImageBitmap, frameTime: number) {
  worker?.postMessage({ type: "frame", bitmap, frameTime }, [bitmap]);
}

export function stopFaces() {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  callback = null;
  readyResolve = null;
  readyReject = null;
}

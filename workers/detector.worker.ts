import { FilesetResolver, ObjectDetector } from "@mediapipe/tasks-vision";

let detector: ObjectDetector | null = null;
let processing = false;

interface DetectionMsg {
  label: string;
  score: number;
  bbox: { xMin: number; yMin: number; width: number; height: number };
}

async function init(modelName: string) {
  try {
    const wasmPath = "/mediapipe/wasm";
    const vision = await FilesetResolver.forVisionTasks(wasmPath);
    const canvas = new OffscreenCanvas(640, 480);
    const options = {
      baseOptions: { modelAssetPath: `/models/mediapipe/${modelName}.tflite` },
      canvas, scoreThreshold: 0.4, runningMode: "VIDEO" as const,
    };
    try { detector = await ObjectDetector.createFromOptions(vision, { ...options, baseOptions: { ...options.baseOptions, delegate: "GPU" } }); }
    catch { detector = await ObjectDetector.createFromOptions(vision, { ...options, baseOptions: { ...options.baseOptions, delegate: "CPU" } }); }
    (self as any).postMessage({ type: "ready" });
  } catch (err) {
    (self as any).postMessage({ type: "error", error: String(err) });
  }
}

self.addEventListener("message", async (e: MessageEvent) => {
  const { type } = e.data;

  if (type === "init") {
    await init(e.data.model ?? "efficientdet_lite0");
    return;
  }

  if (type === "frame") {
    if (!detector || processing) {
      (e.data.bitmap as ImageBitmap | undefined)?.close();
      return;
    }
    processing = true;
    try {
      const bitmap: ImageBitmap = e.data.bitmap;
      const timestamp = e.data.timestamp ?? performance.now();
      const result = detector.detectForVideo(bitmap, timestamp);
      const w = bitmap.width;
      const h = bitmap.height;
      const detections: DetectionMsg[] = result.detections
        .map((d) => {
          const cat = d.categories[0];
          const box = d.boundingBox;
          if (!box) return null;
          return {
            label: cat?.categoryName ?? "unknown",
            score: cat?.score ?? 0,
            bbox: {
              xMin: box.originX / w,
              yMin: box.originY / h,
              width: box.width / w,
              height: box.height / h,
            },
          };
        })
        .filter((d): d is DetectionMsg => d !== null);
      bitmap.close();
      (self as any).postMessage({ type: "detections", detections, frameTime: e.data.frameTime });
    } catch (err) {
      (self as any).postMessage({ type: "error", error: String(err) });
    } finally {
      processing = false;
    }
  }
});

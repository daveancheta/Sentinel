import Human from "@vladmandic/human";
import type { Config, FaceResult } from "@vladmandic/human";

let human: Human | null = null;
let processing = false;

interface FaceMsg {
  bbox: { xMin: number; yMin: number; width: number; height: number };
  confidence: number;
  embedding: number[];
  emotion: string;
  emotionScore: number;
}

const config: Partial<Config> = {
  modelBasePath: "/models/human",
  backend: "webgl",
  debug: false,
  async: true,
  warmup: "none",
  cacheModels: true,
  validateModels: false,
  filter: { enabled: false },
  gesture: { enabled: false },
  face: {
    enabled: true,
    detector: {
      modelPath: "blazeface.json",
      maxDetected: 10,
      minConfidence: 0.25,
      iouThreshold: 0.3,
      scale: 1.4,
      rotation: false,
      skipFrames: 0,
      skipTime: 0,
      minSize: 0,
      mask: false,
      return: false,
    },
    mesh: { enabled: false },
    attention: { enabled: false },
    iris: { enabled: false },
    emotion: {
      enabled: true,
      modelPath: "emotion.json",
      minConfidence: 0.05,
      skipFrames: 0,
      skipTime: 0,
    },
    description: {
      enabled: true,
      modelPath: "faceres.json",
      minConfidence: 0.05,
      skipFrames: 0,
      skipTime: 0,
    },
    antispoof: { enabled: false },
    liveness: { enabled: false },
    gear: { enabled: false },
  },
  body: { enabled: false },
  hand: { enabled: false },
  object: { enabled: false },
  segmentation: { enabled: false },
};

async function init() {
  try {
    human = new Human(config);
    await human.load();
    (self as any).postMessage({ type: "ready" });
  } catch (err) {
    (self as any).postMessage({ type: "error", error: String(err) });
  }
}

async function detect(bitmap: ImageBitmap, frameTime: number) {
  if (!human || processing) {
    bitmap.close();
    return;
  }
  processing = true;
  try {
    const result = await human.detect(bitmap);
    const faces: FaceMsg[] = (result.face ?? []).map((f: FaceResult) => {
      const [x, y, w, h] = f.boxRaw ?? f.box ?? [0, 0, 0, 0];
      const topEmotion = (f.emotion ?? []).sort((a, b) => b.score - a.score)[0];
      return {
        bbox: { xMin: x, yMin: y, width: w, height: h },
        confidence: f.score,
        embedding: f.embedding ?? [],
        emotion: topEmotion?.emotion ?? "neutral",
        emotionScore: topEmotion?.score ?? 0,
      };
    });
    bitmap.close();
    (self as any).postMessage({ type: "faces", faces, frameTime });
  } catch (err) {
    bitmap.close();
    (self as any).postMessage({ type: "error", error: String(err) });
  } finally {
    processing = false;
  }
}

self.addEventListener("message", async (e: MessageEvent) => {
  const { type } = e.data;
  if (type === "init") {
    await init();
  } else if (type === "frame") {
    await detect(e.data.bitmap, e.data.frameTime ?? performance.now());
  }
});

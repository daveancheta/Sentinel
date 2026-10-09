import { announce, announceUncertain } from "../lib/speech/announcer";
import { playEarcon } from "../lib/audio/earcons";
import { startCamera, stopCamera } from "../lib/camera";
import { matchSignWords, type OcrWord } from "./signs";

let active = false, worker: Worker | null = null, ocrWorker: Worker | null = null, lastPosition = "", lastText = "", lastFrameAt = 0, reachedHandle = false, lastUncertainAt = 0;
export async function startDoorMode() {
  stopDoorMode(); active = true; lastFrameAt = 0;
  worker = new Worker(new URL("../workers/zeroshot.worker.ts", import.meta.url));
  ocrWorker = new Worker(new URL("../workers/ocr.worker.ts", import.meta.url));
  ocrWorker.onmessage = (event: MessageEvent) => {
    if (event.data.type !== "words" || !active) return;
    for (const item of matchSignWords(event.data.words as OcrWord[])) {
      if (item.kind === "PUSH/TULAK" || item.kind === "PULL/HILA") {
        const line = item.kind === "PUSH/TULAK" ? "Itulak para bumukas." : "Hilahin para bumukas.";
        if (line !== lastText) { announce(line, "INFO"); lastText = line; }
      }
    }
  };
  ocrWorker.postMessage({ type: "init" });
  worker.onmessage = (event: MessageEvent) => {
    if (event.data.type === "error") { announce(`Hindi gumana ang pagkilala sa pinto. ${event.data.error}`, "WARNING"); return; }
    if (event.data.type !== "detections" || !active) return;
    const detections = event.data.detections as Array<{ label: string; score: number; bbox: { xMin: number; yMin: number; width: number; height: number } }>;
    const door = detections.filter((d) => d.label.includes("door") && !d.label.includes("handle")).sort((a, b) => b.score - a.score)[0];
    if (!door) return;
    if (door.score < 0.4) {
      if (Date.now() - lastUncertainAt > 5000) { lastUncertainAt = Date.now(); announceUncertain(); }
      return;
    }
    const center = door.bbox.xMin + door.bbox.width / 2;
    const side = center < .38 ? "kaliwa" : center > .62 ? "kanan" : "harap";
    const handle = detections.filter((d) => d.label.includes("handle") && d.bbox.yMin + d.bbox.height > door.bbox.yMin && d.bbox.yMin < door.bbox.yMin + door.bbox.height).sort((a, b) => b.score - a.score)[0];
    const handleSide = handle ? (handle.bbox.xMin + handle.bbox.width / 2 < center ? "kaliwa" : "kanan") : null;
    const position = `${side}:${handleSide ?? "?"}`;
    if (position !== lastPosition) { announce(handleSide ? `May pinto sa ${side}, ang hawakan ay nasa ${handleSide}.` : `May pinto sa ${side}. Hindi malinaw ang hawakan.`, "INFO"); lastPosition = position; }
    const guideCenter = handle ? handle.bbox.xMin + handle.bbox.width / 2 : center;
    const guideHeight = handle?.bbox.height ?? door.bbox.height;
    const pan = Math.max(-1, Math.min(1, (guideCenter - .5) * 2));
    if (handle && !reachedHandle && Math.abs(guideCenter - .5) < .12 && guideHeight > .12) {
      reachedHandle = true;
      announce("Nasa gitna at malapit ang hawakan.", "INFO");
    } else if (!reachedHandle) playEarcon("sonar", pan, Math.min(1, guideHeight / .35));
  };
  worker.postMessage({ type: "init" });
  await startCamera({ fps: 1, facingMode: "environment" }, (frame) => {
    if (!active || frame.timestamp - lastFrameAt < 2000) { frame.bitmap.close(); return; }
    lastFrameAt = frame.timestamp;
    const copy = createImageBitmap(frame.bitmap).then((bitmap) => {
      if (active && ocrWorker) ocrWorker.postMessage({ type: "frame", bitmap }, [bitmap]); else bitmap.close();
    }).catch(() => {});
    void copy;
    if (worker) worker.postMessage({ type: "frame", bitmap: frame.bitmap }, [frame.bitmap]); else frame.bitmap.close();
  });
  announce("Hinahanap ang pinto at hawakan.", "INFO");
}
export function stopDoorMode() { active = false; stopCamera(); worker?.terminate(); ocrWorker?.terminate(); worker = null; ocrWorker = null; lastPosition = ""; lastText = ""; reachedHandle = false; }

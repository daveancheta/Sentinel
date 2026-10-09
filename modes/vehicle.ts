import { playEarcon } from "../lib/audio/earcons";
import { startCamera, stopCamera } from "../lib/camera";
import {
  center,
  directionFromCenter,
  Tracker,
  type BBox,
} from "../lib/geometry";
import { getStrings } from "../lib/i18n";
import { getCurrentLanguage } from "../lib/speech/announcer";
import { vibrate } from "../lib/haptics";
import { announce } from "../lib/speech/announcer";
import { initDetector, sendFrame, setDetectionCallback, stopDetector } from "../lib/detector-bridge";

const VEHICLES = new Set(["car", "motorcycle", "bicycle", "bus", "truck"]);

let active = false;
let tracker: Tracker | null = null;
const cooldowns: Record<number, number> = {};

function localVehicleName(label: string, s: ReturnType<typeof getStrings>): string {
  const key = label as keyof typeof s.modes.vehicle;
  return (s.modes.vehicle[key] as string | undefined) ?? label;
}

export function initVehicleTracker(): void {
  tracker = new Tracker();
}

export function processVehicleDetections(
  detections: { label: string; score: number; bbox: BBox }[],
  frameTime: number,
): void {
  if (!tracker) return;
  const s = getStrings(getCurrentLanguage());
  const vehicleDets = detections
    .filter((d) => VEHICLES.has(d.label.toLowerCase()))
    .map((d) => ({ ...d, bbox: d.bbox as BBox }));
  const tracks = tracker.update(vehicleDets, frameTime);

  for (const t of tracks) {
    const cx = center(t.bbox).x;
    const { side, pan } = directionFromCenter(cx);
    const growing = t.growthRate > 0.00005;
    const enteringFromEdge =
      (cx < 0.2 && t.horizontalVelocity > 0.0005) ||
      (cx > 0.8 && t.horizontalVelocity < -0.0005);
    const now = frameTime;
    const lastWarn = cooldowns[t.id] ?? 0;
    if ((growing || enteringFromEdge) && now - lastWarn > 2500) {
      cooldowns[t.id] = now;
      const name = localVehicleName(t.label, s);
      const sideName = s.modes.directions[side];
      const msg = `${name} ${s.modes.vehicle.warning} ${sideName}!`;
      announce(msg, "DANGER");
      playEarcon("vehicle", pan);
      vibrate("danger");
    }
  }
}

export async function startVehicleMode(): Promise<void> {
  if (active) return;
  active = true;
  const s = getStrings(getCurrentLanguage());
  initVehicleTracker();
  await initDetector("efficientdet_lite0");

  setDetectionCallback((detections, frameTime) => {
    if (!active) return;
    processVehicleDetections(detections, frameTime);
  });

  await startCamera({ fps: 6, facingMode: "environment" }, (frame) => {
    if (active) sendFrame(frame.bitmap, frame.timestamp);
  });

  announce(s.modes.walkingOn, "INFO");
}

export function stopVehicleMode(): void {
  active = false;
  setDetectionCallback(null);
  stopCamera();
  stopDetector();
}

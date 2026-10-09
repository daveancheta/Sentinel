import { playEarcon } from "../lib/audio/earcons";
import { startCamera, stopCamera } from "../lib/camera";
import {
  area,
  center,
  directionFromCenter,
  distanceFromHeight,
  distanceSteps,
  overlap,
  Tracker,
  type BBox,
} from "../lib/geometry";
import type { Detection } from "../lib/detector-bridge";
import { getStrings } from "../lib/i18n";
import { announce, getCurrentLanguage } from "../lib/speech/announcer";
import { vibrate } from "../lib/haptics";
import { initDetector, sendFrame, setDetectionCallback, stopDetector } from "../lib/detector-bridge";

const SEAT_CLASSES = new Set(["chair", "bench", "couch"]);

interface SeatCandidate {
  label: string;
  score: number;
  bbox: BBox;
}

let active = false;
let sonarTimer: ReturnType<typeof setInterval> | null = null;
let targetSeat: SeatCandidate | null = null;
let alreadyInFront = false;

function findEmptySeats(detections: Detection[]): SeatCandidate[] {
  const seats = detections.filter((d) => SEAT_CLASSES.has(d.label.toLowerCase()));
  const people = detections.filter((d) => d.label.toLowerCase() === "person");
  const empty: SeatCandidate[] = [];

  for (const seat of seats) {
    const upper: BBox = {
      xMin: seat.bbox.xMin,
      yMin: seat.bbox.yMin,
      width: seat.bbox.width,
      height: seat.bbox.height * 0.5,
    };
    const upperArea = area(upper);
    const occupied = people.some((p) => overlap(upper, p.bbox) > 0.3 * upperArea);
    if (!occupied) {
      empty.push(seat as SeatCandidate);
    }
  }

  if (empty.length === 0 && people.length >= 2) {
    const sorted = [...people].sort((a, b) => center(a.bbox).x - center(b.bbox).x);
    for (let i = 0; i < sorted.length - 1; i++) {
      const left = sorted[i].bbox;
      const right = sorted[i + 1].bbox;
      const gapLeft = left.xMin + left.width;
      const gapRight = right.xMin;
      const gapWidth = gapRight - gapLeft;
      if (gapWidth > 0.2) {
        empty.push({
          label: "bench",
          score: 0.5,
          bbox: {
            xMin: gapLeft,
            yMin: Math.min(left.yMin, right.yMin),
            width: gapWidth,
            height: Math.max(left.height, right.height),
          },
        });
      }
    }
  }

  return empty;
}

function startSonar() {
  if (sonarTimer) return;
  sonarTimer = setInterval(() => {
    if (!active || !targetSeat) return;
    const cx = center(targetSeat.bbox).x;
    const h = targetSeat.bbox.height;
    const { pan } = directionFromCenter(cx);
    const centeredness = Math.max(0, 1 - Math.abs(cx - 0.5) * 2);
    const proximity = Math.min(1, h / 0.6) * centeredness;
    playEarcon("sonar", pan, proximity);
  }, 300);
}

export async function startSeatMode(): Promise<void> {
  if (active) return;
  active = true;
  targetSeat = null;
  alreadyInFront = false;
  const s = getStrings(getCurrentLanguage());
  await initDetector("efficientdet_lite0");

  setDetectionCallback((detections, frameTime) => {
    if (!active) return;
    const emptySeats = findEmptySeats(detections);
    if (emptySeats.length > 0) {
      targetSeat = emptySeats.reduce((a, b) => (area(a.bbox) > area(b.bbox) ? a : b));
    }

    if (targetSeat) {
      const cx = center(targetSeat.bbox).x;
      const h = targetSeat.bbox.height;
      const { side } = directionFromCenter(cx);
      const steps = distanceSteps(h);
      const dist = distanceFromHeight(h);

      if (!alreadyInFront && h > 0.5 && Math.abs(cx - 0.5) < 0.2) {
        alreadyInFront = true;
        announce(s.modes.seat.inFront, "INFO");
        vibrate("confirm");
      }

      if (!sonarTimer) {
        const sideName = s.modes.seat[side];
        announce(`${s.modes.seat.emptySeat}, ${steps} ${s.modes.seat.steps} ${s.modes.seat.toYour} ${sideName}.`, "INFO");
        startSonar();
      }
    }
  });

  await startCamera({ fps: 4, facingMode: "environment" }, (frame) => {
    if (active) sendFrame(frame.bitmap, frame.timestamp);
  });

  announce(s.modes.seatOn, "INFO");
}

export function stopSeatMode(): void {
  active = false;
  targetSeat = null;
  alreadyInFront = false;
  if (sonarTimer) {
    clearInterval(sonarTimer);
    sonarTimer = null;
  }
  setDetectionCallback(null);
  stopCamera();
  stopDetector();
}

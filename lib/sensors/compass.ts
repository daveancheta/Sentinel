import { announce, getCurrentLanguage } from "../speech/announcer";
import { getStrings } from "../i18n";

let listener: ((heading: number) => void) | null = null;
let orientationHandler: ((e: DeviceOrientationEvent) => void) | null = null;
let active = false;
let smoothed: number | null = null;
let smoothingAlpha = 0.2;
let unstableCount = 0;
let calibrateAnnouncedAt = 0;

export function normalizeHeading(deg: number): number {
  const v = deg % 360;
  return v < 0 ? v + 360 : v;
}

export function shortestAngleDelta(from: number, to: number): number {
  const diff = normalizeHeading(to - from);
  if (diff > 180) return diff - 360;
  return diff;
}

function handleOrientation(e: DeviceOrientationEvent) {
  const anyE = e as any;
  let raw: number | null = null;

  if (typeof anyE.webkitCompassHeading === "number" && !Number.isNaN(anyE.webkitCompassHeading)) {
    raw = normalizeHeading(anyE.webkitCompassHeading);
  } else if (e.absolute && typeof e.alpha === "number" && typeof e.beta === "number" && typeof e.gamma === "number") {
    const c = -(e.alpha + (e.beta * e.gamma) / 90);
    raw = normalizeHeading(c);
  } else if (e.absolute && typeof e.alpha === "number") {
    raw = normalizeHeading(360 - e.alpha);
  }

  if (raw === null || Number.isNaN(raw)) return;

  if (smoothed === null) {
    smoothed = raw;
  } else {
    const delta = shortestAngleDelta(smoothed, raw);
    smoothed = normalizeHeading(smoothed + delta * smoothingAlpha);
  }

  if (smoothed !== null) {
    const diff = Math.abs(shortestAngleDelta(smoothed, raw));
    if (diff > 20) {
      unstableCount++;
    } else {
      unstableCount = 0;
    }
    if (unstableCount >= 5 && Date.now() - calibrateAnnouncedAt > 12000) {
      calibrateAnnouncedAt = Date.now();
      const s = getStrings(getCurrentLanguage());
      announce(s.compass.calibrateTip, "WARNING");
      unstableCount = 0;
    }
  }

  listener?.(smoothed);
}

export async function requestCompassPermission(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const ctor = window.DeviceOrientationEvent as any;
  if (typeof ctor?.requestPermission === "function") {
    try {
      const result = await ctor.requestPermission();
      return result === "granted";
    } catch {
      return false;
    }
  }
  return true;
}

export function startCompass(callback: (heading: number) => void): void {
  if (active) stopCompass();
  listener = callback;
  active = true;
  smoothed = null;
  unstableCount = 0;
  orientationHandler = handleOrientation;
  window.addEventListener("deviceorientationabsolute", handleOrientation);
  window.addEventListener("deviceorientation", handleOrientation);
}

export function stopCompass(): void {
  active = false;
  listener = null;
  if (orientationHandler) {
    window.removeEventListener("deviceorientationabsolute", orientationHandler);
    window.removeEventListener("deviceorientation", orientationHandler);
    orientationHandler = null;
  }
  smoothed = null;
  unstableCount = 0;
}

export function getHeading(): number | null {
  return smoothed;
}

export function setSmoothingAlpha(alpha: number): void {
  smoothingAlpha = Math.max(0.05, Math.min(1, alpha));
}

import { initDetector, sendFrame, setDetectionCallback, stopDetector } from "../lib/detector-bridge";
import { startCamera, stopCamera } from "../lib/camera";
import { bearing, formatDistance, haversine, relativeSide, type RelativeSide } from "../lib/geo";
import { db, type Place } from "../lib/db";
import { getStrings, type Strings } from "../lib/i18n";
import { getCurrentLanguage } from "../lib/speech/announcer";
import { announce } from "../lib/speech/announcer";
import {
  requestCompassPermission,
  shortestAngleDelta,
  startCompass,
  stopCompass,
} from "../lib/sensors/compass";

let active = false;
let currentPos: GeolocationPosition | null = null;
let places: Place[] = [];
let lastHeading: number | null = null;
let lastAnnounceTime = 0;
let snapshotDone = false;
let detectionStarted = false;

function cardinalName(heading: number, s: Strings): string {
  const idx = Math.round(((heading % 360) + 360) % 360 / 45) % 8;
  const names = [
    s.compass.north,
    s.compass.northEast,
    s.compass.east,
    s.compass.southEast,
    s.compass.south,
    s.compass.southWest,
    s.compass.west,
    s.compass.northWest,
  ];
  return names[idx];
}

function objectName(label: string, s: Strings): string {
  const key = label.toLowerCase();
  const vehicle = (s.modes.vehicle as Record<string, string>)[key];
  return vehicle ?? label;
}

function placePhrase(place: Place, heading: number, s: Strings, lang: "fil" | "en"): string {
  const br = bearing(currentPos!.coords.latitude, currentPos!.coords.longitude, place.lat, place.lng);
  const rel = relativeSide(br, heading);
  const side = s.modes.facing.relative[rel.side];
  const dist = formatDistance(haversine(currentPos!.coords.latitude, currentPos!.coords.longitude, place.lat, place.lng), lang);
  if (lang === "fil") {
    return `Ang ${place.name} ay nasa ${side} mo, ${dist}.`;
  }
  return `The ${place.name} is ${side}, ${dist}.`;
}

function buildAnnouncement(heading: number): string {
  const lang = getCurrentLanguage();
  const s = getStrings(lang);
  const parts: string[] = [`${s.modes.facing.facing} ${cardinalName(heading, s)}.`];
  if (currentPos && places.length > 0) {
    for (const p of places) {
      parts.push(placePhrase(p, heading, s, lang));
    }
  } else if (currentPos && places.length === 0) {
    parts.push(s.modes.facing.noSavedPlaces);
  } else {
    parts.push(s.modes.facing.noGps);
  }
  return parts.join(" ");
}

async function runSalientSnapshot() {
  if (snapshotDone || detectionStarted || !active) return;
  detectionStarted = true;
  try {
    await initDetector("efficientdet_lite0");
    setDetectionCallback((detections) => {
      if (!active || snapshotDone) return;
      snapshotDone = true;
      const front = detections
        .filter((d) => {
          const cx = d.bbox.xMin + d.bbox.width / 2;
          return cx >= 0.35 && cx <= 0.65 && d.bbox.height >= 0.15;
        })
        .sort((a, b) => b.bbox.height - a.bbox.height)[0];
      if (front) {
        const s = getStrings(getCurrentLanguage());
        const name = objectName(front.label, s);
        announce(`${s.modes.facing.inFrontOf} ${name}.`, "INFO");
      }
      stopCamera();
      stopDetector();
      setDetectionCallback(null);
    });
    await startCamera({ fps: 2, facingMode: "environment" }, (frame) => {
      if (active && !snapshotDone) sendFrame(frame.bitmap, frame.timestamp);
    });
    setTimeout(() => {
      if (!snapshotDone && active) {
        snapshotDone = true;
        stopCamera();
        stopDetector();
        setDetectionCallback(null);
      }
    }, 4000);
  } catch {
    snapshotDone = true;
  }
}

function onHeading(heading: number) {
  if (!active) return;
  const now = Date.now();
  const changed =
    lastHeading === null || Math.abs(shortestAngleDelta(lastHeading, heading)) > 20;
  if (changed || now - lastAnnounceTime > 6000) {
    lastHeading = heading;
    lastAnnounceTime = now;
    announce(buildAnnouncement(heading), "INFO");
    if (!snapshotDone) {
      runSalientSnapshot().catch(() => {});
    }
  }
}

export async function startFacingMode(): Promise<void> {
  if (active) return;
  const s = getStrings(getCurrentLanguage());
  const permitted = await requestCompassPermission();
  if (!permitted) {
    announce(s.compass.permissionDenied, "WARNING");
    return;
  }

  active = true;
  lastHeading = null;
  lastAnnounceTime = 0;
  snapshotDone = false;
  detectionStarted = false;
  currentPos = null;
  places = [];

  try {
    currentPos = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 10000,
      });
    });
    places = await db.places.toArray();
  } catch {
    places = await db.places.toArray();
  }

  startCompass(onHeading);
}

export function stopFacingMode(): void {
  active = false;
  stopCompass();
  stopCamera();
  stopDetector();
  setDetectionCallback(null);
}

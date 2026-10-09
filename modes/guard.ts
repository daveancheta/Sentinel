import { startCamera, stopCamera } from "../lib/camera";
import { initFaces, sendFacesFrame, setFacesCallback, stopFaces } from "../lib/faces-bridge";
import { bestMatch } from "../lib/faces/match";
import { db, type Person } from "../lib/db";
import { getStrings } from "../lib/i18n";
import { getCurrentLanguage } from "../lib/speech/announcer";
import { announce } from "../lib/speech/announcer";
import { getSetting } from "../lib/db";
import { playEarcon } from "../lib/audio/earcons";

let active = false;
let people: Person[] = [];
let threshold = 0.6;
let facing: "environment" | "user" = "user";
let unknownAccumulated = 0;
let lastUnknownAt = 0;
let lastAlertAt = 0;
let lastFrameTime = 0;

const ALERT_MS = 20000;
const COOLDOWN_MS = 60000;
const ABSENT_MS = 3000;

function isUnknownLarge(f: import("../lib/faces-bridge").Face): boolean {
  if (f.bbox.height < 0.4) return false;
  const match = bestMatch(f.embedding, people, threshold);
  return !match.matched;
}

function onFaces(faces: import("../lib/faces-bridge").Face[], frameTime: number) {
  if (!active) return;
  const now = performance.now();
  const unknown = faces.filter(isUnknownLarge);

  if (unknown.length > 0) {
    if (lastFrameTime > 0) {
      const dt = now - lastFrameTime;
      if (dt < 5000) unknownAccumulated += dt;
    }
    lastUnknownAt = now;
  } else {
    if (now - lastUnknownAt > ABSENT_MS) {
      unknownAccumulated = 0;
    }
  }
  lastFrameTime = now;

  if (unknownAccumulated > ALERT_MS && now - lastAlertAt > COOLDOWN_MS) {
    lastAlertAt = now;
    unknownAccumulated = 0;
    const s = getStrings(getCurrentLanguage());
    if ("vibrate" in navigator) navigator.vibrate([50]);
    playEarcon("tick");
    announce(s.modes.guard.alert, "WARNING", { volume: 0.35 });
  }
}

export async function startGuardMode(): Promise<void> {
  if (active) return;
  active = true;
  unknownAccumulated = 0;
  lastUnknownAt = 0;
  lastAlertAt = 0;
  lastFrameTime = 0;
  threshold = await getSetting<number>("faceThreshold", 0.6);
  facing = await getSetting<"environment" | "user">("guardCamera", "user");
  people = await db.people.toArray();

  await initFaces();
  setFacesCallback((faces, frameTime) => onFaces(faces, frameTime));
  await startCamera({ fps: 4, facingMode: facing }, (frame) => {
    if (active) sendFacesFrame(frame.bitmap, frame.timestamp);
  });
}

export function stopGuardMode(): void {
  active = false;
  unknownAccumulated = 0;
  setFacesCallback(null);
  stopCamera();
  stopFaces();
}

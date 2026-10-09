import { startCamera, stopCamera } from "../lib/camera";
import { initFaces, sendFacesFrame, setFacesCallback, stopFaces } from "../lib/faces-bridge";
import { bestMatch } from "../lib/faces/match";
import { center, directionFromCenter, distanceFromHeight } from "../lib/geometry";
import { db, type Person } from "../lib/db";
import { getStrings } from "../lib/i18n";
import { getCurrentLanguage } from "../lib/speech/announcer";
import { announce, announceUncertain } from "../lib/speech/announcer";
import { vibrate } from "../lib/haptics";
import { getSetting } from "../lib/db";

interface SeenFace {
  id: number | "unknown";
  side: string;
  dist: string;
  emotion?: string;
  emotionScore?: number;
  lastAnnounce: number;
  lastEmotionAnnounce: number;
  lastEmotion?: string;
}

let active = false;
let people: Person[] = [];
let threshold = 0.6;
let expressionsEnabled = true;
let previous: SeenFace[] = [];
let lastUnknownAnnounce = 0;
let lastFaceUncertain = 0;
const ARRIVAL_COOLDOWN = 60000;
const MOVE_COOLDOWN = 3000;
const EXPRESSION_COOLDOWN = 10000;

function facePhrase(person: Person | undefined, side: string, dist: string, lang: "fil" | "en"): string {
  if (person) {
    if (lang === "fil") return `Si ${person.name} sa ${side} mo, ${dist}.`;
    return `${person.name} is on your ${side}, ${dist}.`;
  }
  if (lang === "fil") return `May isang taong hindi ko kilala sa ${side}.`;
  return `There is someone I don't know on your ${side}.`;
}

function announceChanges(current: SeenFace[], s: ReturnType<typeof getStrings>, lang: "fil" | "en") {
  const now = Date.now();
  const prevMap = new Map(previous.map((p) => [p.id, p]));

  for (const c of current) {
    const p = prevMap.get(c.id);
    if (c.id !== "unknown") {
      const person = people.find((x) => x.id === c.id);
      if (!p) {
        if (now - c.lastAnnounce > ARRIVAL_COOLDOWN) {
          c.lastAnnounce = now;
          const msg =
            lang === "fil"
              ? `Dumating si ${person?.name} sa ${c.side} mo.`
              : `${person?.name} arrived on your ${c.side}.`;
          announce(msg, "INFO");
          vibrate("confirm");
        }
      } else if (p.side !== c.side && now - c.lastAnnounce > MOVE_COOLDOWN) {
        c.lastAnnounce = now;
        const msg =
          lang === "fil"
            ? `Lumipat si ${person?.name} sa ${c.side} mo.`
            : `${person?.name} moved to your ${c.side}.`;
        announce(msg, "INFO");
      }
    } else if (c.id === "unknown") {
      const unknownCount = current.filter((x) => x.id === "unknown").length;
      if (now - lastUnknownAnnounce > 15000 && unknownCount > 0) {
        lastUnknownAnnounce = now;
        const msg =
          lang === "fil"
            ? `May ${unknownCount} taong hindi ko kilala sa ${c.side}.`
            : `There ${unknownCount === 1 ? "is" : "are"} ${unknownCount} unknown person${unknownCount > 1 ? "s" : ""} ${c.side}.`;
        announce(msg, "INFO");
      }
    }
  }

  for (const p of previous) {
    if (!current.some((c) => c.id === p.id)) {
      if (p.id !== "unknown") {
        const person = people.find((x) => x.id === p.id);
        const msg =
          lang === "fil"
            ? `Umalis si ${person?.name}.`
            : `${person?.name} left.`;
        announce(msg, "INFO");
      }
    }
  }

  previous = current;
}

function checkExpressions(current: SeenFace[], s: ReturnType<typeof getStrings>, lang: "fil" | "en") {
  if (!expressionsEnabled) return;
  const now = Date.now();
  for (const c of current) {
    if (c.id === "unknown" || !c.emotion || c.emotionScore! <= 0.7) continue;
    const person = people.find((x) => x.id === c.id);
    if (!person) continue;
    const prev = previous.find((p) => p.id === c.id);
    const sameAsLast = prev?.lastEmotion === c.emotion;
    if (!sameAsLast && now - (prev?.lastEmotionAnnounce ?? 0) > EXPRESSION_COOLDOWN) {
      c.lastEmotion = c.emotion;
      c.lastEmotionAnnounce = now;
      const label = (s.emotions as Record<string, string>)[c.emotion] ?? c.emotion;
      const msg = lang === "fil" ? `Mukhang ${label} si ${person.name}.` : `${person.name} looks ${label}.`;
      announce(msg, "INFO", { volume: 0.5 });
    }
  }
}

function onFaces(faces: import("../lib/faces-bridge").Face[], frameTime: number) {
  if (!active) return;
  const lang = getCurrentLanguage();
  const s = getStrings(lang);
  const now = Date.now();

  const current: SeenFace[] = [];
  const sorted = [...faces].sort((a, b) => center(a.bbox).x - center(b.bbox).x);

  for (const f of sorted) {
    const cx = center(f.bbox).x;
    const h = f.bbox.height;
    const { side } = directionFromCenter(cx);
    const sideName = s.modes.whosHere.sides[side];
    const dist = distanceFromHeight(h);
    const match = bestMatch(f.embedding, people, threshold);
    if (match.matched && match.person) {
      const prev = previous.find((p) => p.id === match.person!.id);
      current.push({
        id: match.person.id!,
        side: sideName,
        dist,
        emotion: f.emotion,
        emotionScore: f.emotionScore,
        lastAnnounce: prev?.lastAnnounce ?? 0,
        lastEmotionAnnounce: prev?.lastEmotionAnnounce ?? 0,
        lastEmotion: prev?.lastEmotion,
      });
    } else {
      if (people.length > 0 && match.similarity >= threshold - 0.08) {
        if (now - lastFaceUncertain > 5000) { lastFaceUncertain = now; announceUncertain(); }
        continue;
      }
      const prev = previous.find((p) => p.id === "unknown");
      current.push({
        id: "unknown",
        side: sideName,
        dist,
        emotion: f.emotion,
        emotionScore: f.emotionScore,
        lastAnnounce: 0,
        lastEmotionAnnounce: 0,
      });
    }
  }

  if (previous.length === 0 && current.length > 0) {
    const parts = current.map((c) => {
      const person = c.id !== "unknown" ? people.find((p) => p.id === c.id) : undefined;
      return facePhrase(person, c.side, c.dist, lang);
    });
    const summary = parts.join(" ");
    announce(summary, "INFO");
    vibrate("confirm");
    for (const c of current) c.lastAnnounce = now;
    previous = current;
    return;
  }

  announceChanges(current, s, lang);
  checkExpressions(current, s, lang);
}

export async function startWhosHereMode(): Promise<void> {
  if (active) return;
  active = true;
  previous = [];
  lastFaceUncertain = 0;
  const s = getStrings(getCurrentLanguage());
  threshold = await getSetting<number>("faceThreshold", 0.6);
  expressionsEnabled = await getSetting<boolean>("expressionsEnabled", true);
  people = await db.people.toArray();

  await initFaces();
  setFacesCallback((faces, frameTime) => onFaces(faces, frameTime));
  await startCamera({ fps: 4, facingMode: "environment" }, (frame) => {
    if (active) sendFacesFrame(frame.bitmap, frame.timestamp);
  });

  if (people.length === 0) {
    announce(s.modes.whosHere.noPeople, "INFO");
  }
}

export function stopWhosHereMode(): void {
  active = false;
  previous = [];
  setFacesCallback(null);
  stopCamera();
  stopFaces();
}

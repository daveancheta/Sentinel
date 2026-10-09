import { playEarcon } from "../lib/audio/earcons";
import { getSetting } from "../lib/db";
import { vibrateDirection } from "../lib/haptics";
import { getStrings } from "../lib/i18n";
import { getCurrentLanguage } from "../lib/speech/announcer";
import { announce } from "../lib/speech/announcer";
import {
  requestCompassPermission,
  shortestAngleDelta,
  startCompass,
  stopCompass,
} from "../lib/sensors/compass";

let active = false;
let lockedHeading: number | null = null;
let threshold = 10;
let deviationStart = 0;
let lastCueTime = 0;
let tickTimer: ReturnType<typeof setInterval> | null = null;
let lastHeading: number | null = null;

function onHeading(heading: number) {
  if (!active) return;
  lastHeading = heading;

  if (lockedHeading === null) {
    lockedHeading = heading;
    const s = getStrings(getCurrentLanguage());
    announce(s.modes.walkStraight.locked, "INFO", { force: true });
    playEarcon("tick");
    return;
  }

  const delta = shortestAngleDelta(lockedHeading, heading);
  const abs = Math.abs(delta);
  const now = Date.now();

  if (abs > threshold) {
    if (deviationStart === 0) deviationStart = now;
    if (now - deviationStart > 700 && now - lastCueTime > 1500) {
      const side = delta > 0 ? "left" : "right";
      const pan = side === "left" ? -0.9 : 0.9;
      const s = getStrings(getCurrentLanguage());
      announce(s.modes.walkStraight[side], "WARNING");
      vibrateDirection(side);
      playEarcon("tick", pan);
      lastCueTime = now;
    }
  } else {
    deviationStart = 0;
  }
}

export async function startWalkStraightMode(): Promise<void> {
  if (active) return;
  const s = getStrings(getCurrentLanguage());
  const permitted = await requestCompassPermission();
  if (!permitted) {
    announce(s.compass.permissionDenied, "WARNING");
    return;
  }

  threshold = await getSetting<number>("walkStraightThreshold", 10);
  active = true;
  lockedHeading = null;
  deviationStart = 0;
  lastCueTime = 0;
  lastHeading = null;

  startCompass(onHeading);

  tickTimer = setInterval(() => {
    if (active) playEarcon("tick", 0);
  }, 5000);
}

export function stopWalkStraightMode(): void {
  active = false;
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
  lockedHeading = null;
  lastHeading = null;
  deviationStart = 0;
  stopCompass();
}

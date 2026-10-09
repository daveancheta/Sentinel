import { vibrate } from "../lib/haptics";
import { announce } from "../lib/speech/announcer";
import { getStrings } from "../lib/i18n";
import { getCurrentLanguage } from "../lib/speech/announcer";
import { rowAverage } from "../lib/depth/grid";

interface DropoffState {
  lastAlert: number;
}

let state: DropoffState = { lastAlert: 0 };

function reset() {
  state = { lastAlert: 0 };
}

export interface DropoffOptions {
  stepThreshold: number;
  stepMinRows: number;
  cooldownMs: number;
}

export interface DropoffResult {
  message: string;
  kind: "down" | "up" | "curb";
}

export function checkDropoff(
  grid: Float32Array,
  cols: number,
  rows: number,
  options: DropoffOptions,
  lang?: string,
): DropoffResult | null {
  const s = getStrings((lang as any) ?? getCurrentLanguage());
  const lowerStart = Math.floor(rows / 3) * 2;
  const centerStart = Math.floor(cols / 3);
  const centerEnd = centerStart * 2;

  const profile: number[] = [];
  for (let r = lowerStart; r < rows; r++) {
    profile.push(rowAverage(grid, cols, r, centerStart, centerEnd));
  }
  if (profile.length < 3) return null;

  let downRows = 0;
  let upRows = 0;
  let downMagnitude = 0;
  let upMagnitude = 0;

  for (let i = 0; i < profile.length - 1; i++) {
    const diff = profile[i + 1] - profile[i];
    if (diff <= -options.stepThreshold) {
      downRows++;
      downMagnitude += Math.abs(diff);
    } else if (diff >= options.stepThreshold) {
      upRows++;
      upMagnitude += diff;
    }
  }

  const now = performance.now();
  if (now - state.lastAlert < options.cooldownMs) return null;

  let result: DropoffResult | null = null;

  if (downRows >= options.stepMinRows && downMagnitude > options.stepThreshold * 2) {
    state.lastAlert = now;
    const hasMultiple = downRows >= options.stepMinRows + 2;
    const msg = hasMultiple
      ? s.modes.dropoff.stairsDown
      : s.modes.dropoff.curb;
    announce(msg, "DANGER");
    vibrate("step");
    result = { message: msg, kind: hasMultiple ? "down" : "curb" };
  } else if (upRows >= options.stepMinRows && upMagnitude > options.stepThreshold * 2) {
    state.lastAlert = now;
    announce(s.modes.dropoff.stepUp, "DANGER");
    vibrate("step");
    result = { message: s.modes.dropoff.stepUp, kind: "up" };
  }

  return result;
}

export { reset as resetDropoff };

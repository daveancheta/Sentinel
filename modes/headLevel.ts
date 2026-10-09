import { vibrate } from "../lib/haptics";
import { announce } from "../lib/speech/announcer";
import { regionAverage } from "../lib/depth/grid";
import { getStrings } from "../lib/i18n";
import { getCurrentLanguage } from "../lib/speech/announcer";
import { directionFromCenter } from "../lib/geometry";

interface HeadLevelState {
  nearHistory: boolean[];
  lastAlert: number;
}

let state: HeadLevelState = { nearHistory: [], lastAlert: 0 };

function reset() {
  state = { nearHistory: [], lastAlert: 0 };
}

export interface HeadLevelOptions {
  headThreshold: number;
  headLowerMax: number;
  cooldownMs: number;
}

export interface HeadLevelResult {
  message: string;
  side: "left" | "front" | "right";
  pan: number;
}

export function checkHeadLevel(
  grid: Float32Array,
  cols: number,
  rows: number,
  options: HeadLevelOptions,
  lang?: string,
): HeadLevelResult | null {
  const s = getStrings((lang as any) ?? getCurrentLanguage());
  const rowThird = Math.floor(rows / 3);
  const colThird = Math.floor(cols / 3);

  const upperCenter = regionAverage(grid, cols, 0, rowThird, colThird, colThird * 2);
  const upperLeft = regionAverage(grid, cols, 0, rowThird, 0, colThird);
  const upperRight = regionAverage(grid, cols, 0, rowThird, colThird * 2, cols);
  const lowerCenter = regionAverage(
    grid,
    cols,
    rowThird * 2,
    rows,
    colThird,
    colThird * 2,
  );

  const isNear =
    upperCenter >= options.headThreshold && lowerCenter <= options.headLowerMax;

  state.nearHistory.push(isNear);
  if (state.nearHistory.length > 3) state.nearHistory.shift();
  const nearCount = state.nearHistory.filter(Boolean).length;

  const now = performance.now();
  if (nearCount >= 2 && now - state.lastAlert > options.cooldownMs) {
    state.lastAlert = now;
    let side: "left" | "front" | "right" = "front";
    let pan = 0;
    const diff = upperLeft - upperRight;
    if (diff > 0.05) {
      side = "left";
      pan = -0.6;
    } else if (diff < -0.05) {
      side = "right";
      pan = 0.6;
    } else {
      const cx = (upperLeft + upperCenter * 2 + upperRight) / 4;
      const dir = directionFromCenter(cx);
      side = dir.side;
      pan = dir.pan;
    }
    const sideName = s.modes.directions[side];
    const msg = `${s.modes.headLevel.warning} ${sideName}!`;
    announce(msg, "WARNING");
    vibrate("head");
    return { message: msg, side, pan };
  }

  return null;
}

export { reset as resetHeadLevel };

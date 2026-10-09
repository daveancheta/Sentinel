import { playEarcon, type EarconType } from "./audio/earcons";

export type HapticPattern = "left" | "right" | "danger" | "confirm";

const PATTERNS: Record<HapticPattern, number[]> = {
  left: [50],
  right: [50, 100, 50],
  danger: [200, 100, 200],
  confirm: [30],
};

export function vibrate(pattern: HapticPattern): void {
  const pulses = PATTERNS[pattern];
  if ("vibrate" in navigator && typeof navigator.vibrate === "function") {
    navigator.vibrate(pulses);
  }
  const earconMap: Record<HapticPattern, EarconType> = {
    left: "tick",
    right: "tick",
    danger: "vehicle",
    confirm: "tick",
  };
  playEarcon(earconMap[pattern]);
}

export function vibrateDirection(side: "left" | "right" | "center"): void {
  if (side === "left") vibrate("left");
  else if (side === "right") vibrate("right");
  else vibrate("confirm");
}

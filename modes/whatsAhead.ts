import { announce } from "../lib/speech/announcer";
import { getStrings } from "../lib/i18n";
import { getCurrentLanguage } from "../lib/speech/announcer";
import { regionAverage } from "../lib/depth/grid";
import { initDepth, sendDepthFrame, setDepthCallback, stopDepth } from "../lib/depth-bridge";
import { startCamera, stopCamera } from "../lib/camera";
import { getSetting } from "../lib/db";

export interface WhatsAheadOptions {
  clearThreshold: number;
  nearThreshold: number;
}

export function describeWhatsAhead(
  grid: Float32Array,
  cols: number,
  rows: number,
  options: WhatsAheadOptions,
  lang?: string,
): string {
  const s = getStrings((lang as any) ?? getCurrentLanguage());
  const rowThird = Math.floor(rows / 3);
  const colThird = Math.floor(cols / 3);

  const upperLeft = regionAverage(grid, cols, 0, rowThird, 0, colThird);
  const upperCenter = regionAverage(grid, cols, 0, rowThird, colThird, colThird * 2);
  const upperRight = regionAverage(grid, cols, 0, rowThird, colThird * 2, cols);

  const lowerLeft = regionAverage(grid, cols, rowThird * 2, rows, 0, colThird);
  const lowerCenter = regionAverage(grid, cols, rowThird * 2, rows, colThird, colThird * 2);
  const lowerRight = regionAverage(grid, cols, rowThird * 2, rows, colThird * 2, cols);

  const front = lowerCenter;
  const sides = [
    { name: s.modes.directions.left, value: lowerLeft + upperLeft * 0.5 },
    { name: s.modes.directions.right, value: lowerRight + upperRight * 0.5 },
  ];
  sides.sort((a, b) => b.value - a.value);

  const sideNear = sides[0].value >= options.nearThreshold ? sides[0].name : null;

  if (front < options.clearThreshold && !sideNear) {
    return s.modes.whatsAhead.clear;
  }

  const parts: string[] = [];
  if (front < options.clearThreshold) {
    parts.push(s.modes.whatsAhead.clear);
  } else if (front >= options.nearThreshold) {
    parts.push(s.modes.whatsAhead.closeFront);
  }

  if (sideNear) {
    const object = upperCenter >= options.nearThreshold ? s.modes.whatsAhead.overhang : s.modes.whatsAhead.obstacle;
    parts.push(`${object} ${sideNear}`);
  } else if (upperCenter >= options.nearThreshold && front < options.nearThreshold) {
    parts.push(`${s.modes.whatsAhead.overhang} ${s.modes.directions.front}`);
  }

  return parts.length ? parts.join(", ") : s.modes.whatsAhead.clear;
}

export async function startWhatsAheadMode(): Promise<void> {
  const lang = getCurrentLanguage();
  const s = getStrings(lang);
  const clearThreshold = await getSetting<number>("clearThreshold", 0.3);
  const nearThreshold = await getSetting<number>("nearThreshold", 0.55);

  await initDepth();
  const cleanup = () => {
    setDepthCallback(null);
    stopDepth();
    stopCamera();
  };

  return new Promise<void>((resolve, reject) => {
    setDepthCallback((frame) => {
      const summary = describeWhatsAhead(
        frame.grid,
        frame.cols,
        frame.rows,
        { clearThreshold, nearThreshold },
        lang,
      );
      announce(summary, "INFO");
      cleanup();
      resolve();
    });

    startCamera({ fps: 6, facingMode: "environment" }, (frame) => {
      sendDepthFrame(frame.bitmap, frame.timestamp);
    }).catch((err) => {
      cleanup();
      reject(err);
    });
  });
}

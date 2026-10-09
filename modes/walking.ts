import { announce } from "../lib/speech/announcer";
import { getCurrentLanguage } from "../lib/speech/announcer";
import { getStrings } from "../lib/i18n";
import { startCamera, stopCamera } from "../lib/camera";
import { initDetector, sendFrame, setDetectionCallback, stopDetector } from "../lib/detector-bridge";
import { initDepth, sendDepthFrame, setDepthCallback, stopDepth } from "../lib/depth-bridge";
import { processVehicleDetections, initVehicleTracker } from "./vehicle";
import { checkHeadLevel, resetHeadLevel } from "./headLevel";
import { checkDropoff, resetDropoff } from "./dropoff";
import { describeWhatsAhead } from "./whatsAhead";
import { getSetting } from "../lib/db";

interface WalkingOptions {
  headThreshold: number;
  headLowerMax: number;
  stepThreshold: number;
  stepMinRows: number;
  clearThreshold: number;
  nearThreshold: number;
  verbosity: string;
}

let active = false;
let lastNonDanger = 0;
let frameCounter = 0;

async function loadOptions(): Promise<WalkingOptions> {
  return {
    headThreshold: await getSetting<number>("headThreshold", 0.65),
    headLowerMax: await getSetting<number>("headLowerMax", 0.35),
    stepThreshold: await getSetting<number>("stepThreshold", 0.25),
    stepMinRows: await getSetting<number>("stepMinRows", 3),
    clearThreshold: await getSetting<number>("clearThreshold", 0.3),
    nearThreshold: await getSetting<number>("nearThreshold", 0.55),
    verbosity: await getSetting<string>("verbosity", "normal"),
  };
}

export async function startWalkingMode(): Promise<void> {
  if (active) return;
  active = true;
  lastNonDanger = 0;
  frameCounter = 0;

  const lang = getCurrentLanguage();
  const s = getStrings(lang);
  const opts = await loadOptions();

  initVehicleTracker();
  resetHeadLevel();
  resetDropoff();

  await Promise.all([initDetector("efficientdet_lite0"), initDepth()]);

  setDetectionCallback((detections, frameTime) => {
    if (!active) return;
    processVehicleDetections(detections, frameTime);
  });

  setDepthCallback((frame) => {
    if (!active) return;
    const now = frame.frameTime;
    frameCounter++;

    const head = checkHeadLevel(
      frame.grid,
      frame.cols,
      frame.rows,
      {
        headThreshold: opts.headThreshold,
        headLowerMax: opts.headLowerMax,
        cooldownMs: 2000,
      },
      lang,
    );

    const drop = checkDropoff(
      frame.grid,
      frame.cols,
      frame.rows,
      {
        stepThreshold: opts.stepThreshold,
        stepMinRows: opts.stepMinRows,
        cooldownMs: 2000,
      },
      lang,
    );

    if (head && now - lastNonDanger > 2000) {
      lastNonDanger = now;
    }

    if (opts.verbosity === "high" && frameCounter % 60 === 0) {
      const summary = describeWhatsAhead(
        frame.grid,
        frame.cols,
        frame.rows,
        { clearThreshold: opts.clearThreshold, nearThreshold: opts.nearThreshold },
        lang,
      );
      announce(summary, "INFO");
    }
  });

  await startCamera({ fps: 12, facingMode: "environment" }, (frame) => {
    if (!active) return;
    const canvas = new OffscreenCanvas(frame.bitmap.width, frame.bitmap.height);
    const ctx = canvas.getContext("2d");
    ctx?.drawImage(frame.bitmap, 0, 0);
    const depthBitmap = canvas.transferToImageBitmap();
    sendFrame(frame.bitmap, frame.timestamp);
    sendDepthFrame(depthBitmap, frame.timestamp);
  });

  announce(s.modes.walkingOn, "INFO");
}

export function stopWalkingMode(): void {
  active = false;
  setDetectionCallback(null);
  setDepthCallback(null);
  stopCamera();
  stopDetector();
  stopDepth();
}

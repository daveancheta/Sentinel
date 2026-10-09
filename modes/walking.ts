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
let useDepthModel = true;

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
  useDepthModel = await getSetting<string>("modelPackage", "lite") === "full";

  initVehicleTracker();
  resetHeadLevel();
  resetDropoff();

  await Promise.all([initDetector("efficientdet_lite0"), ...(useDepthModel ? [initDepth()] : [])]);

  setDetectionCallback((detections, frameTime) => {
    if (!active) return;
    processVehicleDetections(detections, frameTime);
  });

  setDepthCallback(useDepthModel ? (frame) => {
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
  } : null);

  await startCamera({ fps: 12, facingMode: "environment" }, (frame) => {
    if (!active) return;
    let depthBitmap: ImageBitmap | null = null;
    if (useDepthModel) {
      const canvas = new OffscreenCanvas(frame.bitmap.width, frame.bitmap.height);
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(frame.bitmap, 0, 0);
      depthBitmap = canvas.transferToImageBitmap();
    }
    sendFrame(frame.bitmap, frame.timestamp);
    if (depthBitmap) sendDepthFrame(depthBitmap, frame.timestamp);
  });

  announce(useDepthModel ? s.modes.walkingOn : `${s.modes.walkingOn}. ${lang === "fil" ? "Babala sa sasakyan lang; i-download ang Full package para sa depth at hagdan." : "Vehicle warnings only; download Full for depth and step alerts."}`, "INFO");
}

export function stopWalkingMode(): void {
  active = false;
  setDetectionCallback(null);
  setDepthCallback(null);
  stopCamera();
  stopDetector();
  stopDepth();
}

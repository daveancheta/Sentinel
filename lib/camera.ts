export type FacingMode = "environment" | "user";

export interface CameraOptions {
  width?: number;
  height?: number;
  fps?: number;
  facingMode?: FacingMode;
}

export interface CameraFrame {
  bitmap: ImageBitmap;
  width: number;
  height: number;
  timestamp: number;
}

let video: HTMLVideoElement | null = null;
let stream: MediaStream | null = null;
let rafId: number | null = null;
let intervalId: ReturnType<typeof setInterval> | null = null;
let onFrame: ((frame: CameraFrame) => void) | null = null;
let wakeLock: WakeLockSentinel | null = null;
let active = false;
let busy = false;

async function acquireWakeLock() {
  if (!("wakeLock" in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLock.addEventListener("release", () => {
      wakeLock = null;
    });
  } catch {
    // ignore
  }
}

function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release().catch(() => {});
    wakeLock = null;
  }
}

async function ensureVideoElement() {
  if (video) return video;
  video = document.createElement("video");
  video.setAttribute("playsinline", "true");
  video.setAttribute("webkit-playsinline", "true");
  video.setAttribute("muted", "true");
  video.setAttribute("autoplay", "true");
  video.style.position = "fixed";
  video.style.left = "-1000px";
  video.style.width = "1px";
  video.style.height = "1px";
  video.style.opacity = "0";
  video.style.pointerEvents = "none";
  document.body.appendChild(video);
  return video;
}

async function startStream(width: number, height: number, facingMode: FacingMode) {
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
  }
  const constraints: MediaStreamConstraints = {
    audio: false,
    video: {
      facingMode,
      width: { ideal: width },
      height: { ideal: height },
    },
  };
  stream = await navigator.mediaDevices.getUserMedia(constraints);
  const v = await ensureVideoElement();
  v.srcObject = stream;
  await v.play();
}

async function grabFrame() {
  if (!video || !onFrame || busy || !active || document.hidden) return;
  if (video.readyState < 2) return;
  busy = true;
  try {
    const bitmap = await createImageBitmap(video);
    onFrame({ bitmap, width: video.videoWidth, height: video.videoHeight, timestamp: performance.now() });
  } catch (e) {
    console.error("Frame grab failed", e);
  } finally {
    busy = false;
  }
}

export async function startCamera(
  opts: CameraOptions,
  callback: (frame: CameraFrame) => void,
): Promise<void> {
  if (active && onFrame === callback) return;
  stopCamera();
  onFrame = callback;
  const width = opts.width ?? 640;
  const height = opts.height ?? 480;
  const fps = opts.fps ?? 5;
  await startStream(width, height, opts.facingMode ?? "environment");
  active = true;
  await acquireWakeLock();

  const useRaf =
    typeof HTMLVideoElement !== "undefined" &&
    "requestVideoFrameCallback" in HTMLVideoElement.prototype;

  const loop = async () => {
    if (!active) return;
    if (typeof document !== "undefined" && !document.hidden) {
      await grabFrame();
    }
    if (useRaf && video) {
      rafId = (video as any).requestVideoFrameCallback(loop);
    } else {
      intervalId = setTimeout(loop, 1000 / fps);
    }
  };
  loop();
}

export function stopCamera(): void {
  active = false;
  onFrame = null;
  if (rafId && video && "cancelVideoFrameCallback" in video) {
    (video as any).cancelVideoFrameCallback(rafId);
    rafId = null;
  }
  if (intervalId) {
    clearTimeout(intervalId);
    intervalId = null;
  }
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  releaseWakeLock();
  if (video) {
    video.pause();
    video.srcObject = null;
    video.remove();
    video = null;
  }
}

export function setCameraFacing(facingMode: FacingMode): Promise<void> {
  return startCamera({ facingMode }, onFrame!);
}

export function isCameraActive(): boolean {
  return active;
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      releaseWakeLock();
    } else if (active) {
      acquireWakeLock();
    }
  });
}

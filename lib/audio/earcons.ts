export type EarconType = "head" | "step" | "vehicle" | "tick" | "sonar";

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) {
    const Ctx = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
    audioCtx = new Ctx();
  }
  return audioCtx;
}

export function ensureAudio(): AudioContext {
  return getCtx();
}

function resumeIfNeeded(): void {
  const ctx = getCtx();
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
}

function beep(frequency: number, durationMs: number, pan = 0, volume = 0.5): void {
  resumeIfNeeded();
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;

  osc.type = "sine";
  osc.frequency.setValueAtTime(frequency, ctx.currentTime);

  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000);

  if (panner) {
    panner.pan.setValueAtTime(pan, ctx.currentTime);
    osc.connect(panner);
    panner.connect(gain);
  } else {
    osc.connect(gain);
  }
  gain.connect(ctx.destination);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + durationMs / 1000);
}

export function playEarcon(type: EarconType, pan = 0, param?: number): void {
  switch (type) {
    case "head":
      beep(1200, 150, pan, 0.5);
      setTimeout(() => beep(1600, 150, pan, 0.5), 120);
      break;
    case "step":
      beep(300, 250, pan, 0.6);
      break;
    case "vehicle":
      beep(800, 120, pan, 0.7);
      setTimeout(() => beep(1000, 200, pan, 0.7), 100);
      setTimeout(() => beep(1200, 300, pan, 0.7), 250);
      break;
    case "tick":
      beep(880, 60, 0, 0.25);
      break;
    case "sonar": {
      const proximity = Math.max(0, Math.min(1, param ?? 0.5));
      const freq = 600 + proximity * 800;
      const dur = 80 - proximity * 40;
      beep(freq, dur, pan, 0.4);
      break;
    }
  }
}

export function playEarconSequence(types: EarconType[]): void {
  let delay = 0;
  for (const t of types) {
    setTimeout(() => playEarcon(t), delay);
    delay += 180;
  }
}

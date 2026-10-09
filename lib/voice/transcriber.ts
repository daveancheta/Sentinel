export type WhisperModel = "onnx-community/whisper-tiny" | "onnx-community/whisper-base";
export type VoiceLanguage = "auto" | "fil" | "en";

let worker: Worker | null = null;
let readyPromise: Promise<void> | null = null;
let requestId = 0;
const pending = new Map<number, { resolve: (text: string) => void; reject: (error: Error) => void }>();

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL("../../workers/whisper.worker.ts", import.meta.url), { type: "module" });
    worker.addEventListener("message", (event: MessageEvent) => {
      if (event.data.type === "error") {
        if (event.data.id != null) {
          const p = pending.get(event.data.id); pending.delete(event.data.id);
          p?.reject(new Error(event.data.error));
        }
        return;
      }
      if (event.data.type === "transcript") {
        const p = pending.get(event.data.id); pending.delete(event.data.id); p?.resolve(event.data.text);
      }
    });
  }
  return worker;
}

export async function transcribe(audio: Float32Array, model: WhisperModel, language: VoiceLanguage): Promise<string> {
  const w = getWorker();
  const id = ++requestId;
  const buffer = audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength);
  return new Promise<string>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ type: "transcribe", id, audio: buffer, model, language }, [buffer]);
  });
}

export function preloadWhisper(model: WhisperModel): Promise<void> {
  if (!readyPromise) {
    readyPromise = new Promise((resolve, reject) => {
      const w = getWorker();
      const onMessage = (event: MessageEvent) => {
        if (event.data.type === "ready") { w.removeEventListener("message", onMessage); resolve(); }
        if (event.data.type === "error") { w.removeEventListener("message", onMessage); readyPromise = null; reject(new Error(event.data.error)); }
      };
      w.addEventListener("message", onMessage);
      w.postMessage({ type: "init", model });
    });
  }
  return readyPromise;
}

export async function recordPushToTalk(onStart?: () => void, onStop?: () => void, releaseOnPointer = true): Promise<Float32Array> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("Hindi suportado ang mikropono sa browser na ito.");
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  let recorder: MediaRecorder | null = null;
  try {
    const context = new AudioContext();
    const chunks: BlobPart[] = [];
    recorder = new MediaRecorder(stream);
    recorder.addEventListener("dataavailable", (event) => { if (event.data.size) chunks.push(event.data); });
    const completed = new Promise<Blob>((resolve, reject) => {
      recorder!.addEventListener("stop", () => resolve(new Blob(chunks, { type: recorder!.mimeType })));
      recorder!.addEventListener("error", () => reject(new Error("Hindi maitala ang audio.")));
    });
    recorder.start();
    onStart?.();
    const blob = await new Promise<Blob>((resolve, reject) => {
      const finish = () => { void completed.then(resolve, reject); };
      const onRelease = () => { window.removeEventListener("pointerup", onRelease); window.removeEventListener("pointercancel", onRelease); document.removeEventListener("visibilitychange", onVisibility); if (recorder?.state === "recording") recorder.stop(); finish(); };
      const onVisibility = () => { if (document.hidden) onRelease(); };
      if (releaseOnPointer) {
        window.addEventListener("pointerup", onRelease, { once: true });
        window.addEventListener("pointercancel", onRelease, { once: true });
      }
      document.addEventListener("visibilitychange", onVisibility);
      (window as Window & { __kitaReleaseTalk?: () => void }).__kitaReleaseTalk = onRelease;
    });
    onStop?.();
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    const input = decoded.getChannelData(0);
    const length = Math.ceil(input.length * 16000 / decoded.sampleRate);
    const output = new Float32Array(length);
    const ratio = decoded.sampleRate / 16000;
    for (let i = 0; i < length; i++) {
      const position = i * ratio, left = Math.floor(position), right = Math.min(input.length - 1, left + 1);
      const mix = position - left;
      output[i] = input[left] * (1 - mix) + input[right] * mix;
    }
    await context.close();
    return output;
  } finally { recorder?.stop(); stream.getTracks().forEach((track) => track.stop()); }
}

export function releasePushToTalk() { (window as Window & { __kitaReleaseTalk?: () => void }).__kitaReleaseTalk?.(); }

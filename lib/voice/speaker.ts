let worker: Worker | null = null;
let sequence = 0;
const pending = new Map<number, { resolve: (v: Float32Array) => void; reject: (e: Error) => void }>();
function getWorker() {
  if (!worker) {
    worker = new Worker(new URL("../../workers/speaker.worker.ts", import.meta.url), { type: "module" });
    worker.addEventListener("message", (event: MessageEvent) => {
      const p = pending.get(event.data.id); if (!p) return; pending.delete(event.data.id);
      if (event.data.type === "error") p.reject(new Error(event.data.error)); else p.resolve(new Float32Array(event.data.embedding));
    });
  }
  return worker;
}
export function makeVoiceEmbedding(audio: Float32Array): Promise<Float32Array> {
  const id = ++sequence, buffer = audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength);
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); getWorker().postMessage({ type: "embed", id, audio: buffer }, [buffer]); });
}

export function cosineVoiceSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
}

export async function recordVoiceSample(seconds = 10): Promise<Float32Array> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  const recorder = new MediaRecorder(stream), chunks: BlobPart[] = [];
  const blobPromise = new Promise<Blob>((resolve, reject) => {
    recorder.addEventListener("dataavailable", (event) => { if (event.data.size) chunks.push(event.data); });
    recorder.addEventListener("stop", () => resolve(new Blob(chunks, { type: recorder.mimeType })));
    recorder.addEventListener("error", () => reject(new Error("Audio recording failed")));
  });
  try {
    recorder.start();
    await new Promise((resolve) => window.setTimeout(resolve, seconds * 1000));
    recorder.stop();
    const context = new AudioContext();
    const decoded = await context.decodeAudioData(await (await blobPromise).arrayBuffer());
    const source = decoded.getChannelData(0), output = new Float32Array(Math.ceil(source.length * 16000 / decoded.sampleRate));
    const ratio = decoded.sampleRate / 16000;
    for (let i = 0; i < output.length; i++) { const pos = i * ratio, left = Math.floor(pos), right = Math.min(source.length - 1, left + 1), t = pos - left; output[i] = source[left] * (1 - t) + source[right] * t; }
    await context.close();
    return output;
  } finally { if (recorder.state !== "inactive") recorder.stop(); stream.getTracks().forEach((track) => track.stop()); }
}

export async function startVoiceIdentification(onRecognized: (name: string) => void): Promise<() => void> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  const recorder = new MediaRecorder(stream);
  let stopped = false, processing = false;
  const lastHeard = new Map<number, number>();
  const chunks: BlobPart[] = [];
  const peopleModule = await import("../db");
  const people = (await peopleModule.db.people.toArray()).filter((p) => p.voiceEmbeddings?.length);
  recorder.addEventListener("dataavailable", (event) => { if (event.data.size) chunks.push(event.data); });
  recorder.addEventListener("stop", async () => {
    const blob = new Blob(chunks.splice(0), { type: recorder.mimeType });
    if (stopped || processing || !blob.size || people.length === 0) {
      if (!stopped) { recorder.start(); window.setTimeout(() => { if (!stopped && recorder.state === "recording") recorder.stop(); }, 3000); }
      return;
    }
    processing = true;
    try {
      const context = new AudioContext();
      const decoded = await context.decodeAudioData(await blob.arrayBuffer());
      const source = decoded.getChannelData(0);
      let energy = 0; for (let i = 0; i < source.length; i++) energy += source[i] * source[i];
      const rms = Math.sqrt(energy / Math.max(1, source.length));
      if (rms < 0.015) { await context.close(); return; }
      const audio = new Float32Array(Math.ceil(source.length * 16000 / decoded.sampleRate));
      const ratio = decoded.sampleRate / 16000;
      for (let i = 0; i < audio.length; i++) { const pos = i * ratio, left = Math.floor(pos), right = Math.min(source.length - 1, left + 1), t = pos - left; audio[i] = source[left] * (1 - t) + source[right] * t; }
      await context.close();
      const embedding = await makeVoiceEmbedding(audio);
      let best = { person: people[0], score: 0 };
      for (const person of people) for (const saved of person.voiceEmbeddings ?? []) { const score = cosineVoiceSimilarity(embedding, saved); if (score > best.score) best = { person, score }; }
      if (best.score >= 0.72 && Date.now() - (lastHeard.get(best.person.id ?? 0) ?? 0) > 60000) {
        lastHeard.set(best.person.id ?? 0, Date.now()); onRecognized(best.person.name);
      }
    } catch { /* Unsupported codec or short audio: skip this window. */ }
    finally { processing = false; if (!stopped) { recorder.start(); window.setTimeout(() => { if (!stopped && recorder.state === "recording") recorder.stop(); }, 3000); } }
  });
  recorder.start();
  const segmentTimer = window.setTimeout(() => { if (!stopped && recorder.state === "recording") recorder.stop(); }, 3000);
  return () => { stopped = true; window.clearTimeout(segmentTimer); if (recorder.state !== "inactive") recorder.stop(); stream.getTracks().forEach((track) => track.stop()); };
}

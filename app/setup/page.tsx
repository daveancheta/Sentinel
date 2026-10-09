"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { announce, initAnnouncer, setLanguage } from "../../lib/speech/announcer";
import { getSetting, setSetting } from "../../lib/db";
import { downloadModelPackage, getCachedPackageProgress, getModelManifest, type ModelAsset, type ModelManifest, type ModelPackage, verifyPackageAssets } from "../../lib/setup/models";
import { transcribe, type WhisperModel } from "../../lib/voice/transcriber";
import { makeVoiceEmbedding } from "../../lib/voice/speaker";
import type { Language } from "../../lib/i18n";

type PermissionKey = "camera" | "microphone" | "motion" | "location";
const permissionCopy: Record<PermissionKey, { fil: string; en: string }> = {
  camera: { fil: "Kailangan ng kamera para makita ang mga tao, upuan at mga panganib. Hindi iniimbak ang video.", en: "The camera helps identify people, seats and hazards. Video is not saved." },
  microphone: { fil: "Kailangan ng mikropono para sa push-to-talk at opsyonal na pagkilala sa boses. Sa phone pinoproseso ang audio.", en: "The microphone enables push-to-talk and optional voice identification. Audio is processed on this phone." },
  motion: { fil: "Kailangan ang galaw at direksyon para sa compass at pag-alog para ulitin ang huling mensahe.", en: "Motion and orientation support the compass and shake-to-repeat." },
  location: { fil: "Opsyonal ang lokasyon para i-save ang mga lugar at magbigay ng direksyon. GPS data stays on this phone.", en: "Location is optional for saving places and directions. GPS data stays on this phone." },
};
const permissionLabels: Record<PermissionKey, { fil: string; en: string }> = {
  camera: { fil: "Kamera", en: "Camera" }, microphone: { fil: "Mikropono", en: "Microphone" },
  motion: { fil: "Galaw at direksyon", en: "Motion and orientation" }, location: { fil: "Lokasyon", en: "Location" },
};

function formatSize(bytes: number, lang: Language) {
  const value = bytes / (1024 * 1024);
  return `${value >= 1024 ? (value / 1024).toFixed(1) + " GB" : value.toFixed(0) + " MB"}${lang === "fil" ? " kabuuan" : " total"}`;
}

function testWorker(url: URL, initData: Record<string, unknown>, readyType: string, outputType: string, sample: Blob): Promise<void> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(url, { type: "module" });
    let sent = false;
    const timer = window.setTimeout(() => { worker.terminate(); reject(new Error(`Model self-test timed out: ${String(initData.type)}`)); }, 120_000);
    worker.addEventListener("message", (event: MessageEvent) => {
      if (event.data.type === "error") { clearTimeout(timer); worker.terminate(); reject(new Error(event.data.error)); return; }
      if (event.data.type === readyType && !sent) {
        sent = true;
        void createImageBitmap(sample).then((frame) => worker.postMessage({ type: "frame", bitmap: frame, frameTime: performance.now(), timestamp: performance.now() }, [frame])).catch((error) => { clearTimeout(timer); worker.terminate(); reject(error); });
      } else if (event.data.type === outputType) { clearTimeout(timer); worker.terminate(); resolve(); }
    });
    worker.postMessage(initData);
  });
}

export default function SetupPage() {
  const router = useRouter();
  const [lang, setLang] = useState<Language>("fil");
  const [stage, setStage] = useState(0);
  const [manifest, setManifest] = useState<ModelManifest | null>(null);
  const [packageChoice, setPackageChoice] = useState<ModelPackage>("lite");
  const [progress, setProgress] = useState({ done: 0, total: 0, file: "" });
  const [cached, setCached] = useState({ complete: 0, total: 0 });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [storageText, setStorageText] = useState("");
  const [permission, setPermission] = useState<PermissionKey>("camera");
  const [isRedownload, setIsRedownload] = useState(false);
  const permissions: PermissionKey[] = ["camera", "microphone", "motion", "location"];
  const currentPermissionIndex = permissions.indexOf(permission);
  const strings = {
    welcome: lang === "fil" ? "Maligayang pagdating sa Kita. Pipili muna tayo ng wika at mga pahintulot." : "Welcome to Kita. Choose a language and review permissions first.",
    continue: lang === "fil" ? "Magpatuloy" : "Continue",
    allow: lang === "fil" ? "Payagan at magpatuloy" : "Allow and continue",
    skip: lang === "fil" ? "Laktawan ang pahintulot na ito" : "Skip this permission",
    downloading: lang === "fil" ? "Dinadownload para sa offline" : "Downloading for offline use",
    ready: lang === "fil" ? "Handa na. Magagamit mo na si Kita kahit walang internet." : "Ready. Kita can now work without internet.",
    lite: lang === "fil" ? "LITE: kailangan sa pangunahing gamit" : "LITE: core features",
    full: lang === "fil" ? "FULL: kasama ang depth, doors, Whisper base at voice ID" : "FULL: includes depth, doors, Whisper base and voice ID",
  };

  useEffect(() => {
    setIsRedownload(new URLSearchParams(window.location.search).get("redownload") === "1");
    void initAnnouncer().then(async () => {
      const storedLanguage = await getSetting<Language>("language", "fil");
      setLang(storedLanguage); announce(storedLanguage === "fil" ? "Maligayang pagdating sa Kita. Pipili muna tayo ng wika at mga pahintulot." : "Welcome to Kita. Choose a language and review permissions first.", "INFO");
    });
    void (async () => {
      try {
        const result = await getModelManifest(); setManifest(result);
        const pers = await navigator.storage?.persist?.();
        const estimate = await navigator.storage?.estimate?.();
        const storageLanguage = await getSetting<Language>("language", "fil");
        if (estimate) setStorageText(`${storageLanguage === "fil" ? "Ginamit" : "Used"}: ${formatSize(estimate.usage ?? 0, storageLanguage)} · ${storageLanguage === "fil" ? "Bakante" : "Free"}: ${formatSize(Math.max(0, (estimate.quota ?? 0) - (estimate.usage ?? 0)), storageLanguage)}` + (pers ? (storageLanguage === "fil" ? " · Protektado ang storage" : " · Persistent storage enabled") : ""));
      } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    })();
  }, []);

  useEffect(() => {
    if (!manifest) return;
    const assets = manifest.packages[packageChoice].assets;
    void getCachedPackageProgress(assets).then(setCached);
  }, [manifest, packageChoice]);

  useEffect(() => {
    if (isRedownload) setStage(4);
  }, [isRedownload]);

  const requestPermission = async () => {
    setBusy(true); setMessage("");
    const explanation = permissionCopy[permission][lang]; announce(explanation, "INFO");
    try {
      if (permission === "camera") {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true }); stream.getTracks().forEach((track) => track.stop());
      } else if (permission === "microphone") {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); stream.getTracks().forEach((track) => track.stop());
      } else if (permission === "motion") {
        const orientation = DeviceOrientationEvent as typeof DeviceOrientationEvent & { requestPermission?: () => Promise<string> };
        const motion = DeviceMotionEvent as typeof DeviceMotionEvent & { requestPermission?: () => Promise<string> };
        if (orientation.requestPermission) await orientation.requestPermission();
        if (motion.requestPermission) await motion.requestPermission();
      } else {
        await new Promise<void>((resolve, reject) => navigator.geolocation.getCurrentPosition(() => resolve(), (error) => reject(error), { maximumAge: 60_000, timeout: 10_000 }));
      }
      announce(lang === "fil" ? `Naasikaso na ang ${permissionLabels[permission].fil}.` : `${permissionLabels[permission].en} permission handled.`, "INFO");
    } catch (error) {
      setMessage(`${lang === "fil" ? "Hindi pinayagan o hindi suportado." : "Permission denied or unavailable."} ${error instanceof Error ? error.message : ""}`);
    } finally {
      setBusy(false);
      if (currentPermissionIndex < permissions.length - 1) setPermission(permissions[currentPermissionIndex + 1]);
      else setStage(2);
    }
  };

  const download = async () => {
    if (!manifest) return;
    const selected = manifest.packages[packageChoice];
    setBusy(true); setStage(4); setMessage(""); setProgress({ done: cached.complete, total: selected.totalBytes, file: "" });
    try {
      const estimate = await navigator.storage?.estimate?.();
      const available = Math.max(0, (estimate?.quota ?? Number.MAX_SAFE_INTEGER) - (estimate?.usage ?? 0));
      if (Math.max(0, selected.totalBytes - cached.complete) > available) throw new Error(lang === "fil" ? "Kulang ang bakanteng storage para sa package na ito." : "Not enough free storage for this package.");
      await downloadModelPackage(selected.assets as ModelAsset[], (done, total, file) => setProgress({ done, total, file }));
      await verifyPackageAssets(selected.assets);
      await selfTest(selected.assets);
      await setSetting("modelPackage", packageChoice);
      if (packageChoice === "lite") {
        await setSetting("whisperModel", "onnx-community/whisper-tiny");
        await setSetting("voiceIdEnabled", false);
      }
      await setSetting("setupComplete", true);
      setMessage(strings.ready); announce(strings.ready, "INFO");
      if (isRedownload) { router.push("/settings"); return; }
      setStage(5);
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      setMessage(`${lang === "fil" ? "Naantala ang download o self-test. Itabi ang page at subukan ulit para magpatuloy." : "Download or self-test paused. Return here and retry to resume."} ${text}`);
      announce(text, "WARNING");
    } finally { setBusy(false); }
  };

  const selfTest = async (assets: ModelAsset[]) => {
    const urls = new Set(assets.map((asset) => asset.url));
    const required = (path: string) => { if (!urls.has(path)) throw new Error(`Package is missing ${path}`); };
    required("/models/mediapipe/efficientdet_lite0.tflite");
    const svg = await fetch("/setup/sample.svg").then((response) => response.blob());
    const bitmap = svg;
    const audioContext = new AudioContext();
    const sampleAudio = await audioContext.decodeAudioData(await (await fetch("/setup/sample.wav")).arrayBuffer());
    const pcm = new Float32Array(sampleAudio.getChannelData(0));
    await audioContext.close();
    try {
      await testWorker(new URL("../../workers/detector.worker.ts", import.meta.url), { type: "init", model: "efficientdet_lite0" }, "ready", "detections", bitmap);
      await testWorker(new URL("../../workers/faces.worker.ts", import.meta.url), { type: "init" }, "ready", "faces", bitmap);
      await testWorker(new URL("../../workers/ocr.worker.ts", import.meta.url), { type: "init" }, "ready", "words", bitmap);
      if (packageChoice === "full") {
        await testWorker(new URL("../../workers/depth.worker.ts", import.meta.url), { type: "init" }, "ready", "depth", bitmap);
        await testWorker(new URL("../../workers/zeroshot.worker.ts", import.meta.url), { type: "init" }, "ready", "detections", bitmap);
      }
    } finally { /* Test workers own and release their transferred frame bitmaps. */ }
    const language = await getSetting<"auto" | "fil" | "en">("voiceLanguage", "auto");
    await transcribe(pcm, "onnx-community/whisper-tiny", language);
    if (packageChoice === "full") await transcribe(pcm, "onnx-community/whisper-base" as WhisperModel, language);
    if (packageChoice === "full") await makeVoiceEmbedding(pcm);
  };

  const finishSetup = async () => {
    await setSetting("setupComplete", true);
    router.replace("/");
  };

  const onLanguage = async (value: Language) => {
    await setLanguage(value); setLang(value);
  };

  const percent = progress.total ? Math.min(100, Math.floor(progress.done * 100 / progress.total)) : 0;

  return (
    <main className="mx-auto min-h-screen max-w-2xl space-y-5 p-4" aria-labelledby="setup-title">
      <header className="flex items-center justify-between"><h1 id="setup-title" className="text-3xl font-black text-kita-accent">Kita · {lang === "fil" ? "Pag-setup" : "Setup"}</h1>{isRedownload && <Link href="/settings" className="rounded-xl border px-4 py-3">{lang === "fil" ? "Isara" : "Close"}</Link>}</header>
      {stage === 0 && <section className="space-y-5 rounded-2xl border border-kita-muted bg-kita-panel p-5"><p className="text-xl" aria-live="polite">{strings.welcome}</p><label className="block text-lg font-bold" htmlFor="setup-language">{lang === "fil" ? "Pumili ng wika" : "Choose language"}</label><select id="setup-language" value={lang} onChange={(event) => void onLanguage(event.target.value as Language)} className="min-h-14 w-full rounded-xl border border-kita-muted bg-kita-bg px-4 text-lg"><option value="fil">Filipino</option><option value="en">English</option></select><button onClick={() => setStage(1)} className="min-h-16 w-full rounded-xl bg-kita-accent text-xl font-bold text-kita-bg">{strings.continue}</button></section>}
      {stage === 1 && <section className="space-y-5 rounded-2xl border border-kita-muted bg-kita-panel p-5"><h2 className="text-2xl font-bold">{permissionLabels[permission][lang]} · {currentPermissionIndex + 1}/{permissions.length}</h2><p className="text-xl leading-relaxed" aria-live="polite">{permissionCopy[permission][lang]}</p>{message && <p role="status" className="text-lg text-kita-accent">{message}</p>}<button disabled={busy} onClick={() => void requestPermission()} className="min-h-16 w-full rounded-xl bg-kita-accent text-lg font-bold text-kita-bg disabled:opacity-50">{strings.allow}</button><button disabled={busy} onClick={() => { if (currentPermissionIndex < permissions.length - 1) setPermission(permissions[currentPermissionIndex + 1]); else setStage(2); }} className="min-h-14 w-full rounded-xl border border-kita-muted text-lg font-bold">{strings.skip}</button></section>}
      {stage === 2 && <section className="space-y-5 rounded-2xl border border-kita-muted bg-kita-panel p-5"><h2 className="text-2xl font-bold">{lang === "fil" ? "Ihanda para offline" : "Prepare for offline use"}</h2><p className="text-lg">{lang === "fil" ? "Pipiliin muna ang package at makikita ang laki bago mag-download." : "Choose a package and review its size before downloading."}</p>{manifest ? <div className="space-y-3"><button type="button" onClick={() => setPackageChoice("lite")} aria-pressed={packageChoice === "lite"} className={`w-full rounded-xl border-2 p-4 text-left ${packageChoice === "lite" ? "border-kita-accent" : "border-kita-muted"}`}><span className="block text-xl font-bold">{strings.lite}</span><span className="block mt-1 text-lg">{formatSize(manifest.packages.lite.totalBytes, lang)}</span></button><button type="button" onClick={() => setPackageChoice("full")} aria-pressed={packageChoice === "full"} className={`w-full rounded-xl border-2 p-4 text-left ${packageChoice === "full" ? "border-kita-accent" : "border-kita-muted"}`}><span className="block text-xl font-bold">{strings.full}</span><span className="block mt-1 text-lg">{formatSize(manifest.packages.full.totalBytes, lang)}</span></button><p className="text-base text-kita-muted">{storageText}</p><button disabled={busy} onClick={() => void download()} className="min-h-16 w-full rounded-xl bg-kita-accent text-xl font-bold text-kita-bg disabled:opacity-50">{lang === "fil" ? "I-download para offline" : "Download for offline"}</button><p className="text-base text-kita-muted" aria-live="polite">{cached.complete ? `${lang === "fil" ? "Naka-cache na" : "Already cached"}: ${formatSize(cached.complete, lang)}` : ""}</p></div> : <p role="alert">{message || (lang === "fil" ? "Walang model manifest. Patakbuhin ang scripts/download-models.mjs at i-deploy muli." : "Model manifest unavailable. Run scripts/download-models.mjs and redeploy.")}</p>}</section>}
      {stage === 4 && <section className="space-y-5 rounded-2xl border border-kita-muted bg-kita-panel p-5"><h2 className="text-2xl font-bold">{strings.downloading}</h2><progress className="h-6 w-full" max={100} value={percent} aria-label={`${percent}%`} /><p className="text-xl" aria-live="polite">{percent} {lang === "fil" ? "porsyento" : "percent"} · {progress.file}</p><p className="text-base text-kita-muted">{lang === "fil" ? "Maiiwan sa Cache Storage ang kumpletong files kung maputol; pindutin ulit ang download para ipagpatuloy." : "Completed files remain in Cache Storage if interrupted; retry the download to resume."}</p>{message && <p role="status" className="text-lg">{message}</p>}{!busy && message && <button onClick={() => void download()} className="min-h-14 w-full rounded-xl bg-kita-accent font-bold text-kita-bg">{lang === "fil" ? "Subukan ulit / ipagpatuloy" : "Retry / resume"}</button>}</section>}
      {stage === 5 && <section className="space-y-5 rounded-2xl border border-kita-accent bg-kita-panel p-5"><h2 className="text-2xl font-bold" aria-live="polite">{strings.ready}</h2><p className="text-lg">{storageText}</p><button onClick={() => void finishSetup()} className="min-h-16 w-full rounded-xl bg-kita-accent text-xl font-bold text-kita-bg">{lang === "fil" ? "Simulan gamitin ang Kita" : "Start using Kita"}</button></section>}
      {message && stage !== 1 && stage !== 4 && <p role="status" className="rounded-xl border border-kita-danger p-4 text-lg">{message}</p>}
      {stage < 2 && <p className="text-base text-kita-muted">{storageText}</p>}
    </main>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  initAnnouncer,
  announce,
  setLanguage,
  setSpeechRate,
  setVoiceUri,
  getVoices,
  getCurrentLanguage,
} from "../../lib/speech/announcer";
import { getStrings, type Language } from "../../lib/i18n";
import { clearAllData, getSetting, setSetting } from "../../lib/db";
import { playEarcon } from "../../lib/audio/earcons";
import { vibrate } from "../../lib/haptics";
import { startGuardMode, stopGuardMode } from "../../modes/guard";
import { calibrationScores } from "../../lib/faces/match";
import { db } from "../../lib/db";
import { startCamera, stopCamera } from "../../lib/camera";
import { initFaces, setFacesCallback, sendFacesFrame, stopFaces } from "../../lib/faces-bridge";
import { initDepth, sendDepthFrame, setDepthCallback, stopDepth } from "../../lib/depth-bridge";
import type { WhisperModel, VoiceLanguage } from "../../lib/voice/transcriber";
import { exportEncryptedBackup, importEncryptedBackup } from "../../lib/setup/backup";

export default function SettingsPage() {
  const [lang, setLang] = useState<Language>("fil");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<string>("");
  const [rate, setRate] = useState<number>(1.1);
  const [verbosity, setVerbosity] = useState<string>("normal");
  const [discreet, setDiscreet] = useState<boolean>(false);
  const [haptics, setHaptics] = useState<boolean>(true);
  const [walkThreshold, setWalkThreshold] = useState<number>(10);
  const [faceThreshold, setFaceThreshold] = useState<number>(0.6);
  const [expressions, setExpressions] = useState<boolean>(true);
  const [guardCamera, setGuardCamera] = useState<"user" | "environment">("user");
  const [guardActive, setGuardActive] = useState<boolean>(false);
  const [headThreshold, setHeadThreshold] = useState<number>(0.65);
  const [headLowerMax, setHeadLowerMax] = useState<number>(0.35);
  const [stepThreshold, setStepThreshold] = useState<number>(0.25);
  const [stepMinRows, setStepMinRows] = useState<number>(3);
  const [clearThreshold, setClearThreshold] = useState<number>(0.3);
  const [nearThreshold, setNearThreshold] = useState<number>(0.55);
  const [depthDebug, setDepthDebug] = useState<boolean>(false);
  const [debugActive, setDebugActive] = useState<boolean>(false);
  const [debugGrid, setDebugGrid] = useState<Float32Array | null>(null);
  const [debugDims, setDebugDims] = useState<{ cols: number; rows: number }>({ cols: 0, rows: 0 });
  const [debugInfo, setDebugInfo] = useState<string>("");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [calibActive, setCalibActive] = useState<boolean>(false);
  const [calibText, setCalibText] = useState<string>("");
  const [showDelete, setShowDelete] = useState(false);
  const [whisperModel, setWhisperModel] = useState<WhisperModel>("onnx-community/whisper-tiny");
  const [voiceLanguage, setVoiceLanguage] = useState<VoiceLanguage>("auto");
  const [voiceIdEnabled, setVoiceIdEnabled] = useState(false);
  const [batterySaver, setBatterySaver] = useState(false);
  const [storageSummary, setStorageSummary] = useState("");
  const [backupPassphrase, setBackupPassphrase] = useState("");
  const [importPassphrase, setImportPassphrase] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importStrategy, setImportStrategy] = useState<"merge" | "replace">("merge");
  const [backupStatus, setBackupStatus] = useState("");
  const [modelPackage, setModelPackage] = useState<"lite" | "full">("lite");

  const s = getStrings(lang);

  useEffect(() => {
    (async () => {
      await initAnnouncer();
      const l = getCurrentLanguage();
      setLang(l);
      setVoices(getVoices());
      setRate(await getSetting<number>("speechRate", 1.1));
      setVerbosity(await getSetting<string>("verbosity", "normal"));
      setDiscreet(await getSetting<boolean>("discreet", false));
      setHaptics(await getSetting<boolean>("haptics", true));
      setWalkThreshold(await getSetting<number>("walkStraightThreshold", 10));
      setFaceThreshold(await getSetting<number>("faceThreshold", 0.6));
      setExpressions(await getSetting<boolean>("expressionsEnabled", true));
      setGuardCamera(await getSetting<"user" | "environment">("guardCamera", "user"));
      setHeadThreshold(await getSetting<number>("headThreshold", 0.65));
      setHeadLowerMax(await getSetting<number>("headLowerMax", 0.35));
      setStepThreshold(await getSetting<number>("stepThreshold", 0.25));
      setStepMinRows(await getSetting<number>("stepMinRows", 3));
      setClearThreshold(await getSetting<number>("clearThreshold", 0.3));
      setNearThreshold(await getSetting<number>("nearThreshold", 0.55));
      setDepthDebug(await getSetting<boolean>("depthDebug", false));
      setWhisperModel(await getSetting<WhisperModel>("whisperModel", "onnx-community/whisper-tiny"));
      setVoiceLanguage(await getSetting<VoiceLanguage>("voiceLanguage", "auto"));
      setVoiceIdEnabled(await getSetting<boolean>("voiceIdEnabled", false));
      setBatterySaver(await getSetting<boolean>("batterySaver", false));
      setModelPackage(await getSetting<"lite" | "full">("modelPackage", "lite"));
      const uri = await getSetting<string | null>("voiceUri", null);
      setSelectedVoice(uri ?? "");
      await navigator.storage?.persist?.();
      const storage = await navigator.storage?.estimate?.();
      if (storage) setStorageSummary(`${(storage.usage ?? 0) / 1024 / 1024 | 0} MB ${l === "fil" ? "ginamit sa" : "used of"} ${((storage.quota ?? 0) / 1024 / 1024 / 1024).toFixed(1)} GB`);
      if ("speechSynthesis" in window) {
        window.speechSynthesis.onvoiceschanged = () => setVoices(getVoices());
      }
    })();
    return () => {
      stopGuardMode();
      stopCalibration();
    };
  }, []);

  const changeLang = async (next: Language) => {
    await setLanguage(next);
    setLang(next);
  };

  const changeRate = async (next: number) => {
    await setSpeechRate(next);
    setRate(next);
  };

  const changeVoice = async (uri: string) => {
    await setVoiceUri(uri || null);
    setSelectedVoice(uri);
    announce(s.events.voiceChanged, "INFO");
  };

  const toggle = async (key: "discreet" | "haptics", value: boolean) => {
    await setSetting(key, value);
    if (key === "discreet") setDiscreet(value);
    else setHaptics(value);
  };

  const deleteAll = async () => {
    await clearAllData();
    setShowDelete(false);
    vibrate("danger");
    announce(s.events.dataDeleted, "WARNING");
  };

  const saveBackup = async () => {
    try {
      const blob = await exportEncryptedBackup(backupPassphrase);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = url; link.download = "kita-backup.kita"; link.click(); URL.revokeObjectURL(url);
      setBackupStatus(lang === "fil" ? "Na-export ang encrypted backup." : "Encrypted backup exported.");
      announce(lang === "fil" ? "Naka-save na ang backup file." : "Backup file downloaded.", "INFO");
    } catch (error) { setBackupStatus(error instanceof Error ? error.message : String(error)); }
  };

  const restoreBackup = async () => {
    if (!importFile) return;
    try {
      await importEncryptedBackup(importFile, importPassphrase, importStrategy);
      setBackupStatus(lang === "fil" ? "Naibalik na ang backup. I-reload ang app para i-refresh ang settings." : "Backup restored. Reload the app to refresh settings.");
      announce(lang === "fil" ? "Naibalik na ang backup." : "Backup restored.", "INFO");
    } catch (error) { setBackupStatus(error instanceof Error ? error.message : String(error)); announce(lang === "fil" ? "Hindi maibalik ang backup." : "Backup restore failed.", "WARNING"); }
  };

  const playAndExplain = (type: "head" | "step" | "vehicle" | "tick" | "sonar", label: string) => {
    playEarcon(type);
    announce(`${label}. ${s.sounds[type === "head" ? "headLevel" : type === "step" ? "stepDown" : type === "vehicle" ? "vehicle" : type === "tick" ? "tick" : "sonar"]}`, "INFO");
  };

  const stopCalibration = () => {
    setCalibActive(false);
    setCalibText("");
    setFacesCallback(null);
    stopFaces();
    stopCamera();
  };

  const toggleCalibration = async () => {
    if (calibActive) {
      stopCalibration();
      return;
    }
    setCalibActive(true);
    setCalibText(s.settings.calibration);
    try {
      const people = await db.people.toArray();
      await initFaces();
      setFacesCallback(async (faces) => {
        if (faces.length === 0) return;
        const f = faces[0];
        const scores = calibrationScores(f.embedding, people);
        const lines = scores.map((sc) => `${sc.name}: ${sc.similarity.toFixed(2)}`);
        const text = lines.length ? lines.join(", ") : s.people.noPeople;
        setCalibText(text);
        if (scores.length > 0) {
          const top = scores[0];
          announce(`${top.name} ${top.similarity.toFixed(2)}`, "INFO");
        }
      });
      await startCamera({ fps: 2, facingMode: "environment" }, (frame) => {
        sendFacesFrame(frame.bitmap, frame.timestamp);
      });
    } catch {
      stopCalibration();
    }
  };

  useEffect(() => {
    if (!debugGrid || !canvasRef.current || debugDims.cols === 0 || debugDims.rows === 0) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { cols, rows } = debugDims;
    const cellW = canvas.width / cols;
    const cellH = canvas.height / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const v = debugGrid[r * cols + c];
        const hue = 240 - v * 240;
        ctx.fillStyle = `hsl(${hue}, 90%, 50%)`;
        ctx.fillRect(c * cellW, r * cellH, cellW, cellH);
      }
    }
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.lineWidth = 1;
    const rowThird = Math.floor(rows / 3);
    const colThird = Math.floor(cols / 3);
    ctx.beginPath();
    ctx.moveTo(0, rowThird * cellH);
    ctx.lineTo(canvas.width, rowThird * cellH);
    ctx.moveTo(0, rowThird * 2 * cellH);
    ctx.lineTo(canvas.width, rowThird * 2 * cellH);
    ctx.moveTo(colThird * cellW, 0);
    ctx.lineTo(colThird * cellW, canvas.height);
    ctx.moveTo(colThird * 2 * cellW, 0);
    ctx.lineTo(colThird * 2 * cellW, canvas.height);
    ctx.stroke();
  }, [debugGrid, debugDims]);

  const toggleDebug = async () => {
    if (debugActive) {
      setDebugActive(false);
      setDepthCallback(null);
      stopDepth();
      stopCamera();
    } else {
      setDebugActive(true);
      try {
        await initDepth();
        setDepthCallback((frame) => {
          setDebugGrid(frame.grid);
          setDebugDims({ cols: frame.cols, rows: frame.rows });
          setDebugInfo(`${s.settings.headThreshold}: ${headThreshold.toFixed(2)} · ${s.settings.headLowerMax}: ${headLowerMax.toFixed(2)} · ${s.settings.stepThreshold}: ${stepThreshold.toFixed(2)} · ${s.settings.clearThreshold}: ${clearThreshold.toFixed(2)}`);
        });
        await startCamera({ fps: 6, facingMode: "environment" }, (frame) => {
          sendDepthFrame(frame.bitmap, frame.timestamp);
        });
      } catch {
        setDebugActive(false);
      }
    }
  };

  return (
    <main className="min-h-screen p-4 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-black text-kita-accent">{s.settings.title}</h1>
        <Link
          href="/"
          className="bg-kita-panel border border-kita-muted text-kita-text text-lg font-bold px-4 py-3 rounded-xl"
        >
          {s.settings.close}
        </Link>
      </header>

      <section className="bg-kita-panel rounded-2xl p-4 space-y-4" aria-labelledby="lang-label">
        <h2 id="lang-label" className="text-xl font-bold">{s.settings.language}</h2>
        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => changeLang("fil")}
            className={`flex-1 min-h-[64px] rounded-xl font-bold border-2 ${lang === "fil" ? "bg-kita-accent text-kita-bg border-kita-accent" : "border-kita-muted text-kita-text"}`}
          >
            {s.speech.filPH}
          </button>
          <button
            type="button"
            onClick={() => changeLang("en")}
            className={`flex-1 min-h-[64px] rounded-xl font-bold border-2 ${lang === "en" ? "bg-kita-accent text-kita-bg border-kita-accent" : "border-kita-muted text-kita-text"}`}
          >
            {s.speech.en}
          </button>
        </div>
      </section>

      <section className="bg-kita-panel rounded-2xl p-4 space-y-4" aria-labelledby="battery-label">
        <h2 id="battery-label" className="text-xl font-bold">{lang === "fil" ? "Tipid baterya" : "Battery saver"}</h2>
        <p className="text-base text-kita-muted">{lang === "fil" ? "Binabaan ang frame rate at isinasara ang tuloy-tuloy na voice ID. Hindi awtomatikong bubukas ang camera." : "Reduces frame rates and disables continuous voice ID. Camera stays on demand."}</p>
        <button type="button" onClick={async () => { const value = !batterySaver; setBatterySaver(value); await setSetting("batterySaver", value); announce(value ? (lang === "fil" ? "Bukas ang tipid baterya." : "Battery saver enabled.") : (lang === "fil" ? "Patay ang tipid baterya." : "Battery saver disabled."), "INFO"); }} aria-pressed={batterySaver} className={`min-h-14 w-full rounded-xl border-2 font-bold ${batterySaver ? "border-kita-accent bg-kita-accent text-kita-bg" : "border-kita-muted"}`}>{batterySaver ? (lang === "fil" ? "Tipid baterya: bukas" : "Battery saver: on") : (lang === "fil" ? "Tipid baterya: patay" : "Battery saver: off")}</button>
        <button type="button" onClick={async () => { const batteryApi = navigator as Navigator & { getBattery?: () => Promise<{ level: number; charging: boolean }> }; if (!batteryApi.getBattery) { announce(lang === "fil" ? "Hindi suportado ang battery status sa browser na ito." : "Battery status is not supported in this browser.", "INFO"); return; } const battery = await batteryApi.getBattery(); announce(lang === "fil" ? `Baterya ay ${Math.round(battery.level * 100)} porsyento${battery.charging ? ", nakasaksak." : "."}` : `Battery is ${Math.round(battery.level * 100)} percent${battery.charging ? ", charging." : "."}`, "INFO"); }} className="min-h-14 w-full rounded-xl border border-kita-muted font-bold">{lang === "fil" ? "Ilang porsyento ang baterya?" : "What is the battery percentage?"}</button>
      </section>

      <section className="bg-kita-panel rounded-2xl p-4 space-y-4" aria-labelledby="storage-label">
        <h2 id="storage-label" className="text-xl font-bold">{lang === "fil" ? "Storage at offline models" : "Storage and offline models"}</h2>
        <p className="text-base text-kita-muted" aria-live="polite">{storageSummary || (lang === "fil" ? "Kinukuha ang storage health…" : "Checking storage health…")}</p>
        <Link href="/setup?redownload=1" className="block min-h-14 rounded-xl bg-kita-accent p-4 text-center font-bold text-kita-bg">{lang === "fil" ? "I-download muli ang mga modelo" : "Re-download models"}</Link>
      </section>

      <section className="bg-kita-panel rounded-2xl p-4 space-y-4" aria-labelledby="backup-label">
        <h2 id="backup-label" className="text-xl font-bold">{lang === "fil" ? "Encrypted na backup" : "Encrypted backup"}</h2>
        <p className="text-base text-kita-muted">{lang === "fil" ? "I-export ang mga tao, lugar at settings sa isang .kita file na naka-encrypt gamit ang iyong passphrase." : "Export people, places and settings to one .kita file encrypted with your passphrase."}</p>
        <label htmlFor="backup-pass" className="block text-lg font-bold">{lang === "fil" ? "Passphrase (8 karakter pataas)" : "Passphrase (at least 8 characters)"}</label>
        <input id="backup-pass" type="password" autoComplete="new-password" value={backupPassphrase} onChange={(event) => setBackupPassphrase(event.target.value)} className="min-h-14 w-full rounded-xl border border-kita-muted bg-kita-bg px-4 text-lg" />
        <button type="button" onClick={() => void saveBackup()} disabled={backupPassphrase.length < 8} className="min-h-14 w-full rounded-xl bg-kita-accent font-bold text-kita-bg disabled:opacity-50">{lang === "fil" ? "I-export ang backup" : "Export backup"}</button>
        <label htmlFor="backup-file" className="block text-lg font-bold">{lang === "fil" ? "Pumili ng .kita file" : "Choose a .kita file"}</label>
        <input id="backup-file" type="file" accept=".kita,application/vnd.kita.backup+json" onChange={(event) => setImportFile(event.target.files?.[0] ?? null)} className="min-h-14 w-full rounded-xl border border-kita-muted p-3" />
        <label htmlFor="import-pass" className="block text-lg font-bold">{lang === "fil" ? "Passphrase ng backup" : "Backup passphrase"}</label>
        <input id="import-pass" type="password" autoComplete="current-password" value={importPassphrase} onChange={(event) => setImportPassphrase(event.target.value)} className="min-h-14 w-full rounded-xl border border-kita-muted bg-kita-bg px-4 text-lg" />
        <label htmlFor="import-strategy" className="block text-lg font-bold">{lang === "fil" ? "Paraan ng pag-import" : "Import behavior"}</label>
        <select id="import-strategy" value={importStrategy} onChange={(event) => setImportStrategy(event.target.value as "merge" | "replace")} className="min-h-14 w-full rounded-xl border border-kita-muted bg-kita-bg px-4 text-lg"><option value="merge">{lang === "fil" ? "Pagsamahin" : "Merge"}</option><option value="replace">{lang === "fil" ? "Palitan lahat ng tao, lugar at setting" : "Replace all people, places and settings"}</option></select>
        <button type="button" onClick={() => void restoreBackup()} disabled={!importFile || importPassphrase.length < 8} className="min-h-14 w-full rounded-xl border-2 border-kita-accent font-bold disabled:opacity-50">{lang === "fil" ? "I-import ang backup" : "Import backup"}</button>
        {backupStatus && <p role="status" aria-live="polite" className="text-base">{backupStatus}</p>}
      </section>

      <section className="bg-kita-panel rounded-2xl p-4 space-y-4" aria-labelledby="voice-label">
        <h2 id="voice-label" className="text-xl font-bold">{s.settings.voice}</h2>
        <label className="sr-only" htmlFor="voice-select">
          {s.settings.voice}
        </label>
        <select
          id="voice-select"
          value={selectedVoice}
          onChange={(e) => changeVoice(e.target.value)}
          className="w-full min-h-[56px] bg-kita-bg text-kita-text rounded-xl px-4 text-lg border border-kita-muted"
        >
          <option value="">{s.speech.noVoice}</option>
          {voices.map((v) => (
            <option key={v.voiceURI} value={v.voiceURI}>
              {v.name} ({v.lang})
            </option>
          ))}
        </select>
      </section>

      <section className="bg-kita-panel rounded-2xl p-4 space-y-4" aria-labelledby="rate-label">
        <h2 id="rate-label" className="text-xl font-bold">{s.settings.speechRate}</h2>
        <input
          type="range"
          min="0.5"
          max="2"
          step="0.1"
          value={rate}
          onChange={(e) => changeRate(Number(e.target.value))}
          className="w-full accent-kita-accent"
          aria-valuetext={`${Math.round(rate * 100)} percent`}
        />
      </section>

      <section className="bg-kita-panel rounded-2xl p-4 space-y-4" aria-labelledby="verbosity-label">
        <h2 id="verbosity-label" className="text-xl font-bold">{s.settings.verbosity}</h2>
        <div className="flex gap-2">
          {(["low", "normal", "high"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={async () => {
                setVerbosity(v);
                await setSetting("verbosity", v);
              }}
              className={`flex-1 min-h-[64px] rounded-xl font-bold border-2 ${verbosity === v ? "bg-kita-accent text-kita-bg border-kita-accent" : "border-kita-muted text-kita-text"}`}
            >
              {s.settings[`verbosity${v.charAt(0).toUpperCase() + v.slice(1)}` as keyof typeof s.settings]}
            </button>
          ))}
        </div>
      </section>

      <section className="bg-kita-panel rounded-2xl p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">{s.settings.discreetMode}</h2>
          <button
            type="button"
            onClick={() => toggle("discreet", !discreet)}
            className={`w-16 h-10 rounded-full p-1 transition-colors ${discreet ? "bg-kita-accent" : "bg-kita-muted"}`}
            aria-pressed={discreet}
          >
            <span
              className={`block w-8 h-8 rounded-full bg-white transition-transform ${discreet ? "translate-x-6" : "translate-x-0"}`}
            />
          </button>
        </div>
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">{s.settings.haptics}</h2>
          <button
            type="button"
            onClick={() => toggle("haptics", !haptics)}
            className={`w-16 h-10 rounded-full p-1 transition-colors ${haptics ? "bg-kita-accent" : "bg-kita-muted"}`}
            aria-pressed={haptics}
          >
            <span
              className={`block w-8 h-8 rounded-full bg-white transition-transform ${haptics ? "translate-x-6" : "translate-x-0"}`}
            />
          </button>
        </div>
      </section>

      <section className="bg-kita-panel rounded-2xl p-4 space-y-4" aria-labelledby="threshold-label">
        <h2 id="threshold-label" className="text-xl font-bold">{s.settings.walkStraightThreshold}</h2>
        <input
          type="range"
          min="5"
          max="45"
          step="5"
          value={walkThreshold}
          onChange={async (e) => {
            const v = Number(e.target.value);
            setWalkThreshold(v);
            await setSetting("walkStraightThreshold", v);
          }}
          className="w-full accent-kita-accent"
          aria-valuetext={`${walkThreshold} degrees`}
        />
        <p className="text-lg text-kita-muted" aria-hidden="true">
          {walkThreshold}°
        </p>
      </section>

      <section className="bg-kita-panel rounded-2xl p-4 space-y-4" aria-labelledby="face-threshold-label">
        <h2 id="face-threshold-label" className="text-xl font-bold">{s.settings.faceThreshold}</h2>
        <input
          type="range"
          min="0.35"
          max="0.85"
          step="0.05"
          value={faceThreshold}
          onChange={async (e) => {
            const v = Number(e.target.value);
            setFaceThreshold(v);
            await setSetting("faceThreshold", v);
          }}
          className="w-full accent-kita-accent"
          aria-valuetext={`${faceThreshold.toFixed(2)}`}
        />
        <p className="text-lg text-kita-muted" aria-hidden="true">
          {faceThreshold.toFixed(2)}
        </p>
      </section>

      <section className="bg-kita-panel rounded-2xl p-4 space-y-4" aria-labelledby="head-threshold-label">
        <h2 id="head-threshold-label" className="text-xl font-bold">{s.settings.headThreshold}</h2>
        <input
          type="range"
          min="0.2"
          max="0.9"
          step="0.05"
          value={headThreshold}
          onChange={async (e) => {
            const v = Number(e.target.value);
            setHeadThreshold(v);
            await setSetting("headThreshold", v);
          }}
          className="w-full accent-kita-accent"
          aria-valuetext={`${headThreshold.toFixed(2)}`}
        />
        <p className="text-lg text-kita-muted" aria-hidden="true">{headThreshold.toFixed(2)}</p>
      </section>

      <section className="bg-kita-panel rounded-2xl p-4 space-y-4" aria-labelledby="head-lower-label">
        <h2 id="head-lower-label" className="text-xl font-bold">{s.settings.headLowerMax}</h2>
        <input
          type="range"
          min="0.1"
          max="0.8"
          step="0.05"
          value={headLowerMax}
          onChange={async (e) => {
            const v = Number(e.target.value);
            setHeadLowerMax(v);
            await setSetting("headLowerMax", v);
          }}
          className="w-full accent-kita-accent"
          aria-valuetext={`${headLowerMax.toFixed(2)}`}
        />
        <p className="text-lg text-kita-muted" aria-hidden="true">{headLowerMax.toFixed(2)}</p>
      </section>

      <section className="bg-kita-panel rounded-2xl p-4 space-y-4" aria-labelledby="step-threshold-label">
        <h2 id="step-threshold-label" className="text-xl font-bold">{s.settings.stepThreshold}</h2>
        <input
          type="range"
          min="0.05"
          max="0.6"
          step="0.05"
          value={stepThreshold}
          onChange={async (e) => {
            const v = Number(e.target.value);
            setStepThreshold(v);
            await setSetting("stepThreshold", v);
          }}
          className="w-full accent-kita-accent"
          aria-valuetext={`${stepThreshold.toFixed(2)}`}
        />
        <p className="text-lg text-kita-muted" aria-hidden="true">{stepThreshold.toFixed(2)}</p>
      </section>

      <section className="bg-kita-panel rounded-2xl p-4 space-y-4" aria-labelledby="step-min-label">
        <h2 id="step-min-label" className="text-xl font-bold">{s.settings.stepMinRows}</h2>
        <input
          type="range"
          min="1"
          max="8"
          step="1"
          value={stepMinRows}
          onChange={async (e) => {
            const v = Number(e.target.value);
            setStepMinRows(v);
            await setSetting("stepMinRows", v);
          }}
          className="w-full accent-kita-accent"
          aria-valuetext={`${stepMinRows}`}
        />
        <p className="text-lg text-kita-muted" aria-hidden="true">{stepMinRows}</p>
      </section>

      <section className="bg-kita-panel rounded-2xl p-4 space-y-4" aria-labelledby="clear-threshold-label">
        <h2 id="clear-threshold-label" className="text-xl font-bold">{s.settings.clearThreshold}</h2>
        <input
          type="range"
          min="0.05"
          max="0.6"
          step="0.05"
          value={clearThreshold}
          onChange={async (e) => {
            const v = Number(e.target.value);
            setClearThreshold(v);
            await setSetting("clearThreshold", v);
          }}
          className="w-full accent-kita-accent"
          aria-valuetext={`${clearThreshold.toFixed(2)}`}
        />
        <p className="text-lg text-kita-muted" aria-hidden="true">{clearThreshold.toFixed(2)}</p>
      </section>

      <section className="bg-kita-panel rounded-2xl p-4 space-y-4" aria-labelledby="near-threshold-label">
        <h2 id="near-threshold-label" className="text-xl font-bold">{s.settings.nearThreshold}</h2>
        <input
          type="range"
          min="0.2"
          max="0.9"
          step="0.05"
          value={nearThreshold}
          onChange={async (e) => {
            const v = Number(e.target.value);
            setNearThreshold(v);
            await setSetting("nearThreshold", v);
          }}
          className="w-full accent-kita-accent"
          aria-valuetext={`${nearThreshold.toFixed(2)}`}
        />
        <p className="text-lg text-kita-muted" aria-hidden="true">{nearThreshold.toFixed(2)}</p>
      </section>

      <section className="bg-kita-panel rounded-2xl p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">{s.settings.expressionsEnabled}</h2>
          <button
            type="button"
            onClick={async () => {
              const v = !expressions;
              setExpressions(v);
              await setSetting("expressionsEnabled", v);
            }}
            className={`w-16 h-10 rounded-full p-1 transition-colors ${expressions ? "bg-kita-accent" : "bg-kita-muted"}`}
            aria-pressed={expressions}
          >
            <span className={`block w-8 h-8 rounded-full bg-white transition-transform ${expressions ? "translate-x-6" : "translate-x-0"}`} />
          </button>
        </div>
      </section>

      <section className="bg-kita-panel rounded-2xl p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">{s.settings.depthDebug}</h2>
          <button
            type="button"
            disabled={modelPackage !== "full"}
            onClick={async () => {
              const v = !depthDebug;
              setDepthDebug(v);
              await setSetting("depthDebug", v);
            }}
            className={`w-16 h-10 rounded-full p-1 transition-colors ${depthDebug ? "bg-kita-accent" : "bg-kita-muted"}`}
            aria-pressed={depthDebug}
          >
            <span className={`block w-8 h-8 rounded-full bg-white transition-transform ${depthDebug ? "translate-x-6" : "translate-x-0"}`} />
          </button>
        </div>
        {modelPackage !== "full" && <p className="text-sm text-kita-muted">{lang === "fil" ? "I-download ang Full package para sa depth debug." : "Download the Full package to enable depth debug."}</p>}
      </section>

      {depthDebug && modelPackage === "full" && (
        <section className="bg-kita-panel rounded-2xl p-4 space-y-4" aria-labelledby="depth-debug-label">
          <h2 id="depth-debug-label" className="text-xl font-bold">{s.settings.depthDebug}</h2>
          <button
            type="button"
            onClick={toggleDebug}
            className={`w-full min-h-[64px] rounded-xl font-bold border-2 ${debugActive ? "bg-kita-danger text-white border-kita-danger" : "bg-kita-accent text-kita-bg border-kita-accent"}`}
            aria-pressed={debugActive}
          >
            {debugActive ? s.settings.hideDebug : s.settings.showDebug}
          </button>
          {debugActive && (
            <>
              <canvas
                ref={canvasRef}
                width={320}
                height={240}
                className="w-full rounded-xl bg-kita-bg"
                aria-label="Depth grid overlay"
              />
              <p className="text-lg text-kita-text" aria-live="polite">{debugInfo}</p>
            </>
          )}
        </section>
      )}

      <section className="bg-kita-panel rounded-2xl p-4 space-y-4" aria-labelledby="guard-label">
        <h2 id="guard-label" className="text-xl font-bold">{s.settings.guardCamera}</h2>
        <div className="flex gap-2">
          {(["user", "environment"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={async () => {
                setGuardCamera(v);
                await setSetting("guardCamera", v);
              }}
              className={`flex-1 min-h-[64px] rounded-xl font-bold border-2 ${guardCamera === v ? "bg-kita-accent text-kita-bg border-kita-accent" : "border-kita-muted text-kita-text"}`}
              aria-pressed={guardCamera === v}
            >
              {s.settings[v === "user" ? "guardCameraFront" : "guardCameraRear"]}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">{s.settings.guardMode}</h2>
          <button
            type="button"
            onClick={async () => {
              const v = !guardActive;
              setGuardActive(v);
              if (v) {
                try {
                  await startGuardMode();
                  announce(s.modes.guard.on ?? s.settings.guardMode, "INFO");
                } catch {
                  setGuardActive(false);
                }
              } else {
                stopGuardMode();
              }
            }}
            className={`w-16 h-10 rounded-full p-1 transition-colors ${guardActive ? "bg-kita-accent" : "bg-kita-muted"}`}
            aria-pressed={guardActive}
          >
            <span className={`block w-8 h-8 rounded-full bg-white transition-transform ${guardActive ? "translate-x-6" : "translate-x-0"}`} />
          </button>
        </div>
      </section>

      <section className="bg-kita-panel rounded-2xl p-4 space-y-4" aria-labelledby="calibration-label">
        <h2 id="calibration-label" className="text-xl font-bold">{s.settings.calibration}</h2>
        <button
          type="button"
          onClick={toggleCalibration}
          className={`w-full min-h-[64px] rounded-xl font-bold border-2 ${calibActive ? "bg-kita-danger text-white border-kita-danger" : "bg-kita-accent text-kita-bg border-kita-accent"}`}
          aria-pressed={calibActive}
        >
          {calibActive ? s.settings.stopCalibration : s.settings.startCalibration}
        </button>
        <div aria-live="polite" aria-atomic="true" className="text-lg text-kita-text">
          {calibText}
        </div>
      </section>

      <section className="bg-kita-panel rounded-2xl p-4 space-y-4" aria-labelledby="voice-label">
        <h2 id="voice-label" className="text-xl font-bold">{lang === "fil" ? "Boses at utos" : "Voice and commands"}</h2>
        <p className="text-base text-kita-muted">{lang === "fil" ? "Pinoproseso sa phone ang audio. Hindi ito ipinapadala o sine-save." : "Audio is processed on this phone. It is not uploaded or saved."}</p>
        <label htmlFor="whisper-model" className="block text-lg font-bold">{lang === "fil" ? "Modelo ng pagkilala" : "Recognition model"}</label>
        <select id="whisper-model" value={whisperModel} onChange={async (event) => { const value = event.target.value as WhisperModel; setWhisperModel(value); await setSetting("whisperModel", value); }} className="w-full min-h-14 rounded-xl border border-kita-muted bg-kita-bg px-4 text-lg">
          <option value="onnx-community/whisper-tiny">Whisper tiny (mas magaan / smaller)</option>
          <option value="onnx-community/whisper-base" disabled={modelPackage !== "full"}>Whisper base (Full package)</option>
        </select>
        <label htmlFor="voice-language" className="block text-lg font-bold">{lang === "fil" ? "Wika ng utos" : "Command language"}</label>
        <select id="voice-language" value={voiceLanguage} onChange={async (event) => { const value = event.target.value as VoiceLanguage; setVoiceLanguage(value); await setSetting("voiceLanguage", value); }} className="w-full min-h-14 rounded-xl border border-kita-muted bg-kita-bg px-4 text-lg">
          <option value="auto">{lang === "fil" ? "Awtomatiko" : "Automatic"}</option><option value="fil">Filipino / Tagalog</option><option value="en">English</option>
        </select>
        <div className="flex items-center justify-between gap-4">
          <div><h3 className="text-lg font-bold">{lang === "fil" ? "Kilalanin ang boses" : "Recognize voices"}</h3><p className="text-sm text-kita-muted">{lang === "fil" ? "Opsyonal at patay bilang default. Nakikinig sa maiikling audio window; nasa memorya lang ang audio." : "Optional and off by default. Listens in short audio windows; audio stays in memory."}</p></div>
          <button type="button" disabled={modelPackage !== "full"} onClick={async () => { const value = !voiceIdEnabled; setVoiceIdEnabled(value); await setSetting("voiceIdEnabled", value); announce(value ? (lang === "fil" ? "Nakabukas ang pagkilala sa boses." : "Voice recognition enabled.") : (lang === "fil" ? "Nakasara ang pagkilala sa boses." : "Voice recognition disabled."), "INFO"); }} aria-pressed={voiceIdEnabled} className={`w-16 h-10 shrink-0 rounded-full p-1 ${voiceIdEnabled ? "bg-kita-accent" : "bg-kita-muted"} disabled:opacity-40`}><span className={`block h-8 w-8 rounded-full bg-white ${voiceIdEnabled ? "translate-x-6" : ""}`} /></button>
        </div>
        {modelPackage !== "full" && <p className="text-sm text-kita-muted">{lang === "fil" ? "I-download ang Full package para magamit ang Whisper base at voice ID." : "Download the Full package to enable Whisper base and voice ID."}</p>}
      </section>

      <section className="bg-kita-panel rounded-2xl p-4 space-y-4" aria-labelledby="sounds-label">
        <h2 id="sounds-label" className="text-xl font-bold">{s.settings.learnSounds}</h2>
        {([
          ["head", s.sounds.headLevel],
          ["step", s.sounds.stepDown],
          ["vehicle", s.sounds.vehicle],
          ["tick", s.sounds.tick],
          ["sonar", s.sounds.sonar],
        ] as ["head" | "step" | "vehicle" | "tick" | "sonar", string][]).map(([type, label]) => (
          <div key={type} className="flex items-center justify-between">
            <span className="text-lg">{label}</span>
            <button
              type="button"
              onClick={() => playAndExplain(type, label)}
              className="bg-kita-accent text-kita-bg font-bold px-4 py-2 rounded-xl"
            >
              {s.settings.play}
            </button>
          </div>
        ))}
      </section>

      <section className="bg-kita-panel rounded-2xl p-4 space-y-4">
        <p className="text-lg leading-relaxed">{s.settings.safety}</p>
        <p className="text-lg leading-relaxed">{s.settings.privacy}</p>
      </section>

      <button
        type="button"
        onClick={() => setShowDelete(true)}
        className="w-full min-h-[72px] bg-kita-danger text-white text-xl font-bold rounded-2xl"
      >
        {s.settings.deleteData}
      </button>

      {showDelete && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-6 z-50" role="alertdialog" aria-modal="true">
          <div className="bg-kita-panel rounded-2xl p-6 max-w-sm w-full space-y-6">
            <p className="text-xl">{s.settings.deleteConfirm}</p>
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => setShowDelete(false)}
                className="flex-1 min-h-[56px] rounded-xl border-2 border-kita-muted text-kita-text font-bold"
              >
                {s.settings.close}
              </button>
              <button
                type="button"
                onClick={deleteAll}
                className="flex-1 min-h-[56px] rounded-xl bg-kita-danger text-white font-bold"
              >
                {s.settings.deleteData}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

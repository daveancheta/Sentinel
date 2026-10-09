"use client";

import { useEffect, useState } from "react";
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

export default function SettingsPage() {
  const [lang, setLang] = useState<Language>("fil");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<string>("");
  const [rate, setRate] = useState<number>(1.1);
  const [verbosity, setVerbosity] = useState<string>("normal");
  const [discreet, setDiscreet] = useState<boolean>(false);
  const [haptics, setHaptics] = useState<boolean>(true);
  const [walkThreshold, setWalkThreshold] = useState<number>(10);
  const [showDelete, setShowDelete] = useState(false);

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
      const uri = await getSetting<string | null>("voiceUri", null);
      setSelectedVoice(uri ?? "");
      if ("speechSynthesis" in window) {
        window.speechSynthesis.onvoiceschanged = () => setVoices(getVoices());
      }
    })();
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

  const playAndExplain = (type: "head" | "step" | "vehicle" | "tick" | "sonar", label: string) => {
    playEarcon(type);
    announce(`${label}. ${s.sounds[type === "head" ? "headLevel" : type === "step" ? "stepDown" : type === "vehicle" ? "vehicle" : type === "tick" ? "tick" : "sonar"]}`, "INFO");
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

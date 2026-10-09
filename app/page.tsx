"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { initAnnouncer, announce, repeatLast, getCurrentLanguage } from "../lib/speech/announcer";
import { getStrings, type Language } from "../lib/i18n";
import { vibrate } from "../lib/haptics";
import { startSeatMode, stopSeatMode } from "../modes/seat";
import { startWalkStraightMode, stopWalkStraightMode } from "../modes/walkStraight";
import { startFacingMode, stopFacingMode } from "../modes/facing";
import { startWhosHereMode, stopWhosHereMode } from "../modes/whosHere";
import { startWalkingMode, stopWalkingMode } from "../modes/walking";
import { startWhatsAheadMode } from "../modes/whatsAhead";
import { startSignsMode, stopSignsMode } from "../modes/signs";
import { startDoorMode, stopDoorMode } from "../modes/doors";
import { startGuardMode, stopGuardMode } from "../modes/guard";
import { db, getSetting } from "../lib/db";
import { matchVoiceIntent, voiceExamples, type VoiceIntent } from "../lib/voice/intents";
import { recordPushToTalk, releasePushToTalk, transcribe, type WhisperModel, type VoiceLanguage } from "../lib/voice/transcriber";
import { startVoiceIdentification } from "../lib/voice/speaker";

type ActiveMode = "walking" | "seat" | "walkStraight" | "facing" | "whosHere" | "signs" | "door" | null;

function BigButton({
  label,
  sub,
  onClick,
  testId,
  active,
}: {
  label: string;
  sub?: string;
  onClick: () => void;
  testId: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      aria-pressed={active}
      className={`w-full min-h-[96px] border-2 rounded-2xl px-6 py-4 text-left active:scale-[0.98] focus:outline-none focus-visible:ring-4 focus-visible:ring-kita-accent ${active ? "bg-kita-accent text-kita-bg border-kita-accent" : "bg-kita-panel border-kita-accent text-kita-text"}`}
    >
      <span className="block text-2xl font-bold">{label}</span>
      {sub && <span className={`block text-sm mt-1 ${active ? "text-kita-bg/80" : "text-kita-muted"}`}>{sub}</span>}
    </button>
  );
}

function StopButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full min-h-[72px] bg-kita-danger text-white text-2xl font-black rounded-2xl active:scale-[0.98] focus:outline-none focus-visible:ring-4 focus-visible:ring-white"
    >
      {label}
    </button>
  );
}

export default function HomePage() {
  const [lang, setLangState] = useState<Language>("fil");
  const [activeMode, setActiveMode] = useState<ActiveMode>(null);
  const [loading, setLoading] = useState(false);
  const [showSigns, setShowSigns] = useState(false);
  const [roomNumber, setRoomNumber] = useState("");
  const [recording, setRecording] = useState(false);
  const [toggleTalk, setToggleTalk] = useState(false);
  const [heardIntent, setHeardIntent] = useState<VoiceIntent | null>(null);
  const recordingRef = useRef(false);
  const audioPromiseRef = useRef<Promise<Float32Array> | null>(null);
  const s = getStrings(lang);

  useEffect(() => {
    initAnnouncer().then(() => {
      const l = getCurrentLanguage();
      setLangState(l);
      announce(getStrings(l).tagline, "INFO");
    });
    getSetting<boolean>("voiceToggleMode", false).then(setToggleTalk);
  }, []);

  useEffect(() => {
    let stop: (() => void) | null = null;
    let cancelled = false;
    getSetting<boolean>("voiceIdEnabled", false).then(async (enabled) => {
      if (!enabled || cancelled) return;
      try {
        stop = await startVoiceIdentification((name) => announce(`${lang === "fil" ? "Narinig ko rin si" : "I also heard"} ${name}.`, "INFO"));
      } catch (error) {
        announce(`${lang === "fil" ? "Hindi mabuksan ang mikropono para sa pagkilala ng boses." : "Could not start voice identification."} ${error instanceof Error ? error.message : String(error)}`, "WARNING");
      }
    });
    return () => { cancelled = true; stop?.(); };
  }, [lang]);

  const stopAll = () => {
    setActiveMode(null);
    stopWalkingMode();
    stopSeatMode();
    stopWalkStraightMode();
    stopFacingMode();
    stopWhosHereMode();
    stopSignsMode();
    stopDoorMode();
    stopGuardMode();
    vibrate("confirm");
    announce(s.modes.stopped, "INFO");
  };

  const runIntent = async (intent: VoiceIntent) => {
    setHeardIntent(null);
    switch (intent.type) {
      case "whosHere": await startWhosHere(); break;
      case "walking": await startWalking(); break;
      case "walkStraight": await startWalkStraight(); break;
      case "seat": await startSeat(); break;
      case "findCr": await startSignSearch("CR"); break;
      case "findExit": await startSignSearch("Exit"); break;
      case "findRoom": setRoomNumber(intent.room); await startSignSearch(intent.room); break;
      case "door": await startDoors(); break;
      case "readAll": await startSignSearch("", true); break;
      case "whichWay": await startFacing(); break;
      case "whatsAhead": await startWhatsAhead(); break;
      case "guard":
        if (loading) return;
        setLoading(true); stopAll();
        try { await startGuardMode(); announce(getStrings(lang).modes.guard.on, "INFO"); }
        catch (error) { announce(`Hindi mabuksan ang Guard mode. ${error instanceof Error ? error.message : String(error)}`, "WARNING"); }
        finally { setLoading(false); }
        break;
      case "stop": stopAll(); break;
      case "repeat": repeatLast(); break;
    }
  };

  const startVoiceCapture = async () => {
    if (recordingRef.current) return;
    recordingRef.current = true;
    setRecording(true);
    try {
      const audioPromise = recordPushToTalk(() => vibrate("confirm"), () => vibrate("confirm"), !toggleTalk);
      audioPromiseRef.current = audioPromise;
      const audio = await audioPromise;
      recordingRef.current = false; setRecording(false);
      const model = await getSetting<WhisperModel>("whisperModel", "onnx-community/whisper-tiny");
      const voiceLanguage = await getSetting<VoiceLanguage>("voiceLanguage", "auto");
      const transcript = await transcribe(audio, model, voiceLanguage);
      const match = matchVoiceIntent(transcript);
      if (!match.intent) {
        announce(`${lang === "fil" ? "Hindi ko naintindihan." : "I didn't understand."} ${voiceExamples(lang)}`, "INFO");
      } else if (match.confidence < 0.72) {
        setHeardIntent(match.intent);
        announce(`${lang === "fil" ? "Ang narinig ko" : "I heard"}: ${transcript}. ${lang === "fil" ? "Tama ba? Pindutin ang Oo o Hindi." : "Is that right? Choose Yes or No."}`, "WARNING");
      } else await runIntent(match.intent);
    } catch (error) {
      recordingRef.current = false; setRecording(false);
      announce(`Hindi magamit ang mikropono o Whisper. ${error instanceof Error ? error.message : String(error)}`, "WARNING");
    }
  };

  const stopVoiceCapture = () => releasePushToTalk();

  const startWalking = async () => {
    if (loading || activeMode === "walking") return;
    setLoading(true);
    stopAll();
    try {
      await startWalkingMode();
      setActiveMode("walking");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      announce(`Hindi mabuksan ang kamera. ${msg}`, "WARNING");
    } finally {
      setLoading(false);
    }
  };

  const startSeat = async () => {
    if (loading || activeMode === "seat") return;
    setLoading(true);
    stopAll();
    try {
      await startSeatMode();
      setActiveMode("seat");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      announce(`Hindi mabuksan ang kamera. ${msg}`, "WARNING");
    } finally {
      setLoading(false);
    }
  };

  const startWalkStraight = async () => {
    if (loading || activeMode === "walkStraight") return;
    setLoading(true);
    stopAll();
    try {
      await startWalkStraightMode();
      setActiveMode("walkStraight");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      announce(`Hindi mabuksan ang compass. ${msg}`, "WARNING");
    } finally {
      setLoading(false);
    }
  };

  const startFacing = async () => {
    if (loading || activeMode === "facing") return;
    setLoading(true);
    stopAll();
    try {
      await startFacingMode();
      setActiveMode("facing");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      announce(`Hindi mabuksan ang compass o kamera. ${msg}`, "WARNING");
    } finally {
      setLoading(false);
    }
  };

  const startWhosHere = async () => {
    if (loading || activeMode === "whosHere") return;
    setLoading(true);
    stopAll();
    try {
      await startWhosHereMode();
      setActiveMode("whosHere");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      announce(`Hindi mabuksan ang kamera. ${msg}`, "WARNING");
    } finally {
      setLoading(false);
    }
  };

  const startWhatsAhead = async () => {
    if (loading) return;
    setLoading(true);
    stopAll();
    try {
      await startWhatsAheadMode();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      announce(`Hindi mabuksan ang kamera. ${msg}`, "WARNING");
    } finally {
      setLoading(false);
    }
  };

  const startSignSearch = async (target: string, readAll = false) => {
    if (loading) return;
    setLoading(true); stopAll();
    try { await startSignsMode({ target, readAll }); setActiveMode("signs"); }
    catch (e) { announce(`Hindi mabuksan ang kamera o OCR. ${e instanceof Error ? e.message : String(e)}`, "WARNING"); }
    finally { setLoading(false); }
  };

  const startDoors = async () => {
    if (loading) return;
    setLoading(true); stopAll();
    try { await startDoorMode(); setActiveMode("door"); }
    catch (e) { announce(`Hindi mabuksan ang kamera o pagkilala sa pinto. ${e instanceof Error ? e.message : String(e)}`, "WARNING"); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    const onDoubleShake = () => startWhosHere();
    window.addEventListener("kita-double-shake", onDoubleShake);
    return () => window.removeEventListener("kita-double-shake", onDoubleShake);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="min-h-screen p-4 space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-black text-kita-accent">{s.home.title}</h1>
        <Link
          href="/settings"
          className="bg-kita-panel border border-kita-muted text-kita-text text-lg font-bold px-4 py-3 rounded-xl min-h-[48px]"
        >
          {s.home.settings}
        </Link>
      </header>

      <p className="text-lg text-kita-muted" aria-hidden="true">
        {s.tagline}
      </p>

      <div className="grid grid-cols-2 gap-4">
        <BigButton
          label={s.home.whosHere}
          active={activeMode === "whosHere"}
          onClick={startWhosHere}
          testId="btn-whos-here"
        />
        <BigButton
          label={s.home.walking}
          active={activeMode === "walking"}
          onClick={startWalking}
          testId="btn-walking"
        />
        <BigButton
          label={s.home.walkStraight}
          active={activeMode === "walkStraight"}
          onClick={startWalkStraight}
          testId="btn-walk-straight"
        />
        <BigButton
          label={s.home.findSeat}
          active={activeMode === "seat"}
          onClick={startSeat}
          testId="btn-find-seat"
        />
        <BigButton
          label={s.home.whatsAhead}
          onClick={startWhatsAhead}
          testId="btn-whats-ahead"
        />
        <BigButton
          label={s.home.whichWay}
          active={activeMode === "facing"}
          onClick={startFacing}
          testId="btn-which-way"
        />
        <BigButton label="Signs & Doors" sub="Maghanap ng karatula o pinto" active={showSigns || activeMode === "signs" || activeMode === "door"} onClick={() => setShowSigns((v) => !v)} testId="btn-signs-doors" />
      </div>

      {showSigns && <section aria-label="Signs and doors" className="space-y-3 rounded-2xl border border-kita-muted p-4">
        <h2 className="text-xl font-bold">Maghanap ng karatula o pinto</h2>
        <BigButton label="Hanapin ang CR" onClick={() => startSignSearch("CR")} testId="btn-find-cr" />
        <BigButton label="Hanapin ang Exit" onClick={() => startSignSearch("Exit")} testId="btn-find-exit" />
        <label htmlFor="room-number" className="block text-lg font-bold">Hanapin ang kuwarto</label>
        <div className="flex gap-2">
          <input id="room-number" inputMode="text" autoComplete="off" value={roomNumber} onChange={(e) => setRoomNumber(e.target.value)} placeholder="Hal. 204" className="min-h-14 min-w-0 flex-1 rounded-xl border-2 border-kita-muted bg-kita-panel px-4 text-xl text-kita-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-kita-accent" />
          <button type="button" onClick={() => roomNumber.trim() && startSignSearch(roomNumber.trim())} className="min-h-14 rounded-xl bg-kita-accent px-4 font-bold text-kita-bg focus-visible:ring-4 focus-visible:ring-white">Hanapin</button>
        </div>
        <BigButton label="Hanapin ang pinto" onClick={startDoors} testId="btn-find-door" />
        <BigButton label="Basahin lahat" onClick={() => startSignSearch("", true)} testId="btn-read-all" />
      </section>}

      <button
        type="button"
        onPointerDown={(event) => { event.preventDefault(); if (toggleTalk) { if (recordingRef.current) stopVoiceCapture(); else void startVoiceCapture(); } else void startVoiceCapture(); }}
        onPointerUp={() => { if (!toggleTalk) stopVoiceCapture(); }}
        onPointerCancel={() => { if (!toggleTalk) stopVoiceCapture(); }}
        onKeyDown={(event) => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); if (!toggleTalk && !event.repeat) void startVoiceCapture(); } }}
        onKeyUp={(event) => { if (!toggleTalk && (event.key === " " || event.key === "Enter")) stopVoiceCapture(); }}
        className="w-full min-h-[120px] bg-kita-accent text-kita-bg text-3xl font-black rounded-3xl active:scale-[0.98] focus:outline-none focus-visible:ring-4 focus-visible:ring-white"
        aria-label={`${s.home.holdToTalk}. ${recording ? (lang === "fil" ? "Nagre-record" : "Recording") : (lang === "fil" ? "Bitawan para matapos" : "Release to finish")}`}
        aria-pressed={recording}
      >
        {recording ? (lang === "fil" ? "Nagre-record…" : "Recording…") : s.home.holdToTalk}
      </button>

      <button type="button" aria-pressed={toggleTalk} onClick={() => { setToggleTalk((value) => !value); void db.settings.put({ key: "voiceToggleMode", value: !toggleTalk }); announce(!toggleTalk ? (lang === "fil" ? "Toggle mode: pindutin para magsimula at pindutin ulit para huminto." : "Toggle mode: press to start, then press again to stop.") : (lang === "fil" ? "Hold mode ay bukas." : "Hold mode enabled."), "INFO"); }} className="w-full min-h-14 rounded-xl border border-kita-muted bg-kita-panel px-4 text-lg font-bold" >
        {toggleTalk ? (lang === "fil" ? "Toggle mode: bukas" : "Toggle mode: on") : (lang === "fil" ? "Toggle mode: patay" : "Toggle mode: off")}
      </button>
      {heardIntent && <section className="rounded-xl border-2 border-kita-accent p-3" aria-label={lang === "fil" ? "Kumpirmahin ang command" : "Confirm command"}>
        <button type="button" className="mr-3 min-h-12 rounded-lg bg-kita-accent px-5 font-bold text-kita-bg" onClick={() => void runIntent(heardIntent)}>{lang === "fil" ? "Oo" : "Yes"}</button>
        <button type="button" className="min-h-12 rounded-lg border border-kita-muted px-5 font-bold" onClick={() => { setHeardIntent(null); announce(lang === "fil" ? "Kinansela." : "Cancelled.", "INFO"); }}>{lang === "fil" ? "Hindi" : "No"}</button>
      </section>}

      <StopButton onClick={stopAll} label={s.modes.stopped} />

      <button
        type="button"
        onClick={() => {
          vibrate("confirm");
          repeatLast();
        }}
        className="w-full min-h-[72px] bg-kita-panel border border-kita-muted text-kita-text text-xl font-bold rounded-2xl active:scale-[0.98] focus:outline-none focus-visible:ring-4 focus-visible:ring-kita-accent"
      >
        {s.home.repeat}
      </button>

      <div className="sr-only" role="status">
        {s.tagline}
      </div>
    </main>
  );
}

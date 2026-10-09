"use client";

import { useEffect, useState } from "react";
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

type ActiveMode = "walking" | "seat" | "walkStraight" | "facing" | "whosHere" | null;

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
  const s = getStrings(lang);

  useEffect(() => {
    initAnnouncer().then(() => {
      const l = getCurrentLanguage();
      setLangState(l);
      announce(getStrings(l).tagline, "INFO");
    });
  }, []);

  const stopAll = () => {
    setActiveMode(null);
    stopWalkingMode();
    stopSeatMode();
    stopWalkStraightMode();
    stopFacingMode();
    stopWhosHereMode();
    vibrate("confirm");
    announce(s.modes.stopped, "INFO");
  };

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
      </div>

      <button
        type="button"
        onMouseDown={() => {}}
        onMouseUp={() => {}}
        onTouchStart={() => {}}
        onTouchEnd={() => {}}
        className="w-full min-h-[120px] bg-kita-accent text-kita-bg text-3xl font-black rounded-3xl active:scale-[0.98] focus:outline-none focus-visible:ring-4 focus-visible:ring-white"
        aria-label={s.home.holdToTalk}
      >
        {s.home.holdToTalk}
      </button>

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

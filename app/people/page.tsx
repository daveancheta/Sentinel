"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { db, type Person } from "../../lib/db";
import { getStrings, type Language } from "../../lib/i18n";
import { announce, getCurrentLanguage } from "../../lib/speech/announcer";
import { vibrate } from "../../lib/haptics";
import { startCamera, stopCamera } from "../../lib/camera";
import { initFaces, setFacesCallback, sendFacesFrame, stopFaces } from "../../lib/faces-bridge";
import { cosineSimilarity } from "../../lib/faces/match";
import { makeVoiceEmbedding, recordVoiceSample } from "../../lib/voice/speaker";

const RELATIONS = [
  "nanay",
  "tatay",
  "kuya",
  "ate",
  "lola",
  "lolo",
  "kaibigan",
  "other",
] as const;

export default function PeoplePage() {
  const [lang, setLang] = useState<Language>("fil");
  const [people, setPeople] = useState<Person[]>([]);
  const [mode, setMode] = useState<"list" | "capture" | "add">("list");
  const [name, setName] = useState("");
  const [relation, setRelation] = useState<string>("other");
  const [consent, setConsent] = useState(false);
  const [samples, setSamples] = useState<Float32Array[]>([]);
  const [status, setStatus] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [voiceRecordingId, setVoiceRecordingId] = useState<number | null>(null);
  const capturingRef = useRef(false);
  const samplesRef = useRef<Float32Array[]>([]);
  const s = getStrings(lang);

  useEffect(() => {
    setLang(getCurrentLanguage());
    loadPeople();
    return () => {
      stopCapture();
    };
  }, []);

  const loadPeople = async () => {
    const list = await db.people.toArray();
    setPeople(list);
  };

  const stopCapture = () => {
    capturingRef.current = false;
    stopFaces();
    stopCamera();
    setFacesCallback(null);
  };

  const beginAdd = () => {
    setName("");
    setRelation("other");
    setConsent(false);
    setSamples([]);
    samplesRef.current = [];
    setEditingId(null);
    setMode("add");
  };

  const beginRetrain = (p: Person) => {
    setName(p.name);
    setRelation(p.relation);
    setConsent(true);
    setSamples([]);
    samplesRef.current = [];
    setEditingId(p.id ?? null);
    setMode("capture");
    startCapture(p.id ?? null);
  };

  const startCapture = async (id: number | null) => {
    if (!consent && id === null) {
      announce(s.people.consentRequired, "WARNING");
      return;
    }
    setMode("capture");
    capturingRef.current = true;
    setStatus(s.people.captureHint);
    announce(s.people.captureHint, "INFO");

    try {
      await initFaces();
      setFacesCallback((faces) => {
        if (!capturingRef.current) return;
        if (faces.length !== 1) return;
        const f = faces[0];
        if (f.confidence < 0.55 || f.bbox.height < 0.2 || f.embedding.length === 0) return;
        const emb = new Float32Array(f.embedding);
        const current = samplesRef.current;
        if (current.some((s) => cosineSimilarity(s, emb) > 0.98)) return;
        const next = [...current, emb];
        samplesRef.current = next;
        setSamples(next);
        vibrate("confirm");
        const msg = `${s.people.sampleTaken} ${next.length}. ${s.people[`captureHint${next.length}` as keyof typeof s.people] ?? ""}`;
        announce(msg, "INFO");
        setStatus(msg);
        if (next.length >= 8) {
          void finishCapture(id, next);
        }
      });
      await startCamera({ fps: 3, facingMode: "environment" }, (frame) => {
        if (capturingRef.current) sendFacesFrame(frame.bitmap, frame.timestamp);
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      announce(`${s.people.cameraError} ${msg}`, "WARNING");
      stopCapture();
      setMode("list");
    }
  };

  const finishCapture = async (id: number | null, embeddings: Float32Array[]) => {
    capturingRef.current = false;
    stopFaces();
    stopCamera();
    setFacesCallback(null);
    const trimmed = name.trim();
    if (id != null) {
      await db.people.update(id, { name: trimmed, relation, faceEmbeddings: embeddings });
    } else {
      await db.people.add({ name: trimmed, relation, faceEmbeddings: embeddings, createdAt: Date.now() });
    }
    await loadPeople();
    setMode("list");
    vibrate("confirm");
    announce(s.people.saved.replace("{name}", trimmed), "INFO");
  };

  const savePerson = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (!consent) {
      announce(s.people.consentRequired, "WARNING");
      return;
    }
    await startCapture(null);
  };

  const rename = async (p: Person, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === p.name) return;
    await db.people.update(p.id!, { name: trimmed });
    await loadPeople();
    announce(s.people.renamed, "INFO");
  };

  const remove = async (p: Person) => {
    await db.people.delete(p.id!);
    await loadPeople();
    vibrate("confirm");
    announce(s.people.deleted.replace("{name}", p.name), "INFO");
  };

  const recordVoice = async (p: Person) => {
    if (!p.id || voiceRecordingId !== null) return;
    setVoiceRecordingId(p.id);
    announce(lang === "fil" ? "Magsalita nang natural sa loob ng sampung segundo." : "Speak naturally for ten seconds.", "INFO");
    try {
      const audio = await recordVoiceSample(10);
      const embedding = await makeVoiceEmbedding(audio);
      await db.people.update(p.id, { voiceEmbeddings: [...(p.voiceEmbeddings ?? []), embedding] });
      await loadPeople();
      announce(lang === "fil" ? `Naka-save ang sample ng boses ni ${p.name}.` : `Voice sample saved for ${p.name}.`, "INFO");
    } catch (error) {
      announce(`${lang === "fil" ? "Hindi maitala ang boses." : "Could not record voice."} ${error instanceof Error ? error.message : String(error)}`, "WARNING");
    } finally { setVoiceRecordingId(null); }
  };

  return (
    <main className="min-h-screen p-4 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-black text-kita-accent">{s.people.title}</h1>
        <Link
          href="/"
          className="bg-kita-panel border border-kita-muted text-kita-text text-lg font-bold px-4 py-3 rounded-xl"
        >
          {s.people.close}
        </Link>
      </header>

      {mode === "list" && (
        <>
          <button
            type="button"
            onClick={beginAdd}
            className="w-full min-h-[72px] bg-kita-accent text-kita-bg text-xl font-black rounded-2xl active:scale-[0.98] focus:outline-none focus-visible:ring-4 focus-visible:ring-white"
          >
            {s.people.add}
          </button>

          <section aria-labelledby="people-label">
            <h2 id="people-label" className="text-xl font-bold mb-2">
              {s.people.saved}
            </h2>
            {people.length === 0 ? (
              <p className="text-lg text-kita-muted">{s.people.noPeople}</p>
            ) : (
              <ul className="space-y-4">
                {people.map((p) => (
                  <li
                    key={p.id}
                    className="bg-kita-panel rounded-2xl p-4 space-y-3"
                    aria-label={`${p.name}, ${s.people.relations[p.relation as keyof typeof s.people.relations] ?? p.relation}`}
                  >
                    <input
                      type="text"
                      defaultValue={p.name}
                      onBlur={(e) => rename(p, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      }}
                      className="w-full min-h-[56px] bg-kita-bg text-kita-text rounded-xl px-4 text-lg border border-kita-muted"
                      aria-label={s.people.name}
                    />
                    <p className="text-sm text-kita-muted">
                      {s.people.relation}: {s.people.relations[p.relation as keyof typeof s.people.relations] ?? p.relation}
                    </p>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => beginRetrain(p)}
                        className="flex-1 min-h-[56px] bg-kita-panel border border-kita-muted text-kita-text text-lg font-bold rounded-xl"
                      >
                        {s.people.retrain}
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(p)}
                        className="flex-1 min-h-[56px] bg-kita-danger text-white text-lg font-bold rounded-xl"
                      >
                        {s.people.delete}
                      </button>
                    </div>
                    <button type="button" disabled={voiceRecordingId !== null} onClick={() => void recordVoice(p)} className="w-full min-h-[56px] rounded-xl border-2 border-kita-accent font-bold disabled:opacity-50">
                      {voiceRecordingId === p.id ? (lang === "fil" ? "Kinukuha ang boses…" : "Recording voice…") : (lang === "fil" ? `Itala ang boses (${p.voiceEmbeddings?.length ?? 0} sample)` : `Record voice (${p.voiceEmbeddings?.length ?? 0} samples)`)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {(mode === "add" || mode === "capture") && (
        <section className="bg-kita-panel rounded-2xl p-4 space-y-4" aria-labelledby="capture-label">
          <h2 id="capture-label" className="text-xl font-bold">
            {editingId != null ? s.people.retrain : s.people.add}
          </h2>

          {mode === "add" && (
            <>
              <label htmlFor="person-name" className="text-lg font-bold block">
                {s.people.name}
              </label>
              <input
                id="person-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={s.people.placeholder}
                className="w-full min-h-[56px] bg-kita-bg text-kita-text rounded-xl px-4 text-lg border border-kita-muted"
              />

              <label htmlFor="person-relation" className="text-lg font-bold block">
                {s.people.relation}
              </label>
              <select
                id="person-relation"
                value={relation}
                onChange={(e) => setRelation(e.target.value)}
                className="w-full min-h-[56px] bg-kita-bg text-kita-text rounded-xl px-4 text-lg border border-kita-muted"
              >
                {RELATIONS.map((r) => (
                  <option key={r} value={r}>
                    {s.people.relations[r]}
                  </option>
                ))}
              </select>

              <label className="flex items-start gap-3 text-lg">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-1 w-6 h-6 accent-kita-accent"
                />
                <span>{s.people.consent}</span>
              </label>

              <button
                type="button"
                onClick={savePerson}
                disabled={!name.trim() || !consent}
                className="w-full min-h-[72px] bg-kita-accent text-kita-bg text-xl font-black rounded-2xl disabled:opacity-50"
              >
                {s.people.startCapture}
              </button>
            </>
          )}

          {mode === "capture" && (
            <>
              <p className="text-lg" aria-live="polite" aria-atomic="true">
                {status || s.people.captureHint}
              </p>
              <p className="text-2xl font-black text-kita-accent">
                {samples.length} / 8
              </p>
              <button
                type="button"
                onClick={() => {
                  stopCapture();
                  setMode("list");
                }}
                className="w-full min-h-[56px] bg-kita-danger text-white text-lg font-bold rounded-xl"
              >
                {s.people.cancel}
              </button>
            </>
          )}
        </section>
      )}
    </main>
  );
}

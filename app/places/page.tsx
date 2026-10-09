"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { db, type Place } from "../../lib/db";
import { getStrings, type Language } from "../../lib/i18n";
import { announce, getCurrentLanguage } from "../../lib/speech/announcer";
import { vibrate } from "../../lib/haptics";

export default function PlacesPage() {
  const [lang, setLang] = useState<Language>("fil");
  const [places, setPlaces] = useState<Place[]>([]);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const s = getStrings(lang);

  useEffect(() => {
    setLang(getCurrentLanguage());
    loadPlaces();
  }, []);

  const loadPlaces = async () => {
    setPlaces(await db.places.toArray());
  };

  const savePlace = async () => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await db.places.add({
          name: trimmed,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        setName("");
        await loadPlaces();
        vibrate("confirm");
        announce(s.places.savedAs.replace("{name}", trimmed), "INFO");
        setSaving(false);
      },
      async (err) => {
        vibrate("danger");
        announce(`${s.places.gpsError}. ${err.message}`, "WARNING");
        setSaving(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const rename = async (id: number, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    await db.places.update(id, { name: trimmed });
    await loadPlaces();
    vibrate("confirm");
    announce(s.places.renamed, "INFO");
  };

  const remove = async (id: number, placeName: string) => {
    await db.places.delete(id);
    await loadPlaces();
    vibrate("confirm");
    announce(s.places.deleted.replace("{name}", placeName), "INFO");
  };

  return (
    <main className="min-h-screen p-4 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-black text-kita-accent">{s.places.title}</h1>
        <Link
          href="/"
          className="bg-kita-panel border border-kita-muted text-kita-text text-lg font-bold px-4 py-3 rounded-xl"
        >
          {s.places.close}
        </Link>
      </header>

      <section className="bg-kita-panel rounded-2xl p-4 space-y-4" aria-labelledby="save-label">
        <label id="save-label" htmlFor="place-name" className="text-xl font-bold block">
          {s.places.save}
        </label>
        <input
          id="place-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={s.places.placeholder}
          className="w-full min-h-[56px] bg-kita-bg text-kita-text rounded-xl px-4 text-lg border border-kita-muted"
        />
        <button
          type="button"
          onClick={savePlace}
          disabled={saving || !name.trim()}
          className="w-full min-h-[72px] bg-kita-accent text-kita-bg text-xl font-black rounded-2xl active:scale-[0.98] focus:outline-none focus-visible:ring-4 focus-visible:ring-white disabled:opacity-50"
          aria-label={s.places.save}
        >
          {s.places.save}
        </button>
      </section>

      <section aria-labelledby="saved-label">
        <h2 id="saved-label" className="text-xl font-bold mb-2">
          {s.places.saved}
        </h2>
        {places.length === 0 ? (
          <p className="text-lg text-kita-muted">{s.places.noPlaces}</p>
        ) : (
          <ul className="space-y-4">
            {places.map((p) => (
              <li
                key={p.id}
                className="bg-kita-panel rounded-2xl p-4 space-y-3"
                aria-label={`${p.name}, ${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`}
              >
                <input
                  type="text"
                  defaultValue={p.name}
                  onBlur={(e) => {
                    if (e.target.value.trim() !== p.name) {
                      rename(p.id!, e.target.value);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  className="w-full min-h-[56px] bg-kita-bg text-kita-text rounded-xl px-4 text-lg border border-kita-muted"
                  aria-label={s.places.name}
                />
                <p className="text-sm text-kita-muted">
                  {p.lat.toFixed(5)}, {p.lng.toFixed(5)}
                </p>
                <button
                  type="button"
                  onClick={() => remove(p.id!, p.name)}
                  className="w-full min-h-[56px] bg-kita-danger text-white text-lg font-bold rounded-xl"
                  aria-label={`${s.places.delete} ${p.name}`}
                >
                  {s.places.delete}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

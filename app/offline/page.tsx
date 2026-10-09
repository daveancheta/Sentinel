"use client";

import Link from "next/link";
import { getStrings } from "../../lib/i18n";
import { initAnnouncer, announce, getCurrentLanguage } from "../../lib/speech/announcer";
import { useEffect } from "react";

export default function OfflinePage() {
  useEffect(() => {
    initAnnouncer().then(() => {
      const s = getStrings(getCurrentLanguage());
      announce(s.offline.title, "WARNING");
    });
  }, []);

  const s = getStrings(getCurrentLanguage());

  return (
    <main className="flex flex-col items-center justify-center min-h-screen px-6 text-center">
      <h1 className="text-3xl font-bold text-kita-accent mb-4">{s.offline.title}</h1>
      <p className="text-xl text-kita-text mb-8">{s.offline.message}</p>
      <Link
        href="/"
        className="inline-block bg-kita-accent text-kita-bg text-2xl font-bold py-5 px-8 rounded-2xl min-h-[96px]"
      >
        {s.offline.goHome}
      </Link>
    </main>
  );
}

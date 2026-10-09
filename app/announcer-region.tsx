"use client";

import { useEffect, useState } from "react";
import { registerAriaLive } from "../lib/speech/announcer";
import { getStrings } from "../lib/i18n";

export function AnnouncerRegion({ lang }: { lang: "fil" | "en" }) {
  const [text, setText] = useState("");
  const s = getStrings(lang);

  useEffect(() => {
    registerAriaLive((msg) => setText(msg));
  }, []);

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      aria-label={s.aria.announcerLabel}
      className="sr-only"
    >
      {text}
    </div>
  );
}

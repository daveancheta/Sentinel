"use client";

import { useEffect, useState } from "react";
import { registerAriaLive } from "../lib/speech/announcer";
import { getStrings } from "../lib/i18n";
import { getSetting } from "../lib/db";

export function AnnouncerRegion({ lang }: { lang: "fil" | "en" }) {
  const [text, setText] = useState("");
  const [demoEnabled, setDemoEnabled] = useState(false);
  const [caption, setCaption] = useState("");
  const s = getStrings(lang);

  useEffect(() => {
    void getSetting<boolean>("demoMode", false).then(setDemoEnabled);
    registerAriaLive((msg) => {
      setText(msg);
      if (demoEnabled) setCaption(msg);
    });
    const onDemoToggle = (event: Event) => {
      const enabled = (event as CustomEvent<boolean>).detail;
      setDemoEnabled(enabled);
      if (!enabled) setCaption("");
    };
    window.addEventListener("kita-demo-toggle", onDemoToggle);
    return () => window.removeEventListener("kita-demo-toggle", onDemoToggle);
  }, [demoEnabled]);

  return (
    <>
      <div aria-live="polite" aria-atomic="true" aria-label={s.aria.announcerLabel} className="sr-only">{text}</div>
      {demoEnabled && <div aria-hidden="true" className="fixed inset-x-3 bottom-3 z-50 rounded-2xl border-4 border-kita-accent bg-kita-bg px-5 py-4 text-2xl font-black leading-snug text-kita-text shadow-2xl">{caption}</div>}
    </>
  );
}

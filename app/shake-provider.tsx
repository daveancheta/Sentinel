"use client";

import { useEffect, type ReactNode } from "react";
import { repeatLast } from "../lib/speech/announcer";

export function ShakeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (typeof window === "undefined" || !("DeviceMotionEvent" in window)) return;

    let lastX = 0;
    let lastY = 0;
    let lastZ = 0;
    let lastShake = 0;
    const SHAKE_THRESHOLD = 15;

    const onMotion = (e: DeviceMotionEvent) => {
      const acc = e.accelerationIncludingGravity;
      if (!acc || acc.x == null || acc.y == null || acc.z == null) return;

      const delta = Math.abs(acc.x - lastX) + Math.abs(acc.y - lastY) + Math.abs(acc.z - lastZ);
      lastX = acc.x;
      lastY = acc.y;
      lastZ = acc.z;

      if (delta > SHAKE_THRESHOLD) {
        const now = Date.now();
        if (now - lastShake > 1200) {
          lastShake = now;
          repeatLast();
        }
      }
    };

    window.addEventListener("devicemotion", onMotion);
    return () => window.removeEventListener("devicemotion", onMotion);
  }, []);

  return <>{children}</>;
}

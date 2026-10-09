"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getSetting } from "../lib/db";

export function SetupGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let disposed = false;
    getSetting<boolean>("setupComplete", false).then((complete) => {
      if (disposed) return;
      if (!complete && pathname !== "/setup") router.replace("/setup");
      else setReady(true);
    }).catch(() => { if (!disposed) setReady(true); });
    return () => { disposed = true; };
  }, [pathname, router]);
  if (!ready && pathname !== "/setup") return <main className="min-h-screen p-6" aria-busy="true" aria-label="Kita ay naghahanda" />;
  return children;
}

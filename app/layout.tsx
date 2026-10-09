import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AnnouncerRegion } from "./announcer-region";
import { ShakeProvider } from "./shake-provider";
import { SetupGate } from "./setup-gate";
import { PwaRegistration } from "./pwa-registration";

export const metadata: Metadata = {
  title: "Kita",
  description: "Offline AI vision assistant for blind and low-vision Filipinos.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Kita",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fil">
      <body className="bg-kita-bg text-kita-text min-h-screen">
        <ShakeProvider>
          <PwaRegistration />
          <SetupGate>{children}</SetupGate>
          <AnnouncerRegion lang="fil" />
        </ShakeProvider>
      </body>
    </html>
  );
}

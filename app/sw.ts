import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry } from "serwist";
import { CacheFirst, ExpirationPlugin, Serwist } from "serwist";

const manifest = (self as unknown as { __SW_MANIFEST: (PrecacheEntry | string)[] }).__SW_MANIFEST;

const modelCache = [
  {
    matcher: ({ sameOrigin, url: { pathname } }: { sameOrigin: boolean; url: { pathname: string } }) =>
      sameOrigin && pathname.startsWith("/models/"),
    handler: new CacheFirst({
      cacheName: "kita-models",
      plugins: [new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 365 * 24 * 60 * 60 })],
    }),
  },
  {
    matcher: ({ sameOrigin, url: { pathname } }: { sameOrigin: boolean; url: { pathname: string } }) =>
      sameOrigin && pathname.startsWith("/mediapipe/"),
    handler: new CacheFirst({
      cacheName: "kita-wasm",
      plugins: [new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 365 * 24 * 60 * 60 })],
    }),
  },
  {
    matcher: ({ sameOrigin, url: { pathname } }: { sameOrigin: boolean; url: { pathname: string } }) =>
      sameOrigin && pathname.startsWith("/ort-wasm/"),
    handler: new CacheFirst({
      cacheName: "kita-ort-wasm",
      plugins: [new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 365 * 24 * 60 * 60 })],
    }),
  },
  {
    matcher: ({ sameOrigin, url: { pathname } }: { sameOrigin: boolean; url: { pathname: string } }) =>
      sameOrigin && pathname.startsWith("/tesseract/"),
    handler: new CacheFirst({
      cacheName: "kita-tesseract",
      plugins: [new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 365 * 24 * 60 * 60 })],
    }),
  },
];

const serwist = new Serwist({
  precacheEntries: manifest,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [...modelCache, ...defaultCache],
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher: ({ request }) => request.mode === "navigate",
      },
    ],
  },
});

serwist.addEventListeners();

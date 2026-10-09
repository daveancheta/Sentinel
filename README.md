# Kita

Kita is an offline-first, Filipino-first accessibility PWA for blind and low-vision people. It provides on-device camera, compass, speech-command and navigation helpers. It has no account or cloud database. See [LIMITATIONS.md](LIMITATIONS.md), [PRIVACY.md](PRIVACY.md), and [TESTING.md](TESTING.md) before relying on it outdoors.

## Run locally

Requirements: Node.js 20 or newer and npm.

```sh
npm install
node scripts/download-models.mjs
npm run dev
```

The model download script fetches assets needed by selected features and stores them under `public/`; model size and availability depend on the package. Once app shell and chosen models are cached, the app is designed to work offline. Some browsers require secure context (`localhost` is secure) for camera, microphone, sensors, and service workers.

## Test on a phone

On a development machine, run `npx next dev --experimental-https` and open the HTTPS address from the phone on the same network. A tunnel to the development server is another option. Install the PWA, finish `/setup`, download a model package, then enable airplane mode and follow [TESTING.md](TESTING.md). HTTPS access does not mean Kita sends your camera or microphone data to a server; runtime privacy details are in [PRIVACY.md](PRIVACY.md).

## Checks

```sh
npm run typecheck
npm test
npm run build
npm run test:e2e
```

The Playwright test serves the generated static export locally. Build first. No test downloads or calls model services.

## Deploy

Run `npm run build`, then deploy the generated `out/` directory to static hosting with HTTPS, correct MIME types for `.wasm`, and SPA/route fallback support. The host serves the app shell and model files; runtime inference and user records stay on-device. Do not deploy without including the locally downloaded model assets required by your build. Configure hosting to retain `/sw.js`, the web manifest, and Next static chunks.

## Features

- Filipino and English speech output and push-to-talk commands
- Vehicle, seat, sign, door, face, depth and compass modes, subject to model and device support
- Local IndexedDB storage and encrypted `.kita` backup
- Replayable tutorial, demo captions, quiet mode and battery saver

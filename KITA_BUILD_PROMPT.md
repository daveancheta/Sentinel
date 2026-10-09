# Build Prompt: "Kita" — Offline AI Vision Assistant for Blind & Low-Vision Filipinos (Next.js PWA)

You are a senior full-stack engineer specializing in on-device AI, Web APIs, and accessibility. Build **Kita**, a Progressive Web App (PWA) using **Next.js** that runs **all AI locally in the browser** on the user's phone. There is **NO cloud database, NO backend AI API, NO analytics, NO external CDN at runtime**. After the first install + model download, the app must work **100% offline (airplane mode)**.

This is for the AppBuildersPH Hackathon 2026 (theme: Local AI). The pitch: *"Kita sees for you — instantly, privately, even with no signal."*

---

## 1. Hard constraints

1. **No cloud.** No Firebase, Supabase, MongoDB Atlas, Vercel KV/Postgres, OpenAI, Google Vision, etc. Next.js is used only to build/serve static assets. No server actions or API routes that process user data.
2. **All data stays on the device** in **IndexedDB** (use **Dexie.js**). Camera frames, faces, voices and locations are never uploaded.
3. **Fully offline after setup.** Self-host every model, WASM and font file under `/public`. Do not fetch from Hugging Face, jsDelivr or Google CDNs at runtime.
   - Transformers.js: `env.allowRemoteModels = false; env.localModelPath = '/models/';` and self-host the onnxruntime-web `.wasm` files.
   - MediaPipe Tasks Vision: self-host the `wasm/` folder and `.tflite` models.
4. **Do NOT use the Web Speech API `SpeechRecognition`.** In Chrome it sends audio to Google servers, so it is not offline. Use **Whisper (Transformers.js, `whisper-tiny` or `whisper-base`)** for voice commands.
5. **The app itself must be fully accessible to blind users.** It must work with TalkBack (Android) and VoiceOver (iOS) and be usable with no vision at all (details in section 6).
6. **Mobile-first.** The main target is a mid-range Android phone in Chrome. Must also work on iOS Safari 17+, with fallbacks.
7. All heavy AI runs in **Web Workers** so the UI never freezes. Prefer **WebGPU**, fall back to **WASM**.

---

## 2. Tech stack

- **Next.js 15 (App Router) + TypeScript + Tailwind CSS**
- **PWA:** `@serwist/next` (Serwist; next-pwa is unmaintained). Includes a manifest, icons, installability, offline fallback page, and **precache + runtime cache for model files** (Cache Storage).
- **Storage:** Dexie.js (IndexedDB)
- **Vision:**
  - `@mediapipe/tasks-vision`: **ObjectDetector** (EfficientDet-Lite0/2, COCO classes: person, chair, bench, couch, car, motorcycle, bicycle, bus, truck, etc.) and **FaceDetector**
  - `@vladmandic/human`: **face embeddings (face description)** for recognition, plus **emotion** detection. Self-host its models.
  - `@huggingface/transformers` (Transformers.js):
    - **Depth Anything V2 Small** (`onnx-community/depth-anything-v2-small`) for relative depth (head-level obstacles, drop-offs, distances)
    - **OWL-ViT** (`Xenova/owlvit-base-patch32`) for zero-shot detection of "door", "door handle", "stairs", "curb", "awning", "signboard", "tree branch", "flood water"
    - **Whisper tiny/base** for offline voice commands (Filipino + English)
    - **WavLM speaker verification** (`Xenova/wavlm-base-plus-sv`) for voice embeddings / speaker ID
  - `tesseract.js` with self-hosted `eng` + `fil` traineddata for sign and room-number OCR
- **Output:**
  - `speechSynthesis` (Web Speech **TTS** is fine; it is on-device). Prefer a `fil-PH` voice when available, else `en-PH` or `en`. Let the user choose the voice in settings.
  - **Web Audio API** with **StereoPannerNode** for directional earcons (left/right tones). Works with earphones.
  - `navigator.vibrate` for haptic patterns. **Note: iOS Safari does not support the Vibration API**, so always pair haptics with an audio earcon.
- **Sensors:** `getUserMedia` (rear camera, `facingMode: 'environment'`; front camera for Guard mode), `DeviceOrientationEvent` (compass; on iOS call `DeviceOrientationEvent.requestPermission()` and use `webkitCompassHeading`), Geolocation (GPS works offline), Wake Lock API (keep the screen awake during walking modes).

---

## 3. Architecture

```
app/
  layout.tsx            # lang, PWA meta, global aria-live announcer
  page.tsx              # Home: giant mode buttons + push-to-talk
  setup/page.tsx        # First-run: permissions + "Download for offline" with progress
  people/page.tsx       # Enroll/manage family faces + voices
  places/page.tsx       # Saved landmarks for orientation
  settings/page.tsx     # Language, voice, speech rate, verbosity, haptics, battery mode
  offline/page.tsx      # Offline fallback
lib/
  db.ts                 # Dexie schema
  speech/announcer.ts   # Priority speech queue (see 5.0)
  audio/earcons.ts      # Stereo-panned tones, sonar beeps
  haptics.ts            # Vibration patterns (+ audio fallback)
  camera.ts             # Stream management, frame grabbing at configurable FPS
  sensors/compass.ts    # Heading, smoothing, iOS permission
  i18n/{fil,en}.ts      # All spoken + UI strings
  geometry.ts           # bbox -> left/center/right, distance estimates, "clock face" directions
workers/
  detector.worker.ts    # MediaPipe object + face detection
  faces.worker.ts       # Human: embeddings + emotion
  depth.worker.ts       # Depth Anything
  zeroshot.worker.ts    # OWL-ViT
  ocr.worker.ts         # Tesseract
  whisper.worker.ts     # Voice commands
  speaker.worker.ts     # WavLM speaker embeddings
modes/                  # One module per feature, each a pure "frame -> events" pipeline
public/models/...       # All self-hosted models
```

**Dexie schema:**
- `people { id, name, relation, faceEmbeddings: Float32Array[], voiceEmbeddings: Float32Array[], createdAt }`
- `places { id, name, lat, lng, headingHint, notes }`
- `settings { key, value }`
- `events { id, type, text, timestamp }` (local history log, auto-pruned)

Add **Export/Import backup** as a local encrypted JSON file (Web Crypto AES-GCM with a user passphrase) so users can move to a new phone without any cloud.

---

## 4. Features (build all of them)

Each mode turns camera/mic/sensor input into **events** (`{priority, text, direction, haptic}`) and sends them to the Announcer. Run detectors at a low, configurable FPS (e.g. object detection 4–6 fps, depth 1–2 fps, OCR on demand or 0.5 fps) to save battery.

### A. Family Recognition

**A1. Enroll people (`/people`)**
- Guided capture with spoken coaching: "Hold the phone at face height… move a little left… got it." Capture 5–10 face samples per person and average/store the embeddings.
- Optional voice enrollment: record ~10 s of speech, store the WavLM embedding.
- Name and relation (Nanay, Tatay, Kuya, Ate, Lola, Friend…), editable and deletable. Fully screen-reader operable.

**A2. Who's in the room**
- Trigger: button, shake, or voice ("Sino ang nandito?" / "Who's here?").
- Detect all faces, match embeddings (cosine similarity, tunable threshold ~0.6 to start, **calibrate**), map bbox center to **left / front / right** and face size to a rough distance (near / ~2 m / far).
- Speak one sentence: *"Kuya on your left, Ate in front, about two meters. One person I don't know on your right."*
- In continuous mode, announce **only changes** ("Nanay just arrived on your right"), with a cooldown per person.

**A3. Expressions**
- Use Human's emotion output for recognized people: *"Nanay is smiling."* Only announce when confidence is high and the expression changed. Never claim certainty: "looks happy", "looks upset".

**A4. Stranger alert (Guard mode)**
- Uses the **front camera** (phone worn on a chest lanyard facing back, or placed in a backpack strap) or the rear camera, per user setting.
- If an **unknown** face/person stays within close range (large bbox) for > N seconds (default 20 s) or keeps reappearing, give a **quiet** alert: a discreet haptic + low-volume earcon + optional whisper "Someone has been close behind you for a while." Never loud; do not alarm others.

**A5. Voice recognition**
- When the camera can't see anyone, listen in short windows (VAD by energy threshold), compute WavLM embeddings, and match against enrolled voices: *"That sounds like Tatay."*
- Off by default; a clear toggle with a privacy explanation. Audio is processed in memory and never saved.

### B. Sidewalk Obstacles (Walking mode)

The phone is worn on a chest lanyard or held at chest height, rear camera forward. Keep a Wake Lock on.

**B1. Head-level warnings** ⭐
- Use the depth map: if the **upper third** of the frame has a near region (relative depth above threshold, sustained over 2–3 frames) while the lower area is clear, warn: *"Watch your head, ahead."* Plus a distinct **high-pitch** earcon panned to the side where it is.
- Confirm with OWL-ViT labels (awning, signboard, branch, side mirror) when available to make the message specific.

**B2. Stairs, curbs and drop-offs** ⭐
- Combine (a) OWL-ViT "stairs"/"curb" detection with (b) a depth discontinuity heuristic in the **lower third** (sudden depth jump = step down or drop-off).
- Messages: *"Stairs going down ahead," "Curb ahead," "Step up."* Use a distinct **low-pitch** earcon. Highest priority after vehicles.
- Count visible steps when possible (horizontal edge bands); otherwise don't guess a number.

**B3. Walk-straight guide** ⭐
- User says "Diretso" / taps "Walk straight". Lock the current compass heading.
- If heading drifts more than ±10° (smoothed), give a corrective cue: **stereo tone panned to the direction to turn** + haptic pattern (**1 short pulse = turn left, 2 short pulses = turn right**; a phone can't vibrate on one side, so encode direction in the pattern). Silence while on course; one soft tick every few seconds to confirm it's active.

**B4. Vehicle warning**
- Object detection for car, motorcycle, bicycle, bus, truck (tricycles usually detect as motorcycle). Track bboxes across frames; if a box is **growing quickly** (approaching) or near the frame edge and moving inward, warn: *"Motorcycle coming from the left!"*
- Optional audio cue: a rising microphone amplitude in the engine frequency band raises confidence. **Top priority**: interrupts all other speech.

**General walking rules:** obstacle density summary on demand ("What's ahead?"), configurable verbosity, and only one message every ~2 s except danger.

### C. Getting Around

**C1. Empty seat finder** ⭐
- Detect chair/bench/couch and person boxes. A seat is "empty" if no person bbox overlaps its upper area. For long benches (jeep, church pews, waiting areas), detect a gap between people on a bench using person spacing.
- Output the direction + rough steps: *"Empty seat, two steps to your right."* Then a **sonar mode**: beeps get faster as the seat gets centered and closer.

**C2. Indoor navigation by signs**
- OCR the frame (on demand + periodic in this mode). Match against a dictionary in **Filipino + English**: CR, Comfort Room, Banyo, Restroom, Male/Female, Lalaki/Babae, Exit, Labasan, Entrance, Pasukan, Elevator, Stairs/Hagdan, Pharmacy, Cashier, Information, Emergency, room numbers (regex `\b[A-Z]?\d{2,4}[A-Z]?\b`), floor numbers, arrows (→ ← ↑).
- Combine with bbox position: *"CR sign on the left," "Exit straight ahead," "Room 204, second door on your right."*
- Command: "Hanapin ang CR" / "Find the exit" keeps scanning and guides with directional earcons until found.

**C3. Doors and handles**
- OWL-ViT: "door", "door handle", "glass door". Report position and handle side: *"Door ahead, handle on the right."*
- OCR on the door for PUSH/PULL/TULAK/HILA: *"Push to open."*
- Sonar guidance to bring the hand to the handle.

**C4. Which way am I facing?**
- Compass heading → cardinal direction in Filipino/English ("You're facing north / hilaga").
- If GPS is available, compute the bearing to saved **places** (`/places`: "Home", "Sari-sari store", "Church", "Bus stop") and say the relative direction + distance: *"The store is behind you, about 50 meters. Home is to your left."*
- Optional: run object detection and mention a salient object in front ("You're facing the road; cars ahead").

### D. Core (needed by everything)

**D1. Push-to-talk voice commands (offline Whisper)**
- One giant button (hold to talk) + a volume-key or shake alternative where possible.
- Map transcripts to intents with a simple keyword/fuzzy matcher (Filipino, English and Taglish), e.g.:
  - "sino nandito / who's here" → A2
  - "lakad / walking mode" → B
  - "diretso / walk straight" → B3
  - "hanap upuan / find seat" → C1
  - "hanapin ang CR / find exit / basahin / read sign" → C2
  - "pinto / door" → C3
  - "saan ako nakaharap / which way" → C4
  - "bantay / guard mode" → A4
  - "tigil / stop" → stop current mode
  - "ulitin / repeat" → repeat last message

**D2. Announcer (priority speech queue)**
- Priorities: `DANGER` (vehicles, drop-offs) > `WARNING` (head-level, stranger) > `INFO` (people, seats, signs) > `AMBIENT`.
- DANGER cancels current speech immediately (`speechSynthesis.cancel()`). Deduplicate identical messages within a cooldown window. Mirror all speech into an `aria-live` region.
- Adjustable speech rate, voice, and language (Filipino / English).

**D3. Confidence honesty**
- If confidence is low, say so: *"I'm not sure. Move closer or hold still."* Never present a guess as fact.

**D4. Battery saver**
- Lower FPS, disable depth/zero-shot unless the user asks, screen dimmed, and an on-demand-only mode. Speak the battery % on request (Battery Status API where available).

---

## 5. First-run setup (`/setup`)

1. Spoken welcome in Filipino, then English.
2. Request permissions one at a time with spoken explanations (camera, mic, motion/orientation, location).
3. **"Download for offline"**: fetch all models into Cache Storage with a **spoken + visual progress percentage**. Show the total size before downloading. Let users choose a **Lite** package (no depth/OWL-ViT/WavLM) or a **Full** package.
4. Self-test: run each model once on a sample image to confirm it works offline, then say "Ready. You can now use Kita without internet."

---

## 6. Accessibility requirements (non-negotiable)

- Every control has a proper `aria-label`, role and focus order. Test the full flow with TalkBack and VoiceOver.
- Home screen has a maximum of 4–6 **huge** buttons (min 96 px tall), high contrast (WCAG AAA), large text, no information conveyed by color alone.
- Spoken confirmation for every action ("Walking mode on").
- Consistent gestures: double-tap = activate, long-press = push-to-talk, shake = repeat last message / quick "who's here".
- Haptic + audio vocabulary documented in an in-app spoken tutorial ("Learn the sounds").
- Works in portrait, locked orientation, and with the screen off where the browser allows it (Wake Lock when active).
- Never auto-play loud sounds; respect a "discreet mode" for public places.

---

## 7. Safety and privacy messaging

- On first run and in settings: *"Kita assists your white cane or guide dog. It does not replace them. Always use your judgment, especially when crossing streets."*
- A privacy screen: "Everything stays on your phone. No account. No internet needed." Provide "Delete all my data" (clears IndexedDB + caches).
- Face/voice enrollment requires consent from the person being enrolled (show a reminder).

---

## 8. Performance targets

- Danger detection latency < 300 ms from frame to earcon on a mid-range Android (WebGPU).
- UI thread never blocked (> 50 ms tasks forbidden; everything heavy in workers).
- Reuse a single camera stream and share frames via `ImageBitmap` transfer to workers.
- Lazy-load models per mode; unload idle ones on low-memory devices.

---

## 9. Build order (deliver working increments)

1. Next.js + Tailwind + Serwist PWA skeleton, installable, offline fallback, accessible home screen, Announcer, earcons, haptics, i18n (fil/en).
2. Camera pipeline + MediaPipe object detection worker + **Vehicle warning** + **Empty seat finder**.
3. Compass + **Walk-straight guide** + **Which way am I facing** + places.
4. Human face embeddings + **enrollment** + **Who's in the room** + **Expressions** + **Stranger alert/Guard mode**.
5. Depth worker + **Head-level warnings** + **Stairs/curbs/drop-offs**.
6. Tesseract + OWL-ViT + **Indoor navigation by signs** + **Doors and handles**.
7. Whisper push-to-talk intents + WavLM **voice recognition**.
8. Setup/model download flow (Lite/Full), backup export/import, battery saver, settings.
9. Polish: tutorial, latency tuning, threshold calibration screen, airplane-mode end-to-end test.

After each step: run `npm run build`, run lint/typecheck, and verify it works with **network disabled** in DevTools and in real airplane mode on a phone (camera requires HTTPS; use `next dev --experimental-https` or a tunnel for phone testing).

---

## 10. Demo script (make sure this works perfectly)

With the phone in **airplane mode**:
1. "Sino ang nandito?" → "Kuya on your left, one person I don't know in front."
2. Walking mode → walk toward a hanging sign → "Watch your head." Approach a step → "Step down ahead."
3. "Diretso" → drift sideways → corrective pulses bring the user back.
4. "Hanap upuan" → "Empty seat, two steps to your right."
5. Point at a "CR →" sign → "CR sign, turn right."
6. Show settings: "No account. No internet. Your data never leaves this phone."

---

## 11. Deliverables

- Complete source code with a clear README (setup, model download script `scripts/download-models.mjs` that fetches models into `/public/models` at **build time**, phone testing over HTTPS, known limitations).
- A `LIMITATIONS.md` that honestly states accuracy limits (depth is relative, stairs detection is heuristic, the Vibration API is unavailable on iOS, Filipino TTS voice availability depends on the device).
- No placeholder/mock AI: every listed feature must run on real models on-device.

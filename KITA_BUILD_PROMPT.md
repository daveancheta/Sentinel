# Kita: Step-by-Step Build Prompts (Next.js PWA, 100% offline, no cloud database)

How to use:
- Paste **one prompt at a time** into your AI coding tool, in order (Step 1 → Step 9).
- Before going to the next step, make sure the current step's **"Done when"** checklist passes.
- Every prompt starts with the same **Project rules** block so the AI never forgets the constraints.

---

## Step 1: Foundation (PWA, database, voice, sounds, accessible screens)

```
PROJECT RULES (apply to every step):
- App: "Kita", a Next.js 15 (App Router) + TypeScript + Tailwind PWA that helps blind and low-vision Filipinos using AI that runs 100% on the phone.
- No cloud database, no backend AI APIs, no analytics, no runtime CDN. All data goes in IndexedDB (Dexie.js). After the first install + model download, everything must work in airplane mode.
- Never use the Web Speech API SpeechRecognition (it sends audio to Google). Text-to-speech (speechSynthesis) is fine.
- Heavy AI runs in Web Workers. Prefer WebGPU, fall back to WASM.
- Every screen must be fully usable with TalkBack/VoiceOver and no vision: aria-labels, focus order, spoken confirmations.
- Filipino is the default language, English is optional. All strings go in lib/i18n.

STEP 1: Build ONLY the foundation (no AI yet).

1. Setup
- Next.js 15 + TypeScript + Tailwind CSS.
- PWA with @serwist/next: manifest (name "Kita", standalone, portrait, dark theme), icons, installable, offline fallback page at /offline, app shell precached.
- Dexie database in lib/db.ts:
  people { id, name, relation, faceEmbeddings, voiceEmbeddings, createdAt }
  places { id, name, lat, lng, notes }
  settings { key, value }
  events { id, type, text, timestamp }

2. Announcer (lib/speech/announcer.ts)
- Priority speech queue using speechSynthesis. Priorities: DANGER > WARNING > INFO > AMBIENT. DANGER cancels current speech immediately.
- Skip duplicate messages within a cooldown (default 4 s). Functions: announce(), repeatLast(), stop().
- Prefer a fil-PH voice, else en-PH, else en. Voice, rate and language are saved in settings.
- Mirror every spoken message into a global aria-live region.

3. Sounds and vibration
- lib/audio/earcons.ts: Web Audio API tones with StereoPannerNode (pan -1 left to +1 right): high beep (head-level), low beep (step/drop), urgent siren (vehicle), soft tick (confirm), and a sonar beep whose speed depends on a 0–1 value.
- lib/haptics.ts: navigator.vibrate patterns (1 short = left, 2 short = right, long = danger). iOS has no Vibration API, so every haptic call must also play the matching earcon.

4. Languages: lib/i18n/fil.ts and en.ts.

5. Screens
- Home (/): max 6 huge buttons (min 96 px tall, high contrast, big text): Who's Here, Walking, Walk Straight, Find Seat, Signs & Doors, Which Way. Each announces "Coming soon" for now. Plus a big "Hold to talk" button (placeholder) and a "Repeat" button.
- Settings (/settings): language, voice, speech rate, verbosity (low/normal/high), discreet mode (quiet volume), haptics on/off, a "Learn the sounds" section that plays and explains every earcon, and "Delete all my data" (clears IndexedDB + caches, with confirmation).
- Shake gesture (DeviceMotion) = repeat the last message.

6. First-run safety message (spoken + shown):
"Tumutulong si Kita sa iyong tungkod o guide dog, pero hindi nito sila pinapalitan." and "Lahat ng data ay nasa phone mo lang."

DONE WHEN: npm run build passes with no lint/type errors, the app installs as a PWA, works with the network disabled in DevTools, and home + settings are fully usable by screen reader alone.
```

---

## Step 2: Camera pipeline + object detection (Vehicle warning, Empty seat finder)

```
PROJECT RULES: (same as Step 1) Kita is a Next.js 15 PWA, 100% on-device AI, no cloud, IndexedDB only, works in airplane mode, never use SpeechRecognition, heavy AI in Web Workers, fully screen-reader accessible, Filipino default. Reuse the existing Announcer, earcons, haptics and i18n from Step 1.

STEP 2: Camera + object detection, plus two features.

1. Self-hosted models
- Create scripts/download-models.mjs that downloads models into /public/models at BUILD time (never at runtime). Start with MediaPipe Tasks Vision: the wasm folder -> /public/mediapipe/wasm and EfficientDet-Lite0 (plus Lite2 as an option) -> /public/models/mediapipe/.
- Add a Serwist runtime cache rule (CacheFirst) for /models/* and /mediapipe/*.

2. Camera (lib/camera.ts)
- A single shared getUserMedia stream (rear camera, facingMode "environment", 640x480). It can switch to the front camera.
- A frame grabber at configurable FPS that sends ImageBitmap to workers (transferable). Pause when the tab is hidden.
- Wake Lock while any camera mode is active.

3. workers/detector.worker.ts
- MediaPipe ObjectDetector (COCO), WebGPU/GPU delegate with CPU fallback, score threshold 0.4.
- Returns { label, score, bbox } in normalized coordinates.

4. lib/geometry.ts
- bbox center -> "left" / "front" / "right" (thirds) and a pan value -1..1.
- Rough distance from bbox height ("malapit" near / "mga 2 metro" about 2 m / "malayo" far).
- A simple tracker (IoU matching across frames) that gives each object an id, its bbox growth rate and its horizontal velocity.

5. Feature: Vehicle warning (modes/vehicle.ts)
- Classes: car, motorcycle, bicycle, bus, truck (tricycles usually detect as motorcycle).
- Warn when a tracked vehicle's bbox area grows fast (approaching) OR it enters from a frame edge moving inward.
- Priority DANGER: siren earcon panned to its side + long haptic + speech: "Motor galing sa kaliwa!" / "Motorcycle coming from the left!"
- Per-object cooldown so it doesn't repeat every frame.

6. Feature: Empty seat finder (modes/seat.ts)
- Detect chair, bench and couch boxes plus person boxes. A seat is empty if no person bbox overlaps its upper half. For long benches (jeepney, church pew, waiting area), find gaps between people wider than one person's width.
- Speak the direction + rough steps: "May bakanteng upuan, dalawang hakbang sa kanan mo."
- Then sonar mode: the sonar earcon gets faster and is panned toward the seat as it becomes centered and closer. Says "Nasa harap mo na" (it's right in front of you) when centered + near.

7. Wire the Home buttons "Find Seat" and a "Walking" mode (which for now runs vehicle warning only). Add a big Stop button. Every start/stop is spoken.

DONE WHEN: works in airplane mode after first load, detection runs in a worker without freezing the UI, vehicle warning fires on a video of an approaching motorcycle, and the seat finder guides you to an empty chair.
```

---

## Step 3: Compass (Walk-straight guide, Which way am I facing, Saved places)

```
PROJECT RULES: (same as Step 1) Kita is a Next.js 15 PWA, 100% on-device AI, no cloud, IndexedDB only, works in airplane mode, never use SpeechRecognition, heavy AI in Web Workers, fully screen-reader accessible, Filipino default. Reuse the Announcer, earcons, haptics, camera, detector worker and geometry from previous steps.

STEP 3: Orientation features.

1. lib/sensors/compass.ts
- Heading from DeviceOrientationEvent (deviceorientationabsolute on Android). On iOS, call DeviceOrientationEvent.requestPermission() from a user tap and use webkitCompassHeading.
- Low-pass filter/smoothing, correct wraparound at 0/360.
- A spoken "calibrate" tip if readings are unstable ("Igalaw ang phone na parang numero 8", move the phone in a figure 8).

2. Feature: Walk-straight guide (modes/walkStraight.ts)
- On start: lock the current heading and say "Diretso. Naka-lock na ang direksyon." (Straight. Direction locked.)
- If smoothed heading drifts more than ±10° for more than 0.7 s, give a corrective cue toward the locked heading: stereo tone panned to the side to turn + haptic (1 short = turn left, 2 short = turn right).
- Silent while on course, with one soft tick every 5 s to confirm it is active. The deviation threshold is adjustable in settings.

3. Saved places (/places page)
- "Save this place" uses the Geolocation API (GPS works offline) and asks for a name via a big accessible input (Home, Sari-sari store, Church, Bus stop…). Stored in the Dexie places table. List, rename and delete, all screen-reader friendly.

4. Feature: Which way am I facing? (modes/facing.ts)
- Says the cardinal direction in Filipino/English (hilaga/north, timog/south, silangan/east, kanluran/west, and the in-betweens).
- If GPS is available, computes the bearing + distance to each saved place and gives the relative direction using clock-face or front/back/left/right: "Ang tindahan ay nasa likod mo, mga 50 metro. Ang bahay ay nasa kaliwa mo." (The store is behind you, about 50 m. Home is on your left.)
- Optionally runs one object-detection frame and mentions one salient thing in front ("Nakaharap ka sa kalsada, may mga sasakyan." You're facing the road, there are cars.)

5. Wire the Home buttons "Walk Straight" and "Which Way".

DONE WHEN: works offline, walk-straight gives the correct left/right cue when you turn the phone, facing mode states the correct direction and relative position of saved places, and it works on Android Chrome and iOS Safari (with the permission tap).
```

---

## Step 4: Family recognition (enroll, Who's in the room, Expressions, Stranger alert)

```
PROJECT RULES: (same as Step 1) Kita is a Next.js 15 PWA, 100% on-device AI, no cloud, IndexedDB only, works in airplane mode, never use SpeechRecognition, heavy AI in Web Workers, fully screen-reader accessible, Filipino default. Reuse all existing modules.

STEP 4: Face recognition features.

1. workers/faces.worker.ts using @vladmandic/human
- Self-host all Human models in /public/models/human (add them to scripts/download-models.mjs). Set modelBasePath to the local path. Enable face detection, face description (embedding) and emotion. Disable everything else.
- Returns per face: bbox, embedding, emotion + score, detection confidence.

2. Enrollment (/people page)
- "Add person": name + relation (Nanay, Tatay, Kuya, Ate, Lola, Lolo, Kaibigan/friend, other).
- Guided capture with spoken coaching: "Itapat ang phone sa mukha… bahagyang pakaliwa… ayan, nakuha na" (aim at the face… a bit left… got it). Capture 8 good samples (only frames with a single, large, sharp face) and store all embeddings in Dexie.
- Show a consent reminder: the person being enrolled must agree.
- List, rename, re-train and delete people, all by screen reader.

3. Matching (lib/faces/match.ts)
- Cosine similarity against all stored embeddings, using the best match per person. Threshold default 0.6, adjustable in settings, plus a "calibration" helper that shows the similarity score live for testing.

4. Feature: Who's in the room (modes/whosHere.ts)
- Trigger: Home button "Who's Here", shake (double shake), or later a voice command.
- Builds one natural sentence sorted left to right using geometry.ts: "Si Kuya sa kaliwa mo, si Ate sa harap, mga dalawang metro. May isang taong hindi ko kilala sa kanan." (Kuya on your left, Ate in front about two meters away, and someone I don't know on the right.)
- Continuous mode: only announce changes ("Dumating si Nanay sa kanan mo", Nanay just arrived on your right), with a 60 s per-person cooldown.

5. Feature: Expressions
- For recognized people only, when the emotion score is > 0.7 and it changed: "Mukhang masaya si Nanay" (Nanay looks happy), "Mukhang malungkot si Tatay" (Tatay looks sad). Always say "mukhang" (looks), never claim certainty. It can be turned off in settings.

6. Feature: Stranger alert (Guard mode, modes/guard.ts)
- Setting: which camera to use (front camera when the phone hangs on a chest lanyard facing back / rear camera when in a backpack strap).
- If an UNKNOWN face stays large (close) in frame for more than 20 s total within 60 s, or keeps reappearing, give a QUIET alert: discreet haptic + low-volume earcon + whisper-level speech "May taong malapit sa likod mo nang matagal na." (Someone has been close behind you for a while.) Never loud.

DONE WHEN: works offline, you can enroll 2 people, "Who's Here" correctly names them with positions, unknown people are reported as unknown, the expression is spoken, and Guard mode alerts after the time threshold.
```

---

## Step 5: Depth AI (Head-level warnings, Stairs / curbs / drop-offs)

```
PROJECT RULES: (same as Step 1) Kita is a Next.js 15 PWA, 100% on-device AI, no cloud, IndexedDB only, works in airplane mode, never use SpeechRecognition, heavy AI in Web Workers, fully screen-reader accessible, Filipino default. Reuse all existing modules.

STEP 5: Depth-based safety in Walking mode.

1. workers/depth.worker.ts
- @huggingface/transformers with Depth Anything V2 Small (onnx-community/depth-anything-v2-small), fp16/q8 quantized. Self-host it in /public/models and the onnxruntime-web wasm files in /public. Set env.allowRemoteModels = false and env.localModelPath = '/models/'.
- device "webgpu" with "wasm" fallback. Input ~256–384 px. Runs at 1–2 fps.
- Returns a downsampled relative depth grid (e.g. 32x24, normalized 0–1, higher = closer).

2. Feature: Head-level warnings (modes/headLevel.ts)
- Split the depth grid into upper / middle / lower thirds and left / center / right columns.
- If the UPPER-center region has a "near" value above threshold (sustained for 2 of the last 3 frames) while the LOWER region in front is not equally near (so it is overhanging, not a wall), warn: "Ingat sa ulo, sa harap!" (Watch your head, ahead!)
- Priority WARNING, HIGH-pitch earcon panned to the side it is on.

3. Feature: Stairs, curbs and drop-offs (modes/dropoff.ts)
- In the LOWER third, detect a sudden depth discontinuity along the walking path (rows where depth drops sharply = step down or drop-off; rows that get sharply closer = step up).
- Count repeated horizontal edge bands to estimate steps ONLY when confident; otherwise don't give a number.
- Messages: "Pababang hagdan sa harap" (stairs going down ahead), "May gilid ng kalsada sa harap" (curb ahead), "Paakyat na baitang" (step up).
- Priority DANGER (just below vehicles), LOW-pitch earcon.

4. Walking mode = vehicle warning + head-level + drop-off running together. Rule: max one non-danger message every 2 s; danger always interrupts. Add verbosity support.

5. "What's ahead?" button / command: speaks a one-sentence summary of what is in front ("Maluwag sa harap, may poste sa kanan", clear ahead, a post on the right).

6. Add a debug overlay (hidden behind a setting) showing the depth grid + thresholds so you can tune them. Put all thresholds in settings.

DONE WHEN: works offline, the UI stays smooth (depth runs in a worker), walking toward a hanging sign/branch gives a head warning, standing at the top of stairs or a curb gives a step-down warning, and false alarms are rare on flat ground.
```

---

## Step 6: OCR + zero-shot detection (Indoor navigation by signs, Doors and handles)

```
PROJECT RULES: (same as Step 1) Kita is a Next.js 15 PWA, 100% on-device AI, no cloud, IndexedDB only, works in airplane mode, never use SpeechRecognition, heavy AI in Web Workers, fully screen-reader accessible, Filipino default. Reuse all existing modules.

STEP 6: Signs and doors.

1. workers/ocr.worker.ts
- tesseract.js with self-hosted worker, core and traineddata (eng + fil) in /public/tesseract. No CDN paths. Returns words with bboxes + confidence.
- Preprocess: grayscale + contrast boost, and crop to likely text regions to speed it up.

2. workers/zeroshot.worker.ts
- Transformers.js zero-shot object detection with Xenova/owlvit-base-patch32 (quantized, self-hosted). Labels: "door", "door handle", "glass door", "stairs", "elevator", "sign". WebGPU with wasm fallback. On demand / ~0.5 fps.
- (Optional upgrade: also use these labels to improve Step 5's stairs detection.)

3. Feature: Indoor navigation by signs (modes/signs.ts)
- OCR dictionary in Filipino + English: CR, Comfort Room, Banyo, Restroom, Toilet, Male/Lalaki, Female/Babae, Exit, Labasan, Entrance, Pasukan, Elevator, Stairs/Hagdan, Pharmacy/Botika, Cashier/Kahera, Information, Emergency, Billing, plus room numbers (regex \b[A-Z]?\d{2,4}[A-Z]?\b), floor numbers and arrow characters (→ ← ↑).
- Fuzzy matching (OCR is noisy). Combine with bbox position: "May karatulang CR sa kaliwa" (CR sign on the left), "Exit, diretso sa harap" (exit straight ahead), "Room 204, sa kanan" (room 204, on the right).
- Search mode: "Hanapin ang CR" (find the CR) keeps scanning and uses sonar + panning until the target is found and centered.
- "Read everything" button: reads all text it sees, top to bottom.

4. Feature: Doors and handles (modes/doors.ts)
- OWL-ViT for door + handle. Report the door position and which side the handle is on: "May pinto sa harap, ang hawakan ay nasa kanan." (Door ahead, handle on the right.)
- OCR on the door for PUSH/PULL/TULAK/HILA: "Itulak para bumukas" (push to open) / "Hilahin" (pull).
- Sonar guidance toward the handle until it is centered and close.

5. Wire the Home button "Signs & Doors" with sub-options: Find CR, Find Exit, Find Room (number input/voice), Find Door, Read All.

DONE WHEN: works offline, it finds and announces a printed "CR →" sign and a room number, guides to a door, tells the handle side, and reads PUSH/PULL text.
```

---

## Step 7: Offline voice (Push-to-talk commands with Whisper, Voice recognition)

```
PROJECT RULES: (same as Step 1) Kita is a Next.js 15 PWA, 100% on-device AI, no cloud, IndexedDB only, works in airplane mode, NEVER use SpeechRecognition, heavy AI in Web Workers, fully screen-reader accessible, Filipino default. Reuse all existing modules.

STEP 7: Voice.

1. workers/whisper.worker.ts
- Transformers.js automatic-speech-recognition with Whisper (onnx-community/whisper-base or Xenova/whisper-tiny for low-end phones; selectable). Self-hosted and quantized, WebGPU with wasm fallback.
- Record 16 kHz mono with getUserMedia + AudioWorklet (or MediaRecorder + decode). Language auto or "tl" (Tagalog), with English supported.

2. Push-to-talk
- Make the "Hold to talk" button real: hold = record (soft tick at start and end), release = transcribe. Also support a toggle mode for users who can't hold.
- Speak back what it understood if confidence is low: "Ang narinig ko: 'hanap upuan'. Tama ba?" (I heard "find seat". Is that right?)

3. Intent matcher (lib/voice/intents.ts)
- Keyword + fuzzy matching for Filipino, English and Taglish:
  "sino nandito / sino ang nandito / who's here" -> Who's Here
  "lakad / walking mode / maglalakad" -> Walking mode
  "diretso / walk straight" -> Walk Straight
  "hanap upuan / upuan / find seat" -> Find Seat
  "hanapin ang CR / CR / banyo" -> Signs: find CR
  "labasan / exit" -> Signs: find exit
  "kwarto <number> / room <number>" -> Signs: find room
  "pinto / door" -> Doors
  "basahin / read" -> Read all
  "saan ako nakaharap / which way" -> Which Way
  "ano ang nasa harap / what's ahead" -> What's ahead
  "bantay / guard mode" -> Guard mode
  "tigil / stop" -> stop current mode
  "ulitin / repeat" -> repeat last message
- Unknown command: say "Hindi ko naintindihan" (I didn't understand) + a short list of examples.

4. workers/speaker.worker.ts: Voice recognition
- Transformers.js with Xenova/wavlm-base-plus-sv (self-hosted) to get speaker embeddings.
- On the /people page: optional "Record voice" (~10 s, guided) that stores the voice embeddings.
- Feature: when ON (off by default, with a privacy explanation), listen in short windows using an energy-based VAD, compute the embedding, and match by cosine similarity: "Parang boses ni Tatay" (sounds like Tatay). Audio stays in memory and is never saved. Cooldown per person.
- Merge with Who's Here: if a known voice is heard but no face is seen, add "Narinig ko rin si Tatay" (I also heard Tatay).

DONE WHEN: works in airplane mode, every intent above triggers the right mode from speech (Filipino and English), no network requests happen during voice use (check the DevTools Network tab), and an enrolled voice is recognized.
```

---

## Step 8: First-run setup, offline model download, backup, battery saver

```
PROJECT RULES: (same as Step 1) Kita is a Next.js 15 PWA, 100% on-device AI, no cloud, IndexedDB only, works in airplane mode, never use SpeechRecognition, heavy AI in Web Workers, fully screen-reader accessible, Filipino default. Reuse all existing modules.

STEP 8: Make it ready for real users.

1. First-run setup (/setup), shown automatically on first launch
- Spoken welcome in Filipino (English option).
- Permissions one at a time with spoken explanations: camera, microphone, motion/orientation (iOS tap), location.
- "I-download para offline" (download for offline): choose a package and state its total size first:
  LITE = MediaPipe + Human + Tesseract + Whisper tiny
  FULL = LITE + Depth Anything + OWL-ViT + Whisper base + WavLM
- Download all files into Cache Storage with spoken + visual progress ("40 porsyento"), resumable if interrupted.
- Self-test: run each model once on a bundled sample image/audio, then say "Handa na. Magagamit mo na si Kita kahit walang internet." (Ready. You can use Kita even without internet.)
- Features that need FULL models are hidden or say "I-download muna ang Full package" (download the Full package first).

2. Storage health
- Request navigator.storage.persist() so models aren't evicted, and show storage used. Add a "Re-download models" button.

3. Backup without cloud
- Export: all people (embeddings), places and settings into one file encrypted with Web Crypto AES-GCM (PBKDF2 from a user passphrase). Download it as a .kita file.
- Import: pick the file, enter the passphrase, merge or replace. Fully screen-reader accessible.

4. Battery saver mode
- Lower FPS for all workers, disable depth/zero-shot unless explicitly requested, on-demand-only mode (camera off until a button/command), no continuous voice ID.
- "Ilang porsyento ang baterya?" (what's the battery %?) answers via the Battery Status API where supported.

5. Model lifecycle: lazy-load models per mode, unload idle models after 2 minutes on low-memory devices (navigator.deviceMemory <= 4).

DONE WHEN: a fresh install goes through setup by screen reader only, then the full app works in real airplane mode on a phone after a restart; backup export → delete all data → import restores people and places.
```

---

## Step 9: Polish, tutorial, testing, docs, demo

```
PROJECT RULES: (same as Step 1) Kita is a Next.js 15 PWA, 100% on-device AI, no cloud, IndexedDB only, works in airplane mode, never use SpeechRecognition, heavy AI in Web Workers, fully screen-reader accessible, Filipino default.

STEP 9: Polish and ship.

1. Tutorial ("Paano gamitin", how to use): a spoken, step-by-step walkthrough of the gestures, the sound/vibration meanings and each mode. Replayable from settings.

2. Quality pass
- Announcer: tune cooldowns so walking mode never talks over itself. Danger always first. Add "quiet mode" where only DANGER/WARNING are spoken and everything else is earcons.
- Confidence honesty everywhere: when a model is unsure, say "Hindi ako sigurado, lumapit o huminto sandali" (I'm not sure, move closer or hold still).
- Performance: confirm no main-thread task > 50 ms (Chrome Performance panel), reuse one camera stream, transfer ImageBitmaps, cap the worker queue (drop old frames).
- Accessibility audit: test every screen with TalkBack and VoiceOver, keyboard focus, color contrast AAA, large text 200%.

3. Testing
- Unit tests (Vitest) for geometry, intent matcher, face matching, compass math, announcer priority/cooldown.
- A Playwright test that loads the app, goes offline, reloads, and confirms the app shell + settings work.
- A manual airplane-mode checklist in TESTING.md.

4. Docs
- README.md: what Kita is, features, how to run (npm install → node scripts/download-models.mjs → npm run dev), how to test on a phone over HTTPS (next dev --experimental-https or a tunnel), how to deploy as static hosting.
- LIMITATIONS.md (be honest): depth is relative, stairs/head-level are heuristic, iOS has no Vibration API (audio cues used instead), Filipino TTS voice depends on the device, accuracy drops at night/low light, Kita assists and doesn't replace the cane or guide dog.
- PRIVACY.md: no account, no server, all data on the phone, how to delete it.

5. Demo mode
- A "Demo" toggle that makes all speech also appear in large captions on screen (so judges can follow), and a demo checklist:
  1) Airplane mode ON
  2) "Sino ang nandito?" → names + positions
  3) Walking mode → head-level + step-down warnings
  4) "Diretso" → corrective cues
  5) "Hanap upuan" → guides to the empty seat
  6) "Hanapin ang CR" → finds the sign
  7) Settings → "Walang account, walang internet."

DONE WHEN: all tests pass, npm run build is clean, Lighthouse PWA is installable, the accessibility audit has no critical issues, and the full demo runs in airplane mode with no network requests.
```

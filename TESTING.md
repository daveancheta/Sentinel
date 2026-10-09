# Manual airplane-mode checklist

Complete setup and download the desired model package before this checklist. Use a phone with TalkBack or VoiceOver enabled, then repeat key navigation with a keyboard where available.

## Install and restart offline

- [ ] Install Kita from HTTPS and complete first-run setup with screen reader only.
- [ ] Confirm the selected package and download reaches 100%; restart any interrupted download and check it resumes.
- [ ] Open Home and Settings once, then enable airplane mode and fully close/reopen the installed app.
- [ ] Confirm Home, Settings, tutorial, saved places and local people list load without a network connection.
- [ ] Inspect browser network tools during offline use; confirm no runtime request escapes to the network.

## Interaction and accessibility

- [ ] Tab through controls in a sensible order; every toggle, slider, input and dialog has a useful name and visible focus.
- [ ] At 200% text zoom, reach Settings, Stop, Repeat, Hold to talk, and each mode without horizontal scrolling blocking controls.
- [ ] With TalkBack/VoiceOver, start and stop every mode and confirm feedback is announced once and danger can interrupt.
- [ ] Replay “Paano gamitin”; verify each step advances, returns, and finishes, with spoken steps matching the visible captions.
- [ ] Enable quiet mode; confirm INFO/AMBIENT use earcons and WARNING/DANGER remain spoken. Check that DANGER interrupts current speech.
- [ ] Enable demo captions and confirm captions are large, readable, and track speech without obscuring Stop.

## Device features

- [ ] Grant camera, microphone, orientation and location permissions one at a time; deny each once and confirm a clear recovery message.
- [ ] Test push-to-talk and toggle-to-talk; check Filipino, English, Taglish, Stop and Repeat intents, then check a low-confidence/unknown utterance.
- [ ] Test a vehicle approach, empty chair, printed CR/Exit sign, enrolled consenting person, compass direction and saved place in suitable lighting/location.
- [ ] If Full models are installed, check head-level and step warnings on a safe static test setup. Never use a person walking toward real stairs or traffic as a test.
- [ ] Repeat on iOS Safari and Android Chrome; confirm audio cues work where vibration is unavailable.

## Backup and deletion

- [ ] Export a backup with a passphrase; delete local data; import with the correct passphrase and confirm people and places return.
- [ ] Confirm a wrong passphrase is rejected and does not overwrite current data.
- [ ] Use Delete all data and verify records and cached models are removed; confirm setup is shown again.

Record phone model, OS/browser version, model package and any failures before a release. Hardware accessibility and performance checks must be done on real devices; unit and browser tests do not replace this checklist.

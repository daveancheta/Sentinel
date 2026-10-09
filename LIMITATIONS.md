# Limitations

Kita is an assistive tool in development. Keep using a cane, guide dog, sighted assistance, and established mobility practices. Do not rely on Kita alone to cross roads, find stairs, or judge whether a route is safe.

- Depth output is relative to the current image. Head-level and stair/curb warnings are heuristics and can miss hazards or report false alarms.
- Camera models depend on lighting, camera angle, device speed, model package and browser support. Accuracy drops in darkness, glare, occlusion and crowded scenes. Face recognition can misidentify or miss people; enroll only with clear consent.
- Compass readings can be distorted by nearby metal, magnets and phone orientation. GPS places may be inaccurate or unavailable indoors.
- Filipino text-to-speech depends on voices installed by the operating system. Speech output can be delayed, mispronounced or unavailable.
- iOS Safari does not provide the standard Vibration API; Kita uses audio cues where vibration is unavailable. Haptic behavior varies by device.
- WebGPU, camera, microphone, orientation, battery status, storage persistence and service-worker behavior vary across browsers. Secure HTTPS is required for several features.
- Offline availability requires a successful initial app/model download. Browser storage can still be cleared by the user or operating system. Confirm the offline checklist after changing model packages.
- Voice and vision models can be uncertain. Treat uncertain or missing announcements as unknown conditions, not as evidence that an area is clear.

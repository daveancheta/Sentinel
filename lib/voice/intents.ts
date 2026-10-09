export type VoiceIntent =
  | { type: "whosHere" } | { type: "walking" } | { type: "walkStraight" }
  | { type: "seat" } | { type: "findCr" } | { type: "findExit" }
  | { type: "findRoom"; room: string } | { type: "door" } | { type: "readAll" }
  | { type: "whichWay" } | { type: "whatsAhead" } | { type: "guard" }
  | { type: "stop" } | { type: "repeat" } | { type: "battery" };

const phrases: Array<[VoiceIntent["type"], string[]]> = [
  ["whosHere", ["sino nandito", "sino ang nandito", "who's here", "who is here"]],
  ["walking", ["lakad", "walking mode", "maglalakad"]],
  ["walkStraight", ["diretso", "walk straight"]],
  ["seat", ["hanap upuan", "upuan", "find seat", "find a seat"]],
  ["findCr", ["hanapin ang cr", "hanapin cr", "cr", "banyo", "comfort room", "restroom"]],
  ["findExit", ["labasan", "exit", "hanapin ang exit"]],
  ["door", ["pinto", "door", "hanapin ang pinto"]],
  ["readAll", ["basahin", "read", "read everything", "basahin lahat"]],
  ["whichWay", ["saan ako nakaharap", "which way", "aling direksyon"]],
  ["whatsAhead", ["ano ang nasa harap", "what's ahead", "what is ahead"]],
  ["guard", ["bantay", "guard mode"]],
  ["stop", ["tigil", "stop", "ihinto"]],
  ["repeat", ["ulitin", "repeat"]],
  ["battery", ["ilang porsyento ang baterya", "battery percentage", "what is the battery percentage", "battery level"]],
];

const normalize = (text: string) => text.toLocaleLowerCase().normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

function similarity(a: string, b: string): number {
  if (a === b || a.includes(b) || b.includes(a)) return 1;
  const aa = new Set(a.split(" ").filter(Boolean));
  const bb = new Set(b.split(" ").filter(Boolean));
  if (!aa.size || !bb.size) return 0;
  const intersection = [...aa].filter((word) => bb.has(word)).length;
  return (2 * intersection) / (aa.size + bb.size);
}

export function matchVoiceIntent(transcript: string): { intent: VoiceIntent | null; confidence: number } {
  const text = normalize(transcript);
  if (!text) return { intent: null, confidence: 0 };
  const room = text.match(/(?:kwarto|kuwarto|room)\s*([a-z]?\s*\d{2,4}\s*[a-z]?)/i);
  if (room) return { intent: { type: "findRoom", room: room[1].replace(/\s+/g, "").toUpperCase() }, confidence: 1 };
  let best: { type: VoiceIntent["type"]; score: number } = { type: "stop", score: 0 };
  for (const [type, variants] of phrases) {
    for (const phrase of variants) {
      const score = similarity(text, normalize(phrase));
      if (score > best.score) best = { type, score };
    }
  }
  const confidence = best.score >= 0.5 ? best.score : 0;
  return { intent: confidence ? ({ type: best.type } as VoiceIntent) : null, confidence };
}

export function voiceExamples(language: "fil" | "en"): string {
  return language === "fil"
    ? "Subukan: sino nandito, lakad, diretso, hanap upuan, hanapin ang CR, labasan, pinto, saan ako nakaharap, tigil, o ulitin."
    : "Try: who's here, walking, walk straight, find seat, find the restroom, exit, door, which way, stop, or repeat.";
}

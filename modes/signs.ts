import { announce, announceUncertain } from "../lib/speech/announcer";
import { playEarcon } from "../lib/audio/earcons";
import { startCamera, stopCamera } from "../lib/camera";

export interface OcrWord { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }
export interface SignMatch { text: string; kind: string; side: "kaliwa" | "kanan" | "harap"; center: number; confidence: number }

const entries: Array<[string, string[]]> = [
  ["CR", ["cr", "comfort room", "comfortroom", "banyo", "restroom", "toilet"]],
  ["Male/Lalaki", ["male", "lalaki", "men", "gents"]],
  ["Female/Babae", ["female", "babae", "women", "ladies"]],
  ["Exit/Labasan", ["exit", "labasan"]], ["Entrance/Pasukan", ["entrance", "pasukan"]],
  ["Elevator", ["elevator", "lift"]], ["Stairs/Hagdan", ["stairs", "stair", "hagdan"]],
  ["Pharmacy/Botika", ["pharmacy", "botika"]], ["Cashier/Kahera", ["cashier", "kahera"]],
  ["Information", ["information", "info"]], ["Emergency", ["emergency"]], ["Billing", ["billing"]],
  ["PUSH/TULAK", ["push", "tulak"]], ["PULL/HILA", ["pull", "hila"]],
];

function normalize(value: string) { return value.toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, ""); }
function editDistance(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) { let prev = row[0]; row[0] = i; for (let j = 1; j <= b.length; j++) { const old = row[j]; row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = old; } }
  return row[b.length];
}
export function matchSignWords(words: OcrWord[]): SignMatch[] {
  const matches: SignMatch[] = [];
  for (const word of words) {
    const raw = word.text.trim(); const normalized = normalize(raw);
    let kind = "";
    for (const [label, variants] of entries) {
      if (variants.some((v) => { const n = normalize(v); return normalized.includes(n) || (n.length >= 3 && editDistance(normalized, n) <= Math.max(1, Math.floor(n.length * .2))); })) { kind = label; break; }
    }
    if (!kind && /\b[A-Z]?\d{2,4}[A-Z]?\b/i.test(raw)) kind = `Room ${raw.match(/[A-Z]?\d{2,4}[A-Z]?/i)?.[0]}`;
    if (!kind && /\b\d{1,2}(st|nd|rd|th)?\s*(floor|palapag)\b/i.test(raw)) kind = raw;
    if (!kind && /[\u2190\u2192\u2191\u2193\u2B05\u27A1\u2B06\u2B07]/.test(raw)) kind = `arrow ${raw}`;
    if (kind) {
      const center = (word.bbox.x0 + word.bbox.x1) / 2;
      matches.push({ text: raw, kind, side: center < .38 ? "kaliwa" : center > .62 ? "kanan" : "harap", center, confidence: word.confidence });
    }
  }
  return matches;
}

let active = false, worker: Worker | null = null, target = "", readAll = false, foundCentered = false, lastAnnouncement = "", lastHeardAt = 0, lastFrameAt = 0, lastUncertainAt = 0;
function sayMatches(words: OcrWord[]) {
  const found = matchSignWords(words);
  const wanted = normalize(target);
  const match = found.find((item) => (!wanted || normalize(item.kind).includes(wanted) || normalize(item.text).includes(wanted)) && !foundCentered);
  if (match) {
    if (match.confidence < 45) {
      if (Date.now() - lastUncertainAt > 5000) { lastUncertainAt = Date.now(); announceUncertain(); }
      return;
    }
    const line = `${match.kind}, ${match.side === "harap" ? "diretso sa harap" : `sa ${match.side}`}.`;
    const key = `${line}:${Math.round(match.center * 10)}`;
    if (key !== lastAnnouncement || Date.now() - lastHeardAt > 5000) { announce(line, "INFO"); lastAnnouncement = key; lastHeardAt = Date.now(); }
    playEarcon("sonar", Math.max(-1, Math.min(1, (match.center - .5) * 2)), match.center > .42 && match.center < .58 ? .8 : .4);
    if (wanted && Math.abs(match.center - .5) < .12) { announce(`${match.kind} ay nasa gitna.`, "INFO"); foundCentered = true; }
  } else if (readAll && words.length) {
    const all = words.filter((w) => w.confidence > 35).sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0).map((w) => w.text).join(" ");
    if (all && all !== lastAnnouncement) { announce(all, "INFO"); lastAnnouncement = all; }
  }
}
export async function startSignsMode(options: { target?: string; readAll?: boolean } = {}) {
  stopSignsMode(); active = true; target = options.target ?? ""; readAll = options.readAll ?? !target; foundCentered = false; lastFrameAt = 0;
  worker = new Worker(new URL("../workers/ocr.worker.ts", import.meta.url));
  worker.onmessage = (event: MessageEvent) => { if (event.data.type === "words" && active) sayMatches(event.data.words); if (event.data.type === "error") announce(`Hindi gumana ang OCR. ${event.data.error}`, "WARNING"); };
  worker.postMessage({ type: "init" });
  await startCamera({ fps: 1, facingMode: "environment" }, (frame) => {
    if (active && worker && frame.timestamp - lastFrameAt >= 1000) { lastFrameAt = frame.timestamp; worker.postMessage({ type: "frame", bitmap: frame.bitmap }, [frame.bitmap]); }
    else frame.bitmap.close();
  });
  announce(target ? `Hinahanap ang ${target}. Itapat ang kamera sa mga karatula.` : "Binabasa ang lahat ng nakikitang teksto.", "INFO");
}
export function stopSignsMode() { active = false; stopCamera(); worker?.terminate(); worker = null; target = ""; readAll = false; foundCentered = false; lastAnnouncement = ""; }

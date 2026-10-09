import { getSetting, setSetting } from "../db";
import { getStrings, type Language } from "../i18n";

export type Priority = "DANGER" | "WARNING" | "INFO" | "AMBIENT";

const PRIORITY_RANK: Record<Priority, number> = {
  DANGER: 0,
  WARNING: 1,
  INFO: 2,
  AMBIENT: 3,
};

interface QueueItem {
  text: string;
  priority: Priority;
  lang: Language;
}

const queue: QueueItem[] = [];
let currentLang: Language = "fil";
let currentVoiceUri: string | null = null;
let speechRate = 1.1;
let isSpeaking = false;
let lastMessage = "";
let lastMessageTime = 0;
let cooldownMs = 4000;
let ariaLive: ((text: string) => void) | null = null;

function sortQueue(): void {
  queue.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
}

function selectVoice(voices: SpeechSynthesisVoice[], lang: Language, preferredUri: string | null): SpeechSynthesisVoice | null {
  if (preferredUri) {
    const exact = voices.find((v) => v.voiceURI === preferredUri);
    if (exact) return exact;
  }
  const map: Record<Language, string[]> = {
    fil: ["fil-PH", "en-PH", "en"],
    en: ["en-PH", "en", "fil-PH"],
  };
  const codes = map[lang];
  for (const code of codes) {
    const v = voices.find((voice) => voice.lang.toLowerCase().startsWith(code.toLowerCase()));
    if (v) return v;
  }
  return voices.find((v) => v.lang.toLowerCase().startsWith("en")) || voices[0] || null;
}

async function speakNext(): Promise<void> {
  if (queue.length === 0 || isSpeaking) return;
  sortQueue();
  const item = queue.shift()!;
  isSpeaking = true;
  lastMessage = item.text;
  lastMessageTime = Date.now();

  const utter = new SpeechSynthesisUtterance(item.text);
  const voices = window.speechSynthesis.getVoices();
  const voice = selectVoice(voices, item.lang, currentVoiceUri);
  if (voice) utter.voice = voice;
  utter.lang = item.lang === "fil" ? "fil-PH" : "en-PH";
  utter.rate = speechRate;
  utter.pitch = 1;
  utter.volume = 1;

  utter.onend = () => {
    isSpeaking = false;
    speakNext();
  };
  utter.onerror = () => {
    isSpeaking = false;
    speakNext();
  };

  ariaLive?.(item.text);
  window.speechSynthesis.speak(utter);
}

export function registerAriaLive(callback: (text: string) => void): void {
  ariaLive = callback;
}

export async function initAnnouncer(): Promise<void> {
  currentLang = await getSetting<Language>("language", "fil");
  currentVoiceUri = await getSetting<string | null>("voiceUri", null);
  speechRate = await getSetting<number>("speechRate", 1.1);
  cooldownMs = await getSetting<number>("cooldownMs", 4000);

  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.getVoices();
    };
  }
}

export async function setLanguage(lang: Language): Promise<void> {
  currentLang = lang;
  await setSetting("language", lang);
  const s = getStrings(lang);
  announce(`${s.events.languageChanged} ${lang === "fil" ? s.speech.filPH : s.speech.en}`, "INFO");
}

export async function setVoiceUri(uri: string | null): Promise<void> {
  currentVoiceUri = uri;
  await setSetting("voiceUri", uri);
}

export async function setSpeechRate(rate: number): Promise<void> {
  speechRate = rate;
  await setSetting("speechRate", rate);
  const s = getStrings(currentLang);
  announce(`${s.events.speechRateChanged} ${Math.round(rate * 100)} percent`, "INFO");
}

export async function setCooldown(ms: number): Promise<void> {
  cooldownMs = ms;
  await setSetting("cooldownMs", ms);
}

export function announce(text: string, priority: Priority = "INFO", options?: { force?: boolean }): void {
  if (!text) return;
  const now = Date.now();
  if (!options?.force && text === lastMessage && now - lastMessageTime < cooldownMs) return;

  if (priority === "DANGER") {
    window.speechSynthesis.cancel();
    isSpeaking = false;
    queue.length = 0;
  }

  queue.push({ text, priority, lang: currentLang });
  ariaLive?.(text);
  speakNext();
}

export function stop(): void {
  window.speechSynthesis.cancel();
  isSpeaking = false;
  queue.length = 0;
  const s = getStrings(currentLang);
  ariaLive?.(s.events.speechCancelled);
}

export function repeatLast(): void {
  if (lastMessage) {
    announce(lastMessage, "INFO", { force: true });
  }
}

export function getLastMessage(): string {
  return lastMessage;
}

export function getCurrentLanguage(): Language {
  return currentLang;
}

export function getVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return [];
  return window.speechSynthesis.getVoices();
}

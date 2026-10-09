import { en } from "./en";
import { fil } from "./fil";
import type { Strings } from "./fil";

export type Language = "fil" | "en";

const strings: Record<Language, Strings> = { fil, en };

export function getStrings(lang: Language): Strings {
  return strings[lang] ?? strings.fil;
}

export { en, fil };
export type { Strings };

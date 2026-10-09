import type { Language } from "./i18n";

export type RelativeSide =
  | "front"
  | "frontRight"
  | "right"
  | "backRight"
  | "back"
  | "backLeft"
  | "left"
  | "frontLeft";

export function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

export function toDeg(rad: number): number {
  return rad * (180 / Math.PI);
}

export function normalizeHeading(deg: number): number {
  const v = deg % 360;
  return v < 0 ? v + 360 : v;
}

export function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function bearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLng = toRad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
  const brng = toDeg(Math.atan2(y, x));
  return normalizeHeading(brng);
}

export function formatDistance(meters: number, lang: Language): string {
  if (meters >= 1000) {
    const km = Math.round((meters / 1000) * 10) / 10;
    return lang === "fil" ? `mga ${km} kilometro` : `about ${km} kilometers`;
  }
  let rounded: number;
  if (meters < 20) {
    rounded = Math.round(meters / 5) * 5;
  } else if (meters < 100) {
    rounded = Math.round(meters / 10) * 10;
  } else {
    rounded = Math.round(meters / 50) * 50;
  }
  if (rounded === 0) {
    rounded = Math.max(1, Math.round(meters));
  }
  return lang === "fil" ? `mga ${rounded} metro` : `about ${rounded} meters`;
}

export function relativeSide(bearing: number, heading: number): { degrees: number; side: RelativeSide } {
  const rel = normalizeHeading(bearing - heading);
  const sides: { max: number; side: RelativeSide }[] = [
    { max: 22.5, side: "front" },
    { max: 67.5, side: "frontRight" },
    { max: 112.5, side: "right" },
    { max: 157.5, side: "backRight" },
    { max: 202.5, side: "back" },
    { max: 247.5, side: "backLeft" },
    { max: 292.5, side: "left" },
    { max: 337.5, side: "frontLeft" },
  ];
  const s = sides.find((r) => rel <= r.max) ?? sides[0];
  return { degrees: rel, side: s.side };
}

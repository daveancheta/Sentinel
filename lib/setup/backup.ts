import { db, type Person, type Place, type Setting } from "../db";

const ITERATIONS = 310_000;
interface BackupPayload { format: "kita-backup"; version: 1; createdAt: number; people: Person[]; places: Place[]; settings: Setting[] }
interface EncryptedFile { format: "kita-encrypted"; version: 1; kdf: "PBKDF2-SHA-256"; iterations: number; salt: string; iv: string; ciphertext: string }

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
function fromBase64(value: string): Uint8Array {
  const binary = atob(value), bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: salt as unknown as BufferSource, iterations: ITERATIONS }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
function portablePerson(person: Person) {
  return { ...person, faceEmbeddings: person.faceEmbeddings?.map((item) => Array.from(item)), voiceEmbeddings: person.voiceEmbeddings?.map((item) => Array.from(item)) };
}
function validatePayload(value: unknown): asserts value is BackupPayload {
  if (!value || typeof value !== "object") throw new Error("Invalid backup file.");
  const payload = value as Partial<BackupPayload>;
  if (payload.format !== "kita-backup" || payload.version !== 1 || !Array.isArray(payload.people) || !Array.isArray(payload.places) || !Array.isArray(payload.settings)) throw new Error("Unsupported or invalid backup file.");
}

export async function exportEncryptedBackup(passphrase: string): Promise<Blob> {
  if (passphrase.length < 8) throw new Error("Use a passphrase with at least 8 characters.");
  const [people, places, settings] = await Promise.all([db.people.toArray(), db.places.toArray(), db.settings.toArray()]);
  const payload: BackupPayload = { format: "kita-backup", version: 1, createdAt: Date.now(), people: people.map(portablePerson) as Person[], places, settings };
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as unknown as BufferSource }, key, new TextEncoder().encode(JSON.stringify(payload)));
  const file: EncryptedFile = { format: "kita-encrypted", version: 1, kdf: "PBKDF2-SHA-256", iterations: ITERATIONS, salt: toBase64(salt), iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ciphertext)) };
  return new Blob([JSON.stringify(file)], { type: "application/vnd.kita.backup+json" });
}

export async function importEncryptedBackup(fileBlob: Blob, passphrase: string, strategy: "merge" | "replace"): Promise<void> {
  if (passphrase.length < 8) throw new Error("Use the passphrase with at least 8 characters.");
  const file = JSON.parse(await fileBlob.text()) as Partial<EncryptedFile>;
  if (file.format !== "kita-encrypted" || file.version !== 1 || file.kdf !== "PBKDF2-SHA-256" || !file.salt || !file.iv || !file.ciphertext) throw new Error("This is not a supported Kita backup file.");
  const key = await deriveKey(passphrase, fromBase64(file.salt));
  let cleartext: ArrayBuffer;
  try { cleartext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(file.iv) as unknown as BufferSource }, key, fromBase64(file.ciphertext) as unknown as BufferSource); }
  catch { throw new Error("Incorrect passphrase or damaged backup file."); }
  const payload: unknown = JSON.parse(new TextDecoder().decode(cleartext));
  validatePayload(payload);
  const people = payload.people.map((person) => ({ ...person, id: undefined, faceEmbeddings: person.faceEmbeddings?.map((embedding) => new Float32Array(embedding as unknown as number[])), voiceEmbeddings: person.voiceEmbeddings?.map((embedding) => new Float32Array(embedding as unknown as number[])) }));
  await db.transaction("rw", db.people, db.places, db.settings, async () => {
    if (strategy === "replace") { await db.people.clear(); await db.places.clear(); await db.settings.clear(); }
    for (const person of people) {
      if (strategy === "merge") {
        const existing = await db.people.where("name").equals(person.name).first();
        if (existing?.id != null) await db.people.update(existing.id, { ...person, id: existing.id });
        else await db.people.add(person);
      } else await db.people.add(person);
    }
    for (const place of payload.places) {
      if (strategy === "merge") {
        const existing = await db.places.where("name").equals(place.name).first();
        if (existing?.id != null) await db.places.update(existing.id, { ...place, id: existing.id });
        else await db.places.add({ ...place, id: undefined });
      } else await db.places.add({ ...place, id: undefined });
    }
    for (const setting of payload.settings) await db.settings.put(setting);
  });
}

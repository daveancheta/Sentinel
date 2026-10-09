import Dexie, { type Table } from "dexie";

export interface Person {
  id?: number;
  name: string;
  relation: string;
  faceEmbeddings?: Float32Array[];
  voiceEmbeddings?: Float32Array[];
  createdAt: number;
}

export interface Place {
  id?: number;
  name: string;
  lat: number;
  lng: number;
  notes?: string;
}

export interface Setting {
  key: string;
  value: unknown;
}

export interface EventLog {
  id?: number;
  type: string;
  text: string;
  timestamp: number;
}

export class KitaDatabase extends Dexie {
  people!: Table<Person, number>;
  places!: Table<Place, number>;
  settings!: Table<Setting, string>;
  events!: Table<EventLog, number>;

  constructor() {
    super("KitaDatabase");
    this.version(1).stores({
      people: "++id, name, relation, createdAt",
      places: "++id, name",
      settings: "key",
      events: "++id, timestamp, type",
    });
  }
}

export const db = new KitaDatabase();

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key);
  return row ? (row.value as T) : fallback;
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  await db.settings.put({ key, value });
}

export async function clearAllData(): Promise<void> {
  await db.delete();
  if ("caches" in window) {
    const keys = await window.caches.keys();
    await Promise.all(keys.map((k) => window.caches.delete(k)));
  }
}

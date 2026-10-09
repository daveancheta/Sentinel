export interface BBox {
  xMin: number;
  yMin: number;
  width: number;
  height: number;
}

export type Direction = "left" | "front" | "right";

export interface Track {
  id: number;
  label: string;
  score: number;
  bbox: BBox;
  age: number;
  lastSeen: number;
  growthRate: number;
  horizontalVelocity: number;
  history: { bbox: BBox; time: number }[];
}

export function center(bbox: BBox): { x: number; y: number } {
  return { x: bbox.xMin + bbox.width / 2, y: bbox.yMin + bbox.height / 2 };
}

export function directionFromCenter(x: number): { side: Direction; pan: number } {
  if (x < 0.35) return { side: "left", pan: -1 + x * 2 };
  if (x > 0.65) return { side: "right", pan: (x - 0.65) * 2.857 };
  return { side: "front", pan: (x - 0.5) * 2 };
}

export function distanceFromHeight(height: number): string {
  if (height > 0.5) return "malapit";
  if (height > 0.25) return "mga dalawang metro";
  return "malayo";
}

export function distanceSteps(height: number): number {
  if (height > 0.5) return 1;
  if (height > 0.25) return 2;
  return 4;
}

export function area(bbox: BBox): number {
  return bbox.width * bbox.height;
}

export function iou(a: BBox, b: BBox): number {
  const x1 = Math.max(a.xMin, b.xMin);
  const y1 = Math.max(a.yMin, b.yMin);
  const x2 = Math.min(a.xMin + a.width, b.xMin + b.width);
  const y2 = Math.min(a.yMin + a.height, b.yMin + b.height);
  const interW = Math.max(0, x2 - x1);
  const interH = Math.max(0, y2 - y1);
  const inter = interW * interH;
  const union = area(a) + area(b) - inter;
  return union > 0 ? inter / union : 0;
}

export function overlap(a: BBox, b: BBox): number {
  const x1 = Math.max(a.xMin, b.xMin);
  const y1 = Math.max(a.yMin, b.yMin);
  const x2 = Math.min(a.xMin + a.width, b.xMin + b.width);
  const y2 = Math.min(a.yMin + a.height, b.yMin + b.height);
  const interW = Math.max(0, x2 - x1);
  const interH = Math.max(0, y2 - y1);
  return interW * interH;
}

export class Tracker {
  private tracks: Track[] = [];
  private nextId = 1;
  private maxAge = 500;

  update(detections: { label: string; score: number; bbox: BBox }[], now: number): Track[] {
    const matched = new Set<number>();
    const used = new Set<number>();

    for (const det of detections) {
      let bestI = -1;
      let bestIoU = 0.35;
      for (let i = 0; i < this.tracks.length; i++) {
        if (matched.has(i) || this.tracks[i].label !== det.label) continue;
        const val = iou(this.tracks[i].bbox, det.bbox);
        if (val > bestIoU) {
          bestIoU = val;
          bestI = i;
        }
      }
      if (bestI >= 0) {
        matched.add(bestI);
        used.add(bestI);
        const t = this.tracks[bestI];
        const prev = t.bbox;
        const prevArea = area(prev);
        const newArea = area(det.bbox);
        const dt = now - t.lastSeen;
        t.growthRate = dt > 0 ? (newArea - prevArea) / dt : 0;
        const prevCenter = center(prev);
        const newCenter = center(det.bbox);
        t.horizontalVelocity = dt > 0 ? (newCenter.x - prevCenter.x) / dt : 0;
        t.bbox = det.bbox;
        t.score = det.score;
        t.lastSeen = now;
        t.age = 0;
        t.history.push({ bbox: det.bbox, time: now });
        if (t.history.length > 5) t.history.shift();
      } else {
        this.tracks.push({
          id: this.nextId++,
          label: det.label,
          score: det.score,
          bbox: det.bbox,
          age: 0,
          lastSeen: now,
          growthRate: 0,
          horizontalVelocity: 0,
          history: [{ bbox: det.bbox, time: now }],
        });
      }
    }

    this.tracks = this.tracks.filter((t) => {
      if (used.has(this.tracks.indexOf(t))) return true;
      t.age += now - t.lastSeen;
      return t.age < this.maxAge;
    });

    return this.tracks;
  }
}

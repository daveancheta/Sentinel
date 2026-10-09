export type ModelPackage = "lite" | "full";
export interface ModelAsset { url: string; bytes: number }
export interface ModelManifest {
  packages: Record<ModelPackage, { totalBytes: number; assets: ModelAsset[] }>;
}

const MODEL_CACHE = "kita-models";
const CACHE_NAMES: Array<[string, string]> = [
  ["/models/", "kita-models"], ["/ort-wasm/", "kita-ort-wasm"],
  ["/mediapipe/", "kita-wasm"], ["/tesseract/", "kita-tesseract"],
];

export function cacheNameFor(url: string): string {
  return CACHE_NAMES.find(([prefix]) => url.startsWith(prefix))?.[1] ?? MODEL_CACHE;
}

export async function getModelManifest(): Promise<ModelManifest> {
  const response = await fetch("/model-manifest.json", { cache: "no-store" });
  if (!response.ok) throw new Error("Model manifest missing. Rebuild after running the model download script.");
  return response.json() as Promise<ModelManifest>;
}

export async function downloadModelPackage(
  assets: ModelAsset[],
  onProgress: (completedBytes: number, totalBytes: number, file: string) => void,
): Promise<void> {
  if (!("caches" in window)) throw new Error("Cache Storage is unavailable in this browser.");
  const total = assets.reduce((sum, asset) => sum + asset.bytes, 0);
  let completed = 0;
  for (const asset of assets) {
    const url = new URL(asset.url, window.location.origin).href;
    const cache = await caches.open(cacheNameFor(asset.url));
    if (await cache.match(url)) {
      completed += asset.bytes;
      onProgress(completed, total, asset.url);
      continue;
    }
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not download ${asset.url} (${response.status}).`);
    const storedHeaders = new Headers(response.headers);
    storedHeaders.delete("content-encoding");
    storedHeaders.delete("content-length");
    let received = 0;
    if (response.body) {
      const stream = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          received += chunk.byteLength;
          onProgress(completed + received, total, asset.url);
          controller.enqueue(chunk);
        },
      }));
      await cache.put(url, new Response(stream, { status: 200, headers: storedHeaders }));
    } else {
      const body = await response.arrayBuffer();
      received = body.byteLength;
      await cache.put(url, new Response(body, { status: 200, headers: storedHeaders }));
    }
    completed += asset.bytes || received;
    onProgress(completed, total, asset.url);
  }
}

export async function getCachedPackageProgress(assets: ModelAsset[]): Promise<{ complete: number; total: number }> {
  let complete = 0;
  const total = assets.reduce((sum, asset) => sum + asset.bytes, 0);
  for (const asset of assets) {
    const cache = await caches.open(cacheNameFor(asset.url));
    if (await cache.match(new URL(asset.url, window.location.origin).href)) complete += asset.bytes;
  }
  return { complete, total };
}

export async function verifyPackageAssets(assets: ModelAsset[]): Promise<void> {
  for (const asset of assets) {
    const cache = await caches.open(cacheNameFor(asset.url));
    if (!(await cache.match(new URL(asset.url, window.location.origin).href))) throw new Error(`Missing offline asset: ${asset.url}`);
  }
}

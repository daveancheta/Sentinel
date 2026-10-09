import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const WASM_SOURCE = join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const WASM_DEST = join(root, "public", "mediapipe", "wasm");
const MODELS_DEST = join(root, "public", "models", "mediapipe");

const MODELS = [
  {
    name: "EfficientDet-Lite0",
    file: "efficientdet_lite0.tflite",
    url: "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/latest/efficientdet_lite0.tflite",
  },
  {
    name: "EfficientDet-Lite2",
    file: "efficientdet_lite2.tflite",
    url: "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite2/float16/latest/efficientdet_lite2.tflite",
  },
];

function ensureDir(p) {
  mkdirSync(p, { recursive: true });
}

function copyWasm() {
  ensureDir(WASM_DEST);
  const files = readdirSync(WASM_SOURCE);
  for (const file of files) {
    const src = join(WASM_SOURCE, file);
    const dest = join(WASM_DEST, file);
    if (!existsSync(dest)) {
      copyFileSync(src, dest);
      console.log(`Copied wasm: ${file}`);
    } else {
      console.log(`Wasm exists: ${file}`);
    }
  }
}

async function fetchModel(model) {
  ensureDir(MODELS_DEST);
  const dest = join(MODELS_DEST, model.file);
  if (existsSync(dest)) {
    console.log(`Model exists: ${model.file}`);
    return;
  }
  console.log(`Downloading ${model.name}...`);
  const res = await fetch(model.url);
  if (!res.ok) {
    throw new Error(`Failed to download ${model.name}: ${res.status} ${res.statusText}`);
  }
  const buf = await res.arrayBuffer();
  writeFileSync(dest, Buffer.from(buf));
  console.log(`Saved ${model.file} (${(buf.byteLength / 1024 / 1024).toFixed(2)} MB)`);
}

async function main() {
  copyWasm();
  for (const model of MODELS) {
    await fetchModel(model);
  }
  console.log("Model download complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const WASM_SOURCE = join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const WASM_DEST = join(root, "public", "mediapipe", "wasm");
const MODELS_DEST = join(root, "public", "models", "mediapipe");
const HUMAN_SOURCE = join(root, "node_modules", "@vladmandic", "human", "models");
const HUMAN_DEST = join(root, "public", "models", "human");
const ORT_SOURCE = join(root, "node_modules", "onnxruntime-web", "dist");
const ORT_DEST = join(root, "public", "ort-wasm");
const DEPTH_DEST = join(root, "public", "models", "onnx-community", "depth-anything-v2-small");
const TESSERACT_DEST = join(root, "public", "tesseract");
const OWLVIT_DEST = join(root, "public", "models", "Xenova", "owlvit-base-patch32");
const WHISPER_ASSETS = ["onnx-community/whisper-tiny", "onnx-community/whisper-base"];
const WHISPER_FILES = ["config.json", "generation_config.json", "preprocessor_config.json", "tokenizer.json", "tokenizer_config.json", "onnx/encoder_model_quantized.onnx", "onnx/decoder_model_merged_quantized.onnx"];
const SPEAKER_MODEL = "Xenova/wavlm-base-plus-sv";

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

const DEPTH_FILES = [
  { path: "config.json", url: "https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/config.json" },
  { path: "preprocessor_config.json", url: "https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/preprocessor_config.json" },
  { path: "onnx/model_quantized.onnx", url: "https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/onnx/model_quantized.onnx" },
  { path: "onnx/model_quantized.onnx_data", url: "https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/onnx/model_quantized.onnx_data" },
];

const ORT_WASM_FILES = [
  "ort-wasm-simd-threaded.wasm",
  "ort-wasm-simd-threaded.jsep.wasm",
  "ort-wasm-simd-threaded.mjs",
  "ort-wasm-simd-threaded.jsep.mjs",
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

function copyOrtWasm() {
  ensureDir(ORT_DEST);
  for (const file of ORT_WASM_FILES) {
    const src = join(ORT_SOURCE, file);
    const dest = join(ORT_DEST, file);
    if (!existsSync(src)) {
      console.warn(`ONNX wasm not found: ${file}`);
      continue;
    }
    if (!existsSync(dest)) {
      copyFileSync(src, dest);
      console.log(`Copied ONNX wasm: ${file}`);
    } else {
      console.log(`ONNX wasm exists: ${file}`);
    }
  }
}

function copyHumanModels() {
  ensureDir(HUMAN_DEST);
  const files = [
    "blazeface.json",
    "blazeface.bin",
    "emotion.json",
    "emotion.bin",
    "faceres.json",
    "faceres.bin",
  ];
  for (const file of files) {
    const src = join(HUMAN_SOURCE, file);
    const dest = join(HUMAN_DEST, file);
    if (!existsSync(src)) {
      console.warn(`Human model not found: ${file}`);
      continue;
    }
    if (!existsSync(dest)) {
      copyFileSync(src, dest);
      console.log(`Copied human model: ${file}`);
    } else {
      console.log(`Human model exists: ${file}`);
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

async function fetchDepthFile(file) {
  const dest = join(DEPTH_DEST, file.path);
  if (existsSync(dest)) {
    console.log(`Depth file exists: ${file.path}`);
    return;
  }
  ensureDir(dirname(dest));
  console.log(`Downloading depth ${file.path}...`);
  const res = await fetch(file.url);
  if (!res.ok) {
    if (res.status === 404 && file.path.endsWith(".onnx_data")) {
      console.log(`No external data file for depth model; skipping.`);
      return;
    }
    throw new Error(`Failed to download ${file.path}: ${res.status} ${res.statusText}`);
  }
  const buf = await res.arrayBuffer();
  writeFileSync(dest, Buffer.from(buf));
  console.log(`Saved depth ${file.path} (${(buf.byteLength / 1024 / 1024).toFixed(2)} MB)`);
}

async function fetchToPath(url, relativePath) {
  const dest = join(root, "public", relativePath);
  if (existsSync(dest)) { console.log(`Asset exists: ${relativePath}`); return; }
  ensureDir(dirname(dest));
  console.log(`Downloading ${relativePath}...`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download ${relativePath}: ${response.status}`);
  writeFileSync(dest, Buffer.from(await response.arrayBuffer()));
}

async function prepareSignAssets() {
  ensureDir(TESSERACT_DEST);
  const tessDist = join(root, "node_modules", "tesseract.js", "dist");
  const coreDist = join(root, "node_modules", "tesseract.js-core");
  for (const file of ["worker.min.js"]) {
    const src = join(tessDist, file);
    if (existsSync(src) && !existsSync(join(TESSERACT_DEST, file))) copyFileSync(src, join(TESSERACT_DEST, file));
  }
  for (const file of readdirSync(coreDist).filter((name) => name.startsWith("tesseract-core") && name.endsWith(".js"))) {
    if (!existsSync(join(TESSERACT_DEST, file))) copyFileSync(join(coreDist, file), join(TESSERACT_DEST, file));
  }
  for (const lang of ["eng", "fil"]) {
    await fetchToPath(`https://tessdata.projectnaptha.com/4.0.0/${lang}.traineddata.gz`, `tesseract/${lang}.traineddata.gz`);
  }

  const files = [
    "config.json", "preprocessor_config.json", "tokenizer.json", "tokenizer_config.json", "special_tokens_map.json",
    "onnx/model_quantized.onnx",
  ];
  for (const file of files) {
    const url = `https://huggingface.co/Xenova/owlvit-base-patch32/resolve/main/${file}`;
    const dest = join(OWLVIT_DEST, file);
    if (existsSync(dest)) continue;
    ensureDir(dirname(dest));
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to download OWL-ViT ${file}: ${response.status}`);
    writeFileSync(dest, Buffer.from(await response.arrayBuffer()));
    console.log(`Saved OWL-ViT ${file}`);
  }
}

async function prepareVoiceAssets() {
  for (const model of WHISPER_ASSETS) {
    for (const file of WHISPER_FILES) {
      const relative = `models/${model}/${file}`;
      const dest = join(root, "public", relative);
      if (existsSync(dest)) continue;
      ensureDir(dirname(dest));
      const response = await fetch(`https://huggingface.co/${model}/resolve/main/${file}`);
      if (!response.ok) throw new Error(`Failed to download ${relative}: ${response.status}`);
      writeFileSync(dest, Buffer.from(await response.arrayBuffer()));
      console.log(`Saved ${relative}`);
    }
  }
  for (const file of ["config.json", "preprocessor_config.json", "onnx/model_quantized.onnx"]) {
    const relative = `models/${SPEAKER_MODEL}/${file}`;
    const dest = join(root, "public", relative);
    if (existsSync(dest)) continue;
    ensureDir(dirname(dest));
    const response = await fetch(`https://huggingface.co/${SPEAKER_MODEL}/resolve/main/${file}`);
    if (!response.ok) throw new Error(`Failed to download ${relative}: ${response.status}`);
    writeFileSync(dest, Buffer.from(await response.arrayBuffer()));
    console.log(`Saved ${relative}`);
  }
}

async function main() {
  copyWasm();
  copyOrtWasm();
  copyHumanModels();
  for (const model of MODELS) {
    await fetchModel(model);
  }
  for (const file of DEPTH_FILES) {
    await fetchDepthFile(file);
  }
  await prepareSignAssets();
  await prepareVoiceAssets();
  console.log("Model download complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

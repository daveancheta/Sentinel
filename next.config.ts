import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";
import path from "node:path";

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  reloadOnOnline: false,
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "export",
  distDir: "dist",
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@vladmandic/human": path.resolve(process.cwd(), "node_modules/@vladmandic/human/dist/human.esm.js"),
      "@huggingface/transformers": path.resolve(process.cwd(), "node_modules/@huggingface/transformers/dist/transformers.web.js"),
      "onnxruntime-web$": path.resolve(process.cwd(), "node_modules/onnxruntime-web/dist/ort.all.min.mjs"),
      "onnxruntime-web/webgpu$": path.resolve(process.cwd(), "node_modules/onnxruntime-web/dist/ort.webgpu.min.mjs"),
      "onnxruntime-web/wasm$": path.resolve(process.cwd(), "node_modules/onnxruntime-web/dist/ort.wasm.min.mjs"),
    };
    return config;
  },
};

export default withSerwist(nextConfig);

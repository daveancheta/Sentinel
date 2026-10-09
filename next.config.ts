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
    };
    return config;
  },
};

export default withSerwist(nextConfig);

import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  reloadOnOnline: false,
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "export",
  distDir: "dist",
};

export default withSerwist(nextConfig);

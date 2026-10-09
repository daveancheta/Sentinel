import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        kita: {
          bg: "#0a0a0a",
          panel: "#1a1a1a",
          accent: "#facc15",
          danger: "#ef4444",
          success: "#22c55e",
          text: "#f5f5f5",
          muted: "#a3a3a3",
        },
      },
    },
  },
  plugins: [],
};

export default config;

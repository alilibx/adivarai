import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Obsidian with a violet undertone.
        bg: "#0B0910",
        panel: "#141019",
        panel2: "#1B1626",
        edge: "#2A2536",
        // Gold is the hero — money, earning, premium.
        gold: "#F4B740",
        // Violet carries the brand + structure.
        brand: "#8B6CFF",
        brand2: "#22D3EE",
        ok: "#4ADE80",
        warn: "#FBBF24",
        ink: "#ECE9F3",
        muted: "#968EA8",
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(244,183,64,0.25), 0 8px 40px -8px rgba(244,183,64,0.35)",
        lift: "0 20px 60px -20px rgba(0,0,0,0.8)",
      },
      keyframes: {
        flyup: {
          "0%": { opacity: "0", transform: "translateY(6px) scale(0.9)" },
          "20%": { opacity: "1" },
          "100%": { opacity: "0", transform: "translateY(-22px) scale(1)" },
        },
        breathe: {
          "0%,100%": { opacity: "0.5" },
          "50%": { opacity: "1" },
        },
        expand: {
          from: { opacity: "0", transform: "translateY(8px) scale(0.98)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
      },
      animation: {
        flyup: "flyup 1.1s ease-out forwards",
        breathe: "breathe 2.4s ease-in-out infinite",
        expand: "expand 0.35s cubic-bezier(0.2,0.8,0.2,1) both",
      },
    },
  },
  plugins: [],
};

export default config;

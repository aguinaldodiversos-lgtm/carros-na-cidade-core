import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./hooks/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
    "./services/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#0e62d8",
        "primary-strong": "#0c4fb0",
        "cnc-bg": "#f2f3f7",
        "cnc-surface": "#ffffff",
        "cnc-line": "#dde2ec",
        "cnc-text": "#161f34",
        "cnc-muted": "#5d667d",
        "cnc-footer-a": "#152954",
        "cnc-footer-b": "#0e1b3b",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      fontSize: {
        xs: ["0.75rem", { lineHeight: "1.2rem" }],
        sm: ["0.875rem", { lineHeight: "1.45rem" }],
        base: ["1rem", { lineHeight: "1.7rem" }],
        lg: ["1.125rem", { lineHeight: "1.8rem" }],
        xl: ["1.25rem", { lineHeight: "1.9rem" }],
        "2xl": ["1.5rem", { lineHeight: "2rem" }],
        "3xl": ["1.875rem", { lineHeight: "2.3rem" }],
        "4xl": ["2.25rem", { lineHeight: "2.7rem" }],
      },
      letterSpacing: {
        tightest: "-0.04em",
        tighter: "-0.02em",
        tight: "-0.01em",
      },
      boxShadow: {
        soft: "0 10px 30px rgba(15,23,42,0.08)",
        card: "0 2px 18px rgba(20,30,60,0.06)",
        premium: "0 12px 30px rgba(16,28,58,0.12)",
      },
      borderRadius: {
        xl2: "1rem",
        xl3: "1.5rem",
      },
      maxWidth: {
        "8xl": "90rem",
      },
    },
  },
  plugins: [],
};

export default config;

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
        sans: ['"Segoe UI"', '"Helvetica Neue"', "Arial", "sans-serif"],
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

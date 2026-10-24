import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          950: "#070E18",
          900: "#0D1B2A",
          800: "#12243A",
          700: "#1A2B3C",
          600: "#1E3348",
          500: "#243C55",
        },
        amber: {
          950: "#7C3800",
          900: "#A34A00",
          800: "#C45E05",
          700: "#D97706",
          600: "#EA8A1A",
          500: "#F59E0B",
          400: "#FBBF24",
          300: "#FCD34D",
        },
        citrus: {
          700: "#A16207",
          600: "#CA8A04",
          500: "#EAB308",
          400: "#FACC15",
        },
        cream: {
          100: "#F0E6D3",
          200: "#E8D5B7",
          300: "#D4B896",
        },
        muted: "#94A3B8",
        surface: "#1C2E4A",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      backgroundImage: {
        "navy-gradient":
          "linear-gradient(135deg, #0D1B2A 0%, #1A2B3C 100%)",
        "amber-glow":
          "radial-gradient(ellipse at center, rgba(234,138,26,0.15) 0%, transparent 70%)",
      },
      boxShadow: {
        amber: "0 0 20px rgba(234, 138, 26, 0.3)",
        "amber-sm": "0 0 8px rgba(234, 138, 26, 0.2)",
        panel: "0 4px 24px rgba(0, 0, 0, 0.4)",
      },
      animation: {
        "pulse-amber": "pulse-amber 2s ease-in-out infinite",
        "slide-in": "slide-in 0.2s ease-out",
        "fade-in": "fade-in 0.15s ease-out",
      },
      keyframes: {
        "pulse-amber": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
        "slide-in": {
          "0%": { transform: "translateX(-8px)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;

import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      boxShadow: {
        hud: "0 24px 80px rgba(0, 0, 0, 0.38)",
      },
    },
  },
  plugins: [],
} satisfies Config;

import type { Config } from "tailwindcss";
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: { primary: "var(--accent)", background: "var(--paper)" },
    },
  },
} satisfies Config;

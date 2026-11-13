/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: { pixel: ["'Press Start 2P'", "monospace", "ui-monospace"] },
      colors: {
        bosque: { bg: "#0f2a1d", track: "#1d4d2b", line: "#f5d76e" },
        gold: "#f5c542",
      },
    },
  },
  plugins: [],
};

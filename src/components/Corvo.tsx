"use client";
// Corvo, el Cuervo de RRHH: negro con brillo azul/morado, pico y ojos amarillos,
// lentes, corbata roja de RRHH, sobre en el pico, parado en una ramita.
// Navidad: gorro de Santa. Halloween: sombrerito de bruja.
export default function Corvo({ season = "navidad", size = 96 }: { season?: string; size?: number }) {
  const isNavidad = season === "navidad";
  const isHalloween = season === "halloween";
  const hat = isNavidad ? "#d7263d" : isHalloween ? "#7c3aed" : "#111111";
  const px = size / 12;
  // B negro, U brillo azul/morado, Y pico amarillo, E ojo, G lentes, R corbata, W sobre blanco, N ramita
  const rows: string[][] = [
    [".", ".", ".", ".", "H", "H", ".", ".", ".", ".", ".", "."],
    [".", ".", ".", "H", "H", "H", "H", ".", ".", ".", ".", "."],
    [".", ".", "B", "B", "U", "B", "B", "B", ".", ".", ".", "."],
    [".", ".", "B", "E", "B", "B", "E", "B", "Y", "Y", ".", "."],
    [".", ".", "B", "G", "B", "B", "G", "B", "Y", "Y", "Y", "."],
    [".", ".", ".", "B", "B", "B", "B", "Y", "W", "W", ".", "."],
    [".", ".", ".", "B", "R", "B", "B", "W", "W", "W", ".", "."],
    [".", ".", "B", "B", "R", "B", "B", "B", ".", ".", ".", "."],
    [".", "B", "B", "U", "B", "B", "B", "B", "B", ".", ".", "."],
    [".", ".", "B", "B", "B", "B", "B", ".", ".", ".", ".", "."],
    [".", ".", ".", "N", "N", "N", "N", "N", "N", "N", ".", "."],
    [".", ".", ".", ".", ".", ".", ".", ".", ".", ".", ".", "."],
  ];
  const colors: Record<string, string> = {
    H: hat, B: "#111111", U: "#6366f1", Y: "#facc15", E: "#facc15",
    G: "#e5e7eb", R: "#dc2626", W: "#ffffff", N: "#8b5a2b",
  };
  return (
    <div className="animate-corvo text-center">
      <div style={{ width: size, height: size, display: "grid", gridTemplateColumns: `repeat(12, ${px}px)`, gridTemplateRows: `repeat(12, ${px}px)`, imageRendering: "pixelated", filter: "drop-shadow(2px 3px 0 rgba(0,0,0,.55))", margin: "0 auto" }}>
        {rows.flatMap((row, y) => row.map((ch, x) => (
          <div key={`${y}-${x}`} style={{ width: px, height: px, background: colors[ch] || "transparent" }} />
        )))}
      </div>
      <p style={{ fontSize: 11, textAlign: "center", marginTop: 4 }}>
        🐦‍⬛ Corvo — RRHH {isNavidad ? "🎅" : isHalloween ? "🎃" : ""} · ¡Caw!
      </p>
    </div>
  );
}

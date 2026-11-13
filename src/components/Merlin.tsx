"use client";
// Merlín barbón pixel: sombrero puntiagudo, barba blanca larga, bastón.
// En Navidad: gorro de Santa + túnica roja + trineo con regalos. En Halloween: sombrero de bruja morado/naranja.
export default function Merlin({ season = "navidad", size = 96, caption = true, sleigh = false }: { season?: string; size?: number; caption?: boolean; sleigh?: boolean }) {
  const isNavidad = season === "navidad";
  const isHalloween = season === "halloween";
  const hat = isNavidad ? "#d7263d" : isHalloween ? "#7c3aed" : "#4a3aff";
  const tunic = isNavidad ? "#d7263d" : isHalloween ? "#ea580c" : "#4a3aff";
  const px = size / 12;
  const rows: string[][] = [
    [".", ".", ".", ".", "H", "H", ".", ".", ".", ".", ".", "."],
    [".", ".", ".", "H", "H", "H", "H", ".", ".", ".", ".", "."],
    [".", ".", "H", "H", "H", "H", "H", "H", ".", ".", ".", "."],
    [".", "H", "H", "H", "H", "H", "H", "H", "H", ".", ".", "."],
    [".", ".", "S", "S", "S", "S", "S", "S", ".", ".", ".", "."],
    [".", ".", "S", "E", "S", "S", "E", "S", ".", ".", ".", "."],
    [".", ".", ".", "S", "S", "S", "S", ".", ".", ".", ".", "."],
    [".", ".", "W", "W", "W", "W", "W", "W", ".", ".", ".", "."],
    [".", ".", "W", "W", "W", "W", "W", "W", ".", ".", ".", "."],
    [".", "T", "T", "W", "W", "W", "W", "T", "T", ".", ".", "."],
    [".", "T", "T", "T", "W", "W", "T", "T", "T", ".", ".", "Y"],
    [".", ".", "T", "T", "T", "T", "T", "T", ".", ".", ".", "Y"],
  ];
  const colors: Record<string, string> = { H: hat, S: "#f2c89b", E: "#111", W: "#ffffff", T: tunic, Y: "#8b5a2b" };
  return (
    <div className="animate-float text-center">
      <div style={{ width: size, height: size, display: "grid", gridTemplateColumns: `repeat(12, ${px}px)`, gridTemplateRows: `repeat(12, ${px}px)`, imageRendering: "pixelated", filter: "drop-shadow(2px 3px 0 rgba(0,0,0,.55))", margin: "0 auto" }}>
        {rows.flatMap((row, y) => row.map((ch, x) => (
          <div key={`${y}-${x}`} style={{ width: px, height: px, background: colors[ch] || "transparent" }} />
        )))}
      </div>
      {/* Trineo con regalos (solo en el recuadro de Merlín, debajo del mago) */}
      {sleigh && isNavidad && (
        <div className="mt-1 text-center text-2xl leading-none" aria-hidden>
          🛷<span className="text-lg">🎁🎁🎄</span>
        </div>
      )}
      {caption && (
        <>
          <div className="animate-sled mt-1 text-center text-2xl leading-none" aria-hidden>
            🛷<span className="text-lg">🎁🎁🎄</span>
          </div>
          <p style={{ fontSize: 11, textAlign: "center", marginTop: 4 }}>
            🧙 Merlín {isNavidad ? "🎅 con trineo y regalos" : isHalloween ? "🎃 brujo" : ""}
          </p>
        </>
      )}
    </div>
  );
}

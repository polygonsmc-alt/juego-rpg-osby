"use client";
import { AVATAR_HAIR, AVATAR_SHIRT } from "@/lib/data";

/**
 * Monito pixel 12x12. Cada char es un píxel:
 *  . transparente, H pelo, S piel, E ojo, B camisa, P pantalón, Z zapato
 *  Índices 8-11 son mujeres: 8 coleta larga, 9 moño alto, 10 pelo largo ondulado, 11 trenza.
 */
const BASE = [
  "....HHHH....",
  "...HHHHHH...",
  "...HSSSSSH..",
  "...HSESS ESH..",
  "...HSSSSSS..",
  "....SSSS....",
  ".....SS.....",
  "...BBBBBB...",
  "..BBBBBBBB..",
  "...BBBBBB...",
  "....PPPP....",
  "...ZZ..ZZ...",
];

function rowsFor(sprite: number): string[] {
  const rows = [...BASE];
  if (sprite === 8) { // coleta larga
    rows[2] = "..HHSSSSSH.."; rows[4] = "..HHSSSSSHH."; rows[6] = "..HH..SS..H.";
  }
  if (sprite === 9) { // moño alto
    rows[0] = ".....HH....."; rows[1] = "...HHHHHH...";
  }
  if (sprite === 10) { // pelo largo ondulado
    rows[2] = "..HHSSSSSHH."; rows[5] = "..HHSSSSHH."; rows[7] = "..HHBBBBHH.";
  }
  if (sprite === 11) { // trenza
    rows[3] = "..HHSESSESH."; rows[6] = "...SS..HH.."; rows[8] = "..BBBBBBBH..";
  }
  return rows.map((r) => r.padEnd(12, ".").slice(0, 12));
}

export default function PixelAvatar({ sprite, size = 72, label, animated = false, className = "" }: { sprite: number; size?: number; label?: string; animated?: boolean; className?: string }) {
  const hair = AVATAR_HAIR[sprite % AVATAR_HAIR.length];
  const shirt = AVATAR_SHIRT[sprite % AVATAR_SHIRT.length];
  const rows = rowsFor(sprite);
  const px = size / 12;
  const colors: Record<string, string> = {
    H: hair, S: "#f2c89b", E: "#1a1a1a", B: shirt, P: "#1e3a5f", Z: "#111111",
  };
  return (
    <div
      role="img"
      aria-label={label || `Avatar pixel ${sprite}`}
      className={`${animated ? "animate-walk" : ""} ${className}`}
      style={{ width: size, height: size, display: "grid", gridTemplateColumns: `repeat(12, ${px}px)`, gridTemplateRows: `repeat(12, ${px}px)`, imageRendering: "pixelated", filter: "drop-shadow(2px 3px 0 rgba(0,0,0,.5))" }}
    >
      {rows.flatMap((row, y) =>
        row.split("").map((ch, x) => (
          <div key={`${y}-${x}`} style={{ width: px, height: px, background: colors[ch] || "transparent" }} />
        ))
      )}
    </div>
  );
}

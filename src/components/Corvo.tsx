"use client";
// Corvo, el Cuervo de RRHH, pixel exacto del Master (CrowSprite 18x18):
// negro con brillo azul/morado, pico y ojos amarillos con lentes,
// corbata roja, sobre en el pico, parado en una ramita.
// Navidad: gorro de Santa. Halloween: sombrerito de bruja.
import { CrowSprite } from "./sprites";

export default function Corvo({
  season = "navidad",
  size = 96,
  caption = true,
}: {
  season?: string;
  size?: number;
  caption?: boolean;
}) {
  const isNavidad = season === "navidad";
  const isHalloween = season === "halloween";
  return (
    <div className="animate-corvo text-center">
      <span className="inline-block">
        <CrowSprite size={size} season={season} />
      </span>
      {caption && (
        <p style={{ fontSize: 11, textAlign: "center", marginTop: 4 }}>
          🐦‍⬛ Corvo — RRHH {isNavidad ? "🎅" : isHalloween ? "🎃" : ""} · ¡Caw!
        </p>
      )}
    </div>
  );
}

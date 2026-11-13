"use client";
// Merlín barbón pixel exacto del Master (WizardSprite 18x20 + SleighSprite
// 20x12): sombrero puntiagudo con estrella, barba blanca, túnica y bastón
// con orbe. Navidad: gorro de Santa rojo con ribete blanco + túnica roja.
// Halloween: sombrero de bruja. Primavera: flores. Verano: paja + lentes.
import { WizardSprite, SleighSprite } from "./sprites";

export default function Merlin({
  season = "navidad",
  size = 96,
  caption = true,
  sleigh = false,
}: {
  season?: string;
  size?: number;
  caption?: boolean;
  sleigh?: boolean;
}) {
  const isNavidad = season === "navidad";
  const isHalloween = season === "halloween";
  return (
    <div className="animate-float text-center">
      <span className="inline-block">
        <WizardSprite size={size} season={season} />
      </span>
      {sleigh && isNavidad && (
        <span className="mt-1 block">
          <SleighSprite size={Math.round(size * 0.9)} />
        </span>
      )}
      {caption && (
        <p style={{ fontSize: 11, textAlign: "center", marginTop: 4 }}>
          🧙 Merlín {isNavidad ? "🎅 con trineo y regalos" : isHalloween ? "🎃 brujo" : ""}
        </p>
      )}
    </div>
  );
}

export { SleighSprite };

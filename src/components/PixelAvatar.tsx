"use client";
// Avatar pixel exacto del Master (sprites.tsx): 16x18 SVG, 12 formas,
// 12 paletas y overlays por nivel (cinturón dorado, gemas, corona,
// gema del pecho, capa). FANY sprite 2 = Mago, OSBED sprite 0 = Recluta,
// mayra sprite 10 = Pelo largo ondulado.
import { AvatarSprite, tierIndexFor } from "./sprites";

export default function PixelAvatar({
  sprite,
  points = 0,
  size = 72,
  label,
  animated = false,
  className = "",
}: {
  sprite: number;
  points?: number;
  size?: number;
  label?: string;
  animated?: boolean;
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label={label || `Avatar pixel ${sprite}`}
      className={`${animated ? "sprite-bob" : ""} ${className}`}
      style={{ display: "inline-block", filter: "drop-shadow(2px 3px 0 rgba(0,0,0,.5))" }}
    >
      <AvatarSprite sprite={sprite} tierIdx={tierIndexFor(points)} size={size} />
    </span>
  );
}

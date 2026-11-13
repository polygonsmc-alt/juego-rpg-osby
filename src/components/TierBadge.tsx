// Insignia de nivel (Master): chip con el color del nivel.
import { LEVELS } from "@/lib/data";

const TIER_COLORS: Record<string, string> = {
  Novato: "#7d8694",
  Bronce: "#b0793f",
  Plata: "#9aa5b1",
  Oro: "#e6a817",
  Diamante: "#38bdf8",
  Leyenda: "#a855f7",
};

export default function TierBadge({ points }: { points: number }) {
  let name: string = LEVELS[0].name;
  for (const l of LEVELS) if (points >= l.min) name = l.name;
  const color = TIER_COLORS[name] || "#7d8694";
  return (
    <span className="chip inline-flex items-center px-2 py-0.5 text-[11px] font-bold" style={{ color, borderColor: color }}>
      {name}
    </span>
  );
}

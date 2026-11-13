"use client";
import type { Collaborator, Prize } from "@/lib/types";
import { levelFor } from "@/lib/data";
import PixelAvatar from "./PixelAvatar";
import TierBadge from "./TierBadge";
import { SeasonIcon, PrizeIcon, FlagIcon, SEASON_DECOR } from "./sprites";

// Pista tal cual el Master: regla de premios arriba, carriles de 56px con
// ticks, barra verde abajo y monito de 44px que camina por puntos/meta.
// Nieve: 14 copos cuadrados blancos cayendo DENTRO del panel (Navidad).

// Íconos pixel exactos del Master (sprites.tsx): por id de premio.
// 1-2 gift cards -> gift, 3 Videojuego -> game, 4 Tablet -> console,
// 5 TV -> tv, 6 PS5 -> console.
const PRIZE_ICON: Record<number, string> = {
  1: "gift", 2: "gift", 3: "game", 4: "console", 5: "tv", 6: "console",
};

export default function Track({ collaborators, prizes, season }: { collaborators: Collaborator[]; prizes: Prize[]; season: string }) {
  const sorted = [...collaborators].sort((a, b) => b.points - a.points || a.id - b.id);
  const topCost = prizes.length ? Math.max(...prizes.map((p) => p.cost)) : 0;
  const leader = sorted.length ? Math.max(...sorted.map((p) => p.points)) : 0;
  const scaleMax = Math.max(topCost, leader, 100);
  const isNavidad = season === "navidad";
  const decor = [...(SEASON_DECOR[season] ?? []), ...(SEASON_DECOR[season] ?? [])];

  return (
    <section aria-label="Pista de la carrera">
      <div className="mb-3 flex items-end justify-between gap-3">
        <h2 className="font-pixel text-sm text-[var(--text)] sm:text-base">LA CARRERA</h2>
        <span className="text-xs text-[var(--dim)]">Meta: {scaleMax.toLocaleString("es-MX")} pts</span>
      </div>

      <div className="panel relative overflow-hidden">
        {/* Nieve de Navidad dentro de la pista */}
        {isNavidad && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-10">
            {Array.from({ length: 14 }, (_, i) => (
              <span
                key={i}
                className="snow-flake absolute top-0 block rounded-[1px] bg-white"
                style={{
                  left: `${(i * 67 + 11) % 100}%`,
                  width: `${5 + (i % 3) * 2}px`,
                  height: `${5 + (i % 3) * 2}px`,
                  opacity: 0.85,
                  animationDuration: `${7 + (i % 5) * 1.6}s`,
                  animationDelay: `${(i % 7) * 1.3}s`,
                }}
              />
            ))}
          </div>
        )}

        {/* Decoración de temporada */}
        {season !== "sin-temporada" && decor.length > 0 && (
          <div aria-hidden="true" className="flex items-end justify-between px-3 pt-3 sm:px-4">
            {decor.map((icon, i) => (
              <SeasonIcon key={i} name={icon} size={30} />
            ))}
          </div>
        )}

        {/* Regla de premios */}
        <div className="relative mx-3 mt-3 h-12 sm:mx-4">
          {prizes.map((prize) => {
            const left = Math.min(100, (prize.cost / scaleMax) * 100);
            const isTop = prize.cost === topCost && topCost > 0;
            return (
              <div
                key={prize.id}
                className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
                style={{ left: `${left}%` }}
                title={isTop ? `Premio mayor — ${prize.name}: ${prize.cost.toLocaleString("es-MX")} pts` : `${prize.name}: ${prize.cost.toLocaleString("es-MX")} pts`}
              >
                <span className={isTop ? "inline-flex rounded-full border-2 border-[#e6a817] bg-[#fff3c4] p-0.5 shadow-[0_0_10px_rgba(245,184,30,0.85)]" : "inline-flex"}>
                  <PrizeIcon icon={PRIZE_ICON[prize.id] || "gift"} size={isTop ? 28 : 26} />
                </span>
                <span className="mt-0.5 text-[10px] font-bold" style={{ color: isTop ? "#b8860b" : "var(--dim)" }}>
                  {prize.cost.toLocaleString("es-MX")}
                </span>
              </div>
            );
          })}
          <div className="absolute right-0 top-0 translate-x-1/3">
            <span className="goal-pulse inline-block">
              <FlagIcon size={24} />
            </span>
          </div>
        </div>

        {/* Carriles */}
        <div className="flex flex-col">
          {sorted.map((p, i) => {
            const pct = Math.min(100, (p.points / scaleMax) * 100);
            return (
              <div key={p.id} className="border-t-2 border-dashed border-[var(--border)] px-3 py-2 sm:px-4">
                <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-pixel text-[10px] text-[var(--dim)]">{i + 1}°</span>
                  <span className="text-sm font-bold text-[var(--text)]">{p.name}</span>
                  <TierBadge points={p.points} />
                  <span className="ml-auto font-pixel text-[11px] text-[var(--accent)]">{p.points.toLocaleString("es-MX")} PTS</span>
                </div>
                <div
                  className="relative h-14 rounded-md border-2 border-[var(--border)]"
                  style={{ background: "var(--track)" }}
                  role="img"
                  aria-label={`${p.name} lleva ${p.points.toLocaleString("es-MX")} de ${scaleMax.toLocaleString("es-MX")} puntos`}
                >
                  {[25, 50, 75].map((t) => (
                    <div key={t} className="absolute top-0 h-full w-0 border-l-2 border-dashed border-[var(--border)] opacity-60" style={{ left: `${t}%` }} />
                  ))}
                  <div className="absolute bottom-0 left-0 h-2 bg-[var(--green)] opacity-70 transition-all duration-700" style={{ width: `${pct}%` }} />
                  <div className="absolute bottom-1 transition-all duration-700" style={{ left: `clamp(0px, calc(${pct}% - 22px), calc(100% - 44px))` }}>
                    <span className="sprite-bob inline-block" style={{ animationDelay: `${(i % 5) * 0.15}s` }}>
                      <PixelAvatar sprite={p.sprite} points={p.points} size={44} label={p.name} animated={false} />
                    </span>
                  </div>
                </div>
                <p className="mt-1 text-xs text-[var(--dim)]">Nivel {levelFor(p.points)}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

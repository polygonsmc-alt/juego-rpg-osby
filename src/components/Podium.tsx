"use client";
import type { Collaborator } from "@/lib/types";
import PixelAvatar from "./PixelAvatar";
import TierBadge from "./TierBadge";

// Podio tal cual el Master: tarjetas horizontales, avatar a la izquierda
// (72px el 1°, 60px el 2°), texto a la derecha, línea de ventaja abajo.
export default function Podium({ collaborators }: { collaborators: Collaborator[] }) {
  const sorted = [...collaborators].sort((a, b) => b.points - a.points || a.id - b.id);
  const first = sorted[0] ?? null;
  const second = sorted[1] ?? null;
  if (!first) return null;
  const lead = second ? first.points - second.points : 0;

  function PlaceCard({ p, place }: { p: Collaborator; place: 1 | 2 }) {
    const isFirst = place === 1;
    return (
      <article
        className="panel flex items-center gap-4 p-4"
        style={isFirst ? { borderColor: "#e6a817", borderWidth: 3 } : { borderColor: "#9aa5b1" }}
        aria-label={`${place}° lugar: ${p.name}, ${p.points.toLocaleString("es-MX")} puntos`}
      >
        <div className="flex shrink-0 flex-col items-center gap-1">
          <span className={`font-pixel text-lg ${isFirst ? "prize-gold-cost" : ""}`} style={isFirst ? undefined : { color: "#7d8694" }} aria-hidden="true">
            {place}°
          </span>
          <span className="sprite-bob inline-block">
            <PixelAvatar sprite={p.sprite} points={p.points} size={isFirst ? 72 : 60} label={p.name} />
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className={`font-pixel text-[10px] ${isFirst ? "prize-gold-cost" : ""}`} style={isFirst ? undefined : { color: "var(--dim)" }}>
            {isFirst ? "★ 1° LUGAR ★" : "2° LUGAR"}
          </p>
          <h3 className="mt-1.5 truncate text-lg font-bold text-[var(--text)]">{p.name}</h3>
          <p className="font-pixel mt-1 text-sm text-[var(--accent)]">{p.points.toLocaleString("es-MX")} PTS</p>
          <div className="mt-2">
            <TierBadge points={p.points} />
          </div>
        </div>
      </article>
    );
  }

  return (
    <section aria-label="Podio: primero y segundo lugar">
      <h2 className="font-pixel mb-3 text-sm text-[var(--text)] sm:text-base">PODIO</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <PlaceCard p={first} place={1} />
        {second ? (
          <PlaceCard p={second} place={2} />
        ) : (
          <div className="panel flex items-center p-4 text-sm text-[var(--dim)]" style={{ borderStyle: "dashed" }}>
            El 2° lugar todavía está libre: falta otro corredor en la carrera.
          </div>
        )}
      </div>
      {second &&
        (lead > 0 ? (
          <p className="mt-3 text-center text-sm font-semibold text-[var(--text)]">
            {first.name} le lleva <span className="prize-gold-cost font-pixel text-[12px]">{lead.toLocaleString("es-MX")} pts</span> de ventaja a {second.name}
          </p>
        ) : (
          <p className="mt-3 text-center text-sm font-semibold text-[var(--text)]">
            ¡Empate en la cima! {first.name} y {second.name} van con los mismos puntos.
          </p>
        ))}
    </section>
  );
}

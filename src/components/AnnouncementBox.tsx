"use client";
import type { Announcement } from "@/lib/types";
import Merlin from "./Merlin";
import Corvo from "./Corvo";
import { SleighSprite } from "./sprites";

// Recuadros tal cual el Master: panel horizontal, sprite a la izquierda,
// "MERLÍN DICE:" / "EL CUERVO DE RRHH DICE:" en pixel, chip de bono.
// Solo se muestran los comunicados activos.
function BonusChip({ a, actionLabel }: { a: Announcement; actionLabel?: string | null }) {
  if (a.bonus_multiplier == null) return null;
  return (
    <p className="chip mt-2 inline-flex px-2.5 py-1 text-xs font-bold" style={{ color: "var(--accent)", borderColor: "var(--accent)" }}>
      BONO ACTIVO: puntos ×{a.bonus_multiplier}
      {actionLabel ? ` en «${actionLabel}»` : " en todas las acciones"}
    </p>
  );
}

export function MerlinBox({ announcements, season, actionLabel }: { announcements: Announcement[]; season: string; actionLabel?: (id: number | null) => string | null }) {
  const active = announcements.filter((a) => a.active);
  if (active.length === 0) return null;
  return (
    <section aria-label="Comunicados de Merlín" className="flex h-full flex-col gap-3">
      {active.map((a) => (
        <article key={a.id} className="panel flex flex-1 items-start gap-3 p-4" style={{ borderColor: "#6d4fc2" }}>
          <span className="flex shrink-0 flex-col items-center gap-1">
            <span className="sprite-bob inline-block">
              <Merlin season={season} size={56} caption={false} />
            </span>
            {season === "navidad" && <SleighSprite size={64} />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-pixel text-[10px]" style={{ color: "#6d4fc2" }}>MERLÍN DICE:</p>
            <h3 className="mt-1.5 text-base font-bold text-[var(--text)]">{a.title}</h3>
            {a.body && <p className="mt-1 text-sm text-[var(--dim)]">{a.body}</p>}
            <BonusChip a={a} actionLabel={actionLabel ? actionLabel(a.bonus_action_id) : null} />
          </div>
        </article>
      ))}
    </section>
  );
}

export function CorvoBox({ announcements, season, actionLabel }: { announcements: Announcement[]; season: string; actionLabel?: (id: number | null) => string | null }) {
  const active = announcements.filter((a) => a.active);
  if (active.length === 0) return null;
  return (
    <section aria-label="Comunicados del Cuervo de RRHH" className="flex h-full flex-col gap-3">
      {active.map((a) => (
        <article key={a.id} className="panel flex flex-1 items-start gap-3 p-4" style={{ borderColor: "#3d4fa3" }}>
          <span className="sprite-bob inline-block shrink-0">
            <Corvo season={season} size={60} caption={false} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-pixel text-[10px]" style={{ color: "#3d4fa3" }}>EL CUERVO DE RRHH DICE:</p>
            <h3 className="mt-1.5 text-base font-bold text-[var(--text)]">{a.title}</h3>
            {a.body && <p className="mt-1 text-sm text-[var(--dim)]">{a.body}</p>}
            <BonusChip a={a} actionLabel={actionLabel ? actionLabel(a.bonus_action_id) : null} />
          </div>
        </article>
      ))}
    </section>
  );
}

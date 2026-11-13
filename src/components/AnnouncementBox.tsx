"use client";
import type { Announcement } from "@/lib/types";
import Merlin from "./Merlin";
import Corvo from "./Corvo";

export function MerlinBox({ announcements, season }: { announcements: Announcement[]; season: string }) {
  const active = announcements.filter((a) => a.active);
  return (
    <section className="rounded-2xl border border-purple-400/40 bg-purple-500/10 p-4">
      <div className="flex items-center gap-3"><Merlin season={season} size={72} /><h2 className="text-lg font-bold">MERLÍN</h2></div>
      {active.length === 0 && <p className="mt-2 text-sm opacity-80">Merlín no tiene comunicados activos.</p>}
      {active.map((a) => (
        <article key={a.id} className="mt-3 rounded-lg bg-black/30 p-3">
          <b>{a.title}</b><p className="text-sm">{a.body}</p>
          {a.bonus_multiplier && <p className="text-sm text-yellow-300">Bono ×{a.bonus_multiplier} {a.bonus_action_id ? "en una acción" : "en todas las acciones"}</p>}
        </article>
      ))}
    </section>
  );
}

export function CorvoBox({ announcements, season }: { announcements: Announcement[]; season: string }) {
  const active = announcements.filter((a) => a.active);
  return (
    <section className="rounded-2xl border border-slate-400/40 bg-slate-500/10 p-4">
      <div className="flex items-center gap-3"><Corvo season={season} size={72} /><h2 className="text-lg font-bold">EL CUERVO DE RRHH · CORVO</h2></div>
      {active.length === 0 && <p className="mt-2 text-sm opacity-80">Corvo no tiene comunicados activos.</p>}
      {active.map((a) => (
        <article key={a.id} className="mt-3 rounded-lg bg-black/30 p-3">
          <b>{a.title}</b><p className="text-sm">{a.body}</p>
          {a.bonus_multiplier && <p className="text-sm text-yellow-300">Bono ×{a.bonus_multiplier} {a.bonus_action_id ? "en una acción" : "en todas las acciones"}</p>}
        </article>
      ))}
    </section>
  );
}

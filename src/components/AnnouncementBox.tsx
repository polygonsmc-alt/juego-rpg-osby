"use client";
import type { Announcement } from "@/lib/types";
import Merlin from "./Merlin";
import Corvo from "./Corvo";

export function MerlinBox({ announcements, season }: { announcements: Announcement[]; season: string }) {
  const active = announcements.filter((a) => a.active);
  return (
    <section className="pixel-card relative overflow-hidden rounded-2xl border-2 border-purple-400/50 bg-gradient-to-b from-purple-500/20 to-purple-900/20 p-4">
      <div className="flex items-center gap-3"><Merlin season={season} size={88} /><div><h2 className="pixel-text text-xl font-black">MERLÍN</h2><p className="text-xs text-white/75">El mago del Master · bonos ×2 / ×3</p></div></div>
      {active.length === 0 && <p className="mt-2 text-sm opacity-80">Merlín no tiene comunicados activos.</p>}
      {active.map((a) => (
        <article key={a.id} className="mt-3 rounded-xl border border-purple-300/30 bg-black/40 p-3">
          <b className="text-yellow-200">{a.title}</b><p className="text-sm">{a.body}</p>
          {a.bonus_multiplier && <p className="mt-1 inline-block rounded-full bg-yellow-400 px-2 py-0.5 text-xs font-black text-black">Bono ×{a.bonus_multiplier} {a.bonus_action_id ? "en una acción" : "en todas las acciones"}</p>}
        </article>
      ))}
    </section>
  );
}

export function CorvoBox({ announcements, season }: { announcements: Announcement[]; season: string }) {
  const active = announcements.filter((a) => a.active);
  return (
    <section className="pixel-card relative overflow-hidden rounded-2xl border-2 border-slate-400/50 bg-gradient-to-b from-slate-500/20 to-slate-900/25 p-4">
      <div className="flex items-center gap-3"><Corvo season={season} size={88} /><div><h2 className="pixel-text text-xl font-black">EL CUERVO DE RRHH · CORVO</h2><p className="text-xs text-white/75">Recuadro aparte de Merlín · bonos ×2 / ×3</p></div></div>
      {active.length === 0 && <p className="mt-2 text-sm opacity-80">Corvo no tiene comunicados activos.</p>}
      {active.map((a) => (
        <article key={a.id} className="mt-3 rounded-xl border border-slate-300/30 bg-black/40 p-3">
          <b className="text-sky-200">{a.title}</b><p className="text-sm">{a.body}</p>
          {a.bonus_multiplier && <p className="mt-1 inline-block rounded-full bg-yellow-400 px-2 py-0.5 text-xs font-black text-black">Bono ×{a.bonus_multiplier} {a.bonus_action_id ? "en una acción" : "en todas las acciones"}</p>}
        </article>
      ))}
    </section>
  );
}

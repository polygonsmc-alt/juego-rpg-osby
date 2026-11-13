"use client";
import type { Collaborator } from "@/lib/types";
import { levelFor, nextLevel } from "@/lib/data";
import PixelAvatar from "./PixelAvatar";

export default function Track({ collaborators, season }: { collaborators: Collaborator[]; season: string }) {
  const sorted = [...collaborators].sort((a, b) => b.points - a.points);
  const max = Math.max(100, ...sorted.map((c) => c.points));
  return (
    <section className="rounded-2xl border bg-black/30 p-4">
      <h2 className="text-lg font-bold">🏁 LA CARRERA {season === "navidad" ? "❄️🎄" : season === "halloween" ? "🎃" : ""}</h2>
      {season === "navidad" && <p aria-hidden>❄️ ❄️ ❄️ Nieve cayendo — pinos con luces 🎄</p>}
      <div className="mt-3 space-y-3">
        {sorted.map((c) => {
          const pct = max === 0 ? 0 : Math.round((c.points / max) * 90);
          const next = nextLevel(c.points);
          return (
            <div key={c.id} className="rounded-lg bg-white/5 p-2">
              <div className="flex items-center gap-3">
                <PixelAvatar sprite={c.sprite} size={48} label={c.name} />
                <div className="min-w-[140px]"><b>{c.name}</b><div className="text-sm opacity-80">{c.points} PTS · Nivel {levelFor(c.points)}</div></div>
                <div className="relative h-6 flex-1 rounded-full bg-white/10 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-full bg-yellow-400 transition-all" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-sm w-12 text-right">{pct}%</span>
              </div>
              {next && <p className="mt-1 text-xs opacity-70">Evoluciona a {next.name} en {next.min} pts</p>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

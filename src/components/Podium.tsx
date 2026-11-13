"use client";
import type { Collaborator } from "@/lib/types";
import { levelFor } from "@/lib/data";
import PixelAvatar from "./PixelAvatar";

export default function Podium({ collaborators }: { collaborators: Collaborator[] }) {
  const sorted = [...collaborators].sort((a, b) => b.points - a.points);
  const first = sorted[0];
  const second = sorted[1];
  if (!first) return <div className="rounded-xl border p-4">Aún no hay participantes.</div>;
  const advantage = second ? first.points - second.points : first.points;
  const tied = sorted.length > 1 && sorted[0].points === sorted[1].points;
  return (
    <section aria-label="Podio" className="pixel-card relative overflow-hidden rounded-2xl border-2 border-yellow-500/50 bg-gradient-to-b from-[#122b1c] to-black/60 p-5">
      <h2 className="pixel-text text-center text-2xl font-black tracking-widest text-yellow-300">🏆 PODIO</h2>
      {tied && <p className="mt-1 text-center text-sm font-bold text-yellow-200">Empate en el arranque — ¡todos en {first.points} pts!</p>}
      <div className="mt-4 flex flex-wrap items-end justify-center gap-5">
        <div className="animate-podium min-w-[220px] max-w-[280px] flex-1 rounded-2xl border-4 border-yellow-400 bg-gradient-to-b from-yellow-400/25 to-yellow-600/10 p-5 text-center shadow-[0_0_28px_rgba(245,215,110,.45)]">
          <div className="animate-medal text-4xl">🥇</div>
          <div className="text-2xl font-black text-yellow-300">1°</div>
          <div className="mt-2 flex justify-center"><PixelAvatar sprite={first.sprite} size={96} label={first.name} /></div>
          <div className="pixel-text mt-2 text-lg font-black">{first.name}</div>
          <div className="text-xl font-bold">{first.points} PTS</div>
          <div className="text-sm opacity-90">Nivel {levelFor(first.points)}</div>
          <div className="mt-2 inline-block rounded-full bg-yellow-400 px-3 py-1 text-xs font-black text-black">★ LÍDER ★</div>
        </div>
        {second && (
          <div className="animate-podium min-w-[200px] max-w-[250px] flex-1 rounded-2xl border-4 border-slate-300 bg-gradient-to-b from-slate-300/20 to-slate-500/10 p-5 text-center shadow-[0_0_20px_rgba(203,213,225,.3)]" style={{ animationDelay: ".15s" }} aria-label="Segundo lugar, nivel Novato">
            <div className="animate-medal text-4xl">🥈</div>
            <div className="text-2xl font-black text-slate-200">2°</div>
            <div className="mt-2 flex justify-center"><PixelAvatar sprite={second.sprite} size={88} label={second.name} /></div>
            <div className="pixel-text mt-2 text-lg font-black">{second.name}</div>
            <div className="text-xl font-bold">{second.points} PTS</div>
            <div className="text-sm opacity-90">Nivel {levelFor(second.points)}</div>
          </div>
        )}
      </div>
      {!tied && second ? (
        <p className="mt-4 text-center text-base">Ventaja del 1° sobre el 2°: <b className="text-yellow-300">{advantage} pts</b> — ¡{second.name} lo está alcanzando!</p>
      ) : (
        <p className="mt-4 text-center text-sm text-white/80">Todos empatados en el arranque. ¡Que gane el mejor!</p>
      )}
    </section>
  );
}

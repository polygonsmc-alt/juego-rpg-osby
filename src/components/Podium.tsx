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
    <section aria-label="Podio" className="rounded-2xl border border-yellow-400/40 bg-black/30 p-4">
      <h2 className="text-center text-lg font-bold tracking-wide">🏆 PODIO</h2>
      {tied && <p className="text-center text-sm text-yellow-200">Empate en el arranque — ¡todos en {first.points} pts!</p>}
      <div className="mt-3 flex flex-wrap justify-center gap-4">
        <div className="rounded-xl border-2 border-yellow-400 bg-yellow-400/10 p-4 text-center min-w-[180px]">
          <div className="text-2xl">🥇 1°</div>
          <PixelAvatar sprite={first.sprite} size={64} label={first.name} />
          <div className="font-bold">{first.name}</div>
          <div>{first.points} PTS</div>
          <div className="text-sm opacity-80">Nivel {levelFor(first.points)}</div>
        </div>
        {second && (
          <div className="rounded-xl border-2 border-slate-300 bg-slate-300/10 p-4 text-center min-w-[180px]" aria-label="Segundo lugar, nivel Novato">
            <div className="text-2xl">🥈 2°</div>
            <PixelAvatar sprite={second.sprite} size={64} label={second.name} />
            <div className="font-bold">{second.name}</div>
            <div>{second.points} PTS</div>
            <div className="text-sm opacity-80">Nivel {levelFor(second.points)}</div>
          </div>
        )}
      </div>
      {!tied && second && (
        <p className="mt-3 text-center text-sm">Ventaja del 1° sobre el 2°: <b>{advantage} pts</b></p>
      )}
    </section>
  );
}

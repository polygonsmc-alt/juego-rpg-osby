"use client";
import type { Prize, Collaborator } from "@/lib/types";
import { premioMayor } from "@/lib/data";

export default function PrizeCard({ prize, prizes, leader }: { prize: Prize; prizes: Prize[]; leader: Collaborator | null }) {
  const mayor = premioMayor(prizes);
  const isMayor = mayor?.id === prize.id;
  const out = prize.stock <= 0;
  const leaderPoints = leader?.points ?? 0;
  const pct = Math.min(100, Math.round((leaderPoints / prize.cost) * 100));
  const falta = Math.max(0, prize.cost - leaderPoints);
  return (
    <article
      data-disponibles={prize.stock}
      className={`rounded-2xl border p-4 ${isMayor ? "border-yellow-400 bg-yellow-400/10 ring-2 ring-yellow-400" : "border-white/20 bg-white/5"}`}
    >
      {isMayor && <div className="mb-2 inline-block rounded bg-yellow-400 px-2 py-1 text-xs font-bold text-black">★ PREMIO MAYOR ★</div>}
      <h3 className="font-bold">{prize.name}</h3>
      <p className="text-lg">{prize.cost.toLocaleString("es-MX")} PTS</p>
      <p className="text-sm">{out ? "Agotado" : `Disponibles: ${prize.stock}`}</p>
      <div className="mt-2 h-3 rounded-full bg-white/10 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full ${isMayor ? "bg-yellow-400" : "bg-emerald-400"}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-xs opacity-80">{pct}% — {falta === 0 ? "¡Ya lo puedes pedir en RRHH!" : `Faltan ${falta.toLocaleString("es-MX")} pts`}</p>
      <p className="mt-2 text-center text-sm font-semibold tracking-wide">
        {out ? "¡TE LO GANARON! OBJETO CANJEADO" : "SOLICITAR CANJE EN RRHH"}
      </p>
    </article>
  );
}

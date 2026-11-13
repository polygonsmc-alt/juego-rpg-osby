"use client";
import { useEffect, useState } from "react";
import type { Prize, Collaborator } from "@/lib/types";
import { premioMayor } from "@/lib/data";

export default function PrizeCard({ prize, prizes, leader }: { prize: Prize; prizes: Prize[]; leader: Collaborator | null }) {
  const mayor = premioMayor(prizes);
  const isMayor = mayor?.id === prize.id;
  const out = prize.stock <= 0;
  const leaderPoints = leader?.points ?? 0;
  const pct = Math.min(100, Math.round((leaderPoints / prize.cost) * 100));
  const falta = Math.max(0, prize.cost - leaderPoints);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  return (
    <article
      data-disponibles={prize.stock}
      className={`pixel-card rounded-2xl border p-4 transition-transform hover:-translate-y-1 ${isMayor ? "animate-gold-glow border-yellow-400 bg-gradient-to-b from-yellow-400/20 to-yellow-600/10" : "border-white/20 bg-white/5"}`}
    >
      {isMayor && <div className="gold-banner mb-2 inline-block rounded px-2 py-1 text-xs font-black text-black">★ PREMIO MAYOR ★</div>}
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-black">{prize.name}</h3>
        <span className="text-2xl" aria-hidden>{isMayor ? "🎮🏆" : "🎁"}</span>
      </div>
      <p className="text-lg font-bold">{prize.cost.toLocaleString("es-MX")} PTS</p>
      <p className={`mt-1 inline-block rounded-full px-2 py-0.5 text-sm font-bold ${out ? "bg-red-500/30 text-red-200" : "bg-emerald-500/25 text-emerald-200"}`}>
        {out ? "Agotado" : `Disponibles: ${prize.stock}`}
      </p>
      <div className="mt-3 h-3 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className={`animate-fill h-full ${isMayor ? "bg-yellow-400" : "bg-emerald-400"}`} style={{ width: mounted ? `${pct}%` : "0%" }} />
      </div>
      <p className="mt-1 text-xs opacity-80">{pct}% — {falta === 0 ? "¡Ya lo puedes pedir en RRHH!" : `Faltan ${falta.toLocaleString("es-MX")} pts`}</p>
      <p className={`mt-3 rounded-lg py-2 text-center text-sm font-black tracking-wide ${out ? "bg-red-500/25 text-red-200" : isMayor ? "bg-yellow-400 text-black" : "bg-white/10"}`}>
        {out ? "¡TE LO GANARON! OBJETO CANJEADO" : "SOLICITAR CANJE EN RRHH"}
      </p>
    </article>
  );
}

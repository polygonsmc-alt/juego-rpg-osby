"use client";
import { useEffect, useState } from "react";
import type { Collaborator } from "@/lib/types";
import { levelFor, nextLevel } from "@/lib/data";
import PixelAvatar from "./PixelAvatar";

const GOAL = 100000;

/* 14 copos de nieve con posición / tamaño / duración / retraso distintos */
const FLAKES = [
  { left: "2%", size: 18, dur: "9s", delay: "0s" },
  { left: "7%", size: 12, dur: "11s", delay: "1.2s" },
  { left: "13%", size: 20, dur: "8s", delay: "0.6s" },
  { left: "19%", size: 11, dur: "12s", delay: "2s" },
  { left: "26%", size: 16, dur: "9.5s", delay: "0.3s" },
  { left: "33%", size: 13, dur: "10s", delay: "1.8s" },
  { left: "40%", size: 22, dur: "8.5s", delay: "0.9s" },
  { left: "47%", size: 12, dur: "11.5s", delay: "2.4s" },
  { left: "54%", size: 18, dur: "9s", delay: "0.2s" },
  { left: "61%", size: 14, dur: "10.5s", delay: "1.5s" },
  { left: "68%", size: 20, dur: "8s", delay: "0.8s" },
  { left: "75%", size: 11, dur: "12s", delay: "2.8s" },
  { left: "82%", size: 17, dur: "9.5s", delay: "0.5s" },
  { left: "91%", size: 13, dur: "10s", delay: "1.9s" },
  { left: "96%", size: 19, dur: "8.8s", delay: "1.1s" },
];

function Pine({ left, height = 64, delay = "0s" }: { left: string; height?: number; delay?: string }) {
  return (
    <div className="animate-pine absolute bottom-[58%] flex flex-col items-center" style={{ left, animationDelay: delay }} aria-hidden>
      <div style={{ width: 0, height: 0, borderLeft: `${height * 0.28}px solid transparent`, borderRight: `${height * 0.28}px solid transparent`, borderBottom: `${height * 0.45}px solid #0d5c2e` }} />
      <div style={{ width: 0, height: 0, borderLeft: `${height * 0.36}px solid transparent`, borderRight: `${height * 0.36}px solid transparent`, borderBottom: `${height * 0.5}px solid #127a3d`, marginTop: -height * 0.18 }} />
      <div style={{ width: 0, height: 0, borderLeft: `${height * 0.44}px solid transparent`, borderRight: `${height * 0.44}px solid transparent`, borderBottom: `${height * 0.55}px solid #0f6b34`, marginTop: -height * 0.2 }} />
      <div style={{ width: 8, height: 12, background: "#5b3a1e" }} />
      <span className="animate-twinkle absolute text-[10px]" style={{ top: "18%", left: "30%" }}>✨</span>
      <span className="animate-twinkle absolute text-[10px]" style={{ top: "42%", right: "22%", animationDelay: ".7s" }}>🔴</span>
      <span className="animate-twinkle absolute text-[10px]" style={{ top: "58%", left: "24%", animationDelay: "1.1s" }}>🟡</span>
    </div>
  );
}

export function Snowfall() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {FLAKES.map((f, i) => (
        <span key={i} className="snowflake" style={{ left: f.left, fontSize: f.size, animationDuration: f.dur, animationDelay: f.delay }}>❄</span>
      ))}
    </div>
  );
}

export default function Track({ collaborators, season }: { collaborators: Collaborator[]; season: string }) {
  const sorted = [...collaborators].sort((a, b) => b.points - a.points);
  const isNavidad = season === "navidad";
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  return (
    <section className="pixel-card relative overflow-hidden rounded-2xl border-2 border-emerald-900 bg-[#0a1f14]">
      {/* Cielo + nieve */}
      <div className="pixel-track relative px-4 pt-4 pb-2">
        {isNavidad && <Snowfall />}
        <div className="relative z-10 flex flex-wrap items-end justify-between gap-2">
          <h2 className="pixel-text text-xl font-black tracking-wide text-white">🏁 LA CARRERA {isNavidad ? "❄️🎄" : season === "halloween" ? "🎃" : ""}</h2>
          <span className="rounded bg-black/50 px-2 py-1 text-xs font-bold text-white">META: {GOAL.toLocaleString("es-MX")} PTS · PS5 🏆</span>
        </div>
        {isNavidad && <p className="relative z-10 mt-1 text-sm text-white/90">❄️ ❄️ ❄️ Nieve cayendo — pinos con luces 🎄</p>}

        {/* Bosque / pinos */}
        <div className="relative mt-2 h-[74px]" aria-hidden>
          <Pine left="1%" height={58} />
          <Pine left="12%" height={72} delay=".6s" />
          <Pine left="86%" height={66} delay="1s" />
          <Pine left="95%" height={54} delay=".3s" />
          {/* Trineo de Merlín deslizándose sobre la pista */}
          <div className="animate-sled absolute right-[38%] top-1 text-3xl" title="Merlín en trineo">🛷🎅🎁</div>
          <div className="absolute left-1/2 top-2 -translate-x-1/2 rounded-full bg-white/15 px-3 py-0.5 text-xs text-white">☁️ Bosque nevado ☁️</div>
        </div>

        {/* Carriles: corredor que SE MUEVE por puntos / 100000 */}
        <div className="relative z-10 space-y-2 pb-2">
          {sorted.map((c, idx) => {
            const pct = Math.min(100, (c.points / GOAL) * 100);
            const pos = 1 + (mounted ? pct * 0.88 : 0); // 1% .. 89% del ancho
            const next = nextLevel(c.points);
            return (
              <div key={c.id} className="relative">
                <div className="track-ground relative h-[64px] overflow-hidden rounded-lg">
                  {/* línea de salida / meta */}
                  <div className="checker-vertical absolute left-0 top-0 h-full w-[14px] opacity-90" aria-hidden />
                  <div className="checker-vertical absolute right-0 top-0 h-full w-[14px] opacity-90" aria-hidden />
                  <span className="absolute left-[18px] top-1 text-[10px] font-bold text-white/80">SALIDA</span>
                  <span className="absolute right-[18px] top-1 text-[10px] font-bold text-white/80">🏁 META</span>
                  {/* corredor */}
                  <div
                    className="animate-runner-enter absolute bottom-[4px] transition-all duration-[1200ms] ease-out"
                    style={{ left: `${pos}%`, transitionDelay: `${idx * 150}ms` }}
                  >
                    <PixelAvatar sprite={c.sprite} size={52} label={c.name} animated />
                  </div>
                  {/* sombra del corredor */}
                  <div className="absolute bottom-[2px] h-[6px] w-[44px] rounded-full bg-black/40 blur-[1px]" style={{ left: `calc(${pos}% + 4px)` }} />
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-white">
                  <b className="pixel-text">{c.name}</b>
                  <span>{c.points} PTS · Nivel {levelFor(c.points)}</span>
                  <span className="ml-auto font-mono">{pct.toFixed(2)}%</span>
                  <div className="h-2 w-28 overflow-hidden rounded-full bg-white/15">
                    <div className="animate-fill h-full bg-yellow-400" style={{ width: `${pct}%` }} />
                  </div>
                </div>
                {next && <p className="text-xs text-white/75">Evoluciona a {next.name} en {next.min} pts</p>}
              </div>
            );
          })}
        </div>
      </div>
      <p className="bg-black/40 px-4 py-2 text-center text-xs text-white/80">
        La posición avanza con los puntos: 100.000 pts = PS5, la meta. Al sumar puntos el monito camina hacia la meta.
      </p>
    </section>
  );
}

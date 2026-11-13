"use client";
import { useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { COLLABORATORS_SEED, PRIZES_SEED, MERLIN_SEED, CORVO_SEED, SETTINGS_SEED, THEMES } from "@/lib/data";
import type { GameState, Collaborator } from "@/lib/types";
import Podium from "@/components/Podium";
import Track, { Snowfall } from "@/components/Track";
import PrizeCard from "@/components/PrizeCard";
import { MerlinBox, CorvoBox } from "@/components/AnnouncementBox";
import PixelAvatar from "@/components/PixelAvatar";
import { levelFor } from "@/lib/data";

const SEED_STATE: GameState = {
  collaborators: COLLABORATORS_SEED,
  prizes: PRIZES_SEED,
  events: [],
  redemptions: [],
  announcements: MERLIN_SEED,
  crow_announcements: CORVO_SEED,
  settings: SETTINGS_SEED,
};

export default function LaCarrera() {
  const [state, setState] = useState<GameState>(SEED_STATE);
  const [live, setLive] = useState(false);

  async function load() {
    if (!isSupabaseConfigured) return;
    const [c, p, e, r, a, ca, s] = await Promise.all([
      supabase.from("collaborators").select("*").order("points", { ascending: false }),
      supabase.from("prizes").select("*").order("cost", { ascending: true }),
      supabase.from("point_events").select("*").order("created_at", { ascending: false }).limit(20),
      supabase.from("redemptions").select("*").eq("status", "approved").order("created_at", { ascending: false }),
      supabase.from("announcements").select("*").order("id"),
      supabase.from("crow_announcements").select("*").order("id"),
      supabase.from("settings").select("*").eq("id", 1).single(),
    ]);
    setState((prev) => ({
      collaborators: (c.data as Collaborator[]) || prev.collaborators,
      prizes: p.data || prev.prizes,
      events: e.data || prev.events,
      redemptions: r.data || prev.redemptions,
      announcements: a.data || prev.announcements,
      crow_announcements: ca.data || prev.crow_announcements,
      settings: (s.data as GameState["settings"]) || prev.settings,
    }));
    setLive(true);
  }

  useEffect(() => {
    load();
    if (!isSupabaseConfigured) return;
    const channel = supabase
      .channel("carrera")
      .on("postgres_changes", { event: "*", schema: "public", table: "collaborators" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "point_events" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "prizes" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "redemptions" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "announcements" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "crow_announcements" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "settings" }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const theme = THEMES[state.settings.theme] || THEMES.bosque;
  const sorted = [...state.collaborators].sort((a, b) => b.points - a.points);
  const leader = sorted[0] || null;
  const isNavidad = state.settings.season === "navidad";

  return (
    <main style={{ background: `linear-gradient(180deg, #071a10 0%, ${theme.bg} 30%, #071a10 100%)` }} className="relative min-h-screen overflow-hidden p-4 text-white md:p-6">
      {isNavidad && (
        <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
          <Snowfall />
        </div>
      )}
      <header className="relative z-10 mx-auto max-w-6xl text-center">
        <div className="mx-auto mb-2 flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-yellow-400/60 bg-black/40 text-3xl shadow-[0_0_20px_rgba(245,215,110,.35)]" aria-hidden>🎮</div>
        <h1 className="pixel-text text-2xl font-black tracking-wide md:text-4xl">{state.settings.company_name}</h1>
        <p className="mt-1 font-bold text-yellow-200">🎮 Juego RPG de Metas — La Carrera {live ? "· en vivo" : "· vista de ejemplo (configura Supabase)"}</p>
        <p className="text-sm opacity-80">Tema {theme.label} · Temporada {state.settings.season} · Solo visual — para canjear, ve a RRHH</p>
        <a href="/master" className="mt-3 inline-block rounded-full border border-white/30 bg-white/10 px-4 py-1.5 text-sm font-bold underline">Ir al Panel Master →</a>
      </header>

      <div className="relative z-10 mx-auto mt-6 max-w-6xl space-y-6">
        <Podium collaborators={state.collaborators} />

        <section className="pixel-card rounded-2xl border-2 border-white/20 bg-black/40 p-4">
          <h2 className="text-lg font-black">Canjes realizados</h2>
          {state.redemptions.length === 0 ? (
            <p>Aún no hay canjes, ¡sé el primero en llegar a un premio!</p>
          ) : (
            <ul className="list-disc pl-5">
              {state.redemptions.map((r) => {
                const who = state.collaborators.find((c) => c.id === r.collaborator_id);
                return <li key={r.id}>{who?.name} canjeó {r.prize_name} ({r.cost} pts), {new Date(r.created_at).toLocaleString("es-MX")}</li>;
              })}
            </ul>
          )}
        </section>

        <Track collaborators={state.collaborators} season={state.settings.season} />

        <div className="grid gap-4 md:grid-cols-2">
          <MerlinBox announcements={state.announcements} season={state.settings.season} />
          <CorvoBox announcements={state.crow_announcements} season={state.settings.season} />
        </div>

        <section>
          <h2 className="pixel-text mb-3 text-xl font-black">🏆 Ranking</h2>
          <div className="grid gap-3">
            {sorted.map((c, i) => (
              <div key={c.id} className="pixel-card flex items-center gap-3 rounded-xl border border-white/15 bg-white/5 p-3">
                <span className="w-8 text-xl font-black">{i + 1}°</span>
                <PixelAvatar sprite={c.sprite} size={48} label={c.name} />
                <div><b>{c.name}</b><div className="text-sm opacity-80">{c.points} PTS · Nivel {levelFor(c.points)}</div></div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="pixel-text mb-3 text-xl font-black">🎁 Premios</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {state.prizes.map((p) => <PrizeCard key={p.id} prize={p} prizes={state.prizes} leader={leader} />)}
          </div>
          <p className="mt-2 text-sm opacity-70">Vista totalmente visual: sin botones ni selectores. Cada premio solo dice “SOLICITAR CANJE EN RRHH”.</p>
        </section>

        <section className="pixel-card rounded-2xl border border-white/15 bg-black/40 p-4">
          <h2 className="text-lg font-black">Actividad reciente</h2>
          {state.events.length === 0 ? <p className="text-sm opacity-70">Aún no hay movimientos. Todos empiezan en 0 pts.</p> : (
            <ul className="space-y-1 text-sm">
              {state.events.slice(0, 10).map((e) => (
                <li key={e.id}>{e.label} — {e.points > 0 ? `+${e.points}` : e.points} pts {e.bonus_from ? `(bono de ${e.bonus_from})` : ""} {e.reversed ? "· DESHECHO" : ""}</li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

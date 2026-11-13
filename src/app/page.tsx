"use client";
import { useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { COLLABORATORS_SEED, PRIZES_SEED, MERLIN_SEED, CORVO_SEED, SETTINGS_SEED, THEMES } from "@/lib/data";
import type { GameState, Collaborator } from "@/lib/types";
import Podium from "@/components/Podium";
import Track from "@/components/Track";
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
    // Realtime: cualquier cambio en Master actualiza La Carrera en <5s
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

  return (
    <main style={{ background: theme.bg }} className="min-h-screen p-4 md:p-6">
      <header className="mx-auto max-w-6xl text-center">
        <h1 className="text-2xl md:text-3xl font-black tracking-wide">{state.settings.company_name}</h1>
        <p className="opacity-80">🎮 Juego RPG de Metas — La Carrera {live ? "· en vivo" : "· vista de ejemplo (configura Supabase)"}</p>
        <p className="text-sm opacity-70">Tema {theme.label} · Temporada {state.settings.season} · Solo visual — para canjear, ve a RRHH</p>
        <a href="/master" className="mt-2 inline-block rounded bg-white/10 px-3 py-1 text-sm underline">Ir al Panel Master</a>
      </header>

      <div className="mx-auto mt-6 max-w-6xl space-y-6">
        <Podium collaborators={state.collaborators} />

        <section className="rounded-2xl border bg-black/30 p-4">
          <h2 className="text-lg font-bold">Canjes realizados</h2>
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

        <div className="grid md:grid-cols-2 gap-4">
          <MerlinBox announcements={state.announcements} season={state.settings.season} />
          <CorvoBox announcements={state.crow_announcements} season={state.settings.season} />
        </div>

        <section>
          <h2 className="text-xl font-bold mb-3">🏆 Ranking</h2>
          <div className="grid gap-3">
            {sorted.map((c, i) => (
              <div key={c.id} className="flex items-center gap-3 rounded-xl bg-white/5 p-3">
                <span className="text-xl font-bold w-8">{i + 1}°</span>
                <PixelAvatar sprite={c.sprite} size={48} label={c.name} />
                <div><b>{c.name}</b><div className="text-sm opacity-80">{c.points} PTS · Nivel {levelFor(c.points)}</div></div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-3">🎁 Premios</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {state.prizes.map((p) => <PrizeCard key={p.id} prize={p} prizes={state.prizes} leader={leader} />)}
          </div>
          <p className="mt-2 text-sm opacity-70">Vista totalmente visual: sin botones ni selectores. Cada premio solo dice “SOLICITAR CANJE EN RRHH”.</p>
        </section>

        <section className="rounded-2xl border bg-black/30 p-4">
          <h2 className="text-lg font-bold">Actividad reciente</h2>
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

"use client";
import { useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { COLLABORATORS_SEED, PRIZES_SEED, MERLIN_SEED, CORVO_SEED, SETTINGS_SEED, ACTIONS, PENALTIES, nextLevel } from "@/lib/data";
import type { GameState, Collaborator } from "@/lib/types";
import Podium from "@/components/Podium";
import Track from "@/components/Track";
import PrizeCard from "@/components/PrizeCard";
import { MerlinBox, CorvoBox } from "@/components/AnnouncementBox";
import PixelAvatar from "@/components/PixelAvatar";
import TierBadge from "@/components/TierBadge";

const SEED_STATE: GameState = {
  collaborators: COLLABORATORS_SEED,
  action_types: ACTIONS,
  penalty_types: PENALTIES,
  prizes: PRIZES_SEED,
  events: [],
  redemptions: [],
  announcements: MERLIN_SEED,
  crow_announcements: CORVO_SEED,
  settings: SETTINGS_SEED,
};

const fmt = (n: number) => n.toLocaleString("es-MX");

function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "ahora mismo";
  if (mins < 60) return `hace ${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

export default function LaCarrera() {
  const [state, setState] = useState<GameState>(SEED_STATE);
  const [live, setLive] = useState(false);

  async function load() {
    if (!isSupabaseConfigured) return;
    const [c, at, p, e, r, a, ca, s] = await Promise.all([
      supabase.from("collaborators").select("*").order("points", { ascending: false }),
      supabase.from("action_types").select("*").order("id"),
      supabase.from("prizes").select("*").order("cost", { ascending: true }),
      supabase.from("point_events").select("*").order("created_at", { ascending: false }).limit(20),
      supabase.from("redemptions").select("*").eq("status", "approved").order("created_at", { ascending: false }),
      supabase.from("announcements").select("*").order("id"),
      supabase.from("crow_announcements").select("*").order("id"),
      supabase.from("settings").select("*").eq("id", 1).single(),
    ]);
    setState((prev) => ({
      collaborators: (c.data as Collaborator[]) || prev.collaborators,
      action_types: (at.data as GameState["action_types"])?.length ? (at.data as GameState["action_types"]) : prev.action_types,
      penalty_types: prev.penalty_types, // La Carrera no muestra faltas; se conserva el seed
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
      .on("postgres_changes", { event: "*", schema: "public", table: "action_types" }, load)
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

  const sorted = [...state.collaborators].sort((a, b) => b.points - a.points || a.id - b.id);
  const actionLabel = (id: number | null) => {
    if (id == null) return null;
    return (state.action_types?.length ? state.action_types : ACTIONS).find((a) => a.id === id)?.label ?? null;
  };

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]" data-theme={state.settings.theme} data-season={state.settings.season}>
      <main className="mx-auto w-full max-w-6xl px-3 pb-10 pt-4 sm:px-4">
        {/* Nombre y logo de la empresa (Master) */}
        {(state.settings.company_name || state.settings.logo_url) && (
          <div className="mb-5 flex items-center gap-3">
            {state.settings.logo_url && (
              <img src={state.settings.logo_url} alt={`Logo de ${state.settings.company_name ?? "la empresa"}`} className="h-12 w-auto max-w-40 rounded-md border-2 border-[var(--border)] bg-[var(--surface)] object-contain p-1" />
            )}
            {state.settings.company_name && (
              <p className="font-pixel text-base text-[var(--text)] sm:text-lg">{state.settings.company_name}</p>
            )}
          </div>
        )}

        {/* Cambio de vista (Master) */}
        <div className="panel mb-5 flex p-1.5" role="tablist" aria-label="Cambiar vista">
          <a href="/" role="tab" aria-selected="true" className="min-h-11 flex-1 rounded-md px-3 py-2 text-center font-pixel text-[11px] sm:text-xs" style={{ background: "var(--accent)", color: "#14161f" }}>LA CARRERA</a>
          <a href="/master" role="tab" aria-selected="false" className="min-h-11 flex-1 rounded-md px-3 py-2 text-center font-pixel text-[11px] text-[var(--text)] sm:text-xs">PANEL MASTER</a>
        </div>

        {!live && (
          <p className="mb-5 rounded-md border-2 border-dashed border-[var(--border)] px-4 py-3 text-sm text-[var(--dim)]">
            🎮 Juego RPG de Metas — La Carrera · vista de ejemplo (configura Supabase) · Solo visual — para canjear, ve a RRHH
          </p>
        )}

        <div className="flex flex-col gap-6">
          {/* Merlín y Corvo siempre arriba: lado a lado en escritorio, apilados en móvil */}
          <div className="grid items-stretch gap-6 md:grid-cols-2">
            <MerlinBox announcements={state.announcements} season={state.settings.season} actionLabel={actionLabel} />
            <CorvoBox announcements={state.crow_announcements} season={state.settings.season} actionLabel={actionLabel} />
          </div>

          <Podium collaborators={state.collaborators} />

          {/* Canjes realizados */}
          <section aria-label="Canjes realizados: objetos canjeados" className="panel p-4 sm:p-5" style={{ borderColor: "var(--green)" }}>
            <h2 className="font-pixel text-sm text-[var(--text)] sm:text-base">CANJES REALIZADOS</h2>
            <p className="mt-1 text-xs font-bold text-[var(--dim)]">OBJETOS CANJEADOS</p>
            {state.redemptions.length === 0 ? (
              <p className="mt-3 text-sm font-semibold text-[var(--text)]">Aún no hay canjes, ¡sé el primero en llegar a un premio!</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {state.redemptions.slice(0, 6).map((r) => {
                  const who = state.collaborators.find((c) => c.id === r.collaborator_id);
                  return (
                    <li key={r.id} className="rounded-md border-2 border-[var(--border)] bg-[var(--surface-alt)] px-3 py-2.5 text-sm">
                      <span className="font-bold text-[var(--text)]">{who?.name ?? "Alguien"}</span>{" "}
                      <span className="text-[var(--dim)]">canjeó</span>{" "}
                      <span className="font-bold text-[var(--text)]">{r.prize_name}</span>{" "}
                      <span className="text-[var(--dim)]">({fmt(r.cost)} pts)</span>
                      <span className="block text-xs text-[var(--dim)]">{new Date(r.resolved_at ?? r.created_at).toLocaleString("es-MX")}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-3 text-xs text-[var(--dim)]">
              ¿Ya te alcanza para un premio? Pídelo en persona: <strong className="text-[var(--text)]">solicitar canje en RRHH</strong>. Solo el Master registra el canje y descuenta los puntos.
            </p>
          </section>

          <Track collaborators={state.collaborators} prizes={state.prizes} season={state.settings.season} />

          <div className="grid gap-6 lg:grid-cols-5">
            {/* Ranking + Actividad */}
            <section aria-label="Ranking" className="lg:col-span-2">
              <h2 className="font-pixel mb-3 text-sm text-[var(--text)]">RANKING</h2>
              <ol className="panel flex flex-col divide-y-2 divide-[var(--border)]">
                {sorted.map((p, i) => {
                  const next = [...state.prizes].sort((a, b) => a.cost - b.cost).find((pr) => pr.cost > p.points) ?? null;
                  const upcoming = nextLevel(p.points);
                  return (
                    <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                      <span className="font-pixel w-7 shrink-0 text-center text-xs" style={{ color: i === 0 ? "var(--gold)" : i === 1 ? "#9aa5b1" : i === 2 ? "#e08a4c" : "var(--dim)" }}>{i + 1}</span>
                      <PixelAvatar sprite={p.sprite} points={p.points} size={34} label={p.name} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-[var(--text)]">{p.name}</p>
                        <p className="text-xs text-[var(--dim)]">
                          {next ? `A ${fmt(next.cost - p.points)} pts de: ${next.name}` : "¡Ya le alcanza para el premio mayor!"}
                          {upcoming ? ` · Evoluciona a ${upcoming.name} en ${fmt(upcoming.min)}` : " · Nivel máximo"}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-pixel text-[11px] text-[var(--text)]">{fmt(p.points)}</p>
                        <TierBadge points={p.points} />
                      </div>
                    </li>
                  );
                })}
              </ol>

              {state.events.length > 0 && (
                <>
                  <h2 className="font-pixel mb-3 mt-6 text-sm text-[var(--text)]">ACTIVIDAD</h2>
                  <ul className="panel flex flex-col divide-y divide-[var(--border)]">
                    {state.events.slice(0, 8).map((e) => {
                      const who = state.collaborators.find((c) => c.id === e.collaborator_id);
                      return (
                        <li key={e.id} className="px-4 py-2.5 text-sm">
                          <span className="font-semibold text-[var(--text)]">{who?.name ?? ""}</span>{" "}
                          <span className={`text-[var(--dim)] ${e.reversed ? "line-through" : ""}`}>{e.label}</span>{" "}
                          {e.reversed && <span className="font-bold" style={{ color: "var(--red)" }}>(deshecho) </span>}
                          <span className="font-bold" style={{ color: e.points >= 0 ? "var(--green)" : "var(--red)" }}>
                            {e.points >= 0 ? "+" : ""}{fmt(e.points)}
                          </span>
                          <span className="block text-xs text-[var(--dim)]">{timeAgo(e.created_at)}</span>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </section>

            {/* Premios: solo visual */}
            <section aria-label="Premios" className="lg:col-span-3">
              <h2 className="font-pixel mb-3 text-sm text-[var(--text)]">PREMIOS</h2>
              <p className="mb-4 rounded-md border-2 border-dashed border-[var(--border)] px-4 py-3 text-sm text-[var(--dim)]">
                Esta vista es solo para ver. Cuando te alcance para un premio, pídelo en persona:{" "}
                <strong className="text-[var(--text)]">solicitar canje en RRHH</strong>. Aquí no se toca nada: solo el Master registra el canje y descuenta los puntos.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                {state.prizes.map((p) => <PrizeCard key={p.id} prize={p} prizes={state.prizes} redemptions={state.redemptions} />)}
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

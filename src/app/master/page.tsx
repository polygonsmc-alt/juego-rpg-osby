"use client";
import { useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { ACTIONS, PENALTIES, COLLABORATORS_SEED, PRIZES_SEED, MERLIN_SEED, CORVO_SEED, SETTINGS_SEED, AVATAR_NAMES, THEMES, levelFor } from "@/lib/data";
import type { GameState, Collaborator } from "@/lib/types";
import { awardPoints, deductPoints, directRedeem, undoEvent } from "@/lib/actions";
import PixelAvatar from "@/components/PixelAvatar";
import Podium from "@/components/Podium";
import Track from "@/components/Track";

const SEED: GameState = {
  collaborators: COLLABORATORS_SEED, prizes: PRIZES_SEED, events: [], redemptions: [],
  announcements: MERLIN_SEED, crow_announcements: CORVO_SEED, settings: SETTINGS_SEED,
};

export default function Master() {
  const [state, setState] = useState<GameState>(SEED);
  const [collabId, setCollabId] = useState(1);
  const [actionId, setActionId] = useState(1);
  const [penaltyId, setPenaltyId] = useState(1);
  const [penaltyReason, setPenaltyReason] = useState("");
  const [customPoints, setCustomPoints] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [prizeId, setPrizeId] = useState(1);
  const [msg, setMsg] = useState("");

  async function load() {
    if (!isSupabaseConfigured) return;
    const [c, p, e, r, a, ca, s] = await Promise.all([
      supabase.from("collaborators").select("*").order("id"),
      supabase.from("prizes").select("*").order("cost"),
      supabase.from("point_events").select("*").order("created_at", { ascending: false }).limit(30),
      supabase.from("redemptions").select("*").order("created_at", { ascending: false }),
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
  }
  useEffect(() => { load(); }, []);

  async function refresh() { await load(); }

  async function doAward() {
    const a = ACTIONS.find((x) => x.id === actionId)!;
    const res = await awardPoints(collabId, a.id, a.label, a.points);
    setMsg(res.ok ? `+${res.points} pts${res.bonus_from ? ` (bono × de ${res.bonus_from})` : ""}` : `Error: ${res.error}`);
    await refresh();
  }
  async function doDeduct() {
    const p = PENALTIES.find((x) => x.id === penaltyId)!;
    const res = await deductPoints(collabId, p.label, p.points, penaltyReason || undefined);
    setMsg(res.ok ? `${p.points} pts — saldo nunca baja de 0` : `Error: ${res.error}`);
    await refresh();
  }
  async function doCustomDeduct() {
    const n = Math.abs(parseInt(customPoints || "0", 10));
    if (!n) return;
    const res = await deductPoints(collabId, customReason || "Resta personalizada", -n, customReason);
    setMsg(res.ok ? `-${n} pts (${customReason})` : `Error: ${res.error}`);
    await refresh();
  }
  async function doRedeem() {
    const res = await directRedeem(collabId, prizeId);
    setMsg(res.ok ? "Canje directo aprobado — puntos y stock descontados" : `No se pudo canjear: ${res.error}`);
    await refresh();
  }
  async function doUndo(id: number) {
    const res = await undoEvent(id);
    setMsg(res.ok ? "Movimiento deshecho (queda en historial como DESHECHO)" : `No se pudo deshacer: ${res.error}`);
    await refresh();
  }
  async function changeStock(prizeIdNum: number, delta: number) {
    const prize = state.prizes.find((p) => p.id === prizeIdNum);
    if (!prize) return;
    const next = Math.max(0, prize.stock + delta);
    if (isSupabaseConfigured) await supabase.from("prizes").update({ stock: next }).eq("id", prizeIdNum);
    setState((s) => ({ ...s, prizes: s.prizes.map((p) => (p.id === prizeIdNum ? { ...p, stock: next } : p)) }));
  }
  async function toggleAnnouncement(table: "announcements" | "crow_announcements", id: number, active: boolean) {
    if (isSupabaseConfigured) await supabase.from(table).update({ active: !active }).eq("id", id);
    await refresh();
  }
  async function deleteAnnouncement(table: "announcements" | "crow_announcements", id: number) {
    if (!confirm("¿Borrar este comunicado?")) return;
    if (isSupabaseConfigured) await supabase.from(table).delete().eq("id", id);
    await refresh();
  }
  async function saveSettings(company: string, theme: string, season: string) {
    if (isSupabaseConfigured) await supabase.from("settings").update({ company_name: company, theme, season }).eq("id", 1);
    setState((s) => ({ ...s, settings: { ...s.settings, company_name: company, theme: theme as never, season: season as never } }));
    setMsg("Empresa / tema / temporada guardados");
  }

  const collab = state.collaborators.find((c) => c.id === collabId) || state.collaborators[0];

  return (
    <main className="min-h-screen bg-[#0f2a1d] p-4 md:p-6 text-white">
      <header className="mx-auto max-w-6xl">
        <h1 className="text-2xl font-black">Panel Master — {state.settings.company_name}</h1>
        <p className="opacity-80">Solo Osbed / Master. <a href="/" className="underline">Ver La Carrera</a></p>
        {!isSupabaseConfigured && <p className="mt-2 rounded bg-yellow-400/20 p-2 text-sm">Modo ejemplo: configura NEXT_PUBLIC_SUPABASE_URL y ANON_KEY en .env.local para guardar en Supabase.</p>}
        {msg && <p className="mt-2 rounded bg-emerald-500/20 p-2 text-sm">{msg}</p>}
      </header>

      <div className="mx-auto mt-6 max-w-6xl space-y-6">
        <Podium collaborators={state.collaborators} />
        <Track collaborators={state.collaborators} season={state.settings.season} />

        {/* Sumar puntos */}
        <section className="rounded-2xl border bg-black/30 p-4">
          <h2 className="text-lg font-bold">➕ Sumar puntos</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            <select value={collabId} onChange={(e) => setCollabId(Number(e.target.value))} className="rounded bg-white text-black px-2 py-2">
              {state.collaborators.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.points} pts · {levelFor(c.points)}</option>)}
            </select>
            <select value={actionId} onChange={(e) => setActionId(Number(e.target.value))} className="rounded bg-white text-black px-2 py-2">
              {ACTIONS.map((a) => <option key={a.id} value={a.id}>{a.label} — {a.points} pts</option>)}
            </select>
            <button onClick={doAward} className="rounded bg-emerald-500 px-4 py-2 font-bold">Sumar</button>
          </div>
          <p className="mt-2 text-sm opacity-80">Si Merlín o Corvo tienen bono activo, se aplica el más fuerte (×2 o ×3), no se suman.</p>
          {collab && <div className="mt-2 flex items-center gap-2"><PixelAvatar sprite={collab.sprite} size={40} /><span>{collab.name} — {collab.points} pts</span></div>}
        </section>

        {/* Restar puntos */}
        <section className="rounded-2xl border bg-black/30 p-4">
          <h2 className="text-lg font-bold">➖ Restar puntos</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            <select value={penaltyId} onChange={(e) => setPenaltyId(Number(e.target.value))} className="rounded bg-white text-black px-2 py-2">
              {PENALTIES.map((p) => <option key={p.id} value={p.id}>{p.label} — {p.points} pts</option>)}
            </select>
            <input value={penaltyReason} onChange={(e) => setPenaltyReason(e.target.value)} placeholder="Motivo (ej. Llegó tarde a la junta)" className="rounded bg-white text-black px-2 py-2 flex-1 min-w-[200px]" />
            <button onClick={doDeduct} className="rounded bg-red-500 px-4 py-2 font-bold">Restar</button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <input value={customPoints} onChange={(e) => setCustomPoints(e.target.value)} placeholder="Puntos a restar" type="number" className="rounded bg-white text-black px-2 py-2 w-32" />
            <input value={customReason} onChange={(e) => setCustomReason(e.target.value)} placeholder="Motivo personalizado" className="rounded bg-white text-black px-2 py-2 flex-1 min-w-[200px]" />
            <button onClick={doCustomDeduct} className="rounded bg-red-700 px-4 py-2 font-bold">Resta personalizada</button>
          </div>
        </section>

        {/* Deshacer */}
        <section className="rounded-2xl border bg-black/30 p-4">
          <h2 className="text-lg font-bold">↩️ DESHACER / RETROCEDER PUNTOS</h2>
          <button onClick={() => state.events[0] && doUndo(state.events[0].id)} className="mt-2 rounded bg-yellow-400 px-4 py-2 font-bold text-black">Deshacer último movimiento</button>
          <ul className="mt-3 space-y-2 text-sm">
            {state.events.slice(0, 10).map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2 rounded bg-white/5 p-2">
                <span>{e.label} — {e.points > 0 ? `+${e.points}` : e.points} pts · {new Date(e.created_at).toLocaleString("es-MX")} {e.reversed ? "· DESHECHO" : ""}</span>
                {!e.reversed && <button onClick={() => doUndo(e.id)} className="rounded bg-white/20 px-2 py-1">Deshacer</button>}
              </li>
            ))}
            {state.events.length === 0 && <li className="opacity-70">Sin movimientos aún.</li>}
          </ul>
        </section>

        {/* Canje directo */}
        <section className="rounded-2xl border bg-black/30 p-4">
          <h2 className="text-lg font-bold">🎁 Canje directo · Solo Master</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            <select value={prizeId} onChange={(e) => setPrizeId(Number(e.target.value))} className="rounded bg-white text-black px-2 py-2">
              {state.prizes.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.cost} pts · {p.stock <= 0 ? "AGOTADO" : `${p.stock} disponibles`}</option>)}
            </select>
            <button onClick={doRedeem} className="rounded bg-yellow-400 px-4 py-2 font-bold text-black">Aprobar y descontar</button>
          </div>
          <h3 className="mt-4 font-bold">Solicitudes de canje pendientes</h3>
          {state.redemptions.filter((r) => r.status === "pending").length === 0 ? <p className="text-sm opacity-70">No hay solicitudes pendientes.</p> : (
            <ul className="text-sm">{state.redemptions.filter((r) => r.status === "pending").map((r) => <li key={r.id}>{r.prize_name} — {r.cost} pts</li>)}</ul>
          )}
          <h3 className="mt-4 font-bold">Canjes realizados</h3>
          {state.redemptions.filter((r) => r.status === "approved").length === 0 ? <p className="text-sm opacity-70">Aún no hay canjes, ¡sé el primero en llegar a un premio!</p> : (
            <ul className="text-sm">{state.redemptions.filter((r) => r.status === "approved").map((r) => <li key={r.id}>{r.prize_name} — {r.cost} pts</li>)}</ul>
          )}
        </section>

        {/* Premios + stock */}
        <section className="rounded-2xl border bg-black/30 p-4">
          <h2 className="text-lg font-bold">🏆 PREMIOS — stock</h2>
          <div className="mt-2 grid gap-2">
            {state.prizes.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded bg-white/5 p-2">
                <b className="flex-1">{p.name} — {p.cost} pts</b>
                <button onClick={() => changeStock(p.id, -1)} className="rounded bg-white/20 px-3 py-1">−</button>
                <span>{p.stock <= 0 ? "AGOTADO" : `Disponibles: ${p.stock}`}</span>
                <button onClick={() => changeStock(p.id, 1)} className="rounded bg-white/20 px-3 py-1">+</button>
              </div>
            ))}
          </div>
        </section>

        {/* Merlín */}
        <section className="rounded-2xl border border-purple-400/40 bg-purple-500/10 p-4">
          <h2 className="text-lg font-bold">🧙 MERLÍN — Comunicados</h2>
          {state.announcements.map((a) => (
            <div key={a.id} className="mt-2 rounded bg-black/30 p-3 text-sm">
              <b>{a.title}</b><p>{a.body}</p>
              <p>Bono: {a.bonus_multiplier ? `×${a.bonus_multiplier}` : "sin bono"} · {a.active ? "Activo" : "Apagado"}</p>
              <div className="mt-1 flex gap-2">
                <button onClick={() => toggleAnnouncement("announcements", a.id, a.active)} className="rounded bg-white/20 px-2 py-1">{a.active ? "Apagar" : "Prender"}</button>
                <button onClick={() => deleteAnnouncement("announcements", a.id)} className="rounded bg-red-500/60 px-2 py-1">Borrar</button>
              </div>
            </div>
          ))}
        </section>

        {/* Corvo */}
        <section className="rounded-2xl border border-slate-400/40 bg-slate-500/10 p-4">
          <h2 className="text-lg font-bold">🐦‍⬛ EL CUERVO DE RRHH · CORVO — Comunicados</h2>
          <p className="text-sm opacity-80">Recuadro separado de Merlín. Sus bonos ×2/×3 funcionan igual; si coinciden, aplica el más fuerte.</p>
          {state.crow_announcements.map((a) => (
            <div key={a.id} className="mt-2 rounded bg-black/30 p-3 text-sm">
              <b>{a.title}</b><p>{a.body}</p>
              <p>Bono: {a.bonus_multiplier ? `×${a.bonus_multiplier}` : "sin bono"} · {a.active ? "Activo" : "Apagado"}</p>
              <div className="mt-1 flex gap-2">
                <button onClick={() => toggleAnnouncement("crow_announcements", a.id, a.active)} className="rounded bg-white/20 px-2 py-1">{a.active ? "Apagar" : "Prender"}</button>
                <button onClick={() => deleteAnnouncement("crow_announcements", a.id)} className="rounded bg-red-500/60 px-2 py-1">Borrar</button>
              </div>
            </div>
          ))}
        </section>

        {/* Empresa / tema / temporada */}
        <section className="rounded-2xl border bg-black/30 p-4">
          <h2 className="text-lg font-bold">⚙️ Empresa, entorno y temporada</h2>
          <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); saveSettings(String(f.get("company") || ""), String(f.get("theme") || "bosque"), String(f.get("season") || "navidad")); }} className="mt-2 flex flex-wrap gap-2">
            <input name="company" defaultValue={state.settings.company_name} className="rounded bg-white text-black px-2 py-2 flex-1 min-w-[220px]" />
            <select name="theme" defaultValue={state.settings.theme} className="rounded bg-white text-black px-2 py-2">
              {Object.entries(THEMES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select name="season" defaultValue={state.settings.season} className="rounded bg-white text-black px-2 py-2">
              <option value="navidad">Navidad</option><option value="halloween">Halloween</option><option value="primavera">Primavera</option><option value="verano">Verano</option><option value="sin-temporada">Sin temporada</option>
            </select>
            <button className="rounded bg-emerald-500 px-4 py-2 font-bold">Guardar</button>
          </form>
          <p className="mt-3 text-sm opacity-80">Avatares (12): {AVATAR_NAMES.join(", ")} — las participantes usan coleta larga, moño alto, pelo largo ondulado y trenza.</p>
        </section>
      </div>
    </main>
  );
}

"use client";
import { useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { ACTIONS, PENALTIES, COLLABORATORS_SEED, PRIZES_SEED, MERLIN_SEED, CORVO_SEED, SETTINGS_SEED, THEMES, levelFor } from "@/lib/data";
import type { GameState, Collaborator, PointEvent } from "@/lib/types";
import { awardPoints, deductPoints, directRedeem, undoEvent, testConnection, resolveRedemption, addPrize, updatePrize, removePrize, publishAnnouncement } from "@/lib/actions";
import PixelAvatar from "@/components/PixelAvatar";
import Podium from "@/components/Podium";
import Track from "@/components/Track";
import { PrizeIcon, SeasonIcon } from "@/components/sprites";
import Merlin from "@/components/Merlin";
import Corvo from "@/components/Corvo";

const SEED: GameState = {
  collaborators: COLLABORATORS_SEED, prizes: PRIZES_SEED, events: [], redemptions: [],
  announcements: MERLIN_SEED, crow_announcements: CORVO_SEED, settings: SETTINGS_SEED,
};

const fmt = (n: number) => n.toLocaleString("es-MX");
function fmtDateTime(iso: string) {
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}
function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "ahora mismo";
  if (mins < 60) return `hace ${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

const inputCls = "min-h-10 rounded-md border-2 border-[var(--border)] bg-[var(--surface-alt)] px-3 py-2 text-sm text-[var(--text)]";
const btnPrimary = "min-h-11 rounded-md border-2 border-[var(--accent)] bg-[var(--surface-alt)] px-4 py-2 font-pixel text-[11px] text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40";
const btnDanger = "min-h-9 rounded-md border-2 border-[var(--red)] px-3 py-1 text-xs font-bold text-[var(--red)] disabled:opacity-40";
const PRIZE_ICON: Record<number, string> = { 1: "gift", 2: "gift", 3: "game", 4: "console", 5: "tv", 6: "console" };
const THEME_SWATCHES: Record<string, string[]> = {
  clasico: ["#e6e8f2", "#a8740a", "#1d9e4b"],
  bosque: ["#e2efe0", "#2e7d32", "#a9c39b"],
  oceano: ["#dfeef5", "#0b6fa4", "#9dbfd4"],
  atardecer: ["#f7e8dd", "#c2510a", "#dbb096"],
  neon: ["#171231", "#7c3aed", "#c084fc"],
};
const SEASON_OPTIONS = [
  { key: "sin-temporada", label: "Sin temporada", icon: null as string | null, hint: "El entorno normal del juego." },
  { key: "navidad", label: "Navidad", icon: "tree", hint: "Nieve, pinos con luces, Merlín de Santa junto a su trineo y Corvo con gorro de Santa." },
  { key: "halloween", label: "Halloween", icon: "pumpkin", hint: "Calabazas, murciélagos, Merlín con sombrero de brujo y Corvo con sombrerito de bruja." },
  { key: "primavera", label: "Primavera", icon: "flower", hint: "Flores por la pista y en el sombrero de Merlín." },
  { key: "verano", label: "Verano", icon: "sun", hint: "Sol, sombrillas y Merlín con sombrero de paja y lentes de sol." },
];

export default function Master() {
  const [state, setState] = useState<GameState>(SEED);
  const [collabId, setCollabId] = useState(1);
  const [penaltyCollabId, setPenaltyCollabId] = useState(1);
  const [customAwardPoints, setCustomAwardPoints] = useState("");
  const [customAwardLabel, setCustomAwardLabel] = useState("");
  const [customPoints, setCustomPoints] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [directCollabId, setDirectCollabId] = useState(1);
  const [prizeId, setPrizeId] = useState(1);
  const [directConfirm, setDirectConfirm] = useState(false);
  const [directMsg, setDirectMsg] = useState<string | null>(null);
  const [undoConfirmId, setUndoConfirmId] = useState<number | null>(null);
  const [undoMsg, setUndoMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgKind, setMsgKind] = useState<"ok" | "err" | "">("");
  const [companyName, setCompanyName] = useState(SETTINGS_SEED.company_name);
  // Publicar comunicado
  const [pubTitle, setPubTitle] = useState<Record<string, string>>({});
  const [pubBody, setPubBody] = useState<Record<string, string>>({});
  const [pubBonus, setPubBonus] = useState<Record<string, boolean>>({});
  const [pubMult, setPubMult] = useState<Record<string, number>>({});
  const [pubAction, setPubAction] = useState<Record<string, string>>({});
  // Editar premio
  const [editingPrize, setEditingPrize] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editCost, setEditCost] = useState("");
  const [editStock, setEditStock] = useState("");
  const [newPrizeName, setNewPrizeName] = useState("");
  const [newPrizeCost, setNewPrizeCost] = useState("");
  const [newPrizeStock, setNewPrizeStock] = useState("");

  function humanError(e?: string) {
    switch (e) {
      case "supabase_no_configurado":
        return "Supabase no conectado en Vercel — los botones no guardan puntos. Ve a Vercel > Settings > Environment Variables, pon las 3 llaves y haz Redeploy.";
      case "out_of_stock":
        return "Ese premio está AGOTADO, ya no quedan unidades. Sube su inventario en la sección PREMIOS si tienes más.";
      case "insufficient_points":
        return "No le alcanzan los puntos para ese premio.";
      case "already_reversed":
        return "Ese movimiento ya se había deshecho antes.";
      case "is_reversal_record":
        return "Ese renglón es el registro de un deshacer anterior; no se puede deshacer.";
      case "already_resolved":
        return "Esa solicitud ya había sido aprobada o rechazada.";
      case "solicitud no encontrada":
        return "Solicitud de canje no encontrada en la base de datos.";
      case "colaborador no encontrado":
        return "Colaborador no encontrado en la base de datos.";
      case "premio no encontrado":
        return "Premio no encontrado en la base de datos.";
      case "evento no encontrado":
        return "Movimiento no encontrado en la base de datos.";
      default:
        return e ? `Error: ${e}` : "Error desconocido. Revisa tu conexión e inténtalo de nuevo.";
    }
  }
  function showMsg(kind: "ok" | "err", text: string) { setMsgKind(kind); setMsg(text); }

  async function load() {
    if (!isSupabaseConfigured) return;
    try {
      const [c, p, e, r, a, ca, s] = await Promise.all([
        supabase.from("collaborators").select("*").order("id"),
        supabase.from("prizes").select("*").order("cost"),
        supabase.from("point_events").select("*").order("created_at", { ascending: false }).limit(50),
        supabase.from("redemptions").select("*").order("created_at", { ascending: false }),
        supabase.from("announcements").select("*").order("id"),
        supabase.from("crow_announcements").select("*").order("id"),
        supabase.from("settings").select("*").eq("id", 1).single(),
      ]);
      const err = [c, p, e, r, a, ca, s].find((x) => x.error)?.error;
      if (err) { showMsg("err", `Error al cargar desde Supabase: ${err.message}`); return; }
      setState((prev) => ({
        collaborators: (c.data as Collaborator[]) || prev.collaborators,
        prizes: p.data || prev.prizes,
        events: e.data || prev.events,
        redemptions: r.data || prev.redemptions,
        announcements: a.data || prev.announcements,
        crow_announcements: ca.data || prev.crow_announcements,
        settings: (s.data as GameState["settings"]) || prev.settings,
      }));
      setCompanyName((s.data as GameState["settings"])?.company_name ?? SEED.settings.company_name);
    } catch (e) {
      showMsg("err", `Error al cargar desde Supabase: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  useEffect(() => { load(); }, []);
  async function refresh() { await load(); }

  const collab = state.collaborators.find((c) => c.id === collabId) || state.collaborators[0];
  const penaltyTarget = state.collaborators.find((c) => c.id === penaltyCollabId) || state.collaborators[0];
  const directParticipant = state.collaborators.find((c) => c.id === directCollabId) || state.collaborators[0];
  const directPrize = state.prizes.find((p) => p.id === prizeId) || state.prizes[0];
  const directAffords = directParticipant && directPrize ? directParticipant.points >= directPrize.cost : false;
  const directInStock = directPrize ? directPrize.stock > 0 : false;
  const directCanRedeem = directAffords && directInStock;
  const pendingRedemptions = state.redemptions.filter((r) => r.status === "pending");
  const resolvedRedemptions = state.redemptions.filter((r) => r.status !== "pending");

  async function doTestConnection() {
    try {
      const res = await testConnection();
      if (res.ok) showMsg("ok", `Conexión OK: Supabase responde. ${res.count} colaboradores: ${res.collaborators || "—"}`);
      else showMsg("err", humanError(res.error));
    } catch (e) {
      showMsg("err", `Error al probar la conexión: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function doAward(a: { id: number; label: string; points: number }) {
    if (!collab) return;
    setBusy(true);
    try {
      const res = await awardPoints(collab.id, a.id, a.label, a.points);
      if (res.ok) showMsg("ok", `+${fmt(res.points)} pts para ${collab.name}: ${a.label}${res.bonus_from ? ` (bono × de ${res.bonus_from})` : ""} — nuevo saldo: ${fmt(res.newPoints)} pts`);
      else showMsg("err", humanError(res.error));
    } catch (e) {
      showMsg("err", `Error al sumar puntos: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBusy(false); await refresh(); }
  }
  async function doCustomAward() {
    const pts = Number(customAwardPoints);
    if (!collab || !Number.isFinite(pts) || pts === 0) return;
    setBusy(true);
    try {
      const res = await awardPoints(collab.id, null as unknown as number, customAwardLabel.trim() || "Ajuste manual", Math.trunc(pts));
      if (res.ok) showMsg("ok", `${res.points >= 0 ? "+" : ""}${fmt(res.points)} pts para ${collab.name}: ${customAwardLabel.trim() || "Ajuste manual"} — nuevo saldo: ${fmt(res.newPoints)} pts`);
      else showMsg("err", humanError(res.error));
      setCustomAwardPoints(""); setCustomAwardLabel("");
    } catch (e) {
      showMsg("err", `Error al aplicar el ajuste: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBusy(false); await refresh(); }
  }
  async function doDeduct(p: { id: number; label: string; points: number }) {
    if (!penaltyTarget) return;
    setBusy(true);
    try {
      const res = await deductPoints(penaltyTarget.id, p.label, p.points);
      if (res.ok) showMsg("ok", `−${fmt(Math.abs(p.points))} pts a ${penaltyTarget.name}: ${p.label} — nuevo saldo: ${fmt(res.newPoints)} pts (el saldo nunca baja de 0)`);
      else showMsg("err", humanError(res.error));
    } catch (e) {
      showMsg("err", `Error al restar puntos: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBusy(false); await refresh(); }
  }
  async function doCustomDeduct() {
    const n = Math.abs(parseInt(customPoints || "0", 10));
    if (!penaltyTarget || !n) return;
    setBusy(true);
    try {
      const res = await deductPoints(penaltyTarget.id, customReason || "Falta (ajuste manual)", -n, customReason);
      if (res.ok) showMsg("ok", `-${n} pts a ${penaltyTarget.name} (${customReason || "resta personalizada"}) — nuevo saldo: ${fmt(res.newPoints)} pts`);
      else showMsg("err", humanError(res.error));
      setCustomPoints(""); setCustomReason("");
    } catch (e) {
      showMsg("err", `Error al restar puntos: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBusy(false); await refresh(); }
  }
  async function doUndo(id: number) {
    setBusy(true);
    try {
      const res = await undoEvent(id);
      const ev = state.events.find((e) => e.id === id);
      if (res.ok) setUndoMsg(ev ? `Listo: se deshizo «${ev.label}» de ${nameOf(ev.collaborator_id)} (${ev.points >= 0 ? "+" : ""}${fmt(ev.points)} pts). Su saldo y su nivel ya quedaron como antes, y el movimiento sigue en el historial marcado como deshecho.` : "Listo: movimiento deshecho.");
      else setUndoMsg(humanError(res.error));
      setUndoConfirmId(null);
    } catch (e) {
      setUndoMsg(`No se pudo deshacer. Revisa tu conexión e inténtalo de nuevo. (${e instanceof Error ? e.message : String(e)})`);
      setUndoConfirmId(null);
    } finally { setBusy(false); await refresh(); }
  }
  function nameOf(collaboratorId: number) {
    return state.collaborators.find((c) => c.id === collaboratorId)?.name ?? "";
  }
  async function doRedeem() {
    if (!directParticipant || !directPrize) return;
    setBusy(true);
    try {
      const res = await directRedeem(directParticipant.id, directPrize.id);
      setDirectConfirm(false);
      if (res.ok) setDirectMsg(`Canje registrado: ${directParticipant.name} canjeó «${directPrize.name}» y se le descontaron ${fmt(directPrize.cost)} pts. El inventario de ese premio bajó a ${fmt(Math.max(0, directPrize.stock - 1))} disponible${directPrize.stock - 1 === 1 ? "" : "s"}${directPrize.stock - 1 <= 0 ? " (AGOTADO)" : ""}. Ya se ve en La Carrera como objeto canjeado y en el recuadro de Canjes realizados.`);
      else setDirectMsg(humanError(res.error));
    } catch (e) {
      setDirectConfirm(false);
      setDirectMsg(`No se pudo registrar el canje. Revisa tu conexión e inténtalo de nuevo. (${e instanceof Error ? e.message : String(e)})`);
    } finally { setBusy(false); await refresh(); }
  }
  async function doResolve(id: number, approve: boolean) {
    setBusy(true);
    try {
      const res = await resolveRedemption(id, approve);
      const req = state.redemptions.find((r) => r.id === id);
      if (!res.ok) setDirectMsg(humanError(res.error));
      else if (res.approved) setDirectMsg(req ? `Canje aprobado: se descontaron ${fmt(req.cost)} pts a ${nameOf(req.collaborator_id)} por «${req.prize_name}» y quedó registrado en el historial.` : "Canje aprobado y puntos descontados.");
      else setDirectMsg(req ? `Solicitud rechazada: ${nameOf(req.collaborator_id)} pidió «${req.prize_name}» y no se descontó ningún punto. Quedó registrada como rechazada.` : "Solicitud rechazada. No se descontó ningún punto.");
    } catch (e) {
      setDirectMsg(`No se pudo resolver la solicitud. Revisa tu conexión e inténtalo de nuevo. (${e instanceof Error ? e.message : String(e)})`);
    } finally { setBusy(false); await refresh(); }
  }
  async function changeStock(prizeIdNum: number, delta: number) {
    const prize = state.prizes.find((p) => p.id === prizeIdNum);
    if (!prize) return;
    const next = Math.max(0, prize.stock + delta);
    try {
      const res = await updatePrize(prizeIdNum, { stock: next });
      if (!res.ok) { showMsg("err", humanError(res.error)); return; }
      setState((s) => ({ ...s, prizes: s.prizes.map((p) => (p.id === prizeIdNum ? { ...p, stock: next } : p)) }));
      showMsg("ok", `Stock de ${prize.name}: ahora ${next} disponibles`);
    } catch (e) {
      showMsg("err", `Error al cambiar el stock: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  async function toggleAnnouncement(table: "announcements" | "crow_announcements", id: number, active: boolean) {
    try {
      const { error } = await supabase.from(table).update({ active: !active }).eq("id", id);
      if (error) { showMsg("err", `Error: ${error.message}`); return; }
      await refresh();
      showMsg("ok", active ? "Comunicado apagado" : "Comunicado prendido");
    } catch (e) {
      showMsg("err", `Error al cambiar el comunicado: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  async function deleteAnnouncement(table: "announcements" | "crow_announcements", id: number) {
    if (!confirm("¿Borrar este comunicado?")) return;
    try {
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) { showMsg("err", `Error: ${error.message}`); return; }
      await refresh();
      showMsg("ok", "Comunicado borrado");
    } catch (e) {
      showMsg("err", `Error al borrar el comunicado: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  async function doPublish(table: "announcements" | "crow_announcements") {
    const title = (pubTitle[table] || "").trim();
    const body = (pubBody[table] || "").trim();
    if (!title) { showMsg("err", "Escribe un título para el comunicado."); return; }
    try {
      const res = await publishAnnouncement(table, title, body, pubBonus[table] ? (pubMult[table] || 2) : null, pubAction[table] && pubAction[table] !== "all" ? Number(pubAction[table]) : null);
      if (!res.ok) { showMsg("err", humanError(res.error)); return; }
      setPubTitle((s) => ({ ...s, [table]: "" })); setPubBody((s) => ({ ...s, [table]: "" })); setPubBonus((s) => ({ ...s, [table]: false }));
      await refresh();
      showMsg("ok", "Comunicado publicado");
    } catch (e) {
      showMsg("err", `Error al publicar: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  async function saveCompany() {
    try {
      const { error } = await supabase.from("settings").update({ company_name: companyName }).eq("id", 1);
      if (error) { showMsg("err", `Error: ${error.message}`); return; }
      setState((s) => ({ ...s, settings: { ...s.settings, company_name: companyName } }));
      showMsg("ok", "Nombre de la empresa guardado");
    } catch (e) {
      showMsg("err", `Error al guardar la empresa: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  async function saveAppearance(theme: string, season: string) {
    try {
      const { error } = await supabase.from("settings").update({ theme, season }).eq("id", 1);
      if (error) { showMsg("err", `Error: ${error.message}`); return; }
      setState((s) => ({ ...s, settings: { ...s.settings, theme: theme as never, season: season as never } }));
      showMsg("ok", "Entorno actualizado: se ve igual en las dos vistas.");
    } catch (e) {
      showMsg("err", `Error al guardar el entorno: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const undoable = state.events.filter((e) => !e.reversed && e.kind !== "reversal");
  const lastUndoable = undoable[0] ?? null;
  const shownEvents = state.events.slice(0, 12);
  const seasonOption = SEASON_OPTIONS.find((s) => s.key === state.settings.season) ?? SEASON_OPTIONS[0]!;
  const merlinBonus = state.announcements.some((a) => a.active && a.bonus_multiplier != null);
  const crowBonus = state.crow_announcements.some((a) => a.active && a.bonus_multiplier != null);

  function renderUndoControls(e: PointEvent) {
    if (e.kind === "reversal") return <span className="chip shrink-0 px-2.5 py-1 text-[11px] font-bold text-[var(--dim)]">REGISTRO</span>;
    if (e.reversed) return <span className="chip shrink-0 px-2.5 py-1 text-[11px] font-bold" style={{ color: "var(--red)", borderColor: "var(--red)" }}>DESHECHO</span>;
    if (undoConfirmId === e.id) {
      return (
        <span className="flex shrink-0 flex-wrap gap-2">
          <button type="button" className={btnDanger} disabled={busy} onClick={() => doUndo(e.id)}>Sí, deshacer</button>
          <button type="button" className="min-h-9 rounded-md border-2 border-[var(--border)] px-3 py-1 text-xs font-bold text-[var(--dim)]" onClick={() => setUndoConfirmId(null)}>No</button>
        </span>
      );
    }
    return (
      <button type="button" className="shrink-0 rounded-md border-2 border-[var(--red)] px-3 py-1 text-xs font-bold text-[var(--red)] disabled:opacity-40" disabled={busy} onClick={() => setUndoConfirmId(e.id)}>Deshacer</button>
    );
  }

  function renderAnnouncements(table: "announcements" | "crow_announcements", title: string, border: string, intro: string) {
    const list = table === "announcements" ? state.announcements : state.crow_announcements;
    return (
      <section aria-label={title} className="panel p-4 sm:p-5">
        <h2 className="font-pixel text-sm text-[var(--text)]">{title}</h2>
        {intro && <p className="mt-2 text-sm text-[var(--dim)]">{intro}</p>}
        <div className="mt-4 flex flex-col gap-2">
          <input aria-label="Título del comunicado" placeholder="Título (ej. ¡Semana de puntos dobles!)" className={inputCls} value={pubTitle[table] || ""} onChange={(e) => setPubTitle((s) => ({ ...s, [table]: e.target.value }))} />
          <input aria-label="Mensaje del comunicado" placeholder="Mensaje (ej. Si todos hacen check-in a tiempo esta semana, los puntos del check-in valen doble.)" className={inputCls} value={pubBody[table] || ""} onChange={(e) => setPubBody((s) => ({ ...s, [table]: e.target.value }))} />
          <label className="flex min-h-8 cursor-pointer items-center gap-2 text-sm font-semibold text-[var(--text)]">
            <input type="checkbox" checked={!!pubBonus[table]} onChange={(e) => setPubBonus((s) => ({ ...s, [table]: e.target.checked }))} /> Tiene bono (×2 o ×3)
          </label>
          {pubBonus[table] && (
            <div className="flex flex-wrap gap-2">
              <select aria-label="Multiplicador del bono" className={inputCls} value={pubMult[table] || 2} onChange={(e) => setPubMult((s) => ({ ...s, [table]: Number(e.target.value) }))}>
                <option value={2}>×2</option><option value={3}>×3</option>
              </select>
              <select aria-label="Acción a la que aplica el bono" className={inputCls} value={pubAction[table] || "all"} onChange={(e) => setPubAction((s) => ({ ...s, [table]: e.target.value }))}>
                <option value="all">Todas las acciones</option>
                {ACTIONS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            </div>
          )}
          <button type="button" className={btnPrimary} disabled={busy || !(pubTitle[table] || "").trim()} onClick={() => doPublish(table)}>PUBLICAR</button>
        </div>
        <div className="mt-4 flex flex-col gap-2">
          {list.map((a) => (
            <div key={a.id} className="rounded bg-[var(--surface-alt)] p-3 text-sm" style={{ borderColor: border }}>
              <b>{a.title}</b><p>{a.body}</p>
              <p>Bono: {a.bonus_multiplier ? `×${a.bonus_multiplier}` : "sin bono"} · {a.active ? "Activo" : "Apagado"}</p>
              <div className="mt-1 flex gap-2">
                <button onClick={() => toggleAnnouncement(table, a.id, a.active)} className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1">{a.active ? "Apagar" : "Prender"}</button>
                <button onClick={() => deleteAnnouncement(table, a.id)} className="rounded bg-red-500/60 px-2 py-1">Borrar</button>
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]" data-theme={state.settings.theme} data-season={state.settings.season}>
      <main className="mx-auto w-full max-w-6xl px-3 pb-10 pt-4 sm:px-4">
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

        <div className="panel mb-5 flex p-1.5" role="tablist" aria-label="Cambiar vista">
          <a href="/" role="tab" aria-selected="false" className="min-h-11 flex-1 rounded-md px-3 py-2 text-center font-pixel text-[11px] text-[var(--text)] sm:text-xs">LA CARRERA</a>
          <a href="/master" role="tab" aria-selected="true" className="min-h-11 flex-1 rounded-md px-3 py-2 text-center font-pixel text-[11px] sm:text-xs" style={{ background: "var(--accent)", color: "#14161f" }}>PANEL MASTER</a>
        </div>

        <p className="mb-5 rounded-md border-2 border-dashed border-[var(--border)] px-4 py-3 text-sm text-[var(--dim)]">
          Vista de control: aquí solo debería entrar quien administra el juego (Osbed / Master). Los colaboradores usan la vista <span className="font-semibold text-[var(--text)]">La Carrera</span>, donde solo ven la pista, el ranking y los premios.
        </p>

        {!isSupabaseConfigured && (
          <div className="mb-5 rounded-md border-2 border-red-500 bg-red-500/15 px-4 py-3 text-sm font-bold text-red-700 dark:text-red-300" role="alert">
            ⚠️ Supabase no conectado en Vercel — los botones no guardan puntos. Ve a Vercel &gt; Settings &gt; Environment Variables, pon las 3 llaves y haz Redeploy.
          </div>
        )}
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <button type="button" onClick={doTestConnection} className={btnPrimary}>PROBAR CONEXIÓN</button>
          <span className="text-sm text-[var(--dim)]">Comprueba si Vercel llega a Supabase y cuántos colaboradores hay.</span>
        </div>
        {msg && (
          <div className={`mb-5 rounded-md border-2 px-4 py-3 text-sm font-bold ${msgKind === "err" ? "border-red-500 bg-red-500/15 text-red-700 dark:text-red-300" : "border-green-600 bg-green-500/15 text-green-800 dark:text-green-300"}`} role="status">
            {msg}
          </div>
        )}

        <div className="flex flex-col gap-6">
        <Podium collaborators={state.collaborators} />
        <Track collaborators={state.collaborators} prizes={state.prizes} season={state.settings.season} />

        {/* Sumar puntos — como el Master: un botón por acción */}
        <section aria-label="Sumar puntos" className="panel p-4 sm:p-5">
          <h2 className="font-pixel text-sm text-[var(--text)]">SUMAR PUNTOS</h2>
          <label htmlFor="award-participant" className="mt-4 block text-sm font-semibold text-[var(--text)]">¿A quién?</label>
          <select id="award-participant" aria-label="Colaborador que recibe los puntos" className={`${inputCls} mt-1 w-full`} value={collab?.id ?? ""} onChange={(e) => setCollabId(Number(e.target.value))}>
            {state.collaborators.map((p) => <option key={p.id} value={p.id}>{p.name} — {fmt(p.points)} pts</option>)}
          </select>
          {(merlinBonus || crowBonus) && (
            <p className="mt-3 rounded-md border-2 px-3 py-2 text-sm font-semibold text-[var(--text)]" style={{ borderColor: merlinBonus ? "#6d4fc2" : "#3d4fa3" }}>
              Bono {merlinBonus && crowBonus ? "de Merlín y del Cuervo de RRHH" : merlinBonus ? "de Merlín" : "del Cuervo de RRHH"} activo: los puntos de las acciones con bono se multiplican solos al sumarlos.
            </p>
          )}
          <p className="mt-4 text-sm font-semibold text-[var(--text)]">¿Qué hizo?</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {ACTIONS.map((a) => (
              <button key={a.id} type="button" disabled={!collab || busy} aria-label={`Sumar ${a.points} puntos por ${a.label}`} onClick={() => doAward(a)} className="flex min-h-12 items-center justify-between gap-2 rounded-md border-2 border-[var(--border)] bg-[var(--surface-alt)] px-3 py-2 text-left disabled:opacity-40">
                <span className="text-sm font-semibold text-[var(--text)]">{a.label}</span>
                <span className="font-pixel shrink-0 text-[11px] text-[var(--green)]">+{fmt(a.points)}</span>
              </button>
            ))}
          </div>
          <form className="mt-4 flex flex-col gap-2 border-t-2 border-dashed border-[var(--border)] pt-4 sm:flex-row" onSubmit={(e) => { e.preventDefault(); doCustomAward(); }}>
            <input aria-label="Puntos personalizados (pueden ser negativos)" type="number" inputMode="numeric" placeholder="Pts (+ o −)" className={`${inputCls} sm:w-32`} value={customAwardPoints} onChange={(e) => setCustomAwardPoints(e.target.value)} />
            <input aria-label="Motivo del ajuste" type="text" placeholder="Motivo (ej. Bonus del mes)" className={`${inputCls} flex-1`} value={customAwardLabel} onChange={(e) => setCustomAwardLabel(e.target.value)} />
            <button type="submit" className={btnPrimary} disabled={busy}>APLICAR</button>
          </form>
          {collab && <div className="mt-3 flex items-center gap-2"><PixelAvatar sprite={collab.sprite} points={collab.points} size={40} /><span>{collab.name} — {collab.points} pts</span></div>}
        </section>

        {/* Deshacer — como el Master */}
        <section aria-label="Deshacer o retroceder puntos" className="panel p-4 sm:p-5" style={{ borderColor: "var(--red)" }}>
          <h2 className="font-pixel text-sm text-[var(--text)]">DESHACER / RETROCEDER PUNTOS</h2>
          <p className="mt-2 text-sm text-[var(--dim)]">¿Te equivocaste al sumar o restar puntos? Deshaz el movimiento aquí: se revierte el saldo de puntos, así que el nivel del monito baja de nuevo. El historial <strong>no</strong> se borra: el movimiento queda marcado como deshecho y se agrega el registro del deshacer.</p>
          {lastUndoable ? (
            <div className="mt-4">
              {undoConfirmId === lastUndoable.id ? (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button type="button" disabled={busy} onClick={() => doUndo(lastUndoable.id)} className="min-h-12 flex-1 rounded-md border-2 px-4 py-2 font-pixel text-[11px] disabled:cursor-not-allowed disabled:opacity-50" style={{ borderColor: "var(--red)", background: "var(--red)", color: "#fff" }}>{busy ? "DESHACIENDO…" : "SÍ, DESHACER EL ÚLTIMO MOVIMIENTO"}</button>
                  <button type="button" onClick={() => setUndoConfirmId(null)} className="min-h-12 rounded-md border-2 border-[var(--border)] px-4 py-2 font-pixel text-[11px] text-[var(--dim)]">NO, CANCELAR</button>
                </div>
              ) : (
                <button type="button" disabled={busy} onClick={() => setUndoConfirmId(lastUndoable.id)} className="min-h-12 w-full rounded-md border-2 px-4 py-2 font-pixel text-[11px] disabled:cursor-not-allowed disabled:opacity-50" style={{ borderColor: "var(--red)", color: "var(--red)", background: "var(--surface-alt)" }}>↩ DESHACER EL ÚLTIMO MOVIMIENTO</button>
              )}
              <p className="mt-2 text-xs text-[var(--dim)]">Último movimiento: <span className="font-semibold text-[var(--text)]">{nameOf(lastUndoable.collaborator_id)}</span> — {lastUndoable.label} ({lastUndoable.points >= 0 ? "+" : ""}{fmt(lastUndoable.points)} pts · {fmtDateTime(lastUndoable.created_at)})</p>
            </div>
          ) : (
            <p className="mt-4 text-sm text-[var(--dim)]">No hay movimientos por deshacer.</p>
          )}
          {undoMsg && <p role="status" className="mt-3 rounded-md border-2 border-[var(--green)] bg-[var(--surface-alt)] px-3 py-2 text-sm font-semibold text-[var(--text)]">{undoMsg}</p>}
          <h3 className="font-pixel mt-5 text-xs text-[var(--text)]">ÚLTIMOS MOVIMIENTOS</h3>
          {shownEvents.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--dim)]">Aún no hay movimientos. Suma los primeros puntos en la sección de arriba.</p>
          ) : (
            <ul className="mt-2 flex flex-col divide-y divide-[var(--border)]">
              {shownEvents.map((e) => (
                <li key={e.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <div className={`min-w-0 flex-1 ${e.reversed ? "opacity-60" : ""}`}>
                    <span className="font-semibold text-[var(--text)]">{nameOf(e.collaborator_id)}</span>{" "}
                    <span className={`text-[var(--dim)] ${e.reversed ? "line-through" : ""}`}>{e.label}</span>{" "}
                    <span className="font-bold" style={{ color: e.points >= 0 ? "var(--green)" : "var(--red)" }}>{e.points >= 0 ? "+" : ""}{fmt(e.points)}</span>
                    <span className="block text-xs text-[var(--dim)]">{fmtDateTime(e.created_at)} · {timeAgo(e.created_at)}</span>
                  </div>
                  {renderUndoControls(e)}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Restar puntos — como el Master */}
        <section aria-label="Restar puntos" className="panel p-4 sm:p-5" style={{ borderColor: "var(--red)" }}>
          <h2 className="font-pixel text-sm" style={{ color: "var(--red)" }}>RESTAR PUNTOS</h2>
          <label htmlFor="penalty-participant" className="mt-4 block text-sm font-semibold text-[var(--text)]">¿A quién?</label>
          <select id="penalty-participant" aria-label="Colaborador al que se le restan puntos" className={`${inputCls} mt-1 w-full`} value={penaltyTarget?.id ?? ""} onChange={(e) => setPenaltyCollabId(Number(e.target.value))}>
            {state.collaborators.map((p) => <option key={p.id} value={p.id}>{p.name} — {fmt(p.points)} pts</option>)}
          </select>
          <p className="mt-4 text-sm font-semibold text-[var(--text)]">¿Qué falta cometió?</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {PENALTIES.map((pen) => (
              <button key={pen.id} type="button" disabled={!penaltyTarget || busy} aria-label={`Restar ${Math.abs(pen.points)} puntos a ${penaltyTarget?.name ?? ""} por ${pen.label}`} onClick={() => doDeduct(pen)} className="flex min-h-12 items-center justify-between gap-2 rounded-md border-2 bg-[var(--surface-alt)] px-3 py-2 text-left disabled:opacity-40" style={{ borderColor: "var(--red)" }}>
                <span className="text-sm font-semibold text-[var(--text)]">{pen.label}</span>
                <span className="font-pixel shrink-0 text-[11px]" style={{ color: "var(--red)" }}>−{fmt(Math.abs(pen.points))}</span>
              </button>
            ))}
          </div>
          <form className="mt-4 flex flex-col gap-2 border-t-2 border-dashed border-[var(--border)] pt-4 sm:flex-row" onSubmit={(e) => { e.preventDefault(); doCustomDeduct(); }}>
            <input aria-label="Puntos a restar" type="number" inputMode="numeric" min={1} placeholder="Pts a restar" className={`${inputCls} sm:w-32`} value={customPoints} onChange={(e) => setCustomPoints(e.target.value)} />
            <input aria-label="Motivo de la falta" type="text" placeholder="Motivo (ej. Llegó tarde a la junta)" className={`${inputCls} flex-1`} value={customReason} onChange={(e) => setCustomReason(e.target.value)} />
            <button type="submit" className="min-h-11 rounded-md border-2 px-4 py-2 font-pixel text-[11px] disabled:cursor-not-allowed disabled:opacity-40" style={{ borderColor: "var(--red)", color: "var(--red)", background: "var(--surface-alt)" }} disabled={busy}>RESTAR</button>
          </form>
        </section>

        {/* Solicitudes de canje + canje directo — como el Master */}
        <section aria-label="Solicitudes de canje pendientes" className="panel p-4 sm:p-5" style={{ borderColor: "var(--accent)" }}>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-pixel text-sm text-[var(--text)]">SOLICITUDES DE CANJE PENDIENTES</h2>
            <span className="chip px-2.5 py-0.5 text-xs font-bold" style={{ color: "var(--accent)", borderColor: "var(--accent)" }}>{pendingRedemptions.length} PENDIENTE{pendingRedemptions.length === 1 ? "" : "S"}</span>
          </div>
          <p className="mt-2 text-sm text-[var(--dim)]">La Carrera ya es solo visual: los colaboradores no tocan nada, piden su premio en persona con <strong className="text-[var(--text)]">RRHH</strong> y <strong className="text-[var(--text)]">solo tú, el Master, registras el canje aquí</strong>. Usa el canje directo de abajo (seleccionas quién y qué premio, y se descuentan los puntos al confirmar) o aprueba una solicitud pendiente anterior. Al canjear, en La Carrera ese premio se marca «Te lo ganaron · Objeto canjeado» y el canje aparece arriba en el recuadro de Canjes realizados.</p>
          <div className="mt-4 rounded-md border-2 border-[var(--border)] bg-[var(--surface-alt)] px-3 py-3 sm:px-4">
            <h3 className="font-pixel text-xs text-[var(--text)]">CANJE DIRECTO · SOLO MASTER</h3>
            <p className="mt-1.5 text-sm text-[var(--dim)]">El colaborador te pidió el premio en RRHH / en persona. Selecciónalo aquí junto con el premio: al confirmar se le descuentan los puntos y queda registrado como canjeado.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div>
                <label htmlFor="direct-participant" className="block text-sm font-semibold text-[var(--text)]">¿Quién canjea?</label>
                <select id="direct-participant" aria-label="Colaborador que canjea el premio" className={`${inputCls} mt-1 w-full`} value={directParticipant?.id ?? ""} onChange={(e) => { setDirectCollabId(Number(e.target.value)); setDirectConfirm(false); setDirectMsg(null); }}>
                  {state.collaborators.map((p) => <option key={p.id} value={p.id}>{p.name} — {fmt(p.points)} pts</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="direct-prize" className="block text-sm font-semibold text-[var(--text)]">¿Qué premio?</label>
                <select id="direct-prize" aria-label="Premio a canjear" className={`${inputCls} mt-1 w-full`} value={directPrize?.id ?? ""} onChange={(e) => { setPrizeId(Number(e.target.value)); setDirectConfirm(false); setDirectMsg(null); }}>
                  {state.prizes.map((p) => <option key={p.id} value={p.id}>{p.name} — {fmt(p.cost)} pts · {p.stock > 0 ? `Disponibles: ${fmt(p.stock)}` : "AGOTADO"}</option>)}
                </select>
              </div>
            </div>
            {directParticipant && directPrize && (
              <p className="mt-2 text-sm text-[var(--text)]">
                {!directInStock ? (
                  <span className="font-bold" style={{ color: "var(--red)" }}>AGOTADO: no quedan unidades de «{directPrize.name}», así que no se puede canjear. Sube su inventario en la sección PREMIOS si tienes más.</span>
                ) : directAffords ? (
                  <>A {directParticipant.name} le alcanzan: tiene {fmt(directParticipant.points)} pts y el premio cuesta {fmt(directPrize.cost)} pts. Quedaría con {fmt(directParticipant.points - directPrize.cost)} pts y el premio quedaría con {fmt(directPrize.stock - 1)} disponible{directPrize.stock - 1 === 1 ? "" : "s"}.</>
                ) : (
                  <span className="font-bold" style={{ color: "var(--red)" }}>A {directParticipant.name} no le alcanzan: tiene {fmt(directParticipant.points)} pts y el premio cuesta {fmt(directPrize.cost)} pts.</span>
                )}
              </p>
            )}
            {directConfirm ? (
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <button type="button" className={btnPrimary} disabled={busy} onClick={doRedeem}>{busy ? "CANJEANDO…" : "SÍ, CANJEAR Y DESCONTAR"}</button>
                <button type="button" className="min-h-11 rounded-md border-2 border-[var(--border)] px-4 py-2 text-sm font-bold text-[var(--dim)]" onClick={() => setDirectConfirm(false)}>Cancelar</button>
              </div>
            ) : (
              <button type="button" className={`${btnPrimary} mt-3`} disabled={!directCanRedeem || busy} onClick={() => { setDirectMsg(null); setDirectConfirm(true); }}>REGISTRAR CANJE Y DESCONTAR</button>
            )}
            {directMsg && <p role="status" className="mt-3 rounded-md border-2 border-[var(--green)] bg-[var(--surface)] px-3 py-2 text-sm font-semibold text-[var(--text)]">{directMsg}</p>}
          </div>
          {pendingRedemptions.length === 0 ? (
            <p className="mt-4 rounded-md border-2 border-dashed border-[var(--border)] px-4 py-4 text-sm text-[var(--dim)]">No hay solicitudes pendientes. Ya no se crean desde La Carrera (es solo visual): registra los canjes con el canje directo de arriba cuando el colaborador lo pida en RRHH. Las solicitudes pendientes de antes, si las hubiera, aparecerían aquí para aprobar o rechazar.</p>
          ) : (
            <ul className="mt-4 flex flex-col gap-3">
              {pendingRedemptions.map((r) => {
                const requester = state.collaborators.find((p) => p.id === r.collaborator_id);
                const liveBalance = requester?.points ?? r.cost;
                const stillAffords = liveBalance >= r.cost;
                const prizeRow = state.prizes.find((p) => p.id === r.prize_id);
                const prizeStock = prizeRow?.stock ?? null;
                return (
                  <li key={r.id} className="rounded-md border-2 border-[var(--border)] bg-[var(--surface-alt)] px-3 py-3">
                    <div className="flex items-start gap-3">
                      {requester && <PixelAvatar sprite={requester.sprite} points={requester.points} size={40} />}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-[var(--text)]"><span className="font-bold">{r.prize_name ? nameOf(r.collaborator_id) : ""}</span> solicitó <span className="font-bold">{r.prize_name}</span></p>
                        <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-[var(--dim)] sm:grid-cols-4">
                          <div><dt className="font-semibold">Costo</dt><dd className="font-pixel mt-0.5 text-[11px] text-[var(--accent)]">{fmt(r.cost)} PTS</dd></div>
                          <div><dt className="font-semibold">Saldo actual</dt><dd className="font-pixel mt-0.5 text-[11px] text-[var(--text)]">{fmt(liveBalance)} PTS</dd></div>
                          <div><dt className="font-semibold">Fecha y hora</dt><dd className="mt-0.5 text-[var(--text)]">{fmtDateTime(r.created_at)}</dd></div>
                          <div><dt className="font-semibold">Estado</dt><dd><span className="chip inline-flex px-2 py-0.5 text-[11px] font-bold" style={{ color: "var(--accent)", borderColor: "var(--accent)" }}>PENDIENTE</span></dd></div>
                        </dl>
                        {prizeStock != null && <p className="mt-1.5 text-xs text-[var(--dim)]">Inventario de este premio: <strong style={{ color: prizeStock > 0 ? "var(--green)" : "var(--red)" }}>{prizeStock > 0 ? `Disponibles: ${fmt(prizeStock)}` : "AGOTADO"}</strong></p>}
                        {!stillAffords && <p role="alert" className="mt-2 text-xs font-bold" style={{ color: "var(--red)" }}>Ojo: su saldo actual ({fmt(liveBalance)} pts) ya no alcanza para el costo ({fmt(r.cost)} pts), así que aprobar fallará hasta que tenga los puntos.</p>}
                        {prizeStock === 0 && <p role="alert" className="mt-2 text-xs font-bold" style={{ color: "var(--red)" }}>Ojo: este premio está AGOTADO, así que aprobar fallará hasta que subas su inventario en la sección PREMIOS.</p>}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" className={btnPrimary} disabled={busy} onClick={() => doResolve(r.id, true)}>APROBAR Y DESCONTAR</button>
                      <button type="button" className={btnDanger} disabled={busy} onClick={() => doResolve(r.id, false)}>Rechazar</button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {resolvedRedemptions.length > 0 && (
            <>
              <h3 className="font-pixel mt-5 text-xs text-[var(--text)]">SOLICITUDES YA RESUELTAS</h3>
              <ul className="mt-2 flex flex-col divide-y divide-[var(--border)]">
                {resolvedRedemptions.slice(0, 10).map((r) => (
                  <li key={r.id} className="flex items-center gap-3 py-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <span className="font-semibold text-[var(--text)]">{nameOf(r.collaborator_id)}</span>{" "}
                      <span className="text-[var(--dim)]">solicitó {r.prize_name} ({fmt(r.cost)} pts)</span>
                      <span className="block text-xs text-[var(--dim)]">Pedida el {fmtDateTime(r.created_at)}{r.resolved_at ? ` · Resuelta el ${fmtDateTime(r.resolved_at)}` : ""}</span>
                    </div>
                    {r.status === "approved" ? (
                      <span className="chip shrink-0 px-2.5 py-1 text-[11px] font-bold" style={{ color: "var(--green)", borderColor: "var(--green)" }}>APROBADA · CANJE HECHO</span>
                    ) : (
                      <span className="chip shrink-0 px-2.5 py-1 text-[11px] font-bold" style={{ color: "var(--red)", borderColor: "var(--red)" }}>RECHAZADA</span>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        {/* Merlín y Corvo — publicar + prender/apagar + borrar */}
        {renderAnnouncements("announcements", "MERLÍN · COMUNICADOS Y BONOS", "#6d4fc2", "")}
        {renderAnnouncements("crow_announcements", "EL CUERVO DE RRHH · CORVO · COMUNICADOS Y BONOS", "#3d4fa3", "Recuadro separado de Merlín. Sus bonos ×2/×3 funcionan igual; si coinciden, aplica el más fuerte.")}

        {/* Premios — como el Master */}
        <section aria-label="Administrar premios" className="panel p-4 sm:p-5">
          <h2 className="font-pixel text-sm text-[var(--text)]">PREMIOS</h2>
          <p className="mt-2 text-sm text-[var(--dim)]">Cada premio muestra cuántas unidades quedan: <strong className="text-[var(--text)]">Disponibles</strong>. Sube o baja el inventario con los botones − / + o edítalo con el lápiz de cada premio. Cuando un colaborador canjea, el inventario baja 1 solo; al llegar a 0 el premio se marca <strong className="text-[var(--text)]">Agotado</strong> y ya no se puede canjear.</p>
          <ul className="mt-3 flex flex-col divide-y divide-[var(--border)]">
            {state.prizes.map((prize) => (
              <li key={prize.id} className="py-2.5">
                {editingPrize === prize.id ? (
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <input aria-label="Nombre del premio" type="text" className={`${inputCls} flex-1`} value={editName} onChange={(e) => setEditName(e.target.value)} />
                    <input aria-label="Costo en puntos del premio" type="number" inputMode="numeric" className={`${inputCls} sm:w-28`} value={editCost} onChange={(e) => setEditCost(e.target.value)} />
                    <input aria-label={`Unidades disponibles de ${prize.name}`} type="number" inputMode="numeric" min={0} placeholder="Disponibles" className={`${inputCls} sm:w-32`} value={editStock} onChange={(e) => setEditStock(e.target.value)} />
                    <button type="button" className={btnPrimary} disabled={!editName.trim() || !(Number(editCost) > 0)} onClick={async () => { try { const res = await updatePrize(prize.id, { name: editName.trim(), cost: Math.trunc(Number(editCost)), stock: Math.max(0, Math.trunc(Number(editStock) || 0)) }); if (!res.ok) { showMsg("err", humanError(res.error)); return; } setEditingPrize(null); await refresh(); showMsg("ok", "Premio guardado"); } catch (e) { showMsg("err", `Error al guardar el premio: ${e instanceof Error ? e.message : String(e)}`); } }}>GUARDAR</button>
                    <button type="button" className="min-h-11 rounded-md border-2 border-[var(--border)] px-4 py-2 text-sm font-bold text-[var(--dim)]" onClick={() => setEditingPrize(null)}>Cancelar</button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <PrizeIcon icon={PRIZE_ICON[prize.id] || "gift"} size={34} />
                    <p className="min-w-0 flex-1 text-sm font-semibold text-[var(--text)]">{prize.name}</p>
                    <span className="font-pixel shrink-0 text-[11px] text-[var(--accent)]">{fmt(prize.cost)} PTS</span>
                    <span className="chip inline-flex shrink-0 items-center gap-1 px-2.5 py-1 text-xs font-bold" style={prize.stock > 0 ? { color: "var(--green)", borderColor: "var(--green)" } : { color: "var(--red)", borderColor: "var(--red)" }}>
                      {prize.stock > 0 ? `Disponibles: ${fmt(prize.stock)}` : "Agotado"}
                      <span className="ml-1 inline-flex gap-1">
                        <button type="button" className="flex h-6 w-6 items-center justify-center rounded border-2 border-current text-sm font-bold disabled:opacity-30" disabled={prize.stock <= 0} aria-label={`Quitar una unidad del inventario de ${prize.name}`} onClick={() => changeStock(prize.id, -1)}>−</button>
                        <button type="button" className="flex h-6 w-6 items-center justify-center rounded border-2 border-current text-sm font-bold" aria-label={`Agregar una unidad al inventario de ${prize.name}`} onClick={() => changeStock(prize.id, 1)}>+</button>
                      </span>
                    </span>
                    <button type="button" className="rounded-md border-2 border-[var(--border)] px-3 py-1 text-xs font-bold text-[var(--text)]" aria-label={`Editar premio ${prize.name}`} onClick={() => { setEditingPrize(prize.id); setEditName(prize.name); setEditCost(String(prize.cost)); setEditStock(String(prize.stock)); }}>Editar</button>
                    <button type="button" className={btnDanger} aria-label={`Eliminar premio ${prize.name}`} onClick={async () => { if (!confirm(`¿Eliminar el premio ${prize.name}?`)) return; try { const res = await removePrize(prize.id); if (!res.ok) { showMsg("err", humanError(res.error)); return; } await refresh(); showMsg("ok", "Premio eliminado"); } catch (e) { showMsg("err", `Error al eliminar el premio: ${e instanceof Error ? e.message : String(e)}`); } }}>Eliminar</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <form className="mt-4 flex flex-col gap-2 border-t-2 border-dashed border-[var(--border)] pt-4 sm:flex-row" onSubmit={async (e) => { e.preventDefault(); if (!newPrizeName.trim() || !(Number(newPrizeCost) > 0)) return; try { const res = await addPrize(newPrizeName.trim(), Math.trunc(Number(newPrizeCost)), Math.max(0, Math.trunc(Number(newPrizeStock) || 0))); if (!res.ok) { showMsg("err", humanError(res.error)); return; } setNewPrizeName(""); setNewPrizeCost(""); setNewPrizeStock(""); await refresh(); showMsg("ok", "Premio agregado"); } catch (err) { showMsg("err", `Error al agregar el premio: ${err instanceof Error ? err.message : String(err)}`); } }}>
            <input aria-label="Nombre del nuevo premio" type="text" placeholder="Nombre del premio" className={`${inputCls} flex-1`} value={newPrizeName} onChange={(e) => setNewPrizeName(e.target.value)} />
            <input aria-label="Costo en puntos del nuevo premio" type="number" inputMode="numeric" placeholder="Pts" className={`${inputCls} sm:w-28`} value={newPrizeCost} onChange={(e) => setNewPrizeCost(e.target.value)} />
            <input aria-label="Unidades disponibles del nuevo premio" type="number" inputMode="numeric" min={0} placeholder="Disponibles" className={`${inputCls} sm:w-32`} value={newPrizeStock} onChange={(e) => setNewPrizeStock(e.target.value)} />
            <button type="submit" className={btnPrimary} disabled={!newPrizeName.trim() || !(Number(newPrizeCost) > 0)}>AGREGAR</button>
          </form>
        </section>

        {/* Empresa */}
        <section aria-label="Empresa" className="panel p-4 sm:p-5">
          <h2 className="font-pixel text-sm text-[var(--text)]">TU EMPRESA</h2>
          <p className="mt-2 text-sm text-[var(--dim)]">El nombre y el logo aparecen arriba del juego, también en la vista de los participantes.</p>
          <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); saveCompany(); }}>
            <input aria-label="Nombre de la empresa" type="text" placeholder="Nombre de tu empresa" className={`${inputCls} flex-1`} value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
            <button type="submit" className={btnPrimary}>GUARDAR</button>
          </form>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {state.settings.logo_url ? (
              <img src={state.settings.logo_url} alt="Logo actual de la empresa" className="h-14 w-auto max-w-44 rounded-md border-2 border-[var(--border)] bg-[var(--surface-alt)] object-contain p-1" />
            ) : (
              <p className="text-sm text-[var(--dim)]">Sin logo todavía.</p>
            )}
          </div>
        </section>

        {/* Entorno y temporada */}
        <section aria-label="Entorno y temporada" className="panel p-4 sm:p-5">
          <h2 className="font-pixel text-sm text-[var(--text)]">ENTORNO Y TEMPORADA</h2>
          <p className="mt-2 text-sm text-[var(--dim)]">Cambia los colores del juego y activa una temporada: el entorno, la pista y hasta el look de Merlín se transforman para todos.</p>
          <p className="mt-4 text-sm font-semibold text-[var(--text)]">Colores del entorno</p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {Object.entries(THEMES).map(([key, t]) => (
              <button key={key} type="button" aria-pressed={state.settings.theme === key} aria-label={`Usar colores ${t.label}`} onClick={() => saveAppearance(key, state.settings.season)} className="flex min-h-12 items-center gap-2.5 rounded-md border-2 bg-[var(--surface-alt)] px-3 py-2 text-left disabled:opacity-40" style={{ borderColor: state.settings.theme === key ? "var(--accent)" : "var(--border)" }}>
                <span className="flex shrink-0 -space-x-1.5" aria-hidden="true">
                  {(THEME_SWATCHES[key] || []).map((c) => <span key={c} className="block h-5 w-5 rounded-full border-2 border-[var(--surface)]" style={{ background: c }} />)}
                </span>
                <span className="text-sm font-bold text-[var(--text)]">{t.label}</span>
              </button>
            ))}
          </div>
          <p className="mt-5 text-sm font-semibold text-[var(--text)]">Temporada</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {SEASON_OPTIONS.map((s) => (
              <button key={s.key} type="button" aria-pressed={state.settings.season === s.key} aria-label={`Activar temporada: ${s.label}`} onClick={() => saveAppearance(state.settings.theme, s.key)} className="flex min-h-12 items-center gap-2 rounded-md border-2 bg-[var(--surface-alt)] px-3 py-2 disabled:opacity-40" style={{ borderColor: state.settings.season === s.key ? "var(--accent)" : "var(--border)" }}>
                {s.icon ? <SeasonIcon name={s.icon} size={26} /> : <span aria-hidden="true" className="font-pixel text-xs text-[var(--dim)]">—</span>}
                <span className="text-sm font-bold text-[var(--text)]">{s.label}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-sm text-[var(--dim)]">{seasonOption.hint}</p>
          <div className="mt-4 flex items-end gap-4 rounded-md border-2 border-[var(--border)] px-4 py-3" style={{ background: "var(--track)" }}>
            <span className="flex shrink-0 flex-col items-center gap-1">
              <Merlin season={state.settings.season} size={54} caption={false} sleigh={state.settings.season === "navidad"} />
            </span>
            <span className="shrink-0"><Corvo season={state.settings.season} size={54} caption={false} /></span>
            <div className="min-w-0">
              <p className="font-pixel text-[10px] text-[var(--accent)]">ASÍ SE VEN MERLÍN Y CORVO</p>
              <p className="mt-1.5 text-sm text-[var(--text)]">{state.settings.season === "sin-temporada" ? "Sin temporada: Merlín trae su sombrero y túnica de siempre, y Corvo su corbata roja de RRHH." : `En ${seasonOption.label}, Merlín, Corvo y toda la pista cambian de look en La Carrera.`}</p>
            </div>
          </div>
        </section>

        {/* Historial */}
        <section aria-label="Historial de puntos" className="panel p-4 sm:p-5">
          <h2 className="font-pixel text-sm text-[var(--text)]">HISTORIAL</h2>
          <p className="mt-2 text-sm text-[var(--dim)]">Registro completo: nada se borra. Los movimientos deshechos se ven marcados y su registro de deshacer aparece como renglón propio. Para corregir un movimiento usa el apartado «Deshacer / Retroceder puntos» de arriba.</p>
          {state.events.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--dim)]">Aún no hay movimientos. Suma los primeros puntos arriba.</p>
          ) : (
            <ul className="mt-3 flex flex-col divide-y divide-[var(--border)]">
              {state.events.map((e) => (
                <li key={e.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <div className={`min-w-0 flex-1 ${e.reversed ? "opacity-60" : ""}`}>
                    <span className="font-semibold text-[var(--text)]">{nameOf(e.collaborator_id)}</span>{" "}
                    <span className={`text-[var(--dim)] ${e.reversed ? "line-through" : ""}`}>{e.label}</span>{" "}
                    <span className="font-bold" style={{ color: e.points >= 0 ? "var(--green)" : "var(--red)" }}>{e.points >= 0 ? "+" : ""}{fmt(e.points)}</span>
                    <span className="block text-xs text-[var(--dim)]">{fmtDateTime(e.created_at)} · {timeAgo(e.created_at)}</span>
                  </div>
                  {e.kind === "reversal" ? (
                    <span className="chip shrink-0 px-2.5 py-1 text-[11px] font-bold text-[var(--dim)]">REGISTRO DE DESHACER</span>
                  ) : e.reversed ? (
                    <span className="chip shrink-0 px-2.5 py-1 text-[11px] font-bold" style={{ color: "var(--red)", borderColor: "var(--red)" }}>DESHECHO</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      </main>
    </div>
  );
}

"use client";
import { useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { COLLABORATORS_SEED, SETTINGS_SEED, SOCIAL_STATES, REACTION_ITEMS, KUDO_ITEMS, JOYA_KINDS, KUDOS_PER_DAY, socialStateInfo, mexicoCityDate, mexicoCityWeekMonday } from "@/lib/data";
import type { Collaborator, Settings, SocialPost, SocialReaction, SocialKudo, SocialJoya } from "@/lib/types";
import { setSocialState, postVictory, toggleReaction, sendKudo, postJoya } from "@/lib/actions";
import PixelAvatar from "@/components/PixelAvatar";
import { PrizeIcon } from "@/components/sprites";

const YO_KEY = "rpg-social-yo";
const MISSING_MSG = "Falta correr la migración 0006 en Supabase (SQL Editor, archivo supabase/migrations/0006_social.sql) y hacer Redeploy en Vercel. Sin ella, Social muestra todo vacío y no guarda estados, victorias, pócimas ni joyas.";

const fmt = (n: number) => n.toLocaleString("es-MX");
function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "ahora mismo";
  if (mins < 60) return `hace ${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}
function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(new Date(iso));
}
// ¿La respuesta de Supabase es "esa tabla aún no existe"? Así se
// detecta que falta la migración 0006 sin romper la vista.
function isMissingTable(res: { error: { message: string; code?: string } | null }): boolean {
  if (!res.error) return false;
  const msg = res.error.message || "";
  return msg.includes("social_posts") || msg.includes("social_reactions") || msg.includes("social_kudos") || msg.includes("social_joyas") || msg.includes("social_state") || msg.includes("does not exist") || (res.error as { code?: string }).code === "42P01";
}
function socialError(e?: string, message?: string): string {
  if (message) return message;
  if (e === "falta_migracion_0006") return MISSING_MSG;
  if (e === "supabase_no_configurado") return "Supabase no conectado en Vercel — Social no guarda nada todavía. Ve a Vercel > Settings > Environment Variables, pon las 3 llaves y haz Redeploy.";
  if (e === "colaborador no encontrado") return "Colaborador no encontrado en la base de datos.";
  if (e === "publicación no encontrada") return "Esa publicación ya no existe.";
  return e ? `Error: ${e}` : "Error desconocido. Revisa tu conexión e inténtalo de nuevo.";
}

const inputCls = "min-h-10 w-full rounded-md border-2 border-[var(--border)] bg-[var(--surface-alt)] px-3 py-2 text-sm text-[var(--text)]";
const btnPrimary = "min-h-11 rounded-md border-2 border-[var(--accent)] bg-[var(--surface-alt)] px-4 py-2 font-pixel text-[11px] text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40";

export default function Social() {
  const [collaborators, setCollaborators] = useState<Collaborator[]>(COLLABORATORS_SEED);
  const [settings, setSettings] = useState<Settings>(SETTINGS_SEED);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [reactions, setReactions] = useState<SocialReaction[]>([]);
  const [kudos, setKudos] = useState<SocialKudo[]>([]);
  const [joyas, setJoyas] = useState<SocialJoya[]>([]);
  const [live, setLive] = useState(false);
  const [missingMigration, setMissingMigration] = useState(false);
  const [yoId, setYoId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgKind, setMsgKind] = useState<"ok" | "err" | "">("");
  // Formularios
  const [victoryText, setVictoryText] = useState("");
  const [kudoTo, setKudoTo] = useState<number | null>(null);
  const [kudoItem, setKudoItem] = useState("espresso");
  const [kudoMsg, setKudoMsg] = useState("");
  const [joyaKind, setJoyaKind] = useState("cancion");
  const [joyaBody, setJoyaBody] = useState("");

  function showMsg(kind: "ok" | "err", text: string) { setMsgKind(kind); setMsg(text); }

  async function load() {
    if (!isSupabaseConfigured) return;
    const [c, s] = await Promise.all([
      supabase.from("collaborators").select("*").order("id"),
      supabase.from("settings").select("*").eq("id", 1).single(),
    ]);
    const collabs = ((c.data as Collaborator[]) || COLLABORATORS_SEED).map((x) => ({ ...x, punctuality_points: (x as Collaborator).punctuality_points ?? 0, social_state: (x as Collaborator).social_state ?? "cooperativo", area: x.area ?? null }));
    setCollaborators(collabs);
    if (s.data) setSettings(s.data as Settings);
    setLive(true);
    // Social: se tolera que las tablas 0006 aún no existan.
    const [p, r, k, j] = await Promise.all([
      supabase.from("social_posts").select("*").order("created_at", { ascending: false }).limit(30),
      supabase.from("social_reactions").select("*").limit(500),
      supabase.from("social_kudos").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("social_joyas").select("*").order("created_at", { ascending: false }).limit(30),
    ]);
    if (isMissingTable(p) || isMissingTable(r) || isMissingTable(k) || isMissingTable(j)) {
      setMissingMigration(true);
      return;
    }
    setMissingMigration(false);
    setPosts((p.data as SocialPost[]) || []);
    setReactions((r.data as SocialReaction[]) || []);
    setKudos((k.data as SocialKudo[]) || []);
    setJoyas((j.data as SocialJoya[]) || []);
  }

  useEffect(() => {
    load();
    if (!isSupabaseConfigured) return;
    const channel = supabase
      .channel("social")
      .on("postgres_changes", { event: "*", schema: "public", table: "collaborators" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "social_posts" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "social_reactions" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "social_kudos" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "social_joyas" }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "Soy:" — quién soy yo en Social (sin contraseña; solo para el
  // equipo). Se guarda en el navegador y se recuerda al volver.
  useEffect(() => {
    if (yoId != null || collaborators.length === 0) return;
    try {
      const stored = Number(window.localStorage.getItem(YO_KEY));
      const found = collaborators.find((c) => c.id === stored);
      setYoId(found ? found.id : collaborators[0].id);
    } catch {
      setYoId(collaborators[0].id);
    }
  }, [collaborators, yoId]);
  function changeYo(id: number) {
    setYoId(id);
    try { window.localStorage.setItem(YO_KEY, String(id)); } catch { /* sin localStorage, no pasa nada */ }
  }

  const me = collaborators.find((c) => c.id === yoId) || collaborators[0];
  const meState = socialStateInfo(me?.social_state);
  // Pócimas: cuántas monedas me quedan hoy (día de Ciudad de México).
  const todayMX = mexicoCityDate(new Date());
  const kudosSentToday = kudos.filter((k) => k.from_id === yoId && mexicoCityDate(new Date(k.created_at)) === todayMX).length;
  const kudosRemaining = Math.max(0, KUDOS_PER_DAY - kudosSentToday);
  // Joyas: ¿ya dejé la mía esta semana (lunes a domingo)?
  const weekMonday = mexicoCityWeekMonday(new Date());
  const joyaThisWeek = joyas.some((j) => j.collaborator_id === yoId && mexicoCityWeekMonday(new Date(j.created_at)) === weekMonday);
  // Repisa: lo que cada persona ha recibido, agrupado por ítem.
  function shelfFor(collaboratorId: number): { item: string; label: string; icon: string; count: number }[] {
    const counts = new Map<string, number>();
    for (const k of kudos) if (k.to_id === collaboratorId) counts.set(k.item, (counts.get(k.item) ?? 0) + 1);
    return KUDO_ITEMS.filter((it) => (counts.get(it.id) ?? 0) > 0).map((it) => ({ item: it.id, label: it.label, icon: it.icon, count: counts.get(it.id) ?? 0 }));
  }
  const nameOf = (id: number) => collaborators.find((c) => c.id === id)?.name ?? "Alguien";
  const collabOf = (id: number) => collaborators.find((c) => c.id === id);

  async function doSetState(stateId: string) {
    if (!me || busy) return;
    setBusy(true);
    try {
      const res = await setSocialState(me.id, stateId);
      if (!res.ok) { showMsg("err", socialError(res.error, (res as { message?: string }).message)); return; }
      showMsg("ok", `Tu estado ahora es ${socialStateInfo(stateId).label}.`);
      await load();
    } finally { setBusy(false); }
  }
  async function doPostVictory() {
    if (!me || busy) return;
    setBusy(true);
    try {
      const res = await postVictory(me.id, victoryText);
      if (!res.ok) { showMsg("err", socialError(res.error, (res as { message?: string }).message)); return; }
      setVictoryText("");
      showMsg("ok", "¡Victoria colgada en el Muro!");
      await load();
    } finally { setBusy(false); }
  }
  async function doToggleReaction(postId: number, item: string) {
    if (!me || busy) return;
    setBusy(true);
    try {
      const res = await toggleReaction(postId, me.id, item);
      if (!res.ok) { showMsg("err", socialError(res.error, (res as { message?: string }).message)); return; }
      await load();
    } finally { setBusy(false); }
  }
  async function doSendKudo() {
    if (!me || busy || kudoTo == null) return;
    setBusy(true);
    try {
      const res = await sendKudo(me.id, kudoTo, kudoItem, kudoMsg);
      if (!res.ok) { showMsg("err", socialError(res.error, (res as { message?: string }).message)); return; }
      setKudoMsg("");
      showMsg("ok", `Pócima regalada a ${nameOf(kudoTo)}. Te quedan ${res.remaining ?? kudosRemaining - 1} monedas hoy.`);
      await load();
    } finally { setBusy(false); }
  }
  async function doPostJoya() {
    if (!me || busy) return;
    setBusy(true);
    try {
      const res = await postJoya(me.id, joyaKind, joyaBody);
      if (!res.ok) { showMsg("err", socialError(res.error, (res as { message?: string }).message)); return; }
      setJoyaBody("");
      showMsg("ok", "¡Joya guardada en el buzón!");
      await load();
    } finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen overflow-x-clip bg-[var(--bg)] text-[var(--text)]" data-theme={settings.theme} data-season={settings.season}>
      <main className="mx-auto w-full max-w-6xl px-3 pb-10 pt-4 sm:px-4">
        {(settings.company_name || settings.logo_url) && (
          <div className="mb-5 flex flex-wrap items-center gap-3">
            {settings.logo_url && (
              <img src={settings.logo_url} alt={`Logo de ${settings.company_name ?? "la empresa"}`} className="h-12 w-auto max-w-40 rounded-md border-2 border-[var(--border)] bg-[var(--surface)] object-contain p-1" />
            )}
            {settings.company_name && (
              <p className="min-w-0 break-words font-pixel text-base text-[var(--text)] sm:text-lg">{settings.company_name}</p>
            )}
          </div>
        )}

        {/* Cambio de vista: ahora son 3 (Social | La Carrera | Panel Master) */}
        <div className="panel mb-5 flex p-1.5" role="tablist" aria-label="Cambiar vista">
          <a href="/social" role="tab" aria-selected="true" className="min-h-11 flex-1 rounded-md px-3 py-2 text-center font-pixel text-[11px] sm:text-xs" style={{ background: "var(--accent)", color: "#14161f" }}>SOCIAL</a>
          <a href="/" role="tab" aria-selected="false" className="min-h-11 flex-1 rounded-md px-3 py-2 text-center font-pixel text-[11px] text-[var(--text)] sm:text-xs">LA CARRERA</a>
          <a href="/master" role="tab" aria-selected="false" className="min-h-11 flex-1 rounded-md px-3 py-2 text-center font-pixel text-[11px] text-[var(--text)] sm:text-xs">PANEL MASTER</a>
        </div>

        {!live && (
          <p className="mb-5 rounded-md border-2 border-dashed border-[var(--border)] px-4 py-3 text-sm text-[var(--dim)]">
            🎮 Juego RPG de Metas — Social · vista de ejemplo (configura Supabase) · Aquí el equipo comparte victorias, se regala pócimas y deja joyas.
          </p>
        )}
        {missingMigration && (
          <div className="mb-5 rounded-md border-2 border-red-500 bg-red-500/15 px-4 py-3 text-sm font-bold text-red-700 dark:text-red-300" role="alert">
            ⚠️ {MISSING_MSG}
          </div>
        )}
        {msg && (
          <div className={`mb-5 rounded-md border-2 px-4 py-3 text-sm font-bold ${msgKind === "err" ? "border-red-500 bg-red-500/15 text-red-700 dark:text-red-300" : "border-green-600 bg-green-500/15 text-green-800 dark:text-green-300"}`} role="status">
            {msg}
          </div>
        )}

        {/* Soy: — quién publica (sin contraseña, solo para el equipo) */}
        <div className="panel mb-6 flex flex-wrap items-center gap-3 p-4 sm:p-5">
          <label htmlFor="soy" className="font-pixel text-[11px] text-[var(--text)] sm:text-xs">SOY:</label>
          <select id="soy" value={yoId ?? ""} onChange={(e) => changeYo(Number(e.target.value))} className={`${inputCls} w-auto min-w-44 flex-1 sm:flex-none`}>
            {collaborators.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <p className="w-full text-xs text-[var(--dim)] sm:w-auto sm:flex-1">Tu estado, tus victorias, tus pócimas y tus joyas salen con este nombre. Sin contraseña: es solo para el equipo.</p>
        </div>

        <div className="flex flex-col gap-6">
          {/* 1) SEMÁFORO */}
          <section aria-label="Semáforo de estados" className="panel p-4 sm:p-5">
            <h2 className="font-pixel text-sm text-[var(--text)] sm:text-base">🚦 SEMÁFORO · ESTADOS DE MISIÓN</h2>
            <p className="mt-1 text-sm text-[var(--dim)]">Tu avatar dice en qué estás, sin tener que avisar por chat. Cambia tu estado cuando quieras:</p>
            <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
              {SOCIAL_STATES.map((s) => {
                const active = me?.social_state === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    disabled={busy || !me}
                    onClick={() => doSetState(s.id)}
                    aria-pressed={active}
                    className="min-h-16 rounded-md border-2 px-3 py-2 text-left disabled:opacity-40"
                    style={{ borderColor: active ? s.color : "var(--border)", background: active ? "var(--surface-alt)" : "transparent" }}
                  >
                    <span className="block text-lg leading-none">{s.emoji}</span>
                    <span className="mt-1 block text-xs font-bold text-[var(--text)]">{s.label}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-sm text-[var(--dim)]">
              Ahora mismo estás en <strong className="text-[var(--text)]">{meState.emoji} {meState.label}</strong>: {meState.text}
            </p>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {collaborators.map((c) => {
                const st = socialStateInfo(c.social_state);
                const shelf = shelfFor(c.id);
                return (
                  <div key={c.id} className="flex flex-col gap-2 rounded-md border-2 border-[var(--border)] bg-[var(--surface-alt)] p-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <PixelAvatar sprite={c.sprite} points={c.points} size={40} label={c.name} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-[var(--text)]">{c.name}</p>
                        {c.area && <p className="truncate text-xs text-[var(--dim)]">Área: {c.area}</p>}
                      </div>
                      <span className="chip shrink-0 px-2.5 py-1 text-xs font-bold max-sm:basis-full max-sm:text-center" style={{ borderColor: st.color, color: st.color }}>{st.emoji} {st.label}</span>
                    </div>
                    <p className="text-sm text-[var(--dim)]">{st.text}</p>
                    {/* Repisa: pócimas recibidas */}
                    <div className="rounded-md border-2 border-dashed border-[var(--border)] px-3 py-2">
                      <p className="text-xs font-bold text-[var(--dim)]">🧺 REPISA · PÓCIMAS RECIBIDAS</p>
                      {shelf.length === 0 ? (
                        <p className="mt-1 text-xs text-[var(--dim)]">Aún no tiene pócimas en su repisa.</p>
                      ) : (
                        <div className="mt-2 flex flex-wrap gap-3">
                          {shelf.map((it) => (
                            <span key={it.item} className="flex items-center gap-1.5 text-xs font-bold text-[var(--text)]" title={it.label}>
                              <PrizeIcon icon={it.icon} size={22} label={it.label} />×{it.count}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* 2) MURO DE VICTORIAS */}
          <section aria-label="Muro de victorias" className="panel p-4 sm:p-5">
            <h2 className="font-pixel text-sm text-[var(--text)] sm:text-base">🏆 MURO DE VICTORIAS</h2>
            <p className="mt-1 text-sm text-[var(--dim)]">¿Hiciste algo genial hoy? Cuélgalo aquí para que el equipo lo vea. En vez de “me gusta”, te dejan loot:</p>
            <div className="mt-4 flex flex-col gap-2">
              <textarea
                value={victoryText}
                onChange={(e) => setVictoryText(e.target.value.slice(0, 200))}
                maxLength={200}
                rows={2}
                placeholder="Ej. Por fin cuadró el reporte que llevaba 3 días atorado…"
                className={`${inputCls} resize-y`}
                aria-label="Tu victoria del día"
              />
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className={btnPrimary} disabled={busy || !victoryText.trim()} onClick={doPostVictory}>COLGAR MI VICTORIA</button>
                <span className="text-xs text-[var(--dim)]">{victoryText.length}/200</span>
              </div>
            </div>
            {posts.length === 0 ? (
              <p className="mt-5 text-sm font-semibold text-[var(--text)]">Aún no hay victorias colgadas. ¡Sé la primera persona en colgar la tuya!</p>
            ) : (
              <ul className="mt-5 flex flex-col gap-3">
                {posts.map((p) => {
                  const who = collabOf(p.collaborator_id);
                  const postReactions = reactions.filter((r) => r.post_id === p.id);
                  return (
                    <li key={p.id} className="rounded-md border-2 border-[var(--border)] bg-[var(--surface-alt)] p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {who && <PixelAvatar sprite={who.sprite} points={who.points} size={30} label={who.name} />}
                        <p className="min-w-0 flex-1 truncate text-sm font-bold text-[var(--text)]">{nameOf(p.collaborator_id)}</p>
                        <span className="shrink-0 text-xs text-[var(--dim)]">{timeAgo(p.created_at)}</span>
                      </div>
                      <p className="mt-2 text-sm text-[var(--text)]" style={{ overflowWrap: "anywhere" }}>{p.body}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {REACTION_ITEMS.map((it) => {
                          const count = postReactions.filter((r) => r.item === it.id).length;
                          const mine = postReactions.some((r) => r.item === it.id && r.collaborator_id === yoId);
                          return (
                            <button
                              key={it.id}
                              type="button"
                              disabled={busy}
                              onClick={() => doToggleReaction(p.id, it.id)}
                              aria-pressed={mine}
                              title={it.label}
                              className="flex min-h-10 items-center gap-1.5 rounded-md border-2 px-2.5 py-1 text-xs font-bold disabled:opacity-40"
                              style={{ borderColor: mine ? "var(--accent)" : "var(--border)", background: mine ? "var(--surface)" : "transparent", color: "var(--text)" }}
                            >
                              <PrizeIcon icon={it.icon} size={20} label={it.label} />
                              {count > 0 ? fmt(count) : ""}
                            </button>
                          );
                        })}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* 3) MÁQUINA EXPENDEDORA DE PÓCIMAS */}
          <section aria-label="Máquina expendedora de pócimas" className="panel p-4 sm:p-5">
            <h2 className="font-pixel text-sm text-[var(--text)] sm:text-base">🧪 MÁQUINA EXPENDEDORA DE PÓCIMAS</h2>
            <p className="mt-1 text-sm text-[var(--dim)]">
              Tienes <strong className="text-[var(--text)]">{fmt(kudosRemaining)} de {KUDOS_PER_DAY} monedas hoy</strong>. Regálale un ítem a un compañero que te ayudó; se guarda en su repisa. Las monedas se renuevan a medianoche.
            </p>
            <div className="mt-4 flex flex-col gap-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                <label htmlFor="kudo-to" className="text-sm font-semibold text-[var(--text)]">Para:</label>
                <select id="kudo-to" value={kudoTo ?? ""} onChange={(e) => setKudoTo(Number(e.target.value))} className={`${inputCls} sm:w-auto sm:min-w-56 sm:flex-none`}>
                  <option value="" disabled>Elige a quién…</option>
                  {collaborators.filter((c) => c.id !== yoId).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" role="radiogroup" aria-label="Ítem a regalar">
                {KUDO_ITEMS.map((it) => {
                  const active = kudoItem === it.id;
                  return (
                    <button
                      key={it.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setKudoItem(it.id)}
                      className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-md border-2 px-2 py-2"
                      style={{ borderColor: active ? "var(--accent)" : "var(--border)", background: active ? "var(--surface-alt)" : "transparent" }}
                    >
                      <PrizeIcon icon={it.icon} size={26} label={it.label} />
                      <span className="text-center text-xs font-bold leading-tight text-[var(--text)]">{it.label}</span>
                    </button>
                  );
                })}
              </div>
              <input
                value={kudoMsg}
                onChange={(e) => setKudoMsg(e.target.value.slice(0, 140))}
                maxLength={140}
                placeholder="Mensaje corto (opcional): ej. por salvarme en la junta"
                className={inputCls}
                aria-label="Mensaje del regalo (opcional)"
              />
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className={btnPrimary} disabled={busy || kudoTo == null || kudosRemaining <= 0} onClick={doSendKudo}>REGALAR PÓCIMA</button>
                {kudosRemaining <= 0 && <span className="text-xs font-bold text-[var(--dim)]">Ya usaste tus 3 monedas de hoy.</span>}
              </div>
            </div>
            {kudos.length > 0 && (
              <>
                <h3 className="font-pixel mb-2 mt-6 text-[11px] text-[var(--text)]">ÚLTIMAS PÓCIMAS REGALADAS</h3>
                <ul className="flex flex-col gap-2">
                  {kudos.slice(0, 8).map((k) => {
                    const item = KUDO_ITEMS.find((it) => it.id === k.item);
                    return (
                      <li key={k.id} className="flex flex-wrap items-center gap-2 rounded-md border-2 border-[var(--border)] bg-[var(--surface-alt)] px-3 py-2 text-sm">
                        <PrizeIcon icon={item?.icon ?? "pocion"} size={20} label={item?.label ?? "Pócima"} />
                        <span className="min-w-0 flex-1 text-[var(--text)]">
                          <strong>{nameOf(k.from_id)}</strong> le regaló <strong>{item?.label ?? k.item}</strong> a <strong>{nameOf(k.to_id)}</strong>
                          {k.message ? <span className="text-[var(--dim)]"> · “{k.message}”</span> : null}
                        </span>
                        <span className="shrink-0 text-xs text-[var(--dim)]">{timeAgo(k.created_at)}</span>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </section>

          {/* 4) BUZÓN DE JOYAS OCULTAS */}
          <section aria-label="Buzón de joyas ocultas" className="panel p-4 sm:p-5">
            <h2 className="font-pixel text-sm text-[var(--text)] sm:text-base">💎 BUZÓN DE JOYAS OCULTAS</h2>
            <p className="mt-1 text-sm text-[var(--dim)]">Una recomendación por semana y por persona (lunes a domingo): una canción para concentrarse, un lugar para comer, un atajo de Excel o un meme sano.</p>
            {joyaThisWeek ? (
              <p className="mt-4 rounded-md border-2 border-dashed border-[var(--border)] px-4 py-3 text-sm font-semibold text-[var(--text)]">
                Ya dejaste tu joya de esta semana. La próxima semana puedes dejar otra.
              </p>
            ) : (
              <div className="mt-4 flex flex-col gap-2">
                <select value={joyaKind} onChange={(e) => setJoyaKind(e.target.value)} className={inputCls} aria-label="Tipo de recomendación">
                  {JOYA_KINDS.map((k) => (
                    <option key={k.id} value={k.id}>{k.label}</option>
                  ))}
                </select>
                <textarea
                  value={joyaBody}
                  onChange={(e) => setJoyaBody(e.target.value.slice(0, 200))}
                  maxLength={200}
                  rows={2}
                  placeholder="Ej. La playlist 'Lo-Fi Beats' para concentrarse…"
                  className={`${inputCls} resize-y`}
                  aria-label="Tu recomendación de la semana"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" className={btnPrimary} disabled={busy || !joyaBody.trim()} onClick={doPostJoya}>DEJAR MI JOYA</button>
                  <span className="text-xs text-[var(--dim)]">{joyaBody.length}/200</span>
                </div>
              </div>
            )}
            {joyas.length === 0 ? (
              <p className="mt-5 text-sm font-semibold text-[var(--text)]">Aún no hay joyas en el buzón. ¡Deja la primera!</p>
            ) : (
              <ul className="mt-5 flex flex-col gap-3">
                {joyas.map((j) => {
                  const who = collabOf(j.collaborator_id);
                  const kind = JOYA_KINDS.find((k) => k.id === j.kind);
                  return (
                    <li key={j.id} className="rounded-md border-2 border-[var(--border)] bg-[var(--surface-alt)] p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {who && <PixelAvatar sprite={who.sprite} points={who.points} size={30} label={who.name} />}
                        <p className="min-w-0 flex-1 truncate text-sm font-bold text-[var(--text)]">{nameOf(j.collaborator_id)}</p>
                        <span className="chip shrink-0 px-2.5 py-1 text-xs font-bold text-[var(--text)]">{kind?.label ?? j.kind}</span>
                        <span className="shrink-0 text-xs text-[var(--dim)]">{fmtDate(j.created_at)}</span>
                      </div>
                      <p className="mt-2 text-sm text-[var(--text)]" style={{ overflowWrap: "anywhere" }}>{j.body}</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

"use server";
import { supabaseAdmin, isSupabaseConfigured } from "./supabase";
import { isMasterAuthenticated } from "./auth";
import { bestBonus } from "./data";
import type { Announcement } from "./types";

// Si Supabase no está configurado (sin env vars en Vercel), el cliente
// apunta a un placeholder y NADA se guardaría. Mejor fallar con un error
// claro que el Master muestra en rojo, que fallar en silencio.
function notConfigured() {
  return { ok: false as const, error: "supabase_no_configurado" };
}

// PIN del Master: ninguna acción que cambia datos corre sin sesión.
// Devuelve el objeto de error para devolverlo tal cual, o null si hay
// sesión. No hay excepción: el PIN no configurado tampoco abre nada.
async function requireMasterAuth() {
  if (!(await isMasterAuthenticated())) {
    return { ok: false as const, error: "no_autorizado" };
  }
  return null;
}

// Toda acción de servidor atrapa su propio error y lo devuelve como
// {ok:false, error: <mensaje>} en vez de lanzar: si lanzara, el botón
// del Master fallaba en silencio (ese era el error que reportó Osbed).
function errText(e: unknown): string {
  if (e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string") {
    return (e as { message: string }).message;
  }
  return e instanceof Error ? e.message : String(e ?? "Error desconocido");
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dbErr(res: { data: any; error: { message: string } | null }): any {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

/** Reglas de negocio (lado servidor, con service role).
 *  - Un solo numero de puntos.
 *  - Saldo nunca < 0. Canje descuenta puntos y stock (-1).
 *  - Deshacer: revierte saldo y, si era premio, devuelve +1 stock.
 *    No borra historial: marca reversed=true y agrega renglón 'reversal'.
 *  - Bono: si Merlín y Corvo coinciden, aplica el más fuerte, no se suman.
 */
async function getBonuses() {
  const db = supabaseAdmin();
  const [m, c] = await Promise.all([
    db.from("announcements").select("*").eq("active", true),
    db.from("crow_announcements").select("*").eq("active", true),
  ]);
  if (m.error) throw new Error(m.error.message);
  if (c.error) throw new Error(c.error.message);
  return {
    merlin: (m.data || []) as Announcement[],
    corvo: (c.data || []) as Announcement[],
  };
}

// Prueba de conexión: lee collaborators desde Vercel y devuelve el
// conteo o el error exacto de Supabase, para diagnosticar en el Master.
export async function testConnection() {
  const auth = await requireMasterAuth();
  if (auth) return auth;
  if (!isSupabaseConfigured) return notConfigured();
  try {
    const db = supabaseAdmin();
    const { data, error } = await db.from("collaborators").select("id, name, points").order("id");
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, count: data?.length ?? 0, collaborators: (data ?? []).map((c) => `${c.name}: ${c.points} pts`).join(" · ") };
  } catch (e) {
    return { ok: false as const, error: errText(e) };
  }
}

export async function awardPoints(collaboratorId: number, actionId: number, label: string, basePoints: number) {
  const auth = await requireMasterAuth();
  if (auth) return auth;
  if (!isSupabaseConfigured) return notConfigured();
  try {
    const db = supabaseAdmin();
    // Ajuste manual (actionId null): sin bono, como en el Master.
    const { merlin, corvo } = actionId ? await getBonuses() : { merlin: [] as Announcement[], corvo: [] as Announcement[] };
    const bonus = bestBonus(merlin, corvo, actionId ?? -1);
    const total = basePoints * bonus.multiplier;
    const coll = dbErr(await db.from("collaborators").select("points").eq("id", collaboratorId).maybeSingle());
    if (!coll) return { ok: false as const, error: "colaborador no encontrado" };
    const newPoints = (coll.points as number) + total;
    dbErr(await db.from("collaborators").update({ points: newPoints }).eq("id", collaboratorId).select("id"));
    dbErr(await db.from("point_events").insert({
      collaborator_id: collaboratorId, kind: "award", label,
      points: total, bonus_from: bonus.from,
    }).select("id"));
    return { ok: true as const, points: total, bonus_from: bonus.from, newPoints };
  } catch (e) {
    return { ok: false as const, error: errText(e) };
  }
}

export async function deductPoints(collaboratorId: number, label: string, points: number, reason?: string) {
  const auth = await requireMasterAuth();
  if (auth) return auth;
  if (!isSupabaseConfigured) return notConfigured();
  try {
    const db = supabaseAdmin();
    const coll = dbErr(await db.from("collaborators").select("points").eq("id", collaboratorId).maybeSingle());
    if (!coll) return { ok: false as const, error: "colaborador no encontrado" };
    const newPoints = Math.max(0, (coll.points as number) + points); // points negativo
    dbErr(await db.from("collaborators").update({ points: newPoints }).eq("id", collaboratorId).select("id"));
    dbErr(await db.from("point_events").insert({
      collaborator_id: collaboratorId, kind: "penalty", label, points, reason: reason || null,
    }).select("id"));
    return { ok: true as const, newPoints };
  } catch (e) {
    return { ok: false as const, error: errText(e) };
  }
}

export async function directRedeem(collaboratorId: number, prizeId: number) {
  const auth = await requireMasterAuth();
  if (auth) return auth;
  if (!isSupabaseConfigured) return notConfigured();
  try {
    const db = supabaseAdmin();
    const prize = dbErr(await db.from("prizes").select("*").eq("id", prizeId).maybeSingle());
    if (!prize) return { ok: false as const, error: "premio no encontrado" };
    if ((prize.stock as number) <= 0) return { ok: false as const, error: "out_of_stock" };
    const coll = dbErr(await db.from("collaborators").select("points").eq("id", collaboratorId).maybeSingle());
    if (!coll) return { ok: false as const, error: "colaborador no encontrado" };
    if ((coll.points as number) < (prize.cost as number)) return { ok: false as const, error: "insufficient_points" };
    const newPoints = (coll.points as number) - (prize.cost as number);
    dbErr(await db.from("collaborators").update({ points: newPoints }).eq("id", collaboratorId).select("id"));
    dbErr(await db.from("prizes").update({ stock: (prize.stock as number) - 1 }).eq("id", prizeId).select("id"));
    const red = dbErr(await db.from("redemptions").insert({
      collaborator_id: collaboratorId, prize_id: prizeId, prize_name: prize.name,
      cost: prize.cost, status: "approved", resolved_at: new Date().toISOString(),
    }).select().single());
    dbErr(await db.from("point_events").insert({
      collaborator_id: collaboratorId, kind: "redeem",
      label: `Canje: ${prize.name}`, points: -(prize.cost as number),
    }).select("id"));
    return { ok: true as const, redemption: red, newPoints };
  } catch (e) {
    return { ok: false as const, error: errText(e) };
  }
}

// Resolver una solicitud pendiente (Master): aprobar descuenta puntos y
// stock y la marca aprobada; rechazar solo la marca rechazada.
export async function resolveRedemption(redemptionId: number, approve: boolean) {
  const auth = await requireMasterAuth();
  if (auth) return auth;
  if (!isSupabaseConfigured) return notConfigured();
  try {
    const db = supabaseAdmin();
    const red = dbErr(await db.from("redemptions").select("*").eq("id", redemptionId).maybeSingle());
    if (!red) return { ok: false as const, error: "solicitud no encontrada" };
    if (red.status !== "pending") return { ok: false as const, error: "already_resolved" };
    if (!approve) {
      dbErr(await db.from("redemptions").update({ status: "rejected", resolved_at: new Date().toISOString() }).eq("id", redemptionId).select("id"));
      return { ok: true as const, approved: false };
    }
    const prize = dbErr(await db.from("prizes").select("*").eq("id", red.prize_id).maybeSingle());
    if (!prize) return { ok: false as const, error: "premio no encontrado" };
    if ((prize.stock as number) <= 0) return { ok: false as const, error: "out_of_stock" };
    const coll = dbErr(await db.from("collaborators").select("points").eq("id", red.collaborator_id).maybeSingle());
    if (!coll) return { ok: false as const, error: "colaborador no encontrado" };
    if ((coll.points as number) < (red.cost as number)) return { ok: false as const, error: "insufficient_points" };
    const newPoints = (coll.points as number) - (red.cost as number);
    dbErr(await db.from("collaborators").update({ points: newPoints }).eq("id", red.collaborator_id).select("id"));
    dbErr(await db.from("prizes").update({ stock: (prize.stock as number) - 1 }).eq("id", red.prize_id).select("id"));
    dbErr(await db.from("redemptions").update({ status: "approved", resolved_at: new Date().toISOString() }).eq("id", redemptionId).select("id"));
    dbErr(await db.from("point_events").insert({
      collaborator_id: red.collaborator_id, kind: "redeem",
      label: `Canje: ${red.prize_name}`, points: -(red.cost as number),
    }).select("id"));
    return { ok: true as const, approved: true, newPoints };
  } catch (e) {
    return { ok: false as const, error: errText(e) };
  }
}

export async function undoEvent(eventId: number) {
  const auth = await requireMasterAuth();
  if (auth) return auth;
  if (!isSupabaseConfigured) return notConfigured();
  try {
    const db = supabaseAdmin();
    const ev = dbErr(await db.from("point_events").select("*").eq("id", eventId).maybeSingle());
    if (!ev) return { ok: false as const, error: "evento no encontrado" };
    if (ev.reversed) return { ok: false as const, error: "already_reversed" };
    if (ev.kind === "reversal") return { ok: false as const, error: "is_reversal_record" };
    const coll = dbErr(await db.from("collaborators").select("points").eq("id", ev.collaborator_id).maybeSingle());
    if (!coll) return { ok: false as const, error: "colaborador no encontrado" };
    // Revertir: restar lo que se sumó, o devolver lo que se quitó.
    const newPoints = Math.max(0, (coll.points as number) - (ev.points as number));
    dbErr(await db.from("collaborators").update({ points: newPoints }).eq("id", ev.collaborator_id).select("id"));
    dbErr(await db.from("point_events").update({ reversed: true }).eq("id", eventId).select("id"));
    dbErr(await db.from("point_events").insert({
      collaborator_id: ev.collaborator_id, kind: "reversal",
      label: `Se deshizo: ${ev.label}`, points: -(ev.points as number),
    }).select("id"));
    // Si era canje, devolver +1 stock buscando el canje aprobado más reciente de ese premio.
    if (ev.kind === "redeem") {
      const name = String(ev.label).replace("Canje: ", "");
      const { data: reds } = await db.from("redemptions").select("*").eq("prize_name", name).eq("status", "approved").order("created_at", { ascending: false }).limit(1);
      const red = reds?.[0];
      if (red) {
        const prize = dbErr(await db.from("prizes").select("stock").eq("id", red.prize_id).maybeSingle());
        if (prize) dbErr(await db.from("prizes").update({ stock: (prize.stock as number) + 1 }).eq("id", red.prize_id).select("id"));
      }
    }
    return { ok: true as const, newPoints };
  } catch (e) {
    return { ok: false as const, error: errText(e) };
  }
}

// --- Catálogo de acciones (Master: ACCIONES Y PUNTOS) ---
// La tabla action_types tiene id bigint primary key SIN identity, por eso
// al agregar se calcula el siguiente id (max + 1). La columna se llama
// `label`, no `name` (la firma recibe name para que sea igual al Master).
function validAction(name: string, points: number): string | null {
  if (!name.trim()) return "Escribe el nombre de la acción.";
  if (!Number.isInteger(points) || points <= 0) return "Los puntos deben ser un número entero mayor que 0.";
  return null;
}
export async function addActionType(name: string, points: number) {
  const auth = await requireMasterAuth();
  if (auth) return auth;
  if (!isSupabaseConfigured) return notConfigured();
  const bad = validAction(name, points);
  if (bad) return { ok: false as const, error: bad };
  try {
    const db = supabaseAdmin();
    const { data: last } = await db.from("action_types").select("id").order("id", { ascending: false }).limit(1);
    const nextId = ((last?.[0]?.id as number | undefined) ?? 0) + 1;
    dbErr(await db.from("action_types").insert({ id: nextId, label: name.trim(), points: Math.trunc(points) }).select("id"));
    return { ok: true as const, id: nextId };
  } catch (e) { return { ok: false as const, error: errText(e) }; }
}
export async function updateActionType(id: number, name: string, points: number) {
  const auth = await requireMasterAuth();
  if (auth) return auth;
  if (!isSupabaseConfigured) return notConfigured();
  const bad = validAction(name, points);
  if (bad) return { ok: false as const, error: bad };
  try {
    const db = supabaseAdmin();
    dbErr(await db.from("action_types").update({ label: name.trim(), points: Math.trunc(points) }).eq("id", id).select("id"));
    return { ok: true as const };
  } catch (e) { return { ok: false as const, error: errText(e) }; }
}
export async function removeActionType(id: number) {
  const auth = await requireMasterAuth();
  if (auth) return auth;
  if (!isSupabaseConfigured) return notConfigured();
  try {
    const db = supabaseAdmin();
    // Un comunicado con bono puede apuntar a esta acción (bonus_action_id
    // es FK a action_types): quitar la referencia antes de borrar, si no
    // Supabase rechaza el borrado con error de llave foránea.
    await db.from("announcements").update({ bonus_action_id: null }).eq("bonus_action_id", id);
    await db.from("crow_announcements").update({ bonus_action_id: null }).eq("bonus_action_id", id);
    dbErr(await db.from("action_types").delete().eq("id", id).select("id"));
    return { ok: true as const };
  } catch (e) { return { ok: false as const, error: errText(e) }; }
}

// --- Colaboradores (Master: COLABORADORES) ---
// La tabla collaborators tiene id identity: se inserta sin id y Supabase
// lo genera. El nuevo colaborador empieza en 0 pts, Novato.
function validCollaborator(name: string, sprite: number, area?: string | null): string | null {
  if (!name.trim()) return "Escribe el nombre del colaborador.";
  if (name.trim().length > 40) return "El nombre no puede pasar de 40 caracteres.";
  if (!Number.isInteger(sprite) || sprite < 0 || sprite > 11) return "El monito debe ser un número entre 0 y 11.";
  if (area != null && area.trim().length > 40) return "El área no puede pasar de 40 caracteres.";
  return null;
}
// Área: opcional, se recorta; vacía se guarda como null (sin área todavía).
function cleanArea(area?: string | null): string | null {
  const a = (area ?? "").trim();
  return a ? a : null;
}
export async function addCollaborator(name: string, sprite: number, area?: string | null) {
  const auth = await requireMasterAuth();
  if (auth) return auth;
  if (!isSupabaseConfigured) return notConfigured();
  const bad = validCollaborator(name, sprite, area);
  if (bad) return { ok: false as const, error: bad };
  try {
    const db = supabaseAdmin();
    const ins = dbErr(await db.from("collaborators").insert({ name: name.trim(), sprite, area: cleanArea(area) }).select("id").single());
    return { ok: true as const, id: ins.id as number };
  } catch (e) { return { ok: false as const, error: errText(e) }; }
}
export async function updateCollaborator(id: number, name: string, sprite: number, area?: string | null) {
  const auth = await requireMasterAuth();
  if (auth) return auth;
  if (!isSupabaseConfigured) return notConfigured();
  const bad = validCollaborator(name, sprite, area);
  if (bad) return { ok: false as const, error: bad };
  try {
    const db = supabaseAdmin();
    dbErr(await db.from("collaborators").update({ name: name.trim(), sprite, area: cleanArea(area) }).eq("id", id).select("id"));
    return { ok: true as const };
  } catch (e) { return { ok: false as const, error: errText(e) }; }
}
export async function removeCollaborator(id: number) {
  const auth = await requireMasterAuth();
  if (auth) return auth;
  if (!isSupabaseConfigured) return notConfigured();
  try {
    const db = supabaseAdmin();
    // Igual que el Master original: al eliminar a un colaborador se borra
    // también su historial de movimientos y sus solicitudes de canje.
    // (En Supabase las FK son ON DELETE CASCADE, así que el borrado del
    // colaborador también lo haría solo, pero se borra explícito primero,
    // como en el original.) El stock de un premio ya canjeado por esa
    // persona NO se devuelve: el original tampoco lo devuelve.
    dbErr(await db.from("point_events").delete().eq("collaborator_id", id).select("id"));
    dbErr(await db.from("redemptions").delete().eq("collaborator_id", id).select("id"));
    dbErr(await db.from("collaborators").delete().eq("id", id).select("id"));
    return { ok: true as const };
  } catch (e) { return { ok: false as const, error: errText(e) }; }
}

// --- Faltas y castigos (Master: FALTAS Y CASTIGOS) ---
// OJO, convención de esta versión de Vercel (distinta a la del Master
// original, donde los puntos de la falta se guardan positivos): aquí la
// tabla penalty_types guarda los puntos NEGATIVOS (seed -50, -30, -15,
// -10) y deductPoints espera un número negativo para restar. Por eso el
// Master pide la magnitud en positivo (como el original: "Pts a restar",
// se muestra −50) y aquí se guarda -magnitud. Cambiar a positivo rompería
// RESTAR PUNTOS y el seed. La tabla penalty_types tiene id bigint primary
// key SIN identity, por eso al agregar se calcula max + 1, igual que
// addActionType. La columna se llama `label`, no `name`.
function validPenalty(name: string, points: number): string | null {
  if (!name.trim()) return "Escribe el nombre de la falta.";
  if (!Number.isInteger(points) || points <= 0) return "Los puntos deben ser un número entero mayor que 0.";
  return null;
}
export async function addPenaltyType(name: string, points: number) {
  const auth = await requireMasterAuth();
  if (auth) return auth;
  if (!isSupabaseConfigured) return notConfigured();
  const bad = validPenalty(name, points);
  if (bad) return { ok: false as const, error: bad };
  try {
    const db = supabaseAdmin();
    const { data: last } = await db.from("penalty_types").select("id").order("id", { ascending: false }).limit(1);
    const nextId = ((last?.[0]?.id as number | undefined) ?? 0) + 1;
    dbErr(await db.from("penalty_types").insert({ id: nextId, label: name.trim(), points: -Math.trunc(points) }).select("id"));
    return { ok: true as const, id: nextId };
  } catch (e) { return { ok: false as const, error: errText(e) }; }
}
export async function updatePenaltyType(id: number, name: string, points: number) {
  const auth = await requireMasterAuth();
  if (auth) return auth;
  if (!isSupabaseConfigured) return notConfigured();
  const bad = validPenalty(name, points);
  if (bad) return { ok: false as const, error: bad };
  try {
    const db = supabaseAdmin();
    dbErr(await db.from("penalty_types").update({ label: name.trim(), points: -Math.trunc(points) }).eq("id", id).select("id"));
    return { ok: true as const };
  } catch (e) { return { ok: false as const, error: errText(e) }; }
}
export async function removePenaltyType(id: number) {
  const auth = await requireMasterAuth();
  if (auth) return auth;
  if (!isSupabaseConfigured) return notConfigured();
  try {
    const db = supabaseAdmin();
    dbErr(await db.from("penalty_types").delete().eq("id", id).select("id"));
    return { ok: true as const };
  } catch (e) { return { ok: false as const, error: errText(e) }; }
}

// --- Gestión de premios y comunicados (Master) ---
export async function addPrize(name: string, cost: number, stock: number) {
  const auth = await requireMasterAuth();
  if (auth) return auth;
  if (!isSupabaseConfigured) return notConfigured();
  try {
    const db = supabaseAdmin();
    dbErr(await db.from("prizes").insert({ name, cost, stock }).select("id"));
    return { ok: true as const };
  } catch (e) { return { ok: false as const, error: errText(e) }; }
}
export async function updatePrize(id: number, fields: { name?: string; cost?: number; stock?: number }) {
  const auth = await requireMasterAuth();
  if (auth) return auth;
  if (!isSupabaseConfigured) return notConfigured();
  try {
    const db = supabaseAdmin();
    dbErr(await db.from("prizes").update(fields).eq("id", id).select("id"));
    return { ok: true as const };
  } catch (e) { return { ok: false as const, error: errText(e) }; }
}
export async function removePrize(id: number) {
  const auth = await requireMasterAuth();
  if (auth) return auth;
  if (!isSupabaseConfigured) return notConfigured();
  try {
    const db = supabaseAdmin();
    dbErr(await db.from("prizes").delete().eq("id", id).select("id"));
    return { ok: true as const };
  } catch (e) { return { ok: false as const, error: errText(e) }; }
}
export async function publishAnnouncement(table: "announcements" | "crow_announcements", title: string, body: string, bonusMultiplier: number | null, bonusActionId: number | null) {
  const auth = await requireMasterAuth();
  if (auth) return auth;
  if (!isSupabaseConfigured) return notConfigured();
  try {
    const db = supabaseAdmin();
    dbErr(await db.from(table).insert({ title, body, active: true, bonus_multiplier: bonusMultiplier, bonus_action_id: bonusActionId }).select("id"));
    return { ok: true as const };
  } catch (e) { return { ok: false as const, error: errText(e) }; }
}

// --- Comunicados y ajustes (Master) — antes se hacían directo con el
// cliente anon; ahora pasan por server action con PIN, como el resto. ---
export async function toggleAnnouncementAction(table: "announcements" | "crow_announcements", id: number, active: boolean) {
  const auth = await requireMasterAuth();
  if (auth) return auth;
  if (!isSupabaseConfigured) return notConfigured();
  try {
    const db = supabaseAdmin();
    const { error } = await db.from(table).update({ active: !active }).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true as const, active: !active };
  } catch (e) { return { ok: false as const, error: errText(e) }; }
}
export async function deleteAnnouncementAction(table: "announcements" | "crow_announcements", id: number) {
  const auth = await requireMasterAuth();
  if (auth) return auth;
  if (!isSupabaseConfigured) return notConfigured();
  try {
    const db = supabaseAdmin();
    const { error } = await db.from(table).delete().eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  } catch (e) { return { ok: false as const, error: errText(e) }; }
}
export async function saveCompanyAction(companyName: string) {
  const auth = await requireMasterAuth();
  if (auth) return auth;
  if (!isSupabaseConfigured) return notConfigured();
  try {
    const db = supabaseAdmin();
    const { error } = await db.from("settings").update({ company_name: companyName }).eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  } catch (e) { return { ok: false as const, error: errText(e) }; }
}
// --- Logo de la empresa (Master: TU EMPRESA) ---
// El logo se guarda como data URL en settings.logo_url (columna text,
// sin límite práctico para una imagen de 2.5 MB en base64, ~3.3 MB de
// texto). Igual que el Master original: máx 2.5 MB, solo PNG/JPG/WebP/GIF.
const LOGO_MIMES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
const LOGO_MAX_BYTES = 2_500_000;
export async function setCompanyLogo(dataBase64: string, mimeType: string) {
  const auth = await requireMasterAuth();
  if (auth) return auth;
  if (!isSupabaseConfigured) return notConfigured();
  if (!(LOGO_MIMES as readonly string[]).includes(mimeType)) {
    return { ok: false as const, error: "Ese archivo no es una imagen válida (PNG, JPG, WebP o GIF)." };
  }
  if (!dataBase64 || !/^[A-Za-z0-9+/=]+$/.test(dataBase64)) {
    return { ok: false as const, error: "Ese archivo no es una imagen válida (PNG, JPG, WebP o GIF)." };
  }
  // Tamaño del archivo original aproximado desde el base64 (3 bytes por
  // cada 4 caracteres): rechazar lo que pase de 2.5 MB.
  if (Math.floor((dataBase64.length * 3) / 4) > LOGO_MAX_BYTES) {
    return { ok: false as const, error: "La imagen pesa más de 2.5 MB; usa una más ligera." };
  }
  try {
    const db = supabaseAdmin();
    const { error } = await db.from("settings").update({ logo_url: `data:${mimeType};base64,${dataBase64}` }).eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  } catch (e) { return { ok: false as const, error: errText(e) }; }
}
export async function removeCompanyLogo() {
  const auth = await requireMasterAuth();
  if (auth) return auth;
  if (!isSupabaseConfigured) return notConfigured();
  try {
    const db = supabaseAdmin();
    const { error } = await db.from("settings").update({ logo_url: null }).eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  } catch (e) { return { ok: false as const, error: errText(e) }; }
}
export async function saveAppearanceAction(theme: string, season: string) {
  const auth = await requireMasterAuth();
  if (auth) return auth;
  if (!isSupabaseConfigured) return notConfigured();
  try {
    const db = supabaseAdmin();
    const { error } = await db.from("settings").update({ theme, season }).eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  } catch (e) { return { ok: false as const, error: errText(e) }; }
}

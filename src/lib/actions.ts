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

"use server";
import { supabaseAdmin, isSupabaseConfigured } from "./supabase";
import { bestBonus } from "./data";
import type { Announcement } from "./types";

// Si Supabase no está configurado (sin env vars en Vercel), el cliente
// apunta a un placeholder y NADA se guardaría. Mejor fallar con un error
// claro que el Master muestra en rojo, que fallar en silencio.
function notConfigured() {
  return { ok: false as const, error: "supabase_no_configurado" };
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
  return {
    merlin: (m.data || []) as Announcement[],
    corvo: (c.data || []) as Announcement[],
  };
}

export async function awardPoints(collaboratorId: number, actionId: number, label: string, basePoints: number) {
  if (!isSupabaseConfigured) return notConfigured();
  const db = supabaseAdmin();
  const { merlin, corvo } = await getBonuses();
  const bonus = bestBonus(merlin, corvo, actionId);
  const total = basePoints * bonus.multiplier;
  const { data: coll } = await db.from("collaborators").select("points").eq("id", collaboratorId).single();
  if (!coll) return { ok: false, error: "colaborador no encontrado" };
  const newPoints = (coll.points as number) + total;
  await db.from("collaborators").update({ points: newPoints }).eq("id", collaboratorId);
  await db.from("point_events").insert({
    collaborator_id: collaboratorId, kind: "award", label,
    points: total, bonus_from: bonus.from,
  });
  return { ok: true, points: total, bonus_from: bonus.from, newPoints };
}

export async function deductPoints(collaboratorId: number, label: string, points: number, reason?: string) {
  if (!isSupabaseConfigured) return notConfigured();
  const db = supabaseAdmin();
  const { data: coll } = await db.from("collaborators").select("points").eq("id", collaboratorId).single();
  if (!coll) return { ok: false, error: "colaborador no encontrado" };
  const newPoints = Math.max(0, (coll.points as number) + points); // points negativo
  await db.from("collaborators").update({ points: newPoints }).eq("id", collaboratorId);
  await db.from("point_events").insert({
    collaborator_id: collaboratorId, kind: "penalty", label, points, reason: reason || null,
  });
  return { ok: true, newPoints };
}

export async function directRedeem(collaboratorId: number, prizeId: number) {
  if (!isSupabaseConfigured) return notConfigured();
  const db = supabaseAdmin();
  const { data: prize } = await db.from("prizes").select("*").eq("id", prizeId).single();
  if (!prize) return { ok: false, error: "premio no encontrado" };
  if ((prize.stock as number) <= 0) return { ok: false, error: "out_of_stock" };
  const { data: coll } = await db.from("collaborators").select("points").eq("id", collaboratorId).single();
  if (!coll) return { ok: false, error: "colaborador no encontrado" };
  if ((coll.points as number) < (prize.cost as number)) return { ok: false, error: "insufficient_points" };
  const newPoints = (coll.points as number) - (prize.cost as number);
  await db.from("collaborators").update({ points: newPoints }).eq("id", collaboratorId);
  await db.from("prizes").update({ stock: (prize.stock as number) - 1 }).eq("id", prizeId);
  const { data: red } = await db.from("redemptions").insert({
    collaborator_id: collaboratorId, prize_id: prizeId, prize_name: prize.name,
    cost: prize.cost, status: "approved", resolved_at: new Date().toISOString(),
  }).select().single();
  await db.from("point_events").insert({
    collaborator_id: collaboratorId, kind: "redeem",
    label: `Canje: ${prize.name}`, points: -(prize.cost as number),
  });
  return { ok: true, redemption: red, newPoints };
}

export async function undoEvent(eventId: number) {
  if (!isSupabaseConfigured) return notConfigured();
  const db = supabaseAdmin();
  const { data: ev } = await db.from("point_events").select("*").eq("id", eventId).single();
  if (!ev) return { ok: false, error: "evento no encontrado" };
  if (ev.reversed) return { ok: false, error: "already_reversed" };
  const { data: coll } = await db.from("collaborators").select("points").eq("id", ev.collaborator_id).single();
  if (!coll) return { ok: false, error: "colaborador no encontrado" };
  // Revertir: restar lo que se sumó, o devolver lo que se quitó.
  const newPoints = Math.max(0, (coll.points as number) - (ev.points as number));
  await db.from("collaborators").update({ points: newPoints }).eq("id", ev.collaborator_id);
  await db.from("point_events").update({ reversed: true }).eq("id", eventId);
  await db.from("point_events").insert({
    collaborator_id: ev.collaborator_id, kind: "reversal",
    label: `Se deshizo: ${ev.label}`, points: -(ev.points as number),
  });
  // Si era canje, devolver +1 stock buscando el canje aprobado más reciente de ese premio.
  if (ev.kind === "redeem") {
    const name = String(ev.label).replace("Canje: ", "");
    const { data: red } = await db.from("redemptions").select("*").eq("prize_name", name).eq("status", "approved").order("created_at", { ascending: false }).limit(1).single();
    if (red) {
      const { data: prize } = await db.from("prizes").select("stock").eq("id", red.prize_id).single();
      if (prize) await db.from("prizes").update({ stock: (prize.stock as number) + 1 }).eq("id", red.prize_id);
    }
  }
  return { ok: true, newPoints };
}

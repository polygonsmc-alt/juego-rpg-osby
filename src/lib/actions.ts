"use server";
import webpush from "web-push";
import { supabaseAdmin, isSupabaseConfigured } from "./supabase";
import { isMasterAuthenticated } from "./auth";
import { bestBonus, isPunctualityAction, isPunctualityPenalty, isPunctualityPrize, linkedPrizeForAction, exclusivePrizeInfo, exclusiveShortfallMessage } from "./data";
import type { Announcement, ActionType, Prize } from "./types";

// Mensaje exacto que pide Osbed cuando no alcanzan los puntos de
// puntualidad para la cantidad de bonos que quiere canjear. Se devuelve
// tal cual (campo `message`) para que el Master lo muestre sin prefijos.
function punctualityShortfallMessage(quantity: number, punctualityPoints: number): string {
  return `NO CUMPLES CON LOS REQUERIMIENTOS PARA CANJEAR ${quantity} BONOS, solo cuentas con ${punctualityPoints} puntos que sí puedes canjear por BONOS.`;
}
// Etiqueta del historial cuando se canjean varias unidades de un premio.
function redeemLabel(prizeName: string, quantity: number): string {
  return quantity > 1 ? `Canje: ${quantity}x ${prizeName}` : `Canje: ${prizeName}`;
}
// Lee saldo total y sub-saldo de puntualidad de un colaborador.
// `?? 0` por si la fila es anterior a la migración 0003.
async function getBalances(db: ReturnType<typeof supabaseAdmin>, collaboratorId: number) {
  const coll = dbErr(await db.from("collaborators").select("points, punctuality_points").eq("id", collaboratorId).maybeSingle());
  if (!coll) return null;
  return { points: (coll.points as number) ?? 0, punctualityPoints: (coll.punctuality_points as number) ?? 0 };
}

// --- Bolsas exclusivas genéricas (acción → premio), migración 0004 ---
// Una bolsa es parte del saldo total ganada con acciones ligadas a un
// premio: bolsa[prizeId] = puntos. La bolsa del BONO DE PUNTUALIDAD
// vive en collaborators.punctuality_points (0003); las demás, en
// collaborator_bags. La suma de las bolsas nunca pasa del total.
type BagMap = Record<number, number>;
type Balances = { points: number; punctualityPoints: number };
async function getBonoPrizeId(db: ReturnType<typeof supabaseAdmin>): Promise<number | null> {
  const prizes = dbErr(await db.from("prizes").select("id, name").order("id"));
  const bono = (prizes as { id: number; name: string }[]).find((p) => isPunctualityPrize(p.name as string));
  return bono ? bono.id : null;
}
async function getBags(db: ReturnType<typeof supabaseAdmin>, collaboratorId: number, balances: Balances, bonoPrizeId: number | null): Promise<BagMap> {
  const bags: BagMap = {};
  if (bonoPrizeId != null) bags[bonoPrizeId] = balances.punctualityPoints;
  const res = await db.from("collaborator_bags").select("prize_id, points").eq("collaborator_id", collaboratorId);
  if (res.error) {
    const msg = res.error.message || "";
    if (msg.includes("collaborator_bags") || msg.includes("does not exist") || (res.error as { code?: string }).code === "42P01") {
      throw new Error("falta_migracion_0004");
    }
    throw new Error(msg);
  }
  for (const row of (res.data as { prize_id: number; points: number }[]) || []) {
    if (row.prize_id === bonoPrizeId) continue; // la del bono vive en punctuality_points
    bags[row.prize_id] = row.points ?? 0;
  }
  return bags;
}
function sumBags(bags: BagMap): number {
  return Object.values(bags).reduce((a, b) => a + (b || 0), 0);
}
// Guarda las bolsas (excepto la del bono, que va en punctuality_points).
async function persistBags(db: ReturnType<typeof supabaseAdmin>, collaboratorId: number, bags: BagMap, bonoPrizeId: number | null) {
  for (const [prizeIdStr, pts] of Object.entries(bags)) {
    const prizeId = Number(prizeIdStr);
    if (prizeId === bonoPrizeId) continue;
    if ((pts || 0) > 0) {
      dbErr(await db.from("collaborator_bags").upsert({ collaborator_id: collaboratorId, prize_id: prizeId, points: pts }, { onConflict: "collaborator_id,prize_id" }).select("prize_id"));
    } else {
      dbErr(await db.from("collaborator_bags").delete().eq("collaborator_id", collaboratorId).eq("prize_id", prizeId).select("prize_id"));
    }
  }
}
// Para un canje general: primero se gastan los puntos que NO están en
// ninguna bolsa; solo si no alcanza se toma de las bolsas, de la más
// grande primero. Devuelve cuánto se tomó de cada bolsa.
function consumeBagsForGeneral(bags: BagMap, totalPoints: number, cost: number): BagMap {
  const used: BagMap = {};
  const nonBag = Math.max(0, totalPoints - sumBags(bags));
  let need = Math.max(0, cost - nonBag);
  if (need <= 0) return used;
  const ordered = Object.entries(bags).sort((a, b) => (b[1] || 0) - (a[1] || 0));
  for (const [prizeIdStr, pts] of ordered) {
    if (need <= 0) break;
    const take = Math.min(pts || 0, need);
    if (take > 0) { used[Number(prizeIdStr)] = take; need -= take; }
  }
  return used;
}
// Recorta las bolsas (la más grande primero) hasta que su suma no pase
// del nuevo total. Devuelve cuánto se recortó de cada bolsa.
function trimBags(bags: BagMap, newTotal: number): { trimmed: BagMap; after: BagMap } {
  const after: BagMap = { ...bags };
  const trimmed: BagMap = {};
  let excess = sumBags(after) - newTotal;
  if (excess <= 0) return { trimmed, after };
  const ordered = Object.entries(after).sort((a, b) => (b[1] || 0) - (a[1] || 0));
  for (const [prizeIdStr, pts] of ordered) {
    if (excess <= 0) break;
    const cut = Math.min(pts || 0, excess);
    if (cut > 0) { after[Number(prizeIdStr)] = (pts || 0) - cut; trimmed[Number(prizeIdStr)] = cut; excess -= cut; }
  }
  return { trimmed, after };
}
// Formato guardado en point_events.reason para poder deshacer bolsas:
// - canje: `bolsas:{"7":500,"12":200}` (lo que se tomó de cada bolsa)
// - premio de acción: `bolsa:<prizeId>:<delta>` (lo que sumó esa bolsa)
// - resta que recortó bolsas: se agrega `bolsas:{...}` al motivo.
function bagsReason(used: BagMap): string | null {
  const entries = Object.entries(used).filter(([, v]) => (v || 0) > 0);
  if (!entries.length) return null;
  return `bolsas:${JSON.stringify(Object.fromEntries(entries))}`;
}
function parseBagsReason(reason: string | null | undefined): BagMap {
  if (!reason) return {};
  const m = /bolsas:\{[^}]*\}/.exec(reason);
  if (!m) return {};
  try {
    const obj = JSON.parse(m[0].slice("bolsas:".length)) as Record<string, unknown>;
    const out: BagMap = {};
    for (const [k, v] of Object.entries(obj)) out[Number(k)] = Number(v) || 0;
    return out;
  } catch { return {}; }
}
function parseAwardBagReason(reason: string | null | undefined): { prizeId: number; delta: number } | null {
  if (!reason) return null;
  const m = /bolsa:(\d+):(\d+)/.exec(reason);
  if (!m) return null;
  return { prizeId: Number(m[1]), delta: Number(m[2]) };
}
// Cálculo compartido de un canje (directo y aprobar solicitud): valida
// ANTES de descontar nada y devuelve los saldos nuevos y lo tomado de
// cada bolsa. Premio exclusivo = alguna acción ligada a él: solo se
// paga con su bolsa. Premio general = primero puntos sin bolsa.
function computeRedeem(balances: Balances, bags: BagMap, prize: Prize, qty: number, bonoPrizeId: number | null, actions: ActionType[], prizes: Prize[], totalCostOverride?: number) {
  // totalCostOverride: una solicitud pendiente guarda su propio costo
  // total (el precio de cuando se pidió); si se pasa, se descuenta ese.
  const totalCost = totalCostOverride ?? (prize.cost as number) * qty;
  if ((prize.stock as number) < qty) {
    return (prize.stock as number) <= 0
      ? { ok: false as const, error: "out_of_stock" }
      : { ok: false as const, error: "stock_insuficiente", message: `Solo quedan ${prize.stock} unidades de «${prize.name}», no se pueden canjear ${qty}.` };
  }
  const { exclusive, actionLabels } = exclusivePrizeInfo(prize, actions, prizes);
  const bagPoints = bags[prize.id] ?? 0;
  if (exclusive && bagPoints < totalCost) {
    if (isPunctualityPrize(prize.name as string)) {
      return { ok: false as const, error: "punctuality_insufficient", message: punctualityShortfallMessage(qty, balances.punctualityPoints) };
    }
    return { ok: false as const, error: "exclusive_insufficient", message: exclusiveShortfallMessage(qty, prize.name as string, bagPoints, actionLabels) };
  }
  if (balances.points < totalCost) {
    return { ok: false as const, error: "insufficient_points", message: `No le alcanzan los puntos: tiene ${balances.points} pts y ${qty} × «${prize.name}» cuestan ${totalCost} pts.` };
  }
  const newPoints = balances.points - totalCost;
  let bagUsed: BagMap = {};
  let bagAfter: BagMap = { ...bags };
  if (exclusive) {
    bagUsed = { [prize.id]: totalCost };
    bagAfter[prize.id] = bagPoints - totalCost;
  } else {
    bagUsed = consumeBagsForGeneral(bags, balances.points, totalCost);
    for (const [k, v] of Object.entries(bagUsed)) bagAfter[Number(k)] = (bags[Number(k)] || 0) - v;
  }
  const newPunctualityPoints = bonoPrizeId != null ? Math.max(0, Math.min(newPoints, bagAfter[bonoPrizeId] ?? balances.punctualityPoints)) : balances.punctualityPoints;
  const punctualityUsed = Math.max(0, balances.punctualityPoints - newPunctualityPoints);
  return { ok: true as const, totalCost, newPoints, newPunctualityPoints, bagUsed, bagAfter, punctualityUsed, exclusive };
}

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
 *  - Un solo numero de puntos (saldo total) + bolsas exclusivas.
 *  - Bolsa = parte del total ganada con acciones ligadas a un premio
 *    (action_types.linked_prize_id). La puntualidad es la primera bolsa:
 *    check-in puntual, semana sin faltas y mes perfecto suman lo mismo
 *    al total y a punctuality_points; ventas, leads y entregas suman
 *    solo al total, salvo que el Master las ligue a un premio.
 *  - Retardo / Falta injustificada restan también de punctuality_points.
 *  - Saldo nunca < 0; ninguna bolsa baja de 0 ni su suma pasa del total.
 *  - Canje descuenta puntos y stock (por cantidad). Un premio exclusivo
 *    (alguna acción ligada a él, como el BONO DE PUNTUALIDAD) solo se
 *    canjea con su bolsa. Si no se canjea, esos puntos se quedan y suman
 *    para los premios generales.
 *  - Canje de premio general: se descuenta primero de los puntos que NO
 *    están en ninguna bolsa y solo si no alcanza, de las bolsas (la más
 *    grande primero).
 *  - Deshacer: revierte saldo y, si era premio, devuelve el stock por
 *    cantidad. No borra historial: marca reversed=true y agrega renglón
 *    'reversal'. El deshacer también revierte las bolsas que ese
 *    movimiento había movido (guardado en point_events.reason como
 *    `bolsas:{...}` en los canjes y `bolsa:<prizeId>:<n>` en los premios;
 *    en canjes viejos, `punctualidad:<n>`).
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
    const balances = await getBalances(db, collaboratorId);
    if (!balances) return { ok: false as const, error: "colaborador no encontrado" };
    const newPoints = balances.points + total;
    // Bolsa exclusiva: si la acción está ligada a un premio (o es de
    // puntualidad), el mismo monto suma a la bolsa de ese premio.
    // Se calcula ANTES del sub-saldo: una acción con nombre nuevo
    // ligada al BONO DE PUNTUALIDAD (ej. "check in", "Puntualidad
    // perfecta | Mes") también es de puntualidad aunque su nombre no
    // esté en la lista vieja; sin esto su bolsa no crecía.
    let linkedPrizeId: number | null = null;
    let bonoPrizeId: number | null = null;
    if (actionId) {
      const prizes = dbErr(await db.from("prizes").select("*").order("id")) as Prize[];
      const actionRow = dbErr(await db.from("action_types").select("*").eq("id", actionId).maybeSingle()) as ActionType | null;
      bonoPrizeId = await getBonoPrizeId(db);
      linkedPrizeId = linkedPrizeForAction(actionRow ?? { id: actionId, label, points: basePoints, linked_prize_id: null }, prizes);
    }
    // Acción de puntualidad: el mismo monto suma también al sub-saldo.
    const punctualityDelta = (isPunctualityAction(actionId || null, label) || (linkedPrizeId != null && linkedPrizeId === bonoPrizeId)) ? total : 0;
    const newPunctualityPoints = Math.max(0, Math.min(newPoints, balances.punctualityPoints + punctualityDelta));
    let bagAfter = 0;
    if (actionId && linkedPrizeId != null) {
      const bags = await getBags(db, collaboratorId, balances, bonoPrizeId);
      const after: BagMap = { ...bags, [linkedPrizeId]: (bags[linkedPrizeId] ?? 0) + total };
      if (linkedPrizeId === bonoPrizeId) after[linkedPrizeId] = newPunctualityPoints;
      await persistBags(db, collaboratorId, after, bonoPrizeId);
      bagAfter = after[linkedPrizeId];
    }
    dbErr(await db.from("collaborators").update({ points: newPoints, punctuality_points: newPunctualityPoints }).eq("id", collaboratorId).select("id"));
    dbErr(await db.from("point_events").insert({
      collaborator_id: collaboratorId, kind: "award", label,
      points: total, bonus_from: bonus.from,
      reason: linkedPrizeId != null ? `bolsa:${linkedPrizeId}:${total}` : null,
    }).select("id"));
    return { ok: true as const, points: total, bonus_from: bonus.from, newPoints, newPunctualityPoints, punctualityDelta, linkedPrizeId, bagAfter };
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
    const balances = await getBalances(db, collaboratorId);
    if (!balances) return { ok: false as const, error: "colaborador no encontrado" };
    const newPoints = Math.max(0, balances.points + points); // points negativo
    // Falta de puntualidad (Retardo / Falta injustificada): también resta
    // del sub-saldo, sin bajar de 0. Cualquier otra resta solo recorta el
    // sub-saldo si el total queda por debajo de él (nunca puede pasar
    // del total: primero se gastan los puntos que no son de puntualidad).
    const newPunctualityPoints = isPunctualityPenalty(label)
      ? Math.max(0, Math.min(newPoints, balances.punctualityPoints - Math.abs(points)))
      : Math.min(balances.punctualityPoints, newPoints);
    // Las demás bolsas también se recortan si su suma pasa del nuevo
    // total (la más grande primero); lo recortado se guarda en el motivo
    // para que Deshacer lo pueda devolver.
    const bonoPrizeId = await getBonoPrizeId(db);
    const bags = await getBags(db, collaboratorId, balances, bonoPrizeId);
    const bagsWithPunct: BagMap = { ...bags, ...(bonoPrizeId != null ? { [bonoPrizeId]: newPunctualityPoints } : {}) };
    const { trimmed, after } = trimBags(bagsWithPunct, newPoints);
    // Si el sub-saldo bajó más de lo que la falta quitó por el tope
    // (nunca pasa del total), esa parte extra también se guarda como
    // recorte para que Deshacer la devuelva. En una falta de puntualidad
    // el deshacer ya devuelve lo que la falta quitó (|puntos|), así que
    // aquí solo se agrega lo que bajó por encima de eso.
    if (bonoPrizeId != null) {
      const punctualityConsumed = balances.punctualityPoints - newPunctualityPoints;
      const alreadyRestored = isPunctualityPenalty(label) ? Math.abs(points) : 0;
      const extra = punctualityConsumed - alreadyRestored;
      if (extra > 0) trimmed[bonoPrizeId] = (trimmed[bonoPrizeId] ?? 0) + extra;
    }
    const finalPunctuality = bonoPrizeId != null ? (after[bonoPrizeId] ?? newPunctualityPoints) : newPunctualityPoints;
    await persistBags(db, collaboratorId, after, bonoPrizeId);
    const trimmedReason = bagsReason(trimmed);
    dbErr(await db.from("collaborators").update({ points: newPoints, punctuality_points: finalPunctuality }).eq("id", collaboratorId).select("id"));
    dbErr(await db.from("point_events").insert({
      collaborator_id: collaboratorId, kind: "penalty", label, points,
      reason: trimmedReason ? (reason ? `${reason} · ${trimmedReason}` : trimmedReason) : (reason || null),
    }).select("id"));
    return { ok: true as const, newPoints, newPunctualityPoints: finalPunctuality };
  } catch (e) {
    return { ok: false as const, error: errText(e) };
  }
}

export async function directRedeem(collaboratorId: number, prizeId: number, quantity: number = 1) {
  const auth = await requireMasterAuth();
  if (auth) return auth;
  if (!isSupabaseConfigured) return notConfigured();
  const qty = Math.trunc(Number(quantity));
  if (!Number.isFinite(qty) || qty < 1) return { ok: false as const, error: "cantidad_invalida", message: "La cantidad a canjear debe ser 1 o más." };
  try {
    const db = supabaseAdmin();
    const prize = dbErr(await db.from("prizes").select("*").eq("id", prizeId).maybeSingle());
    if (!prize) return { ok: false as const, error: "premio no encontrado" };
    const balances = await getBalances(db, collaboratorId);
    if (!balances) return { ok: false as const, error: "colaborador no encontrado" };
    const bonoPrizeId = await getBonoPrizeId(db);
    const bags = await getBags(db, collaboratorId, balances, bonoPrizeId);
    const actions = dbErr(await db.from("action_types").select("*").order("id")) as ActionType[];
    const prizes = dbErr(await db.from("prizes").select("*").order("id")) as Prize[];
    // Validación ANTES de descontar nada (computeRedeem): stock, puntos
    // totales y, si el premio es exclusivo, su bolsa.
    const calc = computeRedeem(balances, bags, prize, qty, bonoPrizeId, actions, prizes);
    if (!calc.ok) return calc;
    const { totalCost, newPoints, newPunctualityPoints, bagUsed, bagAfter, punctualityUsed } = calc;
    dbErr(await db.from("collaborators").update({ points: newPoints, punctuality_points: newPunctualityPoints }).eq("id", collaboratorId).select("id"));
    await persistBags(db, collaboratorId, bagAfter, bonoPrizeId);
    dbErr(await db.from("prizes").update({ stock: (prize.stock as number) - qty }).eq("id", prizeId).select("id"));
    const red = dbErr(await db.from("redemptions").insert({
      collaborator_id: collaboratorId, prize_id: prizeId, prize_name: prize.name,
      cost: totalCost, quantity: qty, status: "approved", resolved_at: new Date().toISOString(),
    }).select().single());
    dbErr(await db.from("point_events").insert({
      collaborator_id: collaboratorId, kind: "redeem",
      label: redeemLabel(prize.name as string, qty), points: -totalCost,
      // Para que Deshacer pueda devolver a cada bolsa exactamente lo que
      // este canje le quitó (en un canje general puede ser 0).
      reason: bagsReason(bagUsed) ?? (punctualityUsed > 0 ? `punctualidad:${punctualityUsed}` : null),
    }).select("id"));
    return { ok: true as const, redemption: red, newPoints, newPunctualityPoints, quantity: qty, totalCost, punctualityUsed };
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
    // Las solicitudes pendientes son de 1 unidad (así se creaban antes);
    // si la fila ya trae cantidad, se respeta.
    const qty = Math.max(1, Math.trunc(Number((red as { quantity?: number }).quantity ?? 1)));
    const cost = red.cost as number; // costo total guardado en la solicitud
    const balances = await getBalances(db, red.collaborator_id as number);
    if (!balances) return { ok: false as const, error: "colaborador no encontrado" };
    const bonoPrizeId = await getBonoPrizeId(db);
    const bags = await getBags(db, red.collaborator_id as number, balances, bonoPrizeId);
    const actions = dbErr(await db.from("action_types").select("*").order("id")) as ActionType[];
    const prizes = dbErr(await db.from("prizes").select("*").order("id")) as Prize[];
    const calc = computeRedeem(balances, bags, prize, qty, bonoPrizeId, actions, prizes, cost);
    if (!calc.ok) return calc;
    const { totalCost, newPoints, newPunctualityPoints, bagUsed, bagAfter, punctualityUsed } = calc;
    dbErr(await db.from("collaborators").update({ points: newPoints, punctuality_points: newPunctualityPoints }).eq("id", red.collaborator_id).select("id"));
    await persistBags(db, red.collaborator_id as number, bagAfter, bonoPrizeId);
    dbErr(await db.from("prizes").update({ stock: (prize.stock as number) - qty }).eq("id", red.prize_id).select("id"));
    dbErr(await db.from("redemptions").update({ status: "approved", resolved_at: new Date().toISOString() }).eq("id", redemptionId).select("id"));
    dbErr(await db.from("point_events").insert({
      collaborator_id: red.collaborator_id, kind: "redeem",
      label: redeemLabel(red.prize_name as string, qty), points: -totalCost,
      reason: bagsReason(bagUsed) ?? (punctualityUsed > 0 ? `punctualidad:${punctualityUsed}` : null),
    }).select("id"));
    return { ok: true as const, approved: true, newPoints, newPunctualityPoints };
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
    const coll = dbErr(await db.from("collaborators").select("points, punctuality_points").eq("id", ev.collaborator_id).maybeSingle());
    if (!coll) return { ok: false as const, error: "colaborador no encontrado" };
    const points = (coll.points as number) ?? 0;
    const punctualityPoints = (coll.punctuality_points as number) ?? 0;
    // Revertir: restar lo que se sumó, o devolver lo que se quitó.
    const newPoints = Math.max(0, points - (ev.points as number));
    // Las bolsas se revierten solo en lo que ese movimiento movió:
    // - premio (award): se quita de la bolsa lo que ese premio sumó
    //   (guardado en reason como `bolsa:<prizeId>:<delta>`, o por la
    //   acción ligada a esa etiqueta si el evento es anterior al ligado);
    // - falta (penalty): se devuelve lo recortado de cada bolsa
    //   (guardado en reason como `bolsas:{...}`) y, si es de puntualidad,
    //   lo que la falta quitó del sub-saldo;
    // - canje (redeem): se devuelve lo guardado en reason
    //   (`bolsas:{...}`; en eventos viejos, `punctualidad:<n>`).
    // La suma de las bolsas nunca pasa del nuevo total.
    const balances = { points, punctualityPoints };
    const bonoPrizeId = await getBonoPrizeId(db);
    const bags = await getBags(db, ev.collaborator_id as number, balances, bonoPrizeId);
    const actions = dbErr(await db.from("action_types").select("*").order("id")) as ActionType[];
    const prizes = dbErr(await db.from("prizes").select("*").order("id")) as Prize[];
    const reason = String((ev as { reason?: string | null }).reason ?? "");
    let bagAfter: BagMap = { ...bags };
    if (ev.kind === "award") {
      const parsed = parseAwardBagReason(reason);
      let prizeId: number | null = parsed ? parsed.prizeId : null;
      const delta = parsed ? parsed.delta : (ev.points as number);
      if (prizeId == null) {
        const act = actions.find((a) => a.label === (ev.label as string));
        prizeId = act ? linkedPrizeForAction(act, prizes) : (isPunctualityAction(null, ev.label as string) ? bonoPrizeId : null);
      }
      if (prizeId != null) bagAfter[prizeId] = Math.max(0, (bags[prizeId] ?? 0) - delta);
    } else if (ev.kind === "penalty") {
      const restored = parseBagsReason(reason);
      for (const [k, v] of Object.entries(restored)) bagAfter[Number(k)] = (bags[Number(k)] ?? 0) + v;
      if (isPunctualityPenalty(ev.label as string) && bonoPrizeId != null) {
        bagAfter[bonoPrizeId] = (bagAfter[bonoPrizeId] ?? punctualityPoints) + Math.abs(ev.points as number);
      }
    } else if (ev.kind === "redeem") {
      const restored = parseBagsReason(reason);
      if (Object.keys(restored).length) {
        for (const [k, v] of Object.entries(restored)) bagAfter[Number(k)] = (bags[Number(k)] ?? 0) + v;
      } else {
        const m = /^punctualidad:(\d+)$/.exec(reason);
        if (m && bonoPrizeId != null) bagAfter[bonoPrizeId] = (bags[bonoPrizeId] ?? punctualityPoints) + Number(m[1]);
      }
    }
    const trimmedUndo = trimBags(bagAfter, newPoints);
    bagAfter = trimmedUndo.after;
    const newPunctualityPoints = bonoPrizeId != null ? (bagAfter[bonoPrizeId] ?? Math.min(punctualityPoints, newPoints)) : Math.min(punctualityPoints, newPoints);
    await persistBags(db, ev.collaborator_id as number, bagAfter, bonoPrizeId);
    dbErr(await db.from("collaborators").update({ points: newPoints, punctuality_points: newPunctualityPoints }).eq("id", ev.collaborator_id).select("id"));
    dbErr(await db.from("point_events").update({ reversed: true }).eq("id", eventId).select("id"));
    dbErr(await db.from("point_events").insert({
      collaborator_id: ev.collaborator_id, kind: "reversal",
      label: `Se deshizo: ${ev.label}`, points: -(ev.points as number),
    }).select("id"));
    // Si era canje, devolver el stock por la cantidad canjeada (no solo
    // +1): se busca el canje aprobado más reciente de ese premio y se
    // devuelve su cantidad. El nombre en el historial puede llevar el
    // prefijo "2x ", por eso se quita antes de buscar.
    if (ev.kind === "redeem") {
      const name = String(ev.label).replace("Canje: ", "").replace(/^\d+x\s+/, "");
      const { data: reds } = await db.from("redemptions").select("*").eq("prize_name", name).eq("status", "approved").order("created_at", { ascending: false }).limit(1);
      const red = reds?.[0];
      if (red) {
        const qty = Math.max(1, Math.trunc(Number((red as { quantity?: number }).quantity ?? 1)));
        const prize = dbErr(await db.from("prizes").select("stock").eq("id", red.prize_id).maybeSingle());
        if (prize) dbErr(await db.from("prizes").update({ stock: (prize.stock as number) + qty }).eq("id", red.prize_id).select("id"));
      }
    }
    return { ok: true as const, newPoints, newPunctualityPoints };
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
export async function addActionType(name: string, points: number, linkedPrizeId?: number | null) {
  const auth = await requireMasterAuth();
  if (auth) return auth;
  if (!isSupabaseConfigured) return notConfigured();
  const bad = validAction(name, points);
  if (bad) return { ok: false as const, error: bad };
  try {
    const db = supabaseAdmin();
    const { data: last } = await db.from("action_types").select("id").order("id", { ascending: false }).limit(1);
    const nextId = ((last?.[0]?.id as number | undefined) ?? 0) + 1;
    dbErr(await db.from("action_types").insert({ id: nextId, label: name.trim(), points: Math.trunc(points), linked_prize_id: linkedPrizeId ?? null }).select("id"));
    return { ok: true as const, id: nextId };
  } catch (e) { return { ok: false as const, error: errText(e) }; }
}
export async function updateActionType(id: number, name: string, points: number, linkedPrizeId?: number | null) {
  const auth = await requireMasterAuth();
  if (auth) return auth;
  if (!isSupabaseConfigured) return notConfigured();
  const bad = validAction(name, points);
  if (bad) return { ok: false as const, error: bad };
  try {
    const db = supabaseAdmin();
    // linkedPrizeId undefined = no se toca el ligado (llamadas viejas);
    // null = quitar el ligado; número = ligar a ese premio.
    const fields: { label: string; points: number; linked_prize_id?: number | null } = { label: name.trim(), points: Math.trunc(points) };
    if (linkedPrizeId !== undefined) fields.linked_prize_id = linkedPrizeId;
    dbErr(await db.from("action_types").update(fields).eq("id", id).select("id"));
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
// La tabla prizes tiene id bigint primary key SIN identity, por eso al
// agregar se calcula el siguiente id (max + 1), igual que addActionType
// y addPenaltyType. Antes se insertaba sin id y Postgres lo rechazaba
// con "null value in column id violates not-null constraint": el botón
// AGREGAR parecía no hacer nada porque el premio nunca se creaba.
function validPrize(name: string, cost: number, stock: number): string | null {
  if (!name.trim()) return "Escribe el nombre del premio.";
  if (!Number.isInteger(cost) || cost <= 0) return "El costo debe ser un número entero mayor que 0.";
  if (!Number.isInteger(stock) || stock < 0) return "El stock debe ser un número entero de 0 o más.";
  return null;
}
export async function addPrize(name: string, cost: number, stock: number) {
  const auth = await requireMasterAuth();
  if (auth) return auth;
  if (!isSupabaseConfigured) return notConfigured();
  const bad = validPrize(name, cost, stock);
  if (bad) return { ok: false as const, error: bad };
  try {
    const db = supabaseAdmin();
    const { data: last } = await db.from("prizes").select("id").order("id", { ascending: false }).limit(1);
    const nextId = ((last?.[0]?.id as number | undefined) ?? 0) + 1;
    dbErr(await db.from("prizes").insert({ id: nextId, name: name.trim(), cost: Math.trunc(cost), stock: Math.trunc(stock) }).select("id"));
    return { ok: true as const, id: nextId };
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
    // Avisar por push a los participantes suscritos (solo comunicados).
    // Si el push falla (sin llaves VAPID o sin tabla 0005), el comunicado
    // queda publicado igual: el error no se devuelve aquí.
    await sendPushToAll(pushTitleFor(table, title), body || title);
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
    // Si se acaba de PRENDER, avisar por push a los suscritos.
    if (!active) {
      const row = await db.from(table).select("title, body").eq("id", id).maybeSingle();
      const t = (row.data as { title?: string } | null)?.title;
      if (t) await sendPushToAll(pushTitleFor(table, t), ((row.data as { body?: string } | null)?.body || t));
    }
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

// --- Notificaciones push (Chrome/escritorio) — migración 0005 ---
// Solo comunicados de Merlín y Corvo: cuando Osbed publica o prende
// uno, el servidor avisa a todos los navegadores suscritos con
// web-push (llaves VAPID en Vercel). Sumar/restar puntos no avisa.
// Si faltan las llaves o la tabla, el comunicado se publica igual y
// el push se salta en silencio (el Master lo avisa con la prueba).
type PushSubInput = { endpoint: string; keys: { p256dh: string; auth: string } };

function vapidConfig(): { publicKey: string; privateKey: string; subject: string } | null {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
  const privateKey = process.env.VAPID_PRIVATE_KEY || "";
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject: process.env.VAPID_SUBJECT || "https://juego-rpg-osby.vercel.app/" };
}

function isMissingPushTableError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  return msg.includes("push_subscriptions") || msg.includes("does not exist") || (e as { code?: string })?.code === "42P01";
}

function pushTitleFor(table: "announcements" | "crow_announcements", title: string): string {
  return table === "announcements" ? `🧙 Merlín dice: ${title}` : `🐦‍⬛ Corvo dice: ${title}`;
}

// Manda la notificación a todos los suscritos; borra las
// suscripciones que el navegador ya dio de baja (410/404). Nunca
// rompe la acción que la llamó: si algo falla, devuelve el error.
async function sendPushToAll(title: string, body: string): Promise<{ ok: boolean; sent: number; total: number; error?: string }> {
  const vapid = vapidConfig();
  if (!vapid) return { ok: false, sent: 0, total: 0, error: "push_no_configurado" };
  if (!isSupabaseConfigured) return { ok: false, sent: 0, total: 0, error: "supabase_no_configurado" };
  try {
    const db = supabaseAdmin();
    const { data, error } = await db.from("push_subscriptions").select("endpoint, p256dh, auth");
    if (error) throw new Error(error.message);
    const subs = (data as { endpoint: string; p256dh: string; auth: string }[]) || [];
    webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
    const payload = JSON.stringify({ title, body, url: "/" });
    let sent = 0;
    const dead: string[] = [];
    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
        sent++;
      } catch (e) {
        const status = (e as { statusCode?: number })?.statusCode;
        if (status === 410 || status === 404) dead.push(s.endpoint);
      }
    }));
    for (const endpoint of dead) {
      await db.from("push_subscriptions").delete().eq("endpoint", endpoint);
    }
    return { ok: true, sent, total: subs.length };
  } catch (e) {
    if (isMissingPushTableError(e)) return { ok: false, sent: 0, total: 0, error: "falta_migracion_0005" };
    return { ok: false, sent: 0, total: 0, error: errText(e) };
  }
}

// Guardar la suscripción del navegador (La Carrera, sin PIN: el
// participante se suscribe solo).
export async function savePushSubscription(sub: PushSubInput) {
  if (!isSupabaseConfigured) return notConfigured();
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    return { ok: false as const, error: "Suscripción inválida." };
  }
  try {
    const db = supabaseAdmin();
    const { error } = await db.from("push_subscriptions").upsert(
      { endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
      { onConflict: "endpoint" },
    ).select("id");
    if (error) throw new Error(error.message);
    return { ok: true as const };
  } catch (e) {
    if (isMissingPushTableError(e)) return { ok: false as const, error: "falta_migracion_0005" };
    return { ok: false as const, error: errText(e) };
  }
}

// Quitar la suscripción (La Carrera, sin PIN).
export async function removePushSubscription(endpoint: string) {
  if (!isSupabaseConfigured) return notConfigured();
  if (!endpoint) return { ok: false as const, error: "Sin suscripción." };
  try {
    const db = supabaseAdmin();
    const { error } = await db.from("push_subscriptions").delete().eq("endpoint", endpoint).select("id");
    if (error) throw new Error(error.message);
    return { ok: true as const };
  } catch (e) {
    if (isMissingPushTableError(e)) return { ok: false as const, error: "falta_migracion_0005" };
    return { ok: false as const, error: errText(e) };
  }
}

// Cuántos dispositivos están suscritos (Master, con PIN).
export async function getPushSubscriberCount() {
  const auth = await requireMasterAuth();
  if (auth) return auth;
  if (!isSupabaseConfigured) return notConfigured();
  try {
    const db = supabaseAdmin();
    const { count, error } = await db.from("push_subscriptions").select("*", { count: "exact", head: true });
    if (error) throw new Error(error.message);
    return { ok: true as const, count: count ?? 0 };
  } catch (e) {
    if (isMissingPushTableError(e)) return { ok: false as const, error: "falta_migracion_0005" };
    return { ok: false as const, error: errText(e) };
  }
}

// Enviar una notificación de prueba a todos los suscritos (Master, con PIN).
export async function sendTestPush() {
  const auth = await requireMasterAuth();
  if (auth) return auth;
  const res = await sendPushToAll("🔔 Notificación de prueba", "Si ves este aviso en tu escritorio, las notificaciones del juego ya funcionan.");
  if (!res.ok) return { ok: false as const, error: res.error ?? "No se pudo enviar la prueba." };
  return { ok: true as const, sent: res.sent, total: res.total };
}


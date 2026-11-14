"use server";
import { supabaseAdmin, isSupabaseConfigured } from "./supabase";
import { isMasterAuthenticated } from "./auth";
import { bestBonus, isPunctualityAction, isPunctualityPenalty, isPunctualityPrize } from "./data";
import type { Announcement } from "./types";

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
 *  - Un solo numero de puntos (saldo total) + sub-saldo de puntualidad.
 *  - Solo las acciones de puntualidad (check-in puntual, semana sin
 *    faltas, mes perfecto) suman lo mismo al total y a punctuality_points.
 *    Ventas, leads y entregas suman solo al total.
 *  - Retardo / Falta injustificada restan también de punctuality_points.
 *  - Saldo nunca < 0; punctuality_points nunca < 0 ni mayor que el total.
 *  - Canje descuenta puntos y stock (por cantidad). El BONO DE
 *    PUNTUALIDAD solo se canjea con puntos de puntualidad.
 *  - Canje de premio general: se descuenta primero de los puntos que NO
 *    son de puntualidad y solo si no alcanza, de puntualidad.
 *  - Deshacer: revierte saldo y, si era premio, devuelve el stock por
 *    cantidad. No borra historial: marca reversed=true y agrega renglón
 *    'reversal'. El deshacer también revierte el sub-saldo de puntualidad
 *    que ese movimiento había movido (guardado en point_events.reason
 *    como `punctualidad:<n>` en los canjes).
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
    // Acción de puntualidad: el mismo monto suma también al sub-saldo.
    const punctualityDelta = isPunctualityAction(actionId || null, label) ? total : 0;
    const newPunctualityPoints = Math.max(0, Math.min(newPoints, balances.punctualityPoints + punctualityDelta));
    dbErr(await db.from("collaborators").update({ points: newPoints, punctuality_points: newPunctualityPoints }).eq("id", collaboratorId).select("id"));
    dbErr(await db.from("point_events").insert({
      collaborator_id: collaboratorId, kind: "award", label,
      points: total, bonus_from: bonus.from,
    }).select("id"));
    return { ok: true as const, points: total, bonus_from: bonus.from, newPoints, newPunctualityPoints, punctualityDelta };
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
    dbErr(await db.from("collaborators").update({ points: newPoints, punctuality_points: newPunctualityPoints }).eq("id", collaboratorId).select("id"));
    dbErr(await db.from("point_events").insert({
      collaborator_id: collaboratorId, kind: "penalty", label, points, reason: reason || null,
    }).select("id"));
    return { ok: true as const, newPoints, newPunctualityPoints };
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
    const totalCost = (prize.cost as number) * qty;
    // Validaciones ANTES de descontar nada: stock, puntos totales y,
    // si es BONO DE PUNTUALIDAD, puntos de puntualidad.
    if ((prize.stock as number) < qty) {
      return (prize.stock as number) <= 0
        ? { ok: false as const, error: "out_of_stock" }
        : { ok: false as const, error: "stock_insuficiente", message: `Solo quedan ${prize.stock} unidades de «${prize.name}», no se pueden canjear ${qty}.` };
    }
    const balances = await getBalances(db, collaboratorId);
    if (!balances) return { ok: false as const, error: "colaborador no encontrado" };
    const isPunctuality = isPunctualityPrize(prize.name as string);
    if (isPunctuality && balances.punctualityPoints < totalCost) {
      return { ok: false as const, error: "punctuality_insufficient", message: punctualityShortfallMessage(qty, balances.punctualityPoints) };
    }
    if (balances.points < totalCost) {
      return { ok: false as const, error: "insufficient_points", message: `No le alcanzan los puntos: tiene ${balances.points} pts y ${qty} × «${prize.name}» cuestan ${totalCost} pts.` };
    }
    const newPoints = balances.points - totalCost;
    // Bono de puntualidad: se descuenta también del sub-saldo.
    // Premio general: primero se gastan los puntos que no son de
    // puntualidad; solo si no alcanza se toma de puntualidad
    // (= punctuality_points queda en min(punct, nuevo total)).
    const punctualityUsed = isPunctuality
      ? totalCost
      : Math.max(0, totalCost - (balances.points - balances.punctualityPoints));
    const newPunctualityPoints = Math.max(0, Math.min(newPoints, balances.punctualityPoints - punctualityUsed));
    dbErr(await db.from("collaborators").update({ points: newPoints, punctuality_points: newPunctualityPoints }).eq("id", collaboratorId).select("id"));
    dbErr(await db.from("prizes").update({ stock: (prize.stock as number) - qty }).eq("id", prizeId).select("id"));
    const red = dbErr(await db.from("redemptions").insert({
      collaborator_id: collaboratorId, prize_id: prizeId, prize_name: prize.name,
      cost: totalCost, quantity: qty, status: "approved", resolved_at: new Date().toISOString(),
    }).select().single());
    dbErr(await db.from("point_events").insert({
      collaborator_id: collaboratorId, kind: "redeem",
      label: redeemLabel(prize.name as string, qty), points: -totalCost,
      // Para que Deshacer pueda devolver al sub-saldo exactamente lo que
      // este canje le quitó (en un canje general puede ser 0).
      reason: punctualityUsed > 0 ? `punctualidad:${punctualityUsed}` : null,
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
    if ((prize.stock as number) < qty) {
      return (prize.stock as number) <= 0
        ? { ok: false as const, error: "out_of_stock" }
        : { ok: false as const, error: "stock_insuficiente", message: `Solo quedan ${prize.stock} unidades de «${prize.name}», no se pueden canjear ${qty}.` };
    }
    const balances = await getBalances(db, red.collaborator_id as number);
    if (!balances) return { ok: false as const, error: "colaborador no encontrado" };
    const isPunctuality = isPunctualityPrize(prize.name as string);
    if (isPunctuality && balances.punctualityPoints < cost) {
      return { ok: false as const, error: "punctuality_insufficient", message: punctualityShortfallMessage(qty, balances.punctualityPoints) };
    }
    if (balances.points < cost) {
      return { ok: false as const, error: "insufficient_points", message: `No le alcanzan los puntos: tiene ${balances.points} pts y «${prize.name}» cuesta ${cost} pts.` };
    }
    const newPoints = balances.points - cost;
    const punctualityUsed = isPunctuality
      ? cost
      : Math.max(0, cost - (balances.points - balances.punctualityPoints));
    const newPunctualityPoints = Math.max(0, Math.min(newPoints, balances.punctualityPoints - punctualityUsed));
    dbErr(await db.from("collaborators").update({ points: newPoints, punctuality_points: newPunctualityPoints }).eq("id", red.collaborator_id).select("id"));
    dbErr(await db.from("prizes").update({ stock: (prize.stock as number) - qty }).eq("id", red.prize_id).select("id"));
    dbErr(await db.from("redemptions").update({ status: "approved", resolved_at: new Date().toISOString() }).eq("id", redemptionId).select("id"));
    dbErr(await db.from("point_events").insert({
      collaborator_id: red.collaborator_id, kind: "redeem",
      label: redeemLabel(red.prize_name as string, qty), points: -cost,
      reason: punctualityUsed > 0 ? `punctualidad:${punctualityUsed}` : null,
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
    // El sub-saldo se revierte solo en lo que ese movimiento movió:
    // - premio de puntualidad: se devolvió al sumar (o se quitó al restar);
    // - falta de puntualidad: se devuelve lo que la falta quitó;
    // - canje: se devuelve lo guardado en reason (`punctualidad:<n>`);
    //   en un canje general puede ser 0 (se gastaron puntos no puntuales).
    // - cualquier otro movimiento: el sub-saldo solo se recorta si el
    //   nuevo total queda por debajo de él.
    let newPunctualityPoints: number;
    if (ev.kind === "award" && isPunctualityAction(null, ev.label as string)) {
      newPunctualityPoints = Math.max(0, Math.min(newPoints, punctualityPoints - (ev.points as number)));
    } else if (ev.kind === "penalty" && isPunctualityPenalty(ev.label as string)) {
      newPunctualityPoints = Math.min(newPoints, punctualityPoints + Math.abs(ev.points as number));
    } else if (ev.kind === "redeem") {
      const m = /^punctualidad:(\d+)$/.exec(String((ev as { reason?: string | null }).reason ?? ""));
      const used = m ? Number(m[1]) : 0;
      newPunctualityPoints = Math.min(newPoints, punctualityPoints + used);
    } else {
      newPunctualityPoints = Math.min(punctualityPoints, newPoints);
    }
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

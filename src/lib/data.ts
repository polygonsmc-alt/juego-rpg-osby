import type { ActionType, PenaltyType, Prize, Collaborator, Announcement, Settings } from "./types";

export const COMPANY_DEFAULT = "SCRIPT TECNOLOGIAS DE LA INFORMACION";

// Niveles por PUNTOS ACTUALES. Al canjear baja.
export const LEVELS = [
  { name: "Novato", min: 0 },
  { name: "Bronce", min: 100 },
  { name: "Plata", min: 300 },
  { name: "Oro", min: 600 },
  { name: "Diamante", min: 1000 },
  { name: "Leyenda", min: 1500 },
] as const;

export function levelFor(points: number): string {
  let lvl = "Novato";
  for (const l of LEVELS) if (points >= l.min) lvl = l.name;
  return lvl;
}
export function nextLevel(points: number): { name: string; min: number } | null {
  for (const l of LEVELS) if (points < l.min) return { name: l.name, min: l.min };
  return null;
}

export const ACTIONS: ActionType[] = [
  { id: 1, label: "Venta concretada", points: 100, linked_prize_id: null },
  { id: 2, label: "Entrega de proyecto a tiempo", points: 50, linked_prize_id: null },
  { id: 3, label: "Semana sin faltas ni retardos", points: 50, linked_prize_id: 7 },
  { id: 4, label: "Cliente referido que sí compra", points: 40, linked_prize_id: null },
  { id: 5, label: "Idea de mejora que se implementa", points: 40, linked_prize_id: null },
  { id: 6, label: "Venta de producto destacado / upsell", points: 30, linked_prize_id: null },
  { id: 7, label: "Reseña de 5 estrellas conseguida", points: 30, linked_prize_id: null },
  { id: 8, label: "Lead nuevo", points: 25, linked_prize_id: null },
  { id: 9, label: "Entrega sin correcciones", points: 25, linked_prize_id: null },
  { id: 10, label: "Capacitación o curso completado", points: 20, linked_prize_id: null },
  { id: 11, label: "Ayuda a un compañero (validada)", points: 15, linked_prize_id: null },
  { id: 12, label: "Check-in puntual", points: 10, linked_prize_id: 7 },
];

export const PENALTIES: PenaltyType[] = [
  { id: 1, label: "Falta injustificada", points: -50 },
  { id: 2, label: "Error en una entrega", points: -30 },
  { id: 3, label: "Retardo", points: -15 },
  { id: 4, label: "No reportar avance / falta de comunicación", points: -10 },
];

export const PUNCTUALITY_PRIZE_NAME = "BONO DE PUNTUALIDAD";
export const PUNCTUALITY_PRIZE_COST = 500; // 500 pts de puntualidad = 1 bono ($500)

// --- Sub-saldo de puntualidad ---
// Qué acciones suman a punctuality_points (además de al saldo total):
// solo las de puntualidad. Se detectan por NOMBRE (así, si Osbed agrega
// desde ACCIONES Y PUNTOS una acción llamada "Mes perfecto...", también
// suma) y, por si se renombra una acción del seed, por su id del seed:
// 3 = Semana sin faltas ni retardos, 12 = Check-in puntual.
// NO se inventan otras: ventas, leads y entregas suman solo al total.
export const PUNCTUALITY_ACTION_IDS = [3, 12];
function normLabel(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
export function isPunctualityAction(actionId: number | null, label: string): boolean {
  if (actionId != null && PUNCTUALITY_ACTION_IDS.includes(actionId)) return true;
  const n = normLabel(label);
  // Nombres nuevos de Osbed (2026-11-13 noche): "check in" a secas y
  // "Puntualidad perfecta | Mes" no contenían "check in puntual" ni
  // "mes perfecto", así que no se detectaban como puntualidad: ni el
  // chip PUNTUALIDAD ni el sub-saldo. "check in" cubre "check in
  // puntual"; "puntualidad" cubre cualquier variante con esa palabra.
  return n.includes("check in") || n.includes("semana sin faltas") || n.includes("mes perfecto") || n.includes("puntualidad");
}
// Qué faltas restan de punctuality_points (además de del saldo total):
// Retardo y Falta injustificada. "No reportar avance / falta de
// comunicación" NO es de puntualidad, por eso se pide el texto exacto
// "falta injustificada" y no solo "falta".
export function isPunctualityPenalty(label: string): boolean {
  const n = normLabel(label);
  return n.includes("retardo") || n.includes("falta injustificada");
}
// Un premio es "solo de puntualidad" si su nombre habla de puntualidad
// (el BONO DE PUNTUALIDAD). Solo se canjea con puntos de puntualidad.
export function isPunctualityPrize(prizeName: string): boolean {
  return normLabel(prizeName).includes("puntualidad");
}
// Cuántos bonos de puntualidad alcanza a canjear con su sub-saldo.
export function punctualityBonusesAvailable(punctualityPoints: number, cost: number = PUNCTUALITY_PRIZE_COST): number {
  return Math.max(0, Math.floor((punctualityPoints || 0) / cost));
}

// --- Bolsas exclusivas genéricas (acción → premio) ---
// Igual que la puntualidad, pero para cualquier acción y premio: el
// Master liga una acción a un premio en ACCIONES Y PUNTOS y los puntos
// de esa acción suman también a la bolsa de ese premio (parte del
// total). Solo con esa bolsa se canjea ese premio; si no se canjea, los
// puntos se quedan y suman para los premios generales.
// La puntualidad es la primera bolsa: acciones 3 y 12 ligadas al BONO
// DE PUNTUALIDAD (id 7 en el seed). Su saldo vive en
// collaborators.punctuality_points, no en collaborator_bags.
// Premio ligado de una acción: el guardado en la base (linked_prize_id)
// y, por compatibilidad con lo anterior, el bono de puntualidad para
// las acciones de puntualidad aunque aún no tengan el ligado guardado.
export function linkedPrizeForAction(action: ActionType | null | undefined, prizes: Prize[]): number | null {
  if (!action) return null;
  if (action.linked_prize_id != null) return action.linked_prize_id;
  if (isPunctualityAction(action.id, action.label)) {
    const bono = prizes.find((p) => isPunctualityPrize(p.name));
    return bono ? bono.id : null;
  }
  return null;
}
// ¿Este premio es exclusivo? Lo es si alguna acción está ligada a él
// (o si es el BONO DE PUNTUALIDAD, ligado a las acciones de puntualidad).
export function exclusivePrizeInfo(prize: Prize, actions: ActionType[], prizes: Prize[]): { exclusive: boolean; actionLabels: string[] } {
  const labels = actions.filter((a) => linkedPrizeForAction(a, prizes) === prize.id).map((a) => a.label);
  return { exclusive: labels.length > 0, actionLabels: labels };
}
// Cuántas unidades de un premio alcanzan con una bolsa.
export function unitsAvailable(bagPoints: number, cost: number): number {
  return Math.max(0, Math.floor((bagPoints || 0) / Math.max(1, cost)));
}
// Mensaje genérico cuando no alcanza la bolsa para la cantidad pedida
// (mismo formato que el de puntualidad, que se mantiene exacto aparte).
export function exclusiveShortfallMessage(quantity: number, prizeName: string, bagPoints: number, actionLabels: string[]): string {
  const con = actionLabels.length ? ` de ${actionLabels.join(" / ")}` : "";
  return `NO CUMPLES CON LOS REQUERIMIENTOS PARA CANJEAR ${quantity} ${prizeName}, solo cuentas con ${bagPoints} puntos${con} que sí puedes canjear por ${prizeName}.`;
}

export const PRIZES_SEED: Prize[] = [
  { id: 1, name: "GIFT CARD 500MXN AMAZON", cost: 500, stock: 4 },
  { id: 2, name: "GIFT CARD 500MXN CINEPOLIS", cost: 700, stock: 5 },
  { id: 3, name: "Videojuego", cost: 900, stock: 3 },
  { id: 4, name: "TABLET SAMSUNG A11+", cost: 1400, stock: 2 },
  { id: 5, name: "TV 50 PULGADAS TCL", cost: 2000, stock: 1 },
  { id: 6, name: "CONSOLA SONY PS5 (STANDARD)", cost: 100000, stock: 1 },
  { id: 7, name: PUNCTUALITY_PRIZE_NAME, cost: PUNCTUALITY_PRIZE_COST, stock: 100 },
];

export function premioMayor(prizes: Prize[]): Prize | null {
  if (!prizes.length) return null;
  return prizes.reduce((a, b) => (b.cost > a.cost ? b : a));
}

export const COLLABORATORS_SEED: Collaborator[] = [
  { id: 1, name: "FANY MOTA", sprite: 2, points: 0, punctuality_points: 0, area: "Marketing" },
  { id: 2, name: "OSBED", sprite: 0, points: 0, punctuality_points: 0, area: "Diseño gráfico" },
  { id: 3, name: "mayra morua", sprite: 10, points: 0, punctuality_points: 0, area: "Marketing" },
];

export const MERLIN_SEED: Announcement[] = [
  {
    id: 1,
    title: "MERLIN A HABLADO | PUNTOS DOBLES",
    body: "Si todos hacen check in entre las 9 y 9:05 AM se llevaran puntos dobles",
    active: true,
    bonus_multiplier: 2,
    bonus_action_id: 12,
    created_at: "2026-11-12T20:27:40Z",
  },
];

export const CORVO_SEED: Announcement[] = [
  { id: 1, title: "¡Caw! Puntos dobles en check-in", body: "¡Caw! Traigo mensaje de RRHH: esta semana hay puntos dobles en check-in", active: true, bonus_multiplier: null, bonus_action_id: null, created_at: "2026-11-12T21:00:00Z" },
  { id: 2, title: "¡Caw! ¿Quién sigue?", body: "¡Caw! Fany canjeó su Gift Card, ¿quién sigue?", active: false, bonus_multiplier: null, bonus_action_id: null, created_at: "2026-11-12T21:00:00Z" },
  { id: 3, title: "¡Caw! Mayra, casi llegas", body: "¡Caw! Mayra, te faltan 300 pts para la Tablet", active: false, bonus_multiplier: null, bonus_action_id: null, created_at: "2026-11-12T21:00:00Z" },
  { id: 4, title: "¡Caw! Canjes en RRHH", body: "¡Caw! Recuerden: para canjear vayan a RRHH", active: false, bonus_multiplier: null, bonus_action_id: null, created_at: "2026-11-12T21:00:00Z" },
];

export const SETTINGS_SEED: Settings = {
  id: 1,
  company_name: COMPANY_DEFAULT,
  logo_url: null,
  theme: "bosque",
  season: "navidad",
};

// 12 avatares pixel. 0-7 base, 8-11 mujeres: 8 coleta larga, 9 moño alto, 10 pelo largo ondulado, 11 trenza.
export const AVATAR_NAMES = [
  "Clásico", "Rubio", "Moreno", "Pelo negro", "Gorra", "Lentes", "Barba", "Pelirrojo",
  "Coleta larga", "Moño alto", "Pelo largo ondulado", "Trenza",
];
export const AVATAR_HAIR = ["#2b2b2b", "#e8b64c", "#4a2c14", "#111111", "#2b2b2b", "#5a3a1a", "#3a2a1a", "#c0392b", "#3a1f0d", "#1a1a1a", "#6b3a1f", "#2b1a0d"];
export const AVATAR_SHIRT = ["#2563eb", "#dc2626", "#059669", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#65a30d", "#ec4899", "#8b5cf6", "#0ea5e9", "#f59e0b"];

export const THEMES: Record<string, { label: string; bg: string; track: string; accent: string }> = {
  clasico: { label: "Clásico", bg: "#1a1a2e", track: "#16213e", accent: "#f5d76e" },
  bosque: { label: "Bosque", bg: "#0f2a1d", track: "#1d4d2b", accent: "#f5d76e" },
  oceano: { label: "Océano", bg: "#0a2540", track: "#134e6b", accent: "#7dd3fc" },
  atardecer: { label: "Atardecer", bg: "#2b0f1e", track: "#7c2d12", accent: "#fb923c" },
  neon: { label: "Neón arcade", bg: "#0f0520", track: "#1e1040", accent: "#e879f9" },
};

export function bestBonus(
  merlin: Announcement[],
  corvo: Announcement[],
  actionId: number
): { multiplier: number; from: string | null } {
  const candidates: { multiplier: number; from: string }[] = [];
  for (const a of [...merlin, ...corvo]) {
    if (!a.active || !a.bonus_multiplier) continue;
    if (a.bonus_action_id !== null && a.bonus_action_id !== actionId) continue;
    const from = merlin.includes(a) ? "Merlín" : "el Cuervo de RRHH";
    candidates.push({ multiplier: a.bonus_multiplier, from });
  }
  if (!candidates.length) return { multiplier: 1, from: null };
  // El más fuerte, no se suman.
  candidates.sort((x, y) => y.multiplier - x.multiplier);
  return candidates[0];
}

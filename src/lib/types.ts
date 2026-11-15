export type ThemeId = "clasico" | "bosque" | "oceano" | "atardecer" | "neon";
export type SeasonId = "navidad" | "halloween" | "primavera" | "verano" | "sin-temporada";

export interface Collaborator {
  id: number;
  name: string;
  sprite: number; // 0-11
  points: number; // SOLO numero: puntos actuales
  // Sub-saldo de puntualidad: parte de `points` que se ganó solo con
  // acciones de puntualidad (check-in puntual, semana sin faltas,
  // mes perfecto). Sirve solo para canjear el BONO DE PUNTUALIDAD:
  // 500 pts de puntualidad = 1 bono. Nunca pasa de `points` ni baja de 0.
  punctuality_points: number;
  // Estado de misión del Semáforo de Social (migración 0006):
  // escudo, cooperativo, fuegos o taberna. Por defecto cooperativo.
  social_state: string;
  area: string | null; // Área/departamento (ej. Ventas) — null = sin área todavía
  created_at?: string;
}

export interface ActionType {
  id: number;
  label: string;
  points: number;
  // Premio ligado (opcional): los puntos de esta acción suman también a
  // la bolsa exclusiva de ese premio (parte del saldo total, como la
  // puntualidad). Solo con esa bolsa se puede canjear ese premio; si no
  // se canjea, esos puntos se quedan y suman para los premios generales.
  // null = acción general, solo suma al total.
  linked_prize_id: number | null;
}

// Bolsa exclusiva de un colaborador para un premio: cuántos de sus
// puntos totales se ganaron con acciones ligadas a ese premio.
// La bolsa del BONO DE PUNTUALIDAD NO se guarda aquí: vive en
// collaborators.punctuality_points (migración 0003) y se mantiene en
// sincronía; las demás bolsas viven en collaborator_bags.
export interface CollaboratorBag {
  collaborator_id: number;
  prize_id: number;
  points: number;
}

export interface PenaltyType {
  id: number;
  label: string;
  points: number; // negativo
}

export interface Prize {
  id: number;
  name: string;
  cost: number;
  stock: number;
}

export interface PointEvent {
  id: number;
  collaborator_id: number;
  kind: "award" | "penalty" | "redeem" | "reversal" | "custom";
  label: string;
  points: number;
  reason?: string | null;
  reversed?: boolean;
  bonus_from?: string | null;
  created_at: string;
}

export interface Redemption {
  id: number;
  collaborator_id: number;
  prize_id: number;
  prize_name: string;
  cost: number; // costo TOTAL: cantidad x costo unitario del premio
  quantity: number; // cuántas unidades se canjearon en este canje (1 = como antes)
  status: "approved" | "pending" | "rejected";
  created_at: string;
  resolved_at?: string | null;
}

export interface Announcement {
  id: number;
  title: string;
  body: string;
  active: boolean;
  bonus_multiplier: number | null; // 2 | 3 | null
  bonus_action_id: number | null; // null = todas las acciones
  created_at: string;
}

export interface PushSubscriptionRow {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
}

export interface Settings {
  id: number;
  company_name: string;
  logo_url: string | null;
  theme: ThemeId;
  season: SeasonId;
}

// --- Vista Social (migración 0006) ---
export type SocialStateId = "escudo" | "cooperativo" | "fuegos" | "taberna";
export type ReactionItem = "pocion" | "moneda" | "corona" | "cafe";
export type KudoItem = "espresso" | "escudo" | "pocion" | "cafe";
export type JoyaKind = "cancion" | "comida" | "atajo" | "meme" | "otro";

// Victoria del día colgada en el Muro (máx 200 caracteres).
export interface SocialPost {
  id: number;
  collaborator_id: number;
  body: string;
  created_at: string;
}

// Reacción tipo Loot a una victoria (una de cada ítem por persona y publicación).
export interface SocialReaction {
  id: number;
  post_id: number;
  collaborator_id: number;
  item: ReactionItem;
  created_at: string;
}

// Pócima regalada (3 monedas al día por persona, nunca a uno mismo).
export interface SocialKudo {
  id: number;
  from_id: number;
  to_id: number;
  item: KudoItem;
  message: string | null;
  created_at: string;
}

// Joya Oculta (1 por persona y semana, lunes a domingo).
export interface SocialJoya {
  id: number;
  collaborator_id: number;
  kind: JoyaKind;
  body: string;
  created_at: string;
}

export interface GameState {
  collaborators: Collaborator[];
  action_types: ActionType[]; // Catálogo de acciones (12 en seed) — el Master lo edita
  penalty_types: PenaltyType[]; // Catálogo de faltas (4 en seed) — el Master lo edita
  prizes: Prize[];
  bags: CollaboratorBag[]; // Bolsas exclusivas por colaborador y premio (sin puntualidad, que vive en punctuality_points)
  events: PointEvent[];
  redemptions: Redemption[];
  announcements: Announcement[]; // Merlín
  crow_announcements: Announcement[]; // Corvo
  settings: Settings;
}

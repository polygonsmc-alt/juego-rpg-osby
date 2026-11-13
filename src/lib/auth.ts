"use server";
import { cookies } from "next/headers";
import {
  signMasterToken,
  verifyMasterToken,
  timingSafeEqual,
} from "./auth-token";

// Protección del Panel Master con PIN.
//
// - El PIN NUNCA está en el código ni en el repo: viene de la variable
//   de entorno MASTER_PIN (solo servidor, SIN prefijo NEXT_PUBLIC_).
// - No hay PIN por defecto: si MASTER_PIN no está configurado, el Master
//   no se abre y se muestra el mensaje de configuración.
// - Al validar el PIN se crea una cookie HttpOnly `master_auth` con un
//   token firmado HMAC-SHA256, válido 7 días. El secreto de firma es
//   `PIN:secreto-del-servidor`, donde el secreto del servidor es
//   SUPABASE_SERVICE_ROLE_KEY si existe, si no el propio PIN. Cambiar
//   el PIN invalida todas las sesiones anteriores.
// - La cookie es Secure en producción y SameSite=Lax.

const COOKIE_NAME = "master_auth";
const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;

function getPin(): string | undefined {
  return process.env.MASTER_PIN || undefined;
}

function getSigningSecret(pin: string): string {
  return `${pin}:${process.env.SUPABASE_SERVICE_ROLE_KEY || pin}`;
}

export async function isPinConfigured(): Promise<boolean> {
  return Boolean(getPin());
}

export async function isMasterAuthenticated(): Promise<boolean> {
  const pin = getPin();
  if (!pin) return false;
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return false;
  return verifyMasterToken(token, getSigningSecret(pin));
}

export async function checkPin(
  pin: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const expected = getPin();
  if (!expected) return { ok: false, error: "pin_no_configurado" };
  const provided = String(pin ?? "").trim();
  // 4-6 dígitos. No se dice nada sobre el PIN real: cualquier fallo
  // devuelve el mismo error genérico.
  if (!/^\d{4,6}$/.test(provided) || !timingSafeEqual(provided, expected)) {
    return { ok: false, error: "pin_incorrecto" };
  }
  const expiresAt = Date.now() + SEVEN_DAYS_SECONDS * 1000;
  const token = await signMasterToken(getSigningSecret(expected), expiresAt);
  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SEVEN_DAYS_SECONDS,
  });
  return { ok: true };
}

export async function logoutPin(): Promise<{ ok: true }> {
  cookies().delete(COOKIE_NAME);
  return { ok: true };
}

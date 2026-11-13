// Token de sesión del Master — sin dependencias, funciona en Edge
// (middleware) y en Node (server actions). NO contiene el PIN:
// es `expiry.HMAC`, donde HMAC = HMAC-SHA256(secreto, "master_auth:v1:expiry").
// El secreto se construye en auth.ts como `PIN:secreto-del-servidor`
// (SUPABASE_SERVICE_ROLE_KEY si existe, si no el propio PIN).
// Nunca se guarda el PIN en el repo ni en el token.

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await globalThis.crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Comparación en tiempo constante: recorre todo el texto sin salir antes,
// para no filtrar por tiempo cuántos caracteres coinciden.
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function signMasterToken(
  secret: string,
  expiresAtMs: number,
): Promise<string> {
  const sig = await hmacHex(secret, `master_auth:v1:${expiresAtMs}`);
  return `${expiresAtMs}.${sig}`;
}

export async function verifyMasterToken(
  token: string,
  secret: string,
): Promise<boolean> {
  const [expStr, sig] = token.split(".");
  const exp = Number(expStr);
  if (!expStr || !sig || !Number.isFinite(exp)) return false;
  if (exp <= Date.now()) return false; // expirado
  const expected = await hmacHex(secret, `master_auth:v1:${exp}`);
  return timingSafeEqual(sig, expected);
}

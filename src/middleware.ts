import { NextResponse, type NextRequest } from "next/server";
import { verifyMasterToken } from "./lib/auth-token";

// Protege /master en el borde: sin sesión válida, redirige a la
// pantalla de PIN. La Carrera (/) queda pública, sin PIN.
// Si MASTER_PIN no está configurado, se deja pasar: el layout del
// Master muestra el mensaje de configuración y NO abre el Panel.
export async function middleware(req: NextRequest) {
  const pin = process.env.MASTER_PIN;
  if (!pin) return NextResponse.next();
  const token = req.cookies.get("master_auth")?.value;
  const secret = `${pin}:${process.env.SUPABASE_SERVICE_ROLE_KEY || pin}`;
  if (token && (await verifyMasterToken(token, secret))) {
    return NextResponse.next();
  }
  const url = req.nextUrl.clone();
  url.pathname = "/master-login";
  url.searchParams.set("next", "/master");
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/master/:path*"],
};

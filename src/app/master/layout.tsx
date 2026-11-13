import { redirect } from "next/navigation";
import { isMasterAuthenticated, isPinConfigured } from "@/lib/auth";

// Segunda barrera además del middleware: el contenido del Master nunca
// se renderiza sin sesión válida, aunque se llegara directo a la ruta.
export default async function MasterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await isPinConfigured())) {
    return (
      <div
        className="min-h-screen bg-[var(--bg)] text-[var(--text)]"
        data-theme="bosque"
        data-season="navidad"
      >
        <main className="mx-auto w-full max-w-2xl px-3 pb-10 pt-10 sm:px-4">
          <div className="panel p-6 text-center sm:p-8">
            <p className="font-pixel text-base text-[var(--text)] sm:text-lg">
              PANEL MASTER
            </p>
            <p
              role="alert"
              className="mt-5 rounded-md border-2 border-red-500 bg-red-500/15 px-4 py-3 text-sm font-bold text-red-700 dark:text-red-300"
            >
              PIN no configurado — pon MASTER_PIN en Vercel &gt; Settings &gt;
              Environment Variables y haz Redeploy
            </p>
            <p className="mt-4 text-sm text-[var(--dim)]">
              Sin PIN no se abre el Panel Master. La Carrera sigue pública en{" "}
              <a href="/" className="font-bold text-[var(--accent)]">
                /
              </a>
              .
            </p>
          </div>
        </main>
      </div>
    );
  }
  if (!(await isMasterAuthenticated())) {
    redirect("/master-login");
  }
  return <>{children}</>;
}

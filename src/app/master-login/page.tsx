import { redirect } from "next/navigation";
import { isMasterAuthenticated, isPinConfigured } from "@/lib/auth";
import PinForm from "./PinForm";

// Pantalla de PIN del Master. Si ya hay sesión, pasa directo al Master.
// Si el PIN no está configurado, se avisa y no se abre nada.
export default async function MasterLogin() {
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
          </div>
        </main>
      </div>
    );
  }
  if (await isMasterAuthenticated()) {
    redirect("/master");
  }
  return (
    <div
      className="min-h-screen bg-[var(--bg)] text-[var(--text)]"
      data-theme="bosque"
      data-season="navidad"
    >
      <main className="mx-auto w-full max-w-2xl px-3 pb-10 pt-10 sm:px-4">
        <p className="font-pixel text-center text-base text-[var(--text)] sm:text-lg">
          SCRIPT TECNOLOGIAS DE LA INFORMACION
        </p>
        <div className="panel mt-6 p-6 sm:p-8">
          <p className="font-pixel text-center text-sm text-[var(--text)]">
            🔒 PANEL MASTER
          </p>
          <p className="mt-3 text-center text-sm text-[var(--dim)]">
            Esta vista es solo para quien administra el juego. Los
            colaboradores usan La Carrera, que sigue pública.
          </p>
          <PinForm />
          <p className="mt-4 text-center text-sm">
            <a href="/" className="font-bold text-[var(--accent)]">
              ← Volver a La Carrera
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}

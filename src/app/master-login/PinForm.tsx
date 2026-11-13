"use client";
import { useState } from "react";
import { checkPin } from "@/lib/auth";

const inputCls =
  "min-h-12 w-full rounded-md border-2 border-[var(--border)] bg-[var(--surface-alt)] px-4 py-3 text-center font-pixel text-lg tracking-[0.5em] text-[var(--text)]";

export default function PinForm() {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      const res = await checkPin(pin);
      if (res.ok) {
        // Recarga completa para que el middleware vea la cookie nueva.
        window.location.href = "/master";
        return;
      }
      if (res.error === "pin_no_configurado") {
        setError(
          "PIN no configurado — pon MASTER_PIN en Vercel > Settings > Environment Variables y haz Redeploy",
        );
      } else {
        setError("PIN incorrecto, intenta de nuevo");
      }
      setPin("");
    } catch {
      setError("PIN incorrecto, intenta de nuevo");
      setPin("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-3">
      <label
        htmlFor="master-pin"
        className="text-sm font-semibold text-[var(--text)]"
      >
        Escribe el PIN del Master (4 a 6 dígitos)
      </label>
      <input
        id="master-pin"
        type="password"
        inputMode="numeric"
        autoComplete="off"
        pattern="[0-9]*"
        maxLength={6}
        minLength={4}
        required
        autoFocus
        disabled={busy}
        placeholder="••••"
        className={inputCls}
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
      />
      {error && (
        <p
          role="alert"
          className="rounded-md border-2 border-red-500 bg-red-500/15 px-4 py-3 text-sm font-bold text-red-700 dark:text-red-300"
        >
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy || pin.length < 4}
        className="min-h-12 rounded-md border-2 px-4 py-2 font-pixel text-[11px] disabled:cursor-not-allowed disabled:opacity-40"
        style={{
          borderColor: "var(--accent)",
          background: "var(--accent)",
          color: "#fff",
        }}
      >
        {busy ? "COMPROBANDO…" : "ENTRAR AL MASTER"}
      </button>
      <p className="text-center text-sm text-[var(--dim)]">
        Solo Osbed / el Master entra aquí. La Carrera sigue pública para los
        colaboradores.
      </p>
    </form>
  );
}

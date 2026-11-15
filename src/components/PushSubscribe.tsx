"use client";
import { useEffect, useState } from "react";
import { savePushSubscription, removePushSubscription } from "@/lib/actions";

// Botón "Activar notificaciones" de La Carrera (solo participantes).
// Registra el service worker, pide permiso al navegador y guarda la
// suscripción en Supabase (tabla push_subscriptions, migración 0005).
// Solo avisos de comunicados de Merlín y Corvo. Si el navegador no
// soporta push o faltan las llaves VAPID en Vercel, el botón no se ve.

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type Status = "checking" | "unsupported" | "denied" | "off" | "on" | "busy" | "error";

export default function PushSubscribe() {
  const [status, setStatus] = useState<Status>("checking");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!VAPID_PUBLIC_KEY) { setStatus("unsupported"); return; }
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") { setStatus("denied"); return; }
    let cancelled = false;
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (cancelled) return;
        if (sub) {
          setStatus("on");
          // Por si la suscripción no quedó guardada antes (base nueva):
          // se vuelve a guardar en silencio.
          const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
          if (json.endpoint && json.keys?.p256dh && json.keys?.auth) {
            savePushSubscription({ endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } }).catch(() => undefined);
          }
        } else {
          setStatus("off");
        }
      })
      .catch(() => { if (!cancelled) setStatus("unsupported"); });
    return () => { cancelled = true; };
  }, []);

  async function subscribe() {
    setMsg(null);
    setStatus("busy");
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setStatus(perm === "denied" ? "denied" : "off");
        if (perm === "denied") setMsg("Las notificaciones quedaron bloqueadas: toca el candado junto a la dirección y permite las notificaciones.");
        return;
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        setStatus("error");
        setMsg("No se pudo crear la suscripción en este navegador.");
        return;
      }
      const res = await savePushSubscription({ endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } });
      if (!res.ok) {
        await sub.unsubscribe().catch(() => undefined);
        setStatus("error");
        setMsg(res.error === "falta_migracion_0005"
          ? "Aún no está lista la base de datos para notificaciones. Avísale al Master."
          : "No se pudo activar. Inténtalo de nuevo.");
        return;
      }
      setStatus("on");
    } catch {
      setStatus("error");
      setMsg("No se pudo activar. Revisa el permiso de notificaciones de este navegador.");
    }
  }

  async function unsubscribe() {
    setMsg(null);
    setStatus("busy");
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe().catch(() => undefined);
        await removePushSubscription(endpoint).catch(() => undefined);
      }
      setStatus("off");
    } catch {
      setStatus("error");
      setMsg("No se pudo desactivar. Inténtalo de nuevo.");
    }
  }

  if (status === "checking" || status === "unsupported") return null;

  return (
    <div className="flex flex-col items-end gap-1">
      {status === "denied" ? (
        <>
          <button type="button" disabled className="min-h-10 rounded-md border-2 border-[var(--border)] px-3 py-1.5 text-xs font-bold text-[var(--dim)] opacity-60">
            🔔 Notificaciones bloqueadas
          </button>
          <p className="max-w-72 text-right text-xs text-[var(--dim)]">Toca el candado junto a la dirección y permite las notificaciones para activarlas.</p>
        </>
      ) : status === "on" ? (
        <>
          <button
            type="button"
            onClick={unsubscribe}
            title="Toca para desactivar las notificaciones en este equipo"
            className="min-h-10 rounded-md border-2 px-3 py-1.5 text-xs font-bold"
            style={{ color: "var(--green)", borderColor: "var(--green)" }}
          >
            🔔 Notificaciones activadas ✓
          </button>
          <p className="max-w-72 text-right text-xs text-[var(--dim)]">Te avisaremos en este equipo cuando Merlín o Corvo publiquen algo.</p>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={subscribe}
            disabled={status === "busy"}
            className="min-h-10 rounded-md border-2 border-[var(--border)] bg-[var(--surface-alt)] px-3 py-1.5 text-xs font-bold text-[var(--text)] disabled:opacity-50"
          >
            {status === "busy" ? "Activando…" : "🔔 Activar notificaciones"}
          </button>
          {msg && <p className="max-w-72 text-right text-xs font-bold" style={{ color: "var(--red)" }}>{msg}</p>}
        </>
      )}
    </div>
  );
}

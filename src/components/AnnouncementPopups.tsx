"use client";
import { useEffect, useState } from "react";
import type { Announcement } from "@/lib/types";
import { MerlinBox, CorvoBox } from "./AnnouncementBox";

// Pop-ups flotantes de Merlín y Corvo al entrar a La Carrera.
// Se muestran solo con los comunicados ACTIVOS que el participante
// aún no ha visto: al cerrar uno se guarda su id en el navegador
// (localStorage) y ya no vuelve a salir hasta que Osbed publique un
// comunicado nuevo. Los recuadros fijos de arriba se quedan como están:
// el pop-up es solo el aviso al entrar, no los reemplaza.

const SEEN_KEY = "rpg-popups-vistos";

function loadSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

function saveSeen(seen: Set<string>) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
  } catch {
    // Sin almacenamiento: el pop-up saldrá de nuevo en la próxima visita.
  }
}

export default function AnnouncementPopups({
  announcements,
  crowAnnouncements,
  season,
  actionLabel,
  ready,
}: {
  announcements: Announcement[];
  crowAnnouncements: Announcement[];
  season: string;
  actionLabel?: (id: number | null) => string | null;
  ready: boolean; // true cuando La Carrera ya cargó de Supabase
}) {
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setSeen(loadSeen());
    setHydrated(true);
  }, []);

  const newMerlin = announcements.filter((a) => a.active && !seen.has(`merlin:${a.id}`));
  const newCorvo = crowAnnouncements.filter((a) => a.active && !seen.has(`corvo:${a.id}`));
  const show = ready && hydrated && (newMerlin.length > 0 || newCorvo.length > 0);

  function dismiss(kind: "merlin" | "corvo", ids: number[]) {
    const next = new Set(seen);
    ids.forEach((id) => next.add(`${kind}:${id}`));
    setSeen(next);
    saveSeen(next);
  }

  // Cerrar todo de una vez: la unión se calcula en un solo paso; si se
  // marcara una tarjeta y luego la otra con el estado anterior, la
  // segunda guardada borraría la primera y el pop-up no se cerraría.
  function dismissAll() {
    const next = new Set(seen);
    newMerlin.forEach((a) => next.add(`merlin:${a.id}`));
    newCorvo.forEach((a) => next.add(`corvo:${a.id}`));
    setSeen(next);
    saveSeen(next);
  }

  useEffect(() => {
    if (!show) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismissAll();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  if (!show) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Comunicados de Merlín y Corvo"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-3 sm:items-center sm:p-6"
      onClick={dismissAll}
    >
      <div className="w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="grid gap-4 md:grid-cols-2">
          {newMerlin.length > 0 && (
            <div className="relative">
              <button
                type="button"
                aria-label="Cerrar comunicado de Merlín"
                onClick={() => dismiss("merlin", newMerlin.map((a) => a.id))}
                className="absolute -right-2 -top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 border-[var(--border)] bg-[var(--surface)] text-sm font-bold text-[var(--text)]"
              >
                ✕
              </button>
              <MerlinBox announcements={newMerlin} season={season} actionLabel={actionLabel} />
            </div>
          )}
          {newCorvo.length > 0 && (
            <div className="relative">
              <button
                type="button"
                aria-label="Cerrar comunicado de Corvo"
                onClick={() => dismiss("corvo", newCorvo.map((a) => a.id))}
                className="absolute -right-2 -top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 border-[var(--border)] bg-[var(--surface)] text-sm font-bold text-[var(--text)]"
              >
                ✕
              </button>
              <CorvoBox announcements={newCorvo} season={season} actionLabel={actionLabel} />
            </div>
          )}
        </div>
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={dismissAll}
            className="min-h-11 rounded-md px-5 py-2 font-pixel text-[11px]"
            style={{ background: "var(--accent)", color: "#14161f" }}
          >
            ENTENDIDO
          </button>
        </div>
      </div>
    </div>
  );
}

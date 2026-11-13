"use client";
import type { Prize, Redemption } from "@/lib/types";
import { premioMayor } from "@/lib/data";

// Tarjeta de premio tal cual el Master: panel, icono a la izquierda,
// costo en pixel, chip de stock, caja "SOLICITAR CANJE EN RRHH" en pixel.
// Sin barra de progreso (el Master no la tiene).
// El letrero "¡TE LO GANARON!" solo aparece si el stock llegó a 0.
const PRIZE_ICON: Record<number, string> = {
  1: "🎫", 2: "🎬", 3: "🎮", 4: "📱", 5: "📺", 6: "🕹️",
};

export default function PrizeCard({ prize, prizes, redemptions }: { prize: Prize; prizes: Prize[]; redemptions?: Redemption[] }) {
  const mayor = premioMayor(prizes);
  const isTop = mayor?.id === prize.id;
  const out = prize.stock <= 0;
  const claims = (redemptions || []).filter((r) => r.prize_id === prize.id && r.status === "approved");
  const latestClaim = claims[0] ?? null;
  return (
    <article
      data-disponibles={prize.stock}
      className={`panel flex flex-col p-4 ${isTop ? "panel-gold" : ""}`}
      aria-label={isTop ? `${prize.name}, premio mayor, ${prize.cost.toLocaleString("es-MX")} puntos, ${prize.stock > 0 ? `${prize.stock} disponibles` : "agotado"}` : `${prize.name}, ${prize.cost.toLocaleString("es-MX")} puntos, ${prize.stock > 0 ? `${prize.stock} disponibles` : "agotado"}`}
    >
      {isTop && (
        <div className="mb-3 flex items-center justify-center gap-2 rounded-md border-2 px-2 py-1.5" style={{ borderColor: "#b8860b", background: "#f5b81e" }}>
          <span aria-hidden="true" className="text-[13px] leading-none text-[#4a3200]">★</span>
          <span className="font-pixel text-center text-[10px] leading-relaxed text-[#4a3200]">PREMIO MAYOR</span>
          <span aria-hidden="true" className="text-[13px] leading-none text-[#4a3200]">★</span>
        </div>
      )}
      {out && latestClaim && (
        <div className="mb-3 rounded-md border-2 px-3 py-2 text-center" style={{ borderColor: "var(--green)", background: "var(--surface-alt)" }} role="status">
          <p className="font-pixel text-[10px] leading-relaxed text-[var(--text)]">¡TE LO GANARON! · OBJETO CANJEADO</p>
          <p className="mt-1 text-xs font-semibold text-[var(--text)]">{latestClaim.prize_name} ya fue canjeado</p>
        </div>
      )}
      {out && (
        <div className="mb-3 rounded-md border-2 px-3 py-2 text-center" style={{ borderColor: "var(--red)", background: "var(--surface-alt)" }} role="status">
          <p className="font-pixel text-[10px] leading-relaxed" style={{ color: "var(--red)" }}>AGOTADO</p>
          <p className="mt-1 text-xs font-semibold text-[var(--text)]">Ya no quedan unidades de este premio.</p>
        </div>
      )}
      <div className="flex items-start gap-3">
        <span className={isTop ? "inline-flex shrink-0 rounded-lg border-2 border-[#e6a817] bg-white/60 p-1 shadow-[0_0_12px_rgba(245,184,30,0.65)] dark:bg-black/20" : "inline-flex shrink-0"}>
          <span className="leading-none" style={{ fontSize: isTop ? 56 : 52 }}>{PRIZE_ICON[prize.id] || "🎁"}</span>
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold text-[var(--text)]">{prize.name}</h3>
          <p className={`font-pixel mt-1 text-[11px] ${isTop ? "prize-gold-cost" : ""}`} style={isTop ? undefined : { color: "var(--accent)" }}>
            {prize.cost.toLocaleString("es-MX")} PTS
          </p>
          <p className="chip mt-2 inline-flex px-2.5 py-1 text-xs font-bold" style={prize.stock > 0 ? { color: "var(--green)", borderColor: "var(--green)" } : { color: "var(--red)", borderColor: "var(--red)" }}>
            {prize.stock > 0 ? `Disponibles: ${prize.stock.toLocaleString("es-MX")}` : "Agotado · Disponibles: 0"}
          </p>
          {isTop && <p className="mt-1 text-xs font-semibold text-[var(--text)]">El premio más especial de la carrera</p>}
        </div>
      </div>
      <p className="mt-4 rounded-md border-2 border-[var(--border)] bg-[var(--surface-alt)] px-3 py-2.5 text-center font-pixel text-[10px] leading-relaxed text-[var(--text)]" role="note">
        SOLICITAR CANJE EN RRHH
      </p>
      <p className="mt-2 text-center text-xs text-[var(--dim)]">
        {out
          ? "Agotado: aunque te alcancen los puntos, ya no se puede canjear hasta que haya más unidades."
          : latestClaim
            ? `Este objeto ya fue canjeado y quedan ${prize.stock.toLocaleString("es-MX")} disponible${prize.stock === 1 ? "" : "s"}. Si te alcanza para otro premio, pídelo en RRHH.`
            : "Sin botones aquí: el canje lo hace RRHH / el Master en persona."}
      </p>
    </article>
  );
}

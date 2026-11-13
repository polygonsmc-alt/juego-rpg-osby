import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Juego RPG de Metas — SCRIPT",
  description: "Carrera visual pixel-art para colaboradores. Panel Master y La Carrera con Supabase Realtime.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="bg-[#0f2a1d] text-white min-h-screen">{children}</body>
    </html>
  );
}

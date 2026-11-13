-- 0002 — Área de cada colaborador (ej. Ventas, Administración, Soporte).
-- CORRER EN SUPABASE > SQL Editor > Run ANTES de hacer Redeploy en Vercel:
-- sin esta columna, guardar un área desde el Master falla.
-- Seguro de volver a correr: `if not exists` no rompe nada si ya existe.
alter table collaborators add column if not exists area text;

-- Áreas reales de los 3 colaboradores actuales (Osbed, 2026-11-13).
-- Por nombre en minúsculas, por si el nombre guardado difiere en mayúsculas.
-- No toca puntos ni nada más; si ya tenían un área puesta a mano, la
-- sobrescribe con esta, que es la correcta según Osbed.
update collaborators set area = 'Marketing' where lower(name) = 'fany mota';
update collaborators set area = 'Marketing' where lower(name) = 'mayra morua';
update collaborators set area = 'Diseño gráfico' where lower(name) = 'osbed';

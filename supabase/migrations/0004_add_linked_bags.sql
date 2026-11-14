-- 0004 — Bolsas exclusivas genéricas: premio ligado a una acción.
-- CORRER EN SUPABASE > SQL Editor > Run DESPUÉS del 0003 y ANTES de
-- hacer Redeploy en Vercel: sin estas columnas/tabla, el Master nuevo
-- falla al sumar, restar o canjear con el mensaje falta_migracion_0004.
-- Seguro de volver a correr: `if not exists` / `on conflict` no rompen
-- nada si ya existe.
--
-- Idea (igual que la puntualidad, pero para cualquier acción y premio):
-- en ACCIONES Y PUNTOS el Master liga una acción a un premio
-- (action_types.linked_prize_id). Los puntos de esa acción suman al
-- total Y a la bolsa de ese premio (collaborator_bags). Solo con esa
-- bolsa se canjea ese premio; si no se canjea, los puntos se quedan y
-- suman para los premios generales. Ejemplo de Osbed: "Venta
-- concretada" 100 pts ligada a una gift card de 200 pts: con 2 ventas
-- la bolsa llega a 200 y solo quien generó esos puntos puede canjearla.
-- La bolsa del BONO DE PUNTUALIDAD NO vive aquí: sigue en
-- collaborators.punctuality_points (0003), en sincronía con su ligado.

-- Por si el 0003 no se corrió antes: la columna de puntualidad y la de
-- cantidad en canjes también hacen falta.
alter table collaborators
  add column if not exists punctuality_points int not null default 0
  check (punctuality_points >= 0);
alter table redemptions
  add column if not exists quantity int not null default 1
  check (quantity >= 1);

alter table action_types
  add column if not exists linked_prize_id bigint references prizes(id) on delete set null;

-- Bolsas exclusivas por colaborador y premio (sin el bono de
-- puntualidad, que vive en punctuality_points).
create table if not exists collaborator_bags (
  collaborator_id bigint not null references collaborators(id) on delete cascade,
  prize_id bigint not null references prizes(id) on delete cascade,
  points int not null default 0 check (points >= 0),
  primary key (collaborator_id, prize_id)
);

alter table collaborator_bags enable row level security;
do $$ begin
  create policy "public read" on collaborator_bags for select using (true);
  create policy "public write" on collaborator_bags for all using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'collaborator_bags'
  ) then
    alter publication supabase_realtime add table collaborator_bags;
  end if;
end $$;

-- La puntualidad ya era una bolsa: ligar sus acciones al BONO DE
-- PUNTUALIDAD (por id del seed y por nombre, por si se renombró una).
update action_types set linked_prize_id = (
  select id from prizes where upper(name) = 'BONO DE PUNTUALIDAD' limit 1
)
where linked_prize_id is null
  and (
    id in (3, 12)
    or lower(label) like '%check-in puntual%'
    or lower(label) like '%check in puntual%'
    or lower(label) like '%semana sin faltas%'
    or lower(label) like '%mes perfecto%'
  );

-- Reconstrucción de bolsas ya ligadas (que no sean puntualidad, que ya
-- la reconstruye el 0003 en punctuality_points): suma los premios de
-- cada acción ligada, con el bono ya aplicado como quedaron registrados,
-- sin contar los deshechos. Si hoy no hay ninguna acción ligada salvo
-- puntualidad, no inserta nada.
insert into collaborator_bags (collaborator_id, prize_id, points)
select e.collaborator_id, a.linked_prize_id, greatest(0, sum(e.points))
from point_events e
join action_types a on a.label = e.label
where e.kind = 'award'
  and coalesce(e.reversed, false) = false
  and a.linked_prize_id is not null
  and a.linked_prize_id <> (
    select id from prizes where upper(name) = 'BONO DE PUNTUALIDAD' limit 1
  )
group by e.collaborator_id, a.linked_prize_id
having greatest(0, sum(e.points)) > 0
on conflict (collaborator_id, prize_id) do nothing;

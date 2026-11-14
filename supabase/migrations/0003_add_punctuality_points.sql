-- 0003 — Sub-saldo de puntualidad + canje por cantidad.
-- CORRER EN SUPABASE > SQL Editor > Run ANTES de hacer Redeploy en Vercel:
-- sin estas columnas, el Master nuevo falla al sumar, restar o canjear
-- (las acciones actualizan `punctuality_points` y los canjes guardan
-- `quantity`). Seguro de volver a correr: `if not exists` / `where not
-- exists` no rompen nada si ya existe.
alter table collaborators
  add column if not exists punctuality_points int not null default 0
  check (punctuality_points >= 0);
alter table redemptions
  add column if not exists quantity int not null default 1
  check (quantity >= 1);

-- Premio BONO DE PUNTUALIDAD (500 pts, stock 100): solo canjeable con
-- puntos de puntualidad. Sin id explícito para no chocar con premios que
-- Osbed ya haya agregado en vivo (ej. BONO EN EFECTIVO MENSUAL).
insert into prizes (name, cost, stock)
select 'BONO DE PUNTUALIDAD', 500, 100
where not exists (
  select 1 from prizes where upper(name) = 'BONO DE PUNTUALIDAD'
);

-- Reconstrucción del sub-saldo con el historial que ya existe: suma los
-- puntos de check-in puntual y semana sin faltas (con el bono ya aplicado,
-- como quedaron registrados) menos Retardo y Falta injustificada, sin
-- pasar del saldo total y sin bajar de 0. Si un colaborador ganó sus
-- puntos con otras acciones (ventas, leads, entregas), su puntualidad
-- empieza en 0 y se acumula desde ahora. No toca el saldo total.
-- (Los movimientos deshechos no cuentan: su renglón original quedó
-- marcado reversed = true.)
update collaborators c
set punctuality_points = least(
  c.points,
  greatest(0,
    coalesce((
      select sum(e.points) from point_events e
      where e.collaborator_id = c.id
        and e.kind = 'award'
        and coalesce(e.reversed, false) = false
        and e.label in ('Check-in puntual', 'Semana sin faltas ni retardos')
    ), 0)
    - coalesce((
      select sum(abs(e.points)) from point_events e
      where e.collaborator_id = c.id
        and e.kind = 'penalty'
        and coalesce(e.reversed, false) = false
        and e.label in ('Retardo', 'Falta injustificada')
    ), 0)
  )
);

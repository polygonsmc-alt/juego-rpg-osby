# Juego RPG de Metas — SCRIPT TECNOLOGIAS DE LA INFORMACION / OSBY

Carrera visual pixel-art para colaboradores. Un solo número de puntos por
persona — **NO hay puntos de por vida / lifetime**. Todos empiezan en 0 pts,
nivel Novato, empatados.

## Qué incluye

- **La Carrera (`/`)** — solo visual: pista pixel, podio (1° dorado, 2° plateado),
  ranking, actividad, premios con texto fijo `SOLICITAR CANJE EN RRHH`
  (sin botones ni selectores para participantes), stock `Disponibles: N` /
  `Agotado`, recuadro `Canjes realizados`.
- **Panel Master (`/master`)** — solo Osbed: sumar / restar puntos, deshacer
  último movimiento y por evento (sin doble reversión, queda en historial
  como DESHECHO), canje directo con **cantidad** (1, 2, 3…: costo total =
  cantidad × costo, stock baja por cantidad), solicitudes pendientes,
  stock con steppers −/+, empresa / logo, tema y temporada.
- **Sub-saldo de puntualidad** — cada colaborador tiene, además de sus
  puntos totales, sus puntos de puntualidad: solo lo ganado con check-in
  puntual, semana sin faltas y mes perfecto. Retardo y Falta injustificada
  también restan de ahí. El **BONO DE PUNTUALIDAD** (500 pts, stock 100)
  solo se canjea con ese sub-saldo: si pide 3 bonos y solo tiene 1,000 pts
  de puntualidad, el Master muestra `NO CUMPLES CON LOS REQUERIMIENTOS
  PARA CANJEAR 3 BONOS, solo cuentas con 1000 puntos que sí puedes canjear
  por BONOS.` Al canjear se descuenta de los dos saldos; si no lo canjea,
  esos puntos se quedan y siguen acumulando para un premio mayor. Un premio
  general descuenta primero los puntos que no son de puntualidad.
- **Merlín** — mago barbón, comunicados con bono ×2 o ×3 en todas las acciones
  o en una sola. Activo: `MERLIN A HABLADO | PUNTOS DOBLES`, ×2 en Check-in.
- **Cuervo de RRHH · Corvo** — recuadro aparte de Merlín. Cuervo negro pixel
  con brillo azul/morado, pico amarillo, lentes, corbata roja, sobre en el
  pico. Santa en Navidad, bruja en Halloween. Sus propios comunicados y bonos
  ×2/×3. Si Merlín y Corvo coinciden, aplica el más fuerte, no se suman.
- **Evolución por puntos actuales:** Novato 0, Bronce 100, Plata 300,
  Oro 600, Diamante 1000, Leyenda 1500. Al canjear baja.
- **Acciones (12):** Venta 100, Entrega a tiempo 50, Semana sin faltas 50,
  Referido que compra 40, Idea implementada 40, Upsell 30, Reseña 5★ 30,
  Lead 25, Entrega sin correcciones 25, Capacitación 20, Ayuda 15,
  Check-in 10.
- **Restas:** Falta -50, Error -30, Retardo -15, No reportar -10, más resta
  personalizada con motivo. Saldo nunca < 0.
- **Premios + stock:** Amazon 500 pts / 4, Cinépolis 700 / 5, Videojuego
  900 / 3, Tablet Samsung A11+ 1400 / 2, TV TCL 50" 2000 / 1,
  PS5 100000 / 1 — Premio Mayor dorado dinámico (el más caro),
  BONO DE PUNTUALIDAD 500 / 100 (solo con puntos de puntualidad).
- **Tema / temporada actual:** Bosque + Navidad (nieve, pinos con luces,
  Merlín con gorro de Santa y trineo).

## Stack

Next.js 14 App Router + TypeScript + Tailwind, Supabase (Postgres + Realtime).
Una sola base de datos: cuando el Master mueve puntos, La Carrera se
actualiza sola en menos de 5 segundos vía Realtime.

## Setup local

```bash
cp .env.example .env.local
# Llena NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
# SUPABASE_SERVICE_ROLE_KEY con las llaves de tu proyecto Supabase.
# Proyecto ya creado: https://ewwrbsoltopjswobwbgq.supabase.co
# NUNCA subas .env.local a GitHub.

npm install
npm run dev
# Abre http://localhost:3000  (La Carrera)
# Panel Master: http://localhost:3000/master
```

## Supabase — crear las tablas

En Supabase > SQL Editor, pega y ejecuta:

```
supabase/migrations/0001_init.sql
supabase/migrations/0002_add_area.sql
supabase/migrations/0003_add_punctuality_points.sql
```

Ese archivo crea: `collaborators`, `action_types`, `penalty_types`,
`point_events`, `prizes`, `redemptions`, `announcements` (Merlín),
`crow_announcements` (Corvo), `settings`, habilita RLS y Realtime,
y siembra los 3 participantes en 0, los 7 premios con stock (incluido el
BONO DE PUNTUALIDAD), el comunicado de Merlín y los 4 de Corvo (el primero
activo, sin bono). Para una instalación nueva, corre 0001, luego 0002 y
luego 0003, en ese orden.

## Migración 0003 — sub-saldo de puntualidad (base ya creada)

Si tu base ya existe (la real, con puntos), en Supabase > SQL Editor
pega y ejecuta **antes** de hacer Redeploy en Vercel:

```
supabase/migrations/0003_add_punctuality_points.sql
```

Agrega `collaborators.punctuality_points` y `redemptions.quantity`,
crea el premio BONO DE PUNTUALIDAD (500 pts, stock 100) si no existe, y
reconstruye el sub-saldo de cada colaborador desde su historial
(check-in puntual y semana sin faltas, menos Retardo y Falta
injustificada, sin pasar del saldo total). Sin correrla, el Master nuevo
falla al sumar, restar o canjear. Volver a correrla es seguro.

## Proteger el Master con PIN

El Panel Master (`/master`) pide un PIN de 4 a 6 dígitos. La Carrera (`/`)
sigue pública, sin PIN, solo para ver.

1. En Vercel > proyecto > **Settings > Environment Variables** agrega
   `MASTER_PIN` con tu PIN (solo servidor, **sin** prefijo `NEXT_PUBLIC_`),
   para **Production** (y Preview si quieres probar).
2. **Redeploy** en Vercel > Deployments.
3. Abre `/master`: te pide el PIN. Si te equivocas dice
   `PIN incorrecto, intenta de nuevo`. La sesión dura 7 días; para salir
   usa **SALIR / CERRAR SESIÓN** arriba en el Master.
4. Sin `MASTER_PIN`, el Master no se abre y avisa que falta configurarlo.
   No hay PIN por defecto y el PIN nunca va en el código ni en GitHub.

## Deploy a Vercel

1. Sube este código a GitHub (org OSBY).
2. En Vercel (Team OSBY) > Add New > Project > Import desde GitHub.
3. En Settings > Environment Variables agrega las 4 variables de `.env.example`
   (las mismas de Supabase, sin el prefijo de ejemplo) **más `MASTER_PIN`**
   con tu PIN de 4-6 dígitos (solo servidor, sin `NEXT_PUBLIC_`).
4. Deploy. Vercel te da `https://juego-rpg-script.vercel.app`.
5. Subdominio: en Vercel > Domains agrega `juego.tudominio.com` y en tu
   DNS crea un registro CNAME `juego` → `cname.vercel-dns.com`.

## Costos (caso real: solo visual + Master diario, 10-20 movimientos/día)

- Para empezar: **$0** — Vercel Hobby + Supabase Free
  (500 MB de base de datos, ~600 KB/mes de uso real).
- Producción: **$45 USD/mes** — Vercel Pro $20 + Supabase Pro desde $25.

## Estructura

```
src/app/page.tsx            La Carrera (visual, Realtime)
src/app/master/page.tsx     Panel Master
src/app/master/layout.tsx   Barrera del PIN (sin sesión no se renderiza)
src/app/master-login/page.tsx  Pantalla de PIN + formulario
src/middleware.ts           Redirige /master sin sesión a /master-login
src/lib/auth.ts             PIN, cookie master_auth (HMAC, 7 días), salir
src/lib/auth-token.ts       Firma/verificación del token (Edge + Node)
src/app/layout.tsx          Layout + metadata
src/components/            PixelAvatar, Merlin, Corvo, Podium, Track, PrizeCard, AnnouncementBox
src/lib/data.ts             Acciones, restas, premios, niveles, seeds, mejor bono
src/lib/types.ts            Tipos (sin lifetime)
src/lib/supabase.ts         Cliente Supabase (anon + admin)
src/lib/actions.ts          Server actions: sumar, restar, canjear, deshacer
supabase/migrations/0001_init.sql
supabase/migrations/0002_add_area.sql
supabase/migrations/0003_add_punctuality_points.sql
```

## Pruebas de aceptación

1. Abrir `/` sin Supabase: se ven los 3 en 0, Novato, empatados.
2. En `/master`, sumar Venta 100 a Fany: sube a 100, Bronce, y se refleja en `/` en <5 s.
3. Activar bono ×2 de Merlín en Check-in y sumar Check-in: +20, historial dice de quién fue.
4. Canjear Amazon con 500 pts: descuenta 500 y stock 4 → 3.
   Canjear 2× BONO DE PUNTUALIDAD con 1,000 pts de puntualidad: descuenta
   1,000 del total y 1,000 de puntualidad, stock 100 → 98, y en Canjes
   realizados se ve "canjeó 2x BONO DE PUNTUALIDAD". Pedir 3 bonos con
   1,000 pts de puntualidad muestra el NO CUMPLES y no descuenta nada.
5. Deshacer ese canje: devuelve puntos y stock, y el evento queda DESHECHO; segundo Deshacer se rechaza.
6. Cambiar temporada a Halloween: Merlín y Corvo cambian de gorro, sin nieve.
7. PIN: abrir `/master` sin sesión redirige a `/master-login`; PIN
   incorrecto dice `PIN incorrecto, intenta de nuevo`; con el PIN correcto
   entra al Master y los botones guardan; **SALIR / CERRAR SESIÓN** vuelve
   a pedir el PIN. Sin `MASTER_PIN` en Vercel, el Master avisa que falta
   configurarlo y no se abre.

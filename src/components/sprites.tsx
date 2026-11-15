// Pixel-art rendering for Juego RPG de Metas.
//
// Avatars are original 16x18 pixel sprites drawn in code, in the chibi
// pixel style of the reference image the user shared (the stock sheet
// itself is never copied). A sprite = base form (Master-assigned look) +
// color palette (hair/hood + skin) + evolution tier overlays: as the
// current point balance grows, the armor recolors and the sprite gains a
// gold belt buckle, shoulder gems, a crown, a chest gem, sparkles, and
// finally a cape. Redeeming a prize spends balance, so the avatar drops
// back down the tiers too.

export interface Tier {
  name: string;
  min: number;
  color: string;
}

export const TIERS: Tier[] = [
  { name: "Novato", min: 0, color: "#8d99ae" },
  { name: "Bronce", min: 100, color: "#e08a4c" },
  { name: "Plata", min: 300, color: "#c7d2e0" },
  { name: "Oro", min: 600, color: "#f5b81e" },
  { name: "Diamante", min: 1000, color: "#4fd8e8" },
  { name: "Leyenda", min: 1500, color: "#b183f2" },
];

export function tierIndexFor(points: number): number {
  let idx = 0;
  for (let i = 0; i < TIERS.length; i++) {
    if (points >= (TIERS[i]?.min ?? 0)) idx = i;
  }
  return idx;
}

export function nextTier(points: number): Tier | null {
  const idx = tierIndexFor(points);
  return TIERS[idx + 1] ?? null;
}

const ARMOR: Array<{ a: string; A: string; d: string }> = [
  { a: "#8d99ae", A: "#aeb9c9", d: "#5c6675" }, // Novato
  { a: "#c97b3f", A: "#e09a58", d: "#8a5326" }, // Bronce
  { a: "#aebdd1", A: "#d3dde9", d: "#75839a" }, // Plata
  { a: "#d9a51f", A: "#f5c542", d: "#9a7414" }, // Oro
  { a: "#3fb8c9", A: "#6fd8e8", d: "#27788a" }, // Diamante
  { a: "#8a4fe0", A: "#b183f2", d: "#5c2ea6" }, // Leyenda
];

interface Palette {
  hair: string;
  hairShade: string;
  skin: string;
  skinShade: string;
}

const PALETTES: Palette[] = [
  { hair: "#6b4a2b", hairShade: "#4e341d", skin: "#f2c79b", skinShade: "#d9a06c" },
  { hair: "#2f6db3", hairShade: "#20507f", skin: "#e8b08a", skinShade: "#c98d5f" },
  { hair: "#3f9e4d", hairShade: "#2c7038", skin: "#8a5a3b", skinShade: "#6e452b" },
  { hair: "#b03a3a", hairShade: "#7f2828", skin: "#f7d7b5", skinShade: "#ddb184" },
  { hair: "#7a4fd0", hairShade: "#57369c", skin: "#c68863", skinShade: "#a06a42" },
  { hair: "#e8b93e", hairShade: "#bd9427", skin: "#f2c79b", skinShade: "#d9a06c" },
  { hair: "#37414f", hairShade: "#232a35", skin: "#a06a42", skinShade: "#7d5230" },
  { hair: "#e86aa8", hairShade: "#bc4a85", skin: "#ffd9c0", skinShade: "#eab493" },
  // Women's styles (sprites 8-11).
  { hair: "#4a2c17", hairShade: "#33200f", skin: "#f2c79b", skinShade: "#d9a06c" },
  { hair: "#20222b", hairShade: "#101216", skin: "#c68863", skinShade: "#a06a42" },
  { hair: "#8a3324", hairShade: "#63231a", skin: "#ffd9c0", skinShade: "#eab493" },
  { hair: "#d9a441", hairShade: "#b07f24", skin: "#8a5a3b", skinShade: "#6e452b" },
];

export const SPRITE_COUNT = PALETTES.length;

// Base forms: 16 columns x 18 rows.
// Chars: . transparent, k outline, s skin, S skin shade, h hair/hood,
// H hair shade, a armor, A armor light, d armor dark, e eye, p pants,
// b boots, m metal face (robot).
const BODY_LOWER = [
  "...aaaaaaaaaa...",
  "...aAaaaaaaAa...",
  "..aa.aaaaaa.aa..",
  "..aa.aaaaaa.aa..",
  "..ss.aaaaaa.ss..",
  "....dddddddd....",
  "....ppp..ppp....",
  "....ppp..ppp....",
  "....bbb..bbb....",
];

const FORMS: string[][] = [
  // 0 Recluta (hair)
  [
    "................",
    ".....hhhhhh.....",
    "....hhhhhhhh....",
    "....hhHHHHhh....",
    "....ssssssss....",
    "....seessees....",
    "....ssssssss....",
    ".....ssssss.....",
    ".......ss.......",
    ...BODY_LOWER,
  ],
  // 1 Explorador (cap + scarf)
  [
    "................",
    "....hhhhhhhh....",
    "...hhhhhhhhhh...",
    "...hhhhhhhhhh...",
    "....ssssssss....",
    "....seessees....",
    "....ssssssss....",
    "....hhhhhhhh....",
    "....hhhhhhhh....",
    ...BODY_LOWER,
  ],
  // 2 Mago (pointy hat + robe)
  [
    ".......hh.......",
    ".......hhh......",
    "......hhhhh.....",
    ".....hhhhhhh....",
    "...hhhhhhhhhh...",
    "....ssssssss....",
    "....seessees....",
    "....ssssssss....",
    ".....ssssss.....",
    "...aaaaaaaaaa...",
    "...aAaaaaaaAa...",
    "..aa.aaaaaa.aa..",
    "..aa.aaaaaa.aa..",
    "..ss.aaaaaa.ss..",
    "....aaaaaaaa....",
    "....aaaaaaaa....",
    "...aaaaaaaaaa...",
    "...aaaaaaaaaa...",
  ],
  // 3 Robot
  [
    ".......gg.......",
    ".......kk.......",
    "...kkkkkkkkkk...",
    "...kmmmmmmmmk...",
    "...kmeekkeemk...",
    "...kmmmmmmmmk...",
    "...kmmkmmkmmk...",
    "...kkkkkkkkkk...",
    ".......kk.......",
    ...BODY_LOWER,
  ],
  // 4 Guerrero (horned helmet)
  [
    "................",
    "..hh........hh..",
    "..hhh.hhhh.hhh..",
    "....hhhhhhhh....",
    "....hhhhhhhh....",
    "....kkkkkkkk....",
    "....ssssssss....",
    "....ssssssss....",
    ".....ssssss.....",
    ...BODY_LOWER,
  ],
  // 5 Ninja (mask)
  [
    "................",
    "....hhhhhhhh....",
    "...hhhhhhhhhh...",
    "...hhhhhhhhhh...",
    "...hhhhhhhhhh...",
    "...hseesseesh...",
    "....hhhhhhhh....",
    "....hhhhhhhh....",
    ".....ssssss.....",
    ...BODY_LOWER,
  ],
  // 6 Recluta II — same form as 0; keeps the look sprite index 6 had when
  // forms wrapped around (form = index % 6) before the catalog grew.
  [
    "................",
    ".....hhhhhh.....",
    "....hhhhhhhh....",
    "....hhHHHHhh....",
    "....ssssssss....",
    "....seessees....",
    "....ssssssss....",
    ".....ssssss.....",
    ".......ss.......",
    ...BODY_LOWER,
  ],
  // 7 Explorador II — same form as 1, same reason as 6.
  [
    "................",
    "....hhhhhhhh....",
    "...hhhhhhhhhh...",
    "...hhhhhhhhhh...",
    "....ssssssss....",
    "....seessees....",
    "....ssssssss....",
    "....hhhhhhhh....",
    "....hhhhhhhh....",
    ...BODY_LOWER,
  ],
  // 8 Coleta larga (long side hair + dress-like skirt hem)
  [
    "................",
    ".....hhhhhh.....",
    "....hhhhhhhh....",
    "....hhHHHHhh....",
    "...hhsssssshh...",
    "...hhseesseeshh.",
    "...hhsssssshh...",
    "...hhsssssshh...",
    "...hh..ss..hh...",
    "...h.aaaaaa.h...",
    "...h.aAaaAa.h...",
    "...h.aaaaaa.h...",
    "...h.aaaaaa.h...",
    "...hs.aaaa.sh...",
    "....dddddddd....",
    "...aaaaaaaaaa...",
    "..aaaaaaaaaaaa..",
    "..bbbb....bbbb..",
  ],
  // 9 Moño alto (top bun + bow, 'x' = bow color)
  [
    "......xxxx......",
    ".....hhhhhh.....",
    "....hhhhhhhh....",
    "....hhHHHHhh....",
    "....ssssssss....",
    "....seessees....",
    "....ssssssss....",
    ".....ssssss.....",
    ".......ss.......",
    ...BODY_LOWER,
  ],
  // 10 Pelo largo ondulado (wavy long hair)
  [
    "................",
    ".....hhhhhh.....",
    "....hhhhhhhh....",
    "...hhhhhhhhhh...",
    "...hhsssssshh...",
    "...hhseesseeshh.",
    "...hhsssssshh...",
    "...hhsssssshh...",
    "....hh.ss.hh....",
    "....h.aaaa.h....",
    "....h.aAaa.h....",
    "...hh.aaaa.hh...",
    "...h..aaaa..h...",
    "...h..aaaa..h...",
    "....dddddddd....",
    "....ppp..ppp....",
    "....ppp..ppp....",
    "....bbb..bbb....",
  ],
  // 11 Trenza (side braid over one shoulder)
  [
    "................",
    ".....hhhhhh.....",
    "....hhhhhhhh....",
    "....hhHHHHhh....",
    "....ssssssss....",
    "....seessees....",
    "....ssssssss....",
    ".....ssssss.....",
    ".......ss.......",
    "...aaaaaaaah....",
    "...aAaaaaaahh...",
    "..aa.aaaaaah....",
    "..aa.aaaaaahh...",
    "..ss.aaaaaah....",
    "....dddddddd....",
    "....ppp..ppp....",
    "....ppp..ppp....",
    "....bbb..bbb....",
  ],
];

function buildGrid(sprite: number, tierIdx: number): string[][] {
  const form = FORMS[sprite % FORMS.length] ?? FORMS[0]!;
  const grid = form.map((row) =>
    row.padEnd(16, ".").slice(0, 16).split(""),
  );
  const set = (r: number, c: number, ch: string) => {
    const row = grid[r];
    if (row && c >= 0 && c < row.length) row[c] = ch;
  };
  // Bronce+: gold belt buckle.
  if (tierIdx >= 1) {
    set(14, 7, "g");
    set(14, 8, "g");
  }
  // Plata+: bright shoulder gems.
  if (tierIdx >= 2) {
    set(9, 3, "w");
    set(9, 12, "w");
  }
  // Oro+: crown.
  if (tierIdx >= 3) {
    set(0, 6, "g");
    set(0, 9, "g");
    set(1, 5, "g");
    set(1, 6, "g");
    set(1, 7, "g");
    set(1, 8, "g");
    set(1, 9, "g");
    set(1, 10, "g");
  }
  // Diamante+: chest gem + sparkles.
  if (tierIdx >= 4) {
    set(11, 7, "c");
    set(11, 8, "c");
    set(3, 1, "w");
    set(6, 14, "w");
    set(13, 14, "w");
  }
  // Leyenda: cape.
  if (tierIdx >= 5) {
    for (let r = 9; r <= 16; r++) {
      if ((grid[r]?.[1] ?? ".") === ".") set(r, 1, "r");
      if ((grid[r]?.[14] ?? ".") === ".") set(r, 14, "r");
    }
    set(1, 7, "c");
  }
  return grid;
}

function charColor(
  ch: string,
  palette: Palette,
  tierIdx: number,
): string | null {
  const armor = ARMOR[tierIdx] ?? ARMOR[0]!;
  switch (ch) {
    case "k":
      return "#232733";
    case "s":
      return palette.skin;
    case "S":
      return palette.skinShade;
    case "h":
      return palette.hair;
    case "H":
      return palette.hairShade;
    case "a":
      return armor.a;
    case "A":
      return armor.A;
    case "d":
      return armor.d;
    case "e":
      return "#232733";
    case "p":
      return "#39415a";
    case "b":
      return "#4a3220";
    case "m":
      return "#cfd6dd";
    case "g":
      return "#ffd23e";
    case "c":
      return "#67e8f9";
    case "w":
      return "#ffffff";
    case "r":
      return "#e03131";
    case "x":
      return "#e03131"; // hair bow (form 9)
    default:
      return null;
  }
}

export function AvatarSprite({
  sprite,
  tierIdx,
  size = 48,
  className,
}: {
  sprite: number;
  tierIdx: number;
  size?: number;
  className?: string;
}) {
  const palette = PALETTES[sprite % PALETTES.length] ?? PALETTES[0]!;
  const grid = buildGrid(sprite, tierIdx);
  const rects: Array<{ x: number; y: number; fill: string }> = [];
  grid.forEach((row, y) => {
    row.forEach((ch, x) => {
      const fill = charColor(ch, palette, tierIdx);
      if (fill) rects.push({ x, y, fill });
    });
  });
  return (
    <svg
      viewBox="0 0 16 18"
      width={size}
      height={Math.round(size * 1.125)}
      className={className}
      role="img"
      aria-label="Avatar pixel"
      style={{ imageRendering: "pixelated", display: "block" }}
    >
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={1.02} height={1.02} fill={r.fill} />
      ))}
    </svg>
  );
}

// ---- Merlín, the Master wizard (18 x 20) ----
// The Master's persona: tall pointy hat with a star, long white beard,
// purple robe and a staff with a glowing orb. Drawn in the same pixel
// style; colors are fixed (he does not evolve with tiers).
// Chars: . transparent, u hat purple, U hat shade, y star gold,
// s skin, e eye, w beard white, W beard shade, r robe, R robe light,
// t staff wood, o orb cyan.
const WIZARD_GRID: string[] = [
  ".......uu.........",
  "......uuuu........",
  "......uuuu........",
  ".....uuuuuu.......",
  ".....uuyuuu.......",
  "....uuuuuuuu......",
  "...uuuuuuuuuu.....",
  ".uuuuuuuuuuuuuu...",
  "....ssssssss......",
  "....seessees......",
  "....ssssssss......",
  ".....wwwwww.......",
  "....wwwwwwww......",
  "...rwwWwwWwwr..t..",
  "...rrwwwwwwrr..t..",
  "..rrrwwwwwwrrr.t..",
  "..rrRwwwwwwRrr.t..",
  "..rrrwwwwwwrrr.t..",
  "...rrrrrrrrrr..t..",
  "...rrrrrrrrrr..t..",
];

const WIZARD_COLORS: Record<string, string> = {
  u: "#6d4fc2",
  U: "#4b3486",
  y: "#ffd23e",
  s: "#f2c79b",
  e: "#232733",
  w: "#eef1f6",
  W: "#c6cdd8",
  r: "#4b3486",
  R: "#5d439e",
  t: "#7a4a21",
  o: "#67e8f9",
};

// The staff orb replaces the top staff pixels.
const WIZARD_OVERRIDES: Record<string, string> = {
  "11,15": "o",
  "12,15": "o",
};

// ---- Merlín's seasonal outfits ----
// Each season remaps some wizard colors and stamps a few extra pixels:
// navidad = red Santa hat with a white fur brim + red robe (his sleigh is
// a separate sprite), halloween = black witch hat with an orange band,
// primavera = flowers on the hat, verano = straw hat + sunglasses.
// Extra chars: f fur white, n orange, p flower pink, l leaf green,
// k sunglasses black.
const WIZARD_EXTRA_COLORS: Record<string, string> = {
  f: "#ffffff",
  n: "#ff8c1a",
  p: "#f783ac",
  l: "#3ecf6e",
  k: "#232733",
};

const WIZARD_SEASON_COLORS: Record<string, Record<string, string>> = {
  navidad: { u: "#d7263d", U: "#a31621", r: "#b31b34", R: "#d7263d" },
  halloween: { u: "#26232e", U: "#17151d", r: "#3d2b57", R: "#503a73", y: "#ff8c1a" },
  verano: { u: "#e8c95a", U: "#c9a83a", r: "#1f7a8c", R: "#2b9aad" },
};

function wizardSeasonOverrides(season: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (season === "navidad") {
    // White fur brim across the hat's widest row.
    for (let x = 1; x <= 14; x++) out[`7,${x}`] = "f";
  } else if (season === "halloween") {
    // Orange band around the hat.
    for (let x = 3; x <= 12; x++) out[`6,${x}`] = "n";
  } else if (season === "primavera") {
    out["2,7"] = "p";
    out["4,4"] = "p";
    out["6,12"] = "p";
    out["3,9"] = "l";
    out["5,10"] = "l";
  } else if (season === "verano") {
    // Sunglasses across the eyes row.
    for (let x = 4; x <= 11; x++) out[`9,${x}`] = "k";
  }
  return out;
}

export function WizardSprite({
  size = 72,
  className,
  season = "ninguna",
}: {
  size?: number;
  className?: string;
  season?: string;
}) {
  const colors: Record<string, string> = {
    ...WIZARD_COLORS,
    ...WIZARD_EXTRA_COLORS,
    ...(WIZARD_SEASON_COLORS[season] ?? {}),
  };
  const overrides: Record<string, string> = {
    ...WIZARD_OVERRIDES,
    ...wizardSeasonOverrides(season),
  };
  const rects: Array<{ x: number; y: number; fill: string }> = [];
  WIZARD_GRID.forEach((rowStr, y) => {
    rowStr
      .padEnd(18, ".")
      .slice(0, 18)
      .split("")
      .forEach((rawCh, x) => {
        const ch = overrides[`${y},${x}`] ?? rawCh;
        const fill = colors[ch];
        if (fill) rects.push({ x, y, fill });
      });
  });
  return (
    <svg
      viewBox="0 0 18 20"
      width={size}
      height={Math.round(size * (20 / 18))}
      className={className}
      role="img"
      aria-label="Merlín, el mago Master"
      style={{ imageRendering: "pixelated", display: "block" }}
    >
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={1.02} height={1.02} fill={r.fill} />
      ))}
    </svg>
  );
}

// ---- Merlín's sleigh (Navidad, 20 x 12) ----
// Red sleigh with a gold runner, loaded with two gift boxes. Shown next
// to Merlín while the Navidad season is active.
// Chars: r sleigh red, R sleigh shade, g/b gift boxes, y gold, k dark.
const SLEIGH_GRID: string[] = [
  "....................",
  "....gggg...bbbb.....",
  "...gggggg.bbbbbb....",
  "...gggygg.bbybbb....",
  "...gggggg.bbbbbb....",
  "..rrrrrrrrrrrrrr....",
  ".rrrrrrrrrrrrrrrr...",
  ".rRRrrrrrrrrrryy....",
  "..rrrrrrrrrrrr......",
  "....y..........yy...",
  "....yyyyyyyyyyyy....",
  "....................",
];

const SLEIGH_COLORS: Record<string, string> = {
  r: "#d7263d",
  R: "#a31621",
  g: "#2e9e4f",
  b: "#3a7bd5",
  y: "#ffd23e",
  k: "#232733",
};

export function SleighSprite({
  size = 84,
  className,
}: {
  size?: number;
  className?: string;
}) {
  const rects: Array<{ x: number; y: number; fill: string }> = [];
  SLEIGH_GRID.forEach((rowStr, y) => {
    rowStr
      .padEnd(20, ".")
      .slice(0, 20)
      .split("")
      .forEach((ch, x) => {
        const fill = SLEIGH_COLORS[ch];
        if (fill) rects.push({ x, y, fill });
      });
  });
  return (
    <svg
      viewBox="0 0 20 12"
      width={size}
      height={Math.round(size * (12 / 20))}
      className={className}
      role="img"
      aria-label="Trineo de Merlín con regalos"
      style={{ imageRendering: "pixelated", display: "block" }}
    >
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={1.02} height={1.02} fill={r.fill} />
      ))}
    </svg>
  );
}

// ---- Corvo, el Cuervo de RRHH (18 x 18) ----
// HR's own messenger, separate from Merlín: a black pixel crow with a
// blue/purple sheen on the feathers, yellow beak and yellow eyes behind
// little glasses, a red HR tie, and the envelope he delivers held in
// front of his beak, standing on a branch. Seasonal looks: navidad =
// Santa hat with white brim and pompom, halloween = black witch hat with
// an orange band.
// Chars: . transparent, k body black, b blue sheen, p purple sheen,
// Y eye yellow, y beak/feet, g glasses frame, r tie red, e envelope,
// E envelope shade, t branch, l leaf, n Santa red, f fur/pompom white,
// h witch hat black, o witch band orange.
const CROW_GRID: string[] = [
  "..................",
  ".....kkkkkk.......",
  "....kkbbkkkkk.....",
  "...kkbkkkkppkk....",
  "...kkkkkkkkkkk....",
  "...kgYYgkgYYgk....",
  "...kkkkkkkkkkk....",
  "....kkkyyyykk.....",
  ".....kyyyyyk......",
  "....eeeeeeeee.....",
  "....eEeeeeeEe.....",
  "....eeEEEEEee.....",
  ".....kkkrrkkk.....",
  "...kkkkkrrkkkkk...",
  "..kkkkkkrrkkkkkk..",
  "..kkkkkkkkkkkkkk..",
  ".....yy...yy......",
  ".tttttltttttttttt.",
];

const CROW_COLORS: Record<string, string> = {
  k: "#26232e",
  b: "#4a6fd9",
  p: "#8a5fd0",
  Y: "#ffd23e",
  y: "#f5b81e",
  g: "#cfd6dd",
  r: "#d7263d",
  e: "#f7f5ee",
  E: "#c9cfda",
  t: "#7a4a21",
  l: "#3ecf6e",
  n: "#d7263d",
  f: "#ffffff",
  h: "#17151d",
  o: "#ff8c1a",
};

function crowSeasonOverrides(season: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (season === "navidad") {
    // Santa hat: red cap over the head top, white pompom, white brim.
    for (let x = 7; x <= 10; x++) out[`0,${x}`] = "n";
    out["0,11"] = "f";
    for (let x = 5; x <= 10; x++) out[`1,${x}`] = "n";
    for (let x = 4; x <= 12; x++) out[`2,${x}`] = "f";
  } else if (season === "halloween") {
    // Pointy witch hat with an orange band.
    out["0,8"] = "h";
    out["0,9"] = "h";
    for (let x = 6; x <= 10; x++) out[`1,${x}`] = "h";
    for (let x = 4; x <= 12; x++) out[`2,${x}`] = "o";
  }
  return out;
}

export function CrowSprite({
  size = 72,
  className,
  season = "ninguna",
}: {
  size?: number;
  className?: string;
  season?: string;
}) {
  const overrides = crowSeasonOverrides(season);
  const rects: Array<{ x: number; y: number; fill: string }> = [];
  CROW_GRID.forEach((rowStr, y) => {
    rowStr
      .padEnd(18, ".")
      .slice(0, 18)
      .split("")
      .forEach((rawCh, x) => {
        const ch = overrides[`${y},${x}`] ?? rawCh;
        const fill = CROW_COLORS[ch];
        if (fill) rects.push({ x, y, fill });
      });
  });
  return (
    <svg
      viewBox="0 0 18 18"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="Corvo, el Cuervo de RRHH"
      style={{ imageRendering: "pixelated", display: "block" }}
    >
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={1.02} height={1.02} fill={r.fill} />
      ))}
    </svg>
  );
}

// ---- Seasonal decoration icons (14 x 12) ----
// Small pixel ornaments the race view sprinkles over the track panel
// while a season is active.
const SEASON_ART: Record<string, { art: string[]; colors: Record<string, string> }> = {
  tree: {
    colors: { g: "#2e9e4f", y: "#ffd23e", r: "#ef5350", o: "#ff8c1a", p: "#f783ac", b: "#4fc3e8", t: "#7a4a21" },
    art: [
      ".......y......",
      "......ggg.....",
      ".....ggggg....",
      "....gggrggg...",
      "...gggggggg...",
      "...goggggog...",
      "..gggggggggg..",
      "..ggpggggbg...",
      "......tt......",
      "......tt......",
      "..............",
      "..............",
    ],
  },
  snowflake: {
    colors: { w: "#7ec8e3" },
    art: [
      "......ww......",
      ".w....ww....w.",
      "..w...ww...w..",
      "...w..ww..w...",
      "....w.ww.w....",
      ".....wwww.....",
      ".wwwwwwwwwwww.",
      ".....wwww.....",
      "....w.ww.w....",
      "...w..ww..w...",
      "..w...ww...w..",
      ".w....ww....w.",
    ],
  },
  pumpkin: {
    colors: { o: "#f07f13", k: "#232733", t: "#2e7d32" },
    art: [
      "......tt......",
      "...oooooooo...",
      "..oooooooooo..",
      ".oooooooooooo.",
      ".ookkoookkooo.",
      ".oooooooooooo.",
      "..ookkkkkkoo..",
      "..oooooooooo..",
      "...oooooooo...",
      "..............",
      "..............",
      "..............",
    ],
  },
  bat: {
    colors: { k: "#574b7a", w: "#ffffff" },
    art: [
      "..............",
      ".kk........kk.",
      ".kkkk....kkkk.",
      "..kkkkkkkkkk..",
      "...kkwkkwkk...",
      "...kk.kk.kk...",
      "....k..k..k...",
      "..............",
      "..............",
      "..............",
      "..............",
      "..............",
    ],
  },
  flower: {
    colors: { p: "#f783ac", y: "#ffd23e", g: "#2e9e4f" },
    art: [
      "....pp..pp....",
      "....pppppp....",
      ".....pyyp.....",
      "....pppppp....",
      "....pp..pp....",
      ".......g......",
      "...g...g......",
      "....gg.g......",
      ".......g......",
      ".......g......",
      "..............",
      "..............",
    ],
  },
  sun: {
    colors: { y: "#f5b81e", o: "#e8890c" },
    art: [
      "......yy......",
      "..y...yy...y..",
      "...y.yyyy.y...",
      "....yyyyyy....",
      ".yy.yyyyyy.yy.",
      "....yyyyyy....",
      "...y.yyyy.y...",
      "..y...yy...y..",
      "......yy......",
      "..............",
      "..............",
      "..............",
    ],
  },
  umbrella: {
    colors: { r: "#ef5350", w: "#ffffff", t: "#7a4a21" },
    art: [
      "....rrrrrr....",
      "..rrrrrrrrrr..",
      ".rrrwrrrrwrrr.",
      ".rrrrrrrrrrrr.",
      "......tt......",
      "......tt......",
      ".....tt.......",
      "....ttt.......",
      "..............",
      "..............",
      "..............",
      "..............",
    ],
  },
};

// Which ornaments each season sprinkles over the track.
export const SEASON_DECOR: Record<string, string[]> = {
  navidad: ["tree", "snowflake", "tree", "snowflake"],
  halloween: ["pumpkin", "bat", "pumpkin", "bat"],
  primavera: ["flower", "flower", "flower", "flower"],
  verano: ["sun", "umbrella", "sun", "umbrella"],
};

export function SeasonIcon({
  name,
  size = 36,
}: {
  name: string;
  size?: number;
}) {
  const entry = SEASON_ART[name] ?? SEASON_ART["flower"]!;
  const rects: Array<{ x: number; y: number; fill: string }> = [];
  entry.art.forEach((row, y) => {
    row
      .padEnd(14, ".")
      .slice(0, 14)
      .split("")
      .forEach((ch, x) => {
        const fill = entry.colors[ch];
        if (fill) rects.push({ x, y, fill });
      });
  });
  return (
    <svg
      viewBox="0 0 14 12"
      width={size}
      height={Math.round(size * (12 / 14))}
      role="img"
      aria-label="Decoración de temporada"
      style={{ imageRendering: "pixelated", display: "block" }}
    >
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={1.02} height={1.02} fill={r.fill} />
      ))}
    </svg>
  );
}

// ---- Prize pixel icons (14 x 12) ----

const ICON_ART: Record<string, string[]> = {
  tv: [
    ".k..........k.",
    "..k........k..",
    "...kkkkkkkk...",
    "..kkkkkkkkkk..",
    "..kbbbbbbbbk..",
    "..kbwwwwbbbk..",
    "..kbbbbbbbbk..",
    "..kkkkkkkkkk..",
    ".....kkkk.....",
    "....kkkkkk....",
    "..............",
    "..............",
  ],
  speaker: [
    ".kkkkkkkkkkkk.",
    ".kggggggggggk.",
    ".kggkkkkkkggk.",
    ".kgkwwwwkkggk.",
    ".kggkkkkkkggk.",
    ".kgkkkkkkkkgk.",
    ".kgkwwwwwwkgk.",
    ".kgkwwwwwwkgk.",
    ".kgkkkkkkkkgk.",
    ".kggggggggggk.",
    ".kkkkkkkkkkkk.",
    "..............",
  ],
  headphones: [
    "....kkkkkk....",
    "..kk......kk..",
    ".k..........k.",
    ".k..........k.",
    "krr........krr",
    "krr........krr",
    "krr........krr",
    "krr........krr",
    ".k..........k.",
    "..kk......kk..",
    "..............",
    "..............",
  ],
  game: [
    "..............",
    "..kkkkkkkkkk..",
    ".kggggggggggk.",
    "kggkk....rrgk.",
    "kgkkkk...ryygk",
    "kggkk....rrgk.",
    ".kggggggggggk.",
    "..kkkkkkkkkk..",
    "..............",
    "..............",
    "..............",
    "..............",
  ],
  console: [
    "...kkkkkkk....",
    "..kgggggggk...",
    "..kgggggggk...",
    "..kgg...ggk...",
    "..kgg.n.ggk...",
    "..kgg...ggk...",
    "..kgggggggk...",
    "..kggkkkggk...",
    "..kgggggggk...",
    "...kkkkkkk....",
    "..............",
    "..............",
  ],
  gift: [
    "....y..y......",
    "...yy..yy.....",
    "....yyyy......",
    "..kkkkkkkkkk..",
    "..krrryyrrrk..",
    "..krrryyrrrk..",
    "..krrryyrrrk..",
    "..krrryyrrrk..",
    "..kkkkkkkkkk..",
    "..............",
    "..............",
    "..............",
  ],
  // ---- Loot de Social (vista Social, migración 0006) ----
  pocion: [
    ".....yy.......",
    ".....kk.......",
    "....kppk......",
    "...kppppk.....",
    "...kppppk.....",
    "..kppppppk....",
    "..kppppppk....",
    "..kppwwpppk...",
    "..kppppppk....",
    "..kppppppk....",
    "...kkkkkk.....",
    "..............",
  ],
  moneda: [
    "....yyyyyy....",
    "..yyyyyyyyyy..",
    "..yywwwwwwyy..",
    "..ywyyyyyywy..",
    "..ywyywwyywy..",
    "..ywyyyyyywy..",
    "..ywyywwyywy..",
    "..ywyyyyyywy..",
    "..yywwwwwwyy..",
    "..yyyyyyyyyy..",
    "....yyyyyy....",
    "..............",
  ],
  corona: [
    "..............",
    ".y..........y.",
    ".yy........yy.",
    ".yyy......yyy.",
    ".yyyyyyyyyyyy.",
    ".yyyyryyyyyyy.",
    ".yyyyyyyyyyyy.",
    "..yyyyyyyyyy..",
    "..yyyyyyyyyy..",
    "..yyyyyyyyyy..",
    "...yyyyyyyy...",
    "..............",
  ],
  cafe: [
    "...ww.........",
    "..ww..........",
    "...ww.........",
    "..............",
    "..kkkkkkkk....",
    "..kooooook....",
    "..kooooookk...",
    "..kooooookk...",
    "..kooooook....",
    "..kooooook....",
    "...kkkkkk.....",
    "..............",
  ],
  escudo: [
    "..kkkkkkkkkk..",
    ".kbbbbbbbbbbk.",
    ".kbbbbbbbbbbk.",
    ".kbbwwwwwwbbk.",
    ".kbbwwwwwwbbk.",
    ".kbbbbbbbbbbk.",
    ".kbbbbbbbbbbk.",
    "..kbbbbbbbbk..",
    "...kbbbbbbk...",
    "....kbbbbk....",
    ".....kbbk.....",
    "......kk......",
  ],
  espresso: [
    "..............",
    "....ww........",
    "...ww.........",
    "....ww........",
    "..............",
    "...kkkkkkk....",
    "...koooook....",
    "...kowooook...",
    "...koooook....",
    "....kkkkk.....",
    "..............",
    "..............",
  ],
};

const ICON_COLORS: Record<string, string> = {
  k: "#232733",
  g: "#9aa5b1",
  b: "#57b7e8",
  w: "#ffffff",
  r: "#ef5350",
  y: "#ffd23e",
  n: "#3ecf6e",
  o: "#b45309",
  p: "#c084fc",
};

export const PRIZE_ICONS = [
  { key: "tv", label: "TV" },
  { key: "speaker", label: "Bocina" },
  { key: "headphones", label: "Audífonos" },
  { key: "game", label: "Videojuego" },
  { key: "console", label: "Consola" },
  { key: "gift", label: "Regalo" },
] as const;

export function PrizeIcon({
  icon,
  size = 40,
  label,
}: {
  icon: string;
  size?: number;
  label?: string;
}) {
  const art = ICON_ART[icon] ?? ICON_ART["gift"]!;
  const rects: Array<{ x: number; y: number; fill: string }> = [];
  art.forEach((row, y) => {
    row
      .padEnd(14, ".")
      .slice(0, 14)
      .split("")
      .forEach((ch, x) => {
        const fill = ICON_COLORS[ch];
        if (fill) rects.push({ x, y, fill });
      });
  });
  return (
    <svg
      viewBox="0 0 14 12"
      width={size}
      height={Math.round(size * (12 / 14))}
      role="img"
      aria-label={label ?? "Ícono del premio"}
      style={{ imageRendering: "pixelated", display: "block" }}
    >
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={1.02} height={1.02} fill={r.fill} />
      ))}
    </svg>
  );
}

export function FlagIcon({ size = 22 }: { size?: number }) {
  const squares: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 5; x++) {
      if ((x + y) % 2 === 0) squares.push({ x, y });
    }
  }
  return (
    <svg
      viewBox="0 0 7 8"
      width={size}
      height={Math.round(size * (8 / 7))}
      role="img"
      aria-label="Meta"
      style={{ imageRendering: "pixelated", display: "block" }}
    >
      <rect x={0} y={0} width={1} height={8} fill="#232733" />
      <rect x={1} y={0} width={5} height={4} fill="#ffffff" />
      {squares.map((s, i) => (
        <rect key={i} x={1 + s.x} y={s.y} width={1} height={1} fill="#232733" />
      ))}
    </svg>
  );
}

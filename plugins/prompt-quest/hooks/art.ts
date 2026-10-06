import type { Rank } from '../types'

// Pixel art drawn into a Raster with half blocks: one cell = two vertical pixels.

type Px = number // 0x00RRGGBB, or -1 for transparent
const NONE = -1
const DEFAULT = 0x01000000

export class Canvas {
  readonly w: number
  readonly h: number
  px: Px[]
  constructor(w: number, h: number) {
    this.w = w
    this.h = h
    this.px = new Array(w * h).fill(NONE)
  }
  set(x: number, y: number, c: Px) {
    if (c === NONE || x < 0 || y < 0 || x >= this.w || y >= this.h) return
    this.px[y * this.w + x] = c
  }
  get(x: number, y: number) {
    return this.px[y * this.w + x] ?? NONE
  }
  sprite(rows: string[], ox: number, oy: number, pal: Record<string, Px>) {
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const c = pal[row[x]!]
        if (c !== undefined) this.set(ox + x, oy + y, c)
      }
    })
  }
  // Encode as RasterProps.cells: [codePoint, fg, bg] u32 LE per cell, base64.
  cells(): { columns: number; rows: number; cells: string } {
    const rows = Math.ceil(this.h / 2)
    const bytes = new Uint8Array(this.w * rows * 12)
    const view = new DataView(bytes.buffer)
    let o = 0
    for (let cy = 0; cy < rows; cy++) {
      for (let x = 0; x < this.w; x++) {
        const top = this.get(x, cy * 2)
        const bot = cy * 2 + 1 < this.h ? this.get(x, cy * 2 + 1) : NONE
        let cp = 0x20, fg = DEFAULT, bg = DEFAULT
        if (top !== NONE && bot !== NONE) { cp = 0x2580; fg = top; bg = bot }
        else if (top !== NONE) { cp = 0x2580; fg = top }
        else if (bot !== NONE) { cp = 0x2584; fg = bot }
        view.setUint32(o, cp, true)
        view.setUint32(o + 4, fg, true)
        view.setUint32(o + 8, bg, true)
        o += 12
      }
    }
    return { columns: this.w, rows, cells: base64(bytes) }
  }
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
function base64(b: Uint8Array) {
  let s = ''
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i]! << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0)
    s += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!
    s += i + 1 < b.length ? B64[(n >> 6) & 63]! : '='
    s += i + 2 < b.length ? B64[n & 63]! : '='
  }
  return s
}

const mix = (a: Px, b: Px, t: number): Px => {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t)
  return (ch(16) << 16) | (ch(8) << 8) | ch(0)
}
const grey = (c: Px): Px => {
  const l = Math.round((((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + (c & 255) * 0.11) * 0.8)
  return (l << 16) | (l << 8) | l
}

// ── Hero scene ────────────────────────────────────────────────────────────

export type HeroClass = 'novice' | 'scribe' | 'alchemist' | 'sage'
export type Mood = 'idle' | 'up' | 'down'

const HERO = [
  '....HHHH....',
  '...HHHHHH...',
  '..HHHHHHHH..',
  '..HSSSSSSH..',
  '..HSESSESH..',
  '...SSSSSS...',
  '...SSppSS...',
  '....SSSS....',
  '..RRRRRRRR..',
  '.RRRRTTRRRR.',
  'SRRRRTTRRRRS',
  'SRRRBBBBRRRS',
  '.RRRRTTRRRR.',
  '.rRRRTTRRRr.',
  '.rrRRRRRRrr.',
  '..rrrrrrrr..',
  '..KK....KK..',
  '..KK....KK..',
]

const HAT = [
  '.....Y......',
  '.....PP.....',
  '....PPPP....',
  '...PPPPPP...',
  '.PPPPPPPPPP.',
]

const ROBES: Record<HeroClass, { R: Px; r: Px; T: Px; H: Px }> = {
  novice: { R: 0x9c7a54, r: 0x6b5235, T: 0xd9c49a, H: 0x4a3220 },
  scribe: { R: 0x3b82f6, r: 0x1e4fa3, T: 0xffd166, H: 0x2b1d14 },
  alchemist: { R: 0xe8792b, r: 0x9a4a12, T: 0x2dd4bf, H: 0x7a1f1f },
  sage: { R: 0x8b5cf6, r: 0x5b30b0, T: 0xfde047, H: 0xe5e5e5 },
}

function item(cv: Canvas, cls: HeroClass, x: number, y: number, f: number) {
  if (cls === 'scribe') {
    cv.sprite(['...W', '..WW', '.WWg', '.Wg.', 'Wg..', 'g...'], x, y - 3 + (f % 8 < 4 ? 0 : -1),
      { W: 0xffffff, g: 0xffd166 })
  } else if (cls === 'alchemist') {
    const liquid = [0x22d3ee, 0x34d399, 0xf472b6, 0xa78bfa][Math.floor(f / 3) % 4]!
    cv.sprite(['.kk..', '..g..', '.gLg.', 'gLLLg', 'gLLLg', '.ggg.'], x, y, { k: 0x8b5a2b, g: 0xcfe8ff, L: liquid })
    const by = y - 1 - (f % 5)
    cv.set(x + 2 + (f % 2), by, mix(liquid, 0xffffff, 0.5))
  } else if (cls === 'sage') {
    for (let i = 0; i < 14; i++) cv.set(x + 1, y - 4 + i, 0x8b5a2b)
    const glow = mix(0x7c3aed, 0x67e8f9, (Math.sin(f / 2) + 1) / 2)
    cv.sprite(['.O.', 'OOO', '.O.'], x, y - 7, { O: glow })
    if (f % 6 < 3) cv.set(x + 3, y - 8, 0xffffff)
  } else {
    cv.sprite(['.s', '.s', '.s', '.s', 'hhh', '.w'], x, y, { s: 0xd1d5db, h: 0x8b5a2b, w: 0x6b4423 })
  }
}

// Seeded star positions so stars stay put between frames.
const STARS = Array.from({ length: 14 }, (_, i) => ({
  x: (i * 37 + 11) % 34, y: (i * 17 + 3) % 12, p: i % 5,
}))
const FLOWERS = [3, 9, 15, 24, 30]

export function heroScene(cls: HeroClass, mood: Mood, f: number): Canvas {
  const W = 34, H = 30
  const cv = new Canvas(W, H)
  const ground = H - 5
  // sky gradient
  const top = mood === 'down' ? 0x1f2430 : 0x1b1340
  const bot = mood === 'down' ? 0x4b5563 : mood === 'up' ? 0xf59e0b : 0x3b5bdb
  for (let y = 0; y < ground; y++) {
    const c = mix(top, bot, y / ground)
    for (let x = 0; x < W; x++) cv.set(x, y, c)
  }
  // stars or moon
  if (mood !== 'down') {
    for (const s of STARS) if ((f + s.p) % 6 !== 0) cv.set(s.x, s.y, (f + s.p) % 6 === 1 ? 0xffffff : 0xc7d2fe)
    cv.sprite(['.MM.', 'MMMM', 'MMMM', '.MM.'], W - 7, 2, { M: 0xfef3c7 })
  }
  // grass
  for (let y = ground; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const base = y === ground ? 0x4ade80 : mix(0x16a34a, 0x14532d, (y - ground) / 5)
      cv.set(x, y, mood === 'down' ? grey(base) : base)
    }
  }
  for (const fx of FLOWERS) {
    const sway = (f + fx) % 8 < 4 ? 0 : 1
    cv.set(fx + sway, ground - 1, [0xf472b6, 0xfde047, 0x60a5fa][fx % 3]!)
    cv.set(fx, ground, 0x166534)
  }

  // hero
  const jump = mood === 'up' ? [0, -2, -3, -2, 0, 0][f % 6]! : 0
  const bob = mood === 'idle' && f % 8 >= 4 ? 1 : 0
  const hx = 9, hy = ground - 18 + jump + bob
  const robe = ROBES[cls]
  const blink = f % 20 === 0
  const pal: Record<string, Px> = {
    H: robe.H, S: 0xf1c27d, E: blink ? 0xf1c27d : 0x1f2937, p: mood === 'down' ? 0x7f1d1d : 0xe11d48,
    R: robe.R, r: robe.r, T: robe.T, B: 0x3f2a14, K: 0x292524,
  }
  if (mood === 'down') for (const k of ['R', 'r', 'T', 'H']) pal[k] = grey(pal[k]!)
  // soft shadow
  for (let x = hx + 1; x < hx + 11; x++) cv.set(x, ground, 0x15803d)
  cv.sprite(HERO, hx, hy, pal)
  if (cls === 'sage') cv.sprite(HAT, hx, hy - 4, { P: pal.R!, Y: 0xfde047 })
  item(cv, cls, hx + 12, hy + 7, f)

  if (mood === 'up') {
    // golden sparkles orbiting the hero
    for (let i = 0; i < 6; i++) {
      const a = f / 3 + (i * Math.PI) / 3
      const x = Math.round(hx + 6 + Math.cos(a) * 9)
      const y = Math.round(hy + 8 + Math.sin(a) * 9)
      cv.set(x, y, i % 2 ? 0xfde047 : 0xffffff)
    }
  } else if (mood === 'down') {
    // rain cloud and drops
    cv.sprite(['..CCCC..', '.CCCCCCC', 'CCCCCCCC'], hx + 2, Math.max(0, hy - 7), { C: 0x6b7280 })
    for (let i = 0; i < 4; i++) {
      const y = Math.max(0, hy - 4) + ((f + i * 3) % 8)
      cv.set(hx + 3 + i * 2, y, 0x60a5fa)
    }
  }
  return cv
}

// ── Rank badges ───────────────────────────────────────────────────────────

const FONT: Record<Rank, string[]> = {
  S: ['###', '#..', '###', '..#', '###'],
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  B: ['##.', '#.#', '##.', '#.#', '##.'],
  C: ['###', '#..', '#..', '#..', '###'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  F: ['###', '#..', '##.', '#..', '#..'],
}

export const RANK_PX: Record<Rank, Px> = {
  S: 0xffd700, A: 0x4ade80, B: 0x60a5fa, C: 0xa3a3a3, D: 0xfb923c, F: 0xef4444,
}

export function rankBadge(rank: Rank, f: number): Canvas {
  const W = 11, H = 16
  const cv = new Canvas(W, H)
  const fill = RANK_PX[rank]
  const edge = mix(fill, 0x000000, 0.45)
  const top = 3
  // crown for S, star for A
  if (rank === 'S') cv.sprite(['Y.Y.Y.Y.Y', 'YYYYYYYYY', '.YYRYYRY.'], 1, 0, { Y: 0xffd700, R: 0xef4444 })
  if (rank === 'A') cv.sprite(['..W..', '.WWW.', '..W..'], 3, 0, { W: f % 4 < 2 ? 0xffffff : 0xbbf7d0 })
  // shield
  for (let y = 0; y < 12; y++) {
    const inset = y < 8 ? 0 : y - 7
    for (let x = inset; x < W - inset; x++) {
      const border = x === inset || x === W - 1 - inset || y === 0 || y === 11 || (y >= 8 && (x === inset + 1 || x === W - 2 - inset) && false)
      cv.set(x, top + y, border ? edge : fill)
    }
  }
  // shine sweep: a diagonal band crossing every ~16 frames
  const s = (f % 16) - 3
  for (let y = 0; y < 12; y++) {
    for (const d of [0, 1]) {
      const x = s + d - Math.floor(y / 2)
      const cur = cv.get(x, top + y)
      if (cur === fill) cv.set(x, top + y, mix(fill, 0xffffff, 0.55))
    }
  }
  // letter
  const ink = rank === 'S' || rank === 'C' ? 0x3b2f00 : 0xffffff
  cv.sprite(FONT[rank], 4, top + 3, { '#': rank === 'C' ? 0x262626 : ink })
  // crack for F
  if (rank === 'F') cv.sprite(['..k', '.k.', 'k..', '.k.', '..k'], 1, top + 4, { k: 0x450a0a })
  if (rank === 'D') cv.set(8, top + 9, 0x7c2d12)
  return cv
}

// Static text fallback for surfaces without Raster.
export const RANK_GLYPH: Record<Rank, string> = { S: '👑', A: '⭐', B: '💎', C: '⚪', D: '🔻', F: '💀' }

// ── Glossy gradient bar (XP, quests) ──────────────────────────────────────

export function barCells(frac: number, width: number, from: Px, to: Px, f = 0) {
  const cv = new Canvas(width, 2)
  const filled = Math.round(Math.max(0, Math.min(1, frac)) * width)
  const glint = filled > 2 ? f % (filled + 8) : -1
  for (let x = 0; x < width; x++) {
    if (x < filled) {
      let c = mix(from, to, width > 1 ? x / (width - 1) : 0)
      if (x === glint) c = mix(c, 0xffffff, 0.6)
      cv.set(x, 0, mix(c, 0xffffff, 0.3))
      cv.set(x, 1, c)
    } else {
      cv.set(x, 0, 0x3a3a52)
      cv.set(x, 1, 0x2a2a3c)
    }
  }
  return cv.cells()
}

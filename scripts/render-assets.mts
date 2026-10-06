// Renders README art straight from the plugin's own pixel-art code.
// Usage: node --experimental-strip-types scripts/render-assets.mts <outDir>
// Writes PPM frames; scripts/render-assets.sh turns them into PNG/GIF.
import { mkdirSync, writeFileSync } from 'node:fs'
import { heroScene, rankBadge } from '../plugins/prompt-quest/hooks/art.ts'

const out = process.argv[2] ?? 'build'
mkdirSync(out, { recursive: true })
const BG = 0x1e1e2e

type Cv = { w: number; h: number; get(x: number, y: number): number }

function ppm(name: string, layers: { cv: Cv; x: number; y: number }[], w: number, h: number) {
  const px = new Uint8Array(w * h * 3)
  for (let i = 0; i < w * h; i++) { px[i * 3] = BG >> 16; px[i * 3 + 1] = (BG >> 8) & 255; px[i * 3 + 2] = BG & 255 }
  for (const { cv, x: ox, y: oy } of layers) {
    for (let y = 0; y < cv.h; y++) for (let x = 0; x < cv.w; x++) {
      const c = cv.get(x, y)
      if (c < 0) continue
      const i = ((oy + y) * w + ox + x) * 3
      px[i] = c >> 16; px[i + 1] = (c >> 8) & 255; px[i + 2] = c & 255
    }
  }
  writeFileSync(`${out}/${name}.ppm`, Buffer.concat([Buffer.from(`P6\n${w} ${h}\n255\n`), px]))
}

// Hero: idle → level up → level down, sage
let n = 0
for (const [mood, frames] of [['idle', 16], ['up', 12], ['down', 12], ['idle', 8]] as const) {
  for (let f = 0; f < frames; f++) {
    const cv = heroScene('sage', mood, n)
    ppm(`hero-${String(n).padStart(3, '0')}`, [{ cv, x: 0, y: 0 }], cv.w, cv.h)
    n++
  }
}

// Class lineup (static)
const classes = ['novice', 'scribe', 'alchemist', 'sage'] as const
for (let f = 0; f < 8; f++) {
  ppm(`classes-${f}`, classes.map((c, i) => ({ cv: heroScene(c, 'idle', f * 2 + 1), x: i * 36, y: 0 })), 36 * 4 - 2, 30)
}

// Rank badges with shine
const ranks = ['S', 'A', 'B', 'C', 'D', 'F'] as const
for (let f = 0; f < 16; f++) {
  ppm(`ranks-${String(f).padStart(2, '0')}`, ranks.map((r, i) => ({ cv: rankBadge(r, f), x: 2 + i * 14, y: 1 })), 6 * 14 + 2, 18)
}

// Stills for the terminal mockups (scripts/mockups/*.html)
{
  const hero = heroScene('alchemist', 'idle', 3)
  ppm('still-hero', [{ cv: hero, x: 0, y: 0 }], hero.w, hero.h)
  for (const r of ['S', 'D'] as const) {
    const b = rankBadge(r, 4)
    ppm(`still-badge-${r}`, [{ cv: b, x: 0, y: 0 }], b.w, b.h)
  }
  // bars as pixel canvases (2 px per terminal row)
  for (const [name, frac, w] of [['xp', 212 / 250, 20], ['xp-pane', 212 / 250, 24], ['weak', 30 / 100, 20], ['q1', 2 / 3, 12], ['q2', 1, 12], ['q3', 0, 12]] as const) {
    const done = name === 'q2'
    const from = name.startsWith('q') ? (done ? 0x22c55e : 0x38bdf8) : 0x8b5cf6
    const to = name.startsWith('q') ? (done ? 0x86efac : 0xa78bfa) : 0xf472b6
    const filled = Math.round(frac * w)
    const cv = { w, h: 2, get: (x: number, y: number) => {
      if (x >= filled) return y === 0 ? 0x3a3a52 : 0x2a2a3c
      const t = w > 1 ? x / (w - 1) : 0
      const mixc = (a: number, b: number, k: number) => {
        const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k)
        return (ch(16) << 16) | (ch(8) << 8) | ch(0)
      }
      const c = mixc(from, to, t)
      return y === 0 ? mixc(c, 0xffffff, 0.3) : c
    } }
    ppm(`still-bar-${name}`, [{ cv, x: 0, y: 0 }], w, 2)
  }
}

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Card, Grade, Save, Session, Tab } from '../types'
import { barCells, heroScene, HIT_FRAMES, rankBadge, RANK_GLYPH, scoreMeterCells } from './art'
import type { HeroClass, Mood } from './art'
import {
  BRANCHES, LORE, PROMPT_TIPS, QUEST_XP, SKILLS,
  bashFiles, checkOf, concretize, emptyTrace, grade, isSearch, LADDER, promptHash, RANK_XP, levelOf, questsFor, RANK_COLOR, relPath, skill, titleOf, turnTips,
} from './data'

const PANE = 'prompt-quest'
const FRAME_MS = 200
const MOOD_MS = 9000
const CACHE_TTL_MS = 5 * 60 * 1000

const FRESH: Save = {
  xp: 0, unlocked: [], perksOff: [],
  stats: { prompts: 0, turns: 0, inTok: 0, outTok: 0, cacheRead: 0, cacheWrite: 0, ranks: {} },
  day: '', quests: {}, questsDone: [], streak: 0, lastDay: '',
  loreSeen: [], quizRight: 0, quizTotal: 0, custom: [],
  budget: 50000, showBand: true, log: [],
}
const NEW_SESSION: Session = { outTok: 0, alerts: [], lastTurnAt: 0, last: null, mood: 'idle', moodAt: 0 }

const saveA = atom({ plugin: 'prompt-quest', key: 'save' } as const, FRESH)
const sessionA = atom({ plugin: 'prompt-quest', key: 'session' } as const, NEW_SESSION)
const tabA = atom({ plugin: 'prompt-quest', key: 'tab' } as const, 'hero')
const cardA = atom({ plugin: 'prompt-quest', key: 'card' } as const, 0)
const quizA = atom({ plugin: 'prompt-quest', key: 'quiz' } as const, null)

// ── derived helpers ───────────────────────────────────────────────────────

/** Skills stay active only while your level covers them; newest go dormant first. */
const activeSkills = (s: Save) => s.unlocked.slice(0, levelOf(s.xp).level)
const isActive = (s: Save, id: string) => activeSkills(s).includes(id)
const points = (s: Save) => Math.max(0, levelOf(s.xp).level - s.unlocked.length)

function heroClass(s: Save): HeroClass {
  const act = activeSkills(s)
  let best: HeroClass = 'novice'
  let n = 0
  for (const b of BRANCHES) {
    const c = act.filter(id => skill(id)?.branch === b.id).length
    if (c > n) { n = c; best = b.id }
  }
  return best
}

const MISSING_LABEL: Record<string, string> = { file: 'which file', why: 'why', 'done-check': 'what done means' }
const CLASS_ICON: Record<HeroClass, string> = { novice: '🧭', scribe: '🪶', alchemist: '🧪', sage: '🔮' }
const className = (c: HeroClass) => (c === 'novice' ? 'Wanderer' : BRANCHES.find(b => b.id === c)!.name)

function dayOf(ms: number) {
  const d = new Date(ms)
  return new Date(ms - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `${n}`)
const textBar = (into: number, need: number, width = 10) => {
  const full = Math.max(0, Math.min(width, Math.round((into / need) * width)))
  return '#'.repeat(full) + '-'.repeat(width - full)
}

function deck(s: Save): Card[] {
  return [
    ...LORE.filter(c => c.deck === 'foundations'),
    ...LORE.filter(c => c.deck === 'internals'),
    ...(isActive(s, 'archives') ? LORE.filter(c => c.deck === 'archives') : []),
    ...s.custom,
  ]
}

const pushLog = (s: Save, line: string): Save => ({ ...s, log: [...s.log, line].slice(-8) })

// ── animation state (module-local; a reload just restarts it) ────────────

let frame = 0
let paneLive = false
let look: { cls: HeroClass; mood: Mood; moodAt: number; rank: Grade['rank'] | null; bar: number | null; dmg: number } = {
  cls: 'novice', mood: 'idle', moodAt: 0, rank: null, bar: null, dmg: 0,
}
let bandRequest: string | null = null

/** The mood to draw now, and for a hit how many frames into it we are. */
function moodNow(now: number): { mood: Mood; t: number } {
  const age = now - look.moodAt
  if (look.mood === 'idle' || age >= MOOD_MS) return { mood: 'idle', t: 0 }
  if (look.mood !== 'hit') return { mood: look.mood, t: 0 }
  const t = Math.floor(age / FRAME_MS)
  return t < HIT_FRAMES ? { mood: 'hit', t } : { mood: 'down', t }
}

/** Share of the XP bar to flash red while a hit drains it. */
function lostShare(xp: number, t: number) {
  if (look.dmg >= 0 || t >= HIT_FRAMES) return 0
  const lv = levelOf(xp)
  const drain = t < 8 ? 1 : 1 - (t - 8) / (HIT_FRAMES - 8)
  return Math.min(-look.dmg / lv.need, 1 - lv.into / lv.need) * drain
}

// ── writes ────────────────────────────────────────────────────────────────

type $T = EngineInterface

async function commit($: $T, fn: (s: Save) => Save) {
  const s = await update($, saveA, fn)
  await $.store.set('save', s)
  return s
}

/** Applies XP and quest progress in one write and announces level changes. */
async function award($: $T, delta: number, why: string, questBumps: string[] = []) {
  let before = FRESH
  let doneNow: string[] = []
  const s = await commit($, cur => {
    before = cur
    let next: Save = { ...cur, xp: Math.max(0, cur.xp + delta) }
    if (delta !== 0) next = pushLog(next, `${delta > 0 ? '+' : ''}${delta} XP · ${why}`)
    const today = questsFor(next.day)
    for (const id of questBumps) {
      const q = today.find(x => x.id === id)
      if (!q || next.questsDone.includes(id)) continue
      const n = (next.quests[id] ?? 0) + 1
      next = { ...next, quests: { ...next.quests, [id]: n } }
      if (n >= q.goal) {
        next = pushLog({ ...next, xp: next.xp + QUEST_XP, questsDone: [...next.questsDone, id] }, `Quest done: ${q.name} +${QUEST_XP}`)
        doneNow = [...doneNow, q.name]
      }
    }
    return next
  })
  for (const name of doneNow) $.ui.toast(`📜 Quest complete: ${name}  +${QUEST_XP} XP`)
  const a = levelOf(before.xp).level
  const b = levelOf(s.xp).level
  const now = await $.clock.now()
  if (b > a) {
    $.ui.toast(`✨ LEVEL UP! You are now level ${b} (${titleOf(b)}). +1 skill point. /quest skills`)
    await setMood($, 'up', now)
  } else if (b < a) {
    const dormant = s.unlocked.slice(b)
    $.ui.toast(`💀 Level down… level ${b}.${dormant.length ? ` Dormant: ${dormant.map(id => skill(id)?.name).join(', ')}` : ''}`)
    await setMood($, 'hit', now, Math.min(-1, delta))
  } else if (delta >= 20) await setMood($, 'up', now)
  else if (delta < 0) {
    $.ui.toast(`💥 Ouch! ${delta} XP`)
    await setMood($, 'hit', now, delta)
  }
  return s
}

async function setMood($: $T, mood: Mood, now: number, dmg = 0) {
  look = { ...look, mood, moodAt: now, dmg }
  await update($, sessionA, ss => ({ ...ss, mood, moodAt: now, dmg }))
}

// ── module ────────────────────────────────────────────────────────────────

export const register: Register = on => {
  let pending: Grade | null = null
  let pendingText = ''
  let tools = 0
  let trace = emptyTrace()
  // Model and context size of the last main turn: for cache-break and /clear rules.
  let lastModel: string | null = null
  let lastContext = 0
  // Files the last turn touched, so a follow-up naming one counts as building on it.
  let lastFiles: string[] = []

  on('session.start', async ($, e, next) => {
    const stored = (await $.store.get('save')) as Partial<Save> | undefined
    if (stored) await update($, saveA, () => ({ ...FRESH, ...stored, stats: { ...FRESH.stats, ...stored.stats } }))
    await $.command.register({
      name: 'quest',
      description: 'Prompt Quest: hero, skills, quests, lore · /quest [skills|quests|lore|close|band|budget <n>|oracle <topic>|rules|feedback [--prompt] <why>|idea <text>]',
    })
    $.clock.every(FRAME_MS, () => {
      frame += 1
      void (async () => {
        const now = await $.clock.now()
        const { mood, t } = moodNow(now)
        // The band's XP bar flashes and drains the lost XP, pane open or not.
        const sinceHit = look.mood === 'hit' ? Math.floor((now - look.moodAt) / FRAME_MS) : -1
        if (bandRequest && sinceHit >= 0 && sinceHit <= HIT_FRAMES + 2) {
          const s = await read($, saveA)
          const lv = levelOf(s.xp)
          await $.ui.blit({ requestId: bandRequest!, key: 'xpbar', ...barCells(lv.into / lv.need, 20, 0x8b5cf6, 0xf472b6, frame, lostShare(s.xp, sinceHit)) })
        }
        if (!paneLive) return
        if ((await read($, tabA)) !== 'hero') return
        const r = await $.ui.blit({ requestId: PANE, key: 'hero', ...heroScene(look.cls, mood, frame, { t, dmg: look.dmg }).cells() })
        if ('deny' in r && r.deny) { paneLive = false; return }
        if (look.rank) await $.ui.blit({ requestId: PANE, key: 'badge', ...rankBadge(look.rank, frame).cells() })
        if (look.bar !== null) await $.ui.blit({ requestId: PANE, key: 'xpbar', ...barCells(look.bar, 24, 0x8b5cf6, 0xf472b6, frame) })
      })()
    })
    return next(e)
  })

  // Grade each prompt you type (no model call; pure heuristics).
  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind !== 'composer' || e.text.trim().startsWith('/')) return next(e)
    const now = await $.clock.now()
    const before = await read($, sessionA)
    const recent = before.lastTurnAt > 0 && (await $.clock.now()) - before.lastTurnAt < 30 * 60_000
    let g = grade(e.text, e.attachments?.length ?? 0, { recent, files: lastFiles })
    // Repeating a prompt earns nothing: only a hash is kept, never the text.
    const hash = promptHash(e.text)
    const seen = await read($, saveA)
    if (g.mode !== 'reply' && (seen.recent ?? []).includes(hash)) {
      g = { ...g, xp: 0, reasons: [...g.reasons, 'repeated prompt: no XP'], tip: 'You sent this prompt before, so it earns no XP this time.' }
    }
    pending = g
    pendingText = e.text
    tools = 0
    trace = emptyTrace()
    const today = dayOf(now)
    const s = await commit($, cur => {
      let s2 = cur
      if (s2.day !== today) {
        const yesterday = dayOf(now - 86400000)
        s2 = {
          ...s2, day: today, quests: {}, questsDone: [],
          streak: s2.lastDay === yesterday ? s2.streak + 1 : 1, lastDay: today,
        }
      }
      return {
        ...s2,
        recent: [...(s2.recent ?? []).filter(x => x !== hash), hash].slice(-50),
        stats: { ...s2.stats, prompts: s2.stats.prompts + 1, ranks: { ...s2.stats.ranks, [g.rank]: (s2.stats.ranks[g.rank] ?? 0) + 1 } },
      }
    })
    const ss = await read($, sessionA)
    if (isActive(s, 'cachesight') && ss.lastTurnAt && now - ss.lastTurnAt > CACHE_TTL_MS) {
      const min = Math.round((now - ss.lastTurnAt) / 60000)
      $.ui.toast(`🔮 Cache Sight: ${min} min idle. The prompt cache (5-min default TTL) is likely cold, so this turn re-reads the context at full input price.`)
    }
    return next(e)
  })

  // Remember which files Claude had to find, so tips can name them.
  // /clear after a long conversation is exactly the habit that saves money.
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      const ctx = lastContext
      lastContext = 0
      if (ctx >= 50_000) await award($, 10, `Clean Slate: /clear with ${Math.round(ctx / 1000)}k history`, ['clear'])
      else if (ctx > 0) $.ui.toast('🧹 Cleared. (Clean Slate XP needs 50k+ tokens of history to make a difference.)')
    }
    return next(e)
  })

  on('session.compact', async ($, e, next) => {
    if (e.trigger === 'auto' && !e.agentId) {
      $.ui.toast('📦 Auto-compact: older history was summarized to free space. /clear between unrelated tasks keeps it rarely needed.')
    }
    return next(e)
  })

  on('tool.call', (_$, e, next) => {
    tools += 1
    const name = String(e.tool)
    const input = e as unknown as Record<string, unknown>
    const path = typeof input.file_path === 'string' ? input.file_path
      : typeof input.notebook_path === 'string' ? input.notebook_path : null
    if (name === 'EnterPlanMode' || name === 'ExitPlanMode') trace.planned = true
    if (name === 'Read' && path) trace.reads[path] = (trace.reads[path] ?? 0) + 1
    else if ((name === 'Edit' || name === 'Write' || name === 'MultiEdit' || name === 'NotebookEdit') && path) trace.edits.push(path)
    else if (name === 'Grep' || name === 'Glob') trace.searches += 1
    else if (name === 'Bash' && typeof input.command === 'string') {
      if (isSearch(input.command)) trace.searches += 1
      const f = bashFiles(input.command)
      for (const p of f.paths) {
        if (f.writes) trace.edits.push(p)
        else trace.reads[p] = (trace.reads[p] ?? 0) + 1
      }
      trace.check = checkOf(input.command) ?? trace.check
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId) return result
    const cwd = await $.session.cwd()
    const home = cwd.match(/^\/(home|Users)\/[^/]+/)?.[0] ?? ''
    const g = pending ? concretize(pending, trace, p => relPath(p, cwd, home)) : null
    pending = null
    const u = e.usage
    const now = await $.clock.now()
    // Prompt XP needs a real turn: usage comes from the API, not from anything typed.
    let delta = u ? (g?.xp ?? 0) : 0
    const notes: string[] = g ? [`rank ${g.rank} ${g.xp >= 0 ? '+' : '−'}${Math.abs(g.xp)}`, ...g.reasons] : []
    const bumps: string[] = ['turn']
    if (g && (g.rank === 'S' || g.rank === 'A')) bumps.push('sharp')
    if (g?.reasons.includes('purpose stated')) bumps.push('purpose')
    if (e.reason === 'aborted') { delta -= 5; notes.push('abandoned turn −5') }
    if (trace.planned) { delta += 5; notes.push('plan mode +5') }
    let spendTips: string[] = []
    if (u) {
      const total = u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens
      const ratio = total ? u.cache_read_input_tokens / total : 0
      const modelSwitch = lastModel !== null && u.model !== lastModel && ratio < 0.5 && total > 2000
      // Tip, not a penalty: opusplan switches models on purpose.
      if (modelSwitch) notes.push('cache break: model switched')
      lastModel = u.model
      lastContext = total
      spendTips = turnTips({ out: u.output_tokens, ratio, total, tools, aborted: e.reason === 'aborted', modelSwitch })
      if (ratio >= 0.8 && total > 2000) { delta += 5; notes.push('cache hit +5'); bumps.push('cache') }
      // Output size only matters for text-only turns: code changes are the work, not chatter.
      const textOnly = trace.edits.length === 0
      if (textOnly && u.output_tokens < 600) { delta += 5; notes.push('lean reply +5'); bumps.push('lean') }
      if (textOnly && u.output_tokens > 8000) { delta -= 5; notes.push('heavy output −5') }
    }
    const s = await award($, delta, g ? `Rank ${g.rank} prompt` : 'turn', bumps)
    await commit($, cur => u ? {
      ...cur,
      stats: {
        ...cur.stats, turns: cur.stats.turns + 1,
        inTok: cur.stats.inTok + u.input_tokens, outTok: cur.stats.outTok + u.output_tokens,
        cacheRead: cur.stats.cacheRead + u.cache_read_input_tokens, cacheWrite: cur.stats.cacheWrite + u.cache_creation_input_tokens,
      },
    } : { ...cur, stats: { ...cur.stats, turns: cur.stats.turns + 1 } })
    const ss = await update($, sessionA, cur => ({
      ...cur,
      lastTurnAt: now,
      outTok: cur.outTok + (u?.output_tokens ?? 0),
      last: {
        prompt: g ? pendingText : undefined, grade: g, xp: delta, notes,
        tips: [...(g && g.rank !== 'S' ? g.tips : []), ...spendTips],
        inTok: u?.input_tokens ?? 0, outTok: u?.output_tokens ?? 0,
        cacheRead: u?.cache_read_input_tokens ?? 0, cacheWrite: u?.cache_creation_input_tokens ?? 0,
      },
    }))
    if (g) look = { ...look, rank: g.rank }
    lastFiles = [...new Set([...trace.edits, ...Object.keys(trace.reads)].map(f => f.split('/').pop() ?? f))].slice(0, 20)
    if (g) $.ui.toast(`${RANK_GLYPH[g.rank]} Rank ${g.rank} · ${delta >= 0 ? '+' : ''}${delta} XP${g.xp < 10 ? ` · 💡 ${g.tip}` : ''}`)
    if (isActive(s, 'budget') && s.budget > 0) {
      const pct = (ss.outTok / s.budget) * 100
      const hit = [50, 80, 100].filter(p => pct >= p && !ss.alerts.includes(p))
      if (hit.length) {
        const p = hit[hit.length - 1]!
        $.ui.toast(`🛡 Budget Ward: ${p}% of session output budget (${k(ss.outTok)}/${k(s.budget)})`)
        await update($, sessionA, cur => ({ ...cur, alerts: [...cur.alerts, ...hit] }))
      }
    }
    return result
  })

  // Active perks shape how Claude answers (one cached section; toggling busts the cache once).
  on('prompt.compose', async ($, e, next) => {
    const r = await next(e)
    const s = await read($, saveA)
    const perks = activeSkills(s)
      .filter(id => !s.perksOff.includes(id))
      .map(id => skill(id)?.perk)
      .filter((p): p is string => !!p)
    if (!perks.length) return r
    const text = `# Prompt Quest perks (the user unlocked these output styles)\n${perks.map(p => `- ${p}`).join('\n')}`
    return { sections: [...r.sections, { id: 'prompt-quest:perks', text, scope: 'session' as const }] }
  })

  // ── /quest ──────────────────────────────────────────────────────────────

  on('command.run', { command: 'quest' }, async ($, e) => {
    const [sub = '', ...rest] = e.args.trim().split(/\s+/)
    const arg = rest.join(' ')
    const open = async (tab: Tab) => {
      await update($, tabA, () => tab)
      await $.ui.open({ id: PANE, title: 'Prompt Quest' })
    }
    if (/^(close|hide|off|x)$/.test(sub) || /\b(close|hide)\b/.test(arg)) {
      paneLive = false
      await $.ui.close({ id: PANE })
      return { text: 'Prompt Quest closed. /quest opens it again.' }
    }
    if (sub === 'band') {
      const s = await commit($, cur => ({ ...cur, showBand: !cur.showBand }))
      return { text: `Quest band ${s.showBand ? 'shown' : 'hidden'}.` }
    }
    if (sub === 'budget') {
      const n = Number(arg.replace(/k$/i, '000'))
      if (!Number.isFinite(n) || n <= 0) return { text: 'Usage: /quest budget 50000 (output tokens per session)' }
      await commit($, cur => ({ ...cur, budget: Math.round(n) }))
      return { text: `Session output budget set to ${k(n)} tokens.` }
    }
    if (sub === 'oracle') return oracle($, arg, open)
    if (sub === 'feedback' || sub === 'idea') {
      const withPrompt = /(^|\s)--prompt\b/.test(arg)
      return report($, sub === 'idea' ? 'idea' : 'rank', arg.replace(/(^|\s)--prompt\b/, '').trim(), withPrompt)
    }
    if (sub === 'reset' && arg === 'confirm') {
      await commit($, () => FRESH)
      return { text: 'Your hero was reborn at level 1.' }
    }
    const tab: Tab = sub === 'skills' || sub === 'quests' || sub === 'lore' || sub === 'rules' ? sub
      : sub === 'help' || sub === 'ranking' ? 'rules' : 'hero'
    await open(tab)
    return { text: 'Prompt Quest opened. /quest close hides it.' }
  })

  // ── band above the prompt ───────────────────────────────────────────────

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const s = await read($, saveA)
    if (!s.showBand || e.props.hasSurvey) return next(e)
    const ss = await read($, sessionA)
    const { Box, Text } = $.ui.resolve(e)
    const lv = levelOf(s.xp)
    const cls = heroClass(s)
    const pts = points(s)
    const last = ss.last
    const g = last?.grade
    const purse = isActive(s, 'purse') && last
    const tips = last?.tips ?? []
    const missing = g?.missing ?? []
    const total = last ? last.inTok + last.cacheRead + last.cacheWrite : 0
    const ratio = total && last ? Math.round((last.cacheRead / total) * 100) : 0
    const els = $.ui.resolve(e) as Record<string, any>
    const Raster = e.surface === 'terminal' ? els.Raster : undefined
    if (Raster && e.requestId) bandRequest = e.requestId
    const hitNow = moodNow(await $.clock.now())
    return (
      <Box flexDirection="column">
        <Box gap={1}>
          <Text>{CLASS_ICON[cls]}</Text>
          <Text color="#ffd166" bold>Lv {lv.level}</Text>
          <Text>{titleOf(lv.level)} {className(cls)}</Text>
          {Raster
            ? <Raster key="xpbar" {...barCells(lv.into / lv.need, 20, 0x8b5cf6, 0xf472b6, frame, hitNow.mood === 'hit' ? lostShare(s.xp, hitNow.t) : 0)} />
            : <Text color="#a78bfa">{textBar(lv.into, lv.need)}</Text>}
          <Text dimColor>{lv.into}/{lv.need} XP</Text>
          {pts > 0 && <Text color="#fde047" bold>+{pts} skill point{pts > 1 ? 's' : ''}: /quest skills</Text>}
          {s.streak > 1 && <Text color="#fb923c">🔥 {s.streak}d</Text>}
        </Box>
        {g && last && (
          <Box>
            <Text backgroundColor={RANK_COLOR[g.rank]} color="#111111" bold> {g.rank} </Text>
            <Text color={last.xp >= 0 ? '#5fff87' : '#ff5f5f'} bold> {last.xp >= 0 ? '+' : ''}{last.xp} XP</Text>
            <Text dimColor wrap="truncate-end"> · {last.notes.join(', ')}</Text>
          </Box>
        )}
        {missing.length > 0 && (
          <Box gap={1}>
            <Text color="#ff9f43" bold>🎯 Missing:</Text>
            {missing.map(m => <Text backgroundColor="#3a3a52" color="#ffd166"> {MISSING_LABEL[m] ?? m} </Text>)}
            {tips.length > 1 && <Text dimColor>({tips.length} tips: /quest)</Text>}
          </Box>
        )}
        {g?.upgrade && <Text color="#5fff87" wrap="truncate-end">✏️ Try: {g.upgrade}</Text>}
        {!g?.upgrade && tips.length > 0 && (
          <Text color="#5fb3ff" wrap="truncate-end">💡 {tips[0]}</Text>
        )}
        {purse && last && (
          <Text dimColor wrap="truncate-end">
            🪙 in {k(last.inTok + last.cacheWrite)} · cache {k(last.cacheRead)} ({ratio}%) · out {k(last.outTok)} · session out {k(ss.outTok)}
            {isActive(s, 'budget') ? `/${k(s.budget)}` : ''}
          </Text>
        )}
      </Box>
    )
  })

  // ── the pane ────────────────────────────────────────────────────────────

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const s = await read($, saveA)
    const ss = await read($, sessionA)
    const tab = await read($, tabA)
    const { Box, Text, Button } = $.ui.resolve(e)
    const width = e.props.bodyColumns
    const terminal = e.surface === 'terminal'
    look = { ...look, cls: heroClass(s), mood: ss.mood, moodAt: ss.moodAt, dmg: ss.dmg ?? look.dmg, rank: ss.last?.grade?.rank ?? look.rank, bar: levelOf(s.xp).into / levelOf(s.xp).need }
    paneLive = terminal

    const tabs: [Tab, string][] = [['hero', 'Hero'], ['skills', 'Skills'], ['quests', 'Quests'], ['lore', 'Lore'], ['rules', 'Rules']]
    const header = (
      <Box gap={1}>
        {tabs.map(([id, label], i) => (
          <Button key={`tab-${id}`} label={label} hotkey={String(i + 1)}
            variant={tab === id ? 'primary' : 'secondary'} onPress={() => update($, tabA, () => id)} />
        ))}
        <Button key="close" label="Close" hotkey="x" role="dismiss"
          onPress={async () => { paneLive = false; await $.ui.close({ id: PANE }) }} />
      </Box>
    )

    let body
    if (tab === 'skills') body = await skillsTab($, e, s)
    else if (tab === 'quests') body = questsTab($, e, s)
    else if (tab === 'lore') body = await loreTab($, e, s)
    else if (tab === 'rules') body = rulesTab($, e, ss)
    else body = await heroTab($, e, s, ss, width, terminal)

    return (
      <Box flexDirection="column" gap={1}>
        {header}
        {body}
      </Box>
    )
  })
}

// ── tabs ──────────────────────────────────────────────────────────────────

type RenderE = Parameters<EngineInterface['ui']['resolve']>[0]

async function heroTab($: $T, e: RenderE, s: Save, ss: Session, width: number, terminal: boolean) {
  const { Box, Text, Button } = $.ui.resolve(e)
  const els = $.ui.resolve(e) as Record<string, any>
  const Raster = terminal ? els.Raster : undefined
  const lv = levelOf(s.xp)
  const cls = heroClass(s)
  const now = await $.clock.now()
  const { mood, t: hitT } = moodNow(now)
  const st = s.stats
  const inAll = st.inTok + st.cacheRead + st.cacheWrite
  const hit = inAll ? Math.round((st.cacheRead / inAll) * 100) : 0
  const avgOut = st.turns ? Math.round(st.outTok / st.turns) : 0
  const ranks = (['S', 'A', 'B', 'C', 'D', 'F'] as const)
  const g = ss.last?.grade
  const dormant = s.unlocked.slice(lv.level)
  const tip = PROMPT_TIPS[(st.prompts + Math.floor(now / 600000)) % PROMPT_TIPS.length]!

  const sheet = (
    <Box flexDirection="column">
      <Text bold color="#ffd166">{titleOf(lv.level)} {className(cls)} · Level {lv.level}</Text>
      <Box gap={1}>
        {Raster
          ? <Raster key="xpbar" {...barCells(lv.into / lv.need, 24, 0x8b5cf6, 0xf472b6, frame)} />
          : <Text color="#a78bfa">{textBar(lv.into, lv.need, 16)}</Text>}
        <Text>{lv.into}/{lv.need} XP</Text>
      </Box>
      <Text dimColor>Total {s.xp} XP · {points(s)} skill point(s) unspent · 🔥 {s.streak}-day streak</Text>
      <Text> </Text>
      <Text bold>Stats</Text>
      <Text>Prompts {st.prompts} · Turns {st.turns}</Text>
      <Text>Cache hit {hit}% · Avg output {k(avgOut)} tok</Text>
      <Text>Quiz {s.quizRight}/{s.quizTotal} · Lore {s.loreSeen.filter(x => !x.startsWith('q:')).length}</Text>
      <Box>
        {ranks.map(r => (
          <Text color={RANK_COLOR[r]}>{r}:{st.ranks[r] ?? 0} </Text>
        ))}
      </Box>
      {dormant.length > 0 && <Text color="#ff9f43">💤 Dormant: {dormant.map(id => skill(id)?.name).join(', ')}</Text>}
      {mood === 'up' && <Text color="#fde047" bold>✨ Your hero is triumphant!</Text>}
      {mood === 'hit' && <Text color="#ff5f5f" bold>💥 Ouch! Your hero took a hit ({look.dmg} XP).</Text>}
      {mood === 'down' && <Text color="#93c5fd" bold>🌧 Your hero is downcast… sharpen the next prompt.</Text>}
    </Box>
  )

  const scene = heroScene(cls, mood, frame, { t: hitT, dmg: look.dmg }).cells()
  const art = Raster ? <Raster key="hero" {...scene} /> : null
  const wide = width >= scene.columns + 30

  const badge = g && Raster ? <Raster key="badge" {...rankBadge(g.rank, frame).cells()} /> : null
  const rankCard = g && ss.last ? (
    <Box gap={2}>
      {badge}
      <Box flexDirection="column" flexShrink={1}>
        <Text bold color={RANK_COLOR[g.rank]}>Last prompt: Rank {g.rank}  {ss.last.xp >= 0 ? '+' : ''}{ss.last.xp} XP</Text>
        <Text>{ss.last.notes.join(' · ') || '—'}</Text>
        {(ss.last.tips ?? []).length > 0 && <Text bold color="#5fb3ff">How to improve</Text>}
        {(ss.last.tips ?? []).map(t => <Text>💡 {t}</Text>)}
        {g.upgrade && <Text color="#5fff87">✏️ Try: <Text italic>{g.upgrade}</Text></Text>}
        <Box gap={1} marginTop={1}>
          <Text dimColor>Rank feel wrong?</Text>
          <Button key="report" label="Report" hotkey="r" onPress={() => report($, 'rank', '', false)} />
          <Button key="report-prompt" label="Report with my prompt" onPress={() => report($, 'rank', '', true)} />
        </Box>
      </Box>
    </Box>
  ) : (
    <Text dimColor>Send a prompt to get your first rank. S/A/B earn XP, D/F lose it, and you can drop a level.</Text>
  )

  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection={wide ? 'row' : 'column'} gap={2}>
        {art}
        {sheet}
      </Box>
      {rankCard}
      <Box flexDirection="column">
        <Text bold>Chronicle</Text>
        {s.log.length === 0 && <Text dimColor>Your story has not begun.</Text>}
        {s.log.slice(-5).map(line => <Text dimColor={!line.startsWith('+')} color={line.startsWith('-') ? '#ff8787' : undefined}>{line}</Text>)}
      </Box>
      <Text color="#5fb3ff">💡 {tip}</Text>
    </Box>
  )
}

async function skillsTab($: $T, e: RenderE, s: Save) {
  const { Box, Text, Button } = $.ui.resolve(e)
  const pts = points(s)
  const act = activeSkills(s)
  return (
    <Box flexDirection="column" gap={1}>
      <Text><Text bold color="#fde047">{pts}</Text> skill point{pts === 1 ? '' : 's'} · 1 per level · perks shape Claude’s replies (toggling refreshes the prompt cache once)</Text>
      {BRANCHES.map(b => (
        <Box flexDirection="column">
          <Text bold color={b.color}>{b.icon} {b.name.toUpperCase()}  <Text dimColor>({b.theme})</Text></Text>
          {SKILLS.filter(x => x.branch === b.id).map(sk => {
            const owned = s.unlocked.includes(sk.id)
            const live = act.includes(sk.id)
            const prev = SKILLS.find(x => x.branch === b.id && x.tier === sk.tier - 1)
            const open = !prev || s.unlocked.includes(prev.id)
            const off = s.perksOff.includes(sk.id)
            const icon = owned ? (live ? (off ? '🟡' : '🟢') : '💤') : open ? '⚪' : '🔒'
            return (
              <Box flexDirection="column" marginLeft={2}>
                <Box gap={1}>
                  <Text color={owned ? b.color : undefined} dimColor={!owned && !open}>{'│ '.repeat(0)}{icon} T{sk.tier} {sk.name}</Text>
                  {!owned && open && pts > 0 && (
                    <Button key={`learn-${sk.id}`} label="Learn (1 point)" variant="primary"
                      onPress={async () => {
                        await commit($, cur => points(cur) > 0 && !cur.unlocked.includes(sk.id)
                          ? pushLog({ ...cur, unlocked: [...cur.unlocked, sk.id] }, `Learned ${sk.name}`) : cur)
                        $.ui.toast(`${b.icon} Learned ${sk.name}!`)
                      }} />
                  )}
                  {owned && live && sk.perk && (
                    <Button key={`toggle-${sk.id}`} label={off ? 'Off' : 'On'}
                      onPress={() => commit($, cur => ({
                        ...cur,
                        perksOff: cur.perksOff.includes(sk.id) ? cur.perksOff.filter(x => x !== sk.id) : [...cur.perksOff, sk.id],
                      }))} />
                  )}
                </Box>
                <Text dimColor>    {sk.blurb}{owned && !live ? ' (dormant: regain your level)' : ''}</Text>
              </Box>
            )
          })}
        </Box>
      ))}
    </Box>
  )
}

function questsTab($: $T, e: RenderE, s: Save) {
  const { Box, Text } = $.ui.resolve(e)
  const Raster = e.surface === 'terminal' ? ($.ui.resolve(e) as Record<string, any>).Raster : undefined
  const today = s.day ? questsFor(s.day) : []
  return (
    <Box flexDirection="column" gap={1}>
      <Text bold color="#ffd166">📜 Daily quests · {s.day || 'start by sending a prompt'}</Text>
      {today.map(q => {
        const n = Math.min(q.goal, s.quests[q.id] ?? 0)
        const done = s.questsDone.includes(q.id)
        return (
          <Box flexDirection="column">
            <Text color={done ? '#5fff87' : undefined} bold>{done ? '✅' : '🎯'} {q.name}  <Text dimColor>+{QUEST_XP} XP</Text></Text>
            <Box gap={1} marginLeft={3}>
              <Text>{q.desc}</Text>
              {Raster
                ? <Raster key={`qbar-${q.id}`} {...barCells(n / q.goal, 12, done ? 0x22c55e : 0x38bdf8, done ? 0x86efac : 0xa78bfa)} />
                : <Text color="#a78bfa">{textBar(n, q.goal, q.goal)}</Text>}
              <Text dimColor>{n}/{q.goal}</Text>
            </Box>
          </Box>
        )
      })}
      <Text dimColor>🔥 Streak: {s.streak} day{s.streak === 1 ? '' : 's'} · new quests every day</Text>
      <Box flexDirection="column">
        <Text bold>How XP works</Text>
        <Text dimColor>Prompt rank: S +30 · A +20 · B +10 · C 0 · D −10 · F −20</Text>
        <Text dimColor>Rank up by naming files/functions, stating your purpose and saying what “done” means.</Text>
        <Text dimColor>Turn bonuses: cache hit ≥80% +5 · reply under 600 tokens +5 · interrupted −5 · over 8k output −5</Text>
      </Box>
    </Box>
  )
}

async function loreTab($: $T, e: RenderE, s: Save) {
  const { Box, Text, Button } = $.ui.resolve(e)
  const cards = deck(s)
  const idx = (await read($, cardA)) % cards.length
  const card = cards[idx]!
  const quiz = await read($, quizA)
  const seen = s.loreSeen.includes(card.id)
  const quizzed = s.loreSeen.includes(`q:${card.id}`)
  const deckName = card.deck === 'oracle' ? '🔮 Oracle' : card.deck === 'archives' ? '🏛 Deep Archives' : '📖 Foundations'
  const showQuiz = isActive(s, 'quiz')
  const picked = quiz && quiz.cardId === card.id ? quiz.picked : null

  return (
    <Box flexDirection="column" gap={1}>
      <Text dimColor>{deckName} · card {idx + 1}/{cards.length}{isActive(s, 'archives') ? '' : ' · learn Deep Archives for more'}</Text>
      <Box flexDirection="column" borderStyle="round" borderColor="#c58cff" paddingX={1}>
        <Text bold color="#c58cff">✨ {card.title} {seen ? '✅' : ''}</Text>
        <Text>{card.body}</Text>
      </Box>
      <Box gap={1}>
        <Button key="prev" label="< Prev" hotkey="p" onPress={() => update($, cardA, n => (n - 1 + cards.length) % cards.length)} />
        {!seen && (
          <Button key="learned" label="Learned +15 XP" variant="primary" hotkey="l"
            onPress={async () => {
              const cur = await read($, saveA)
              if (cur.loreSeen.includes(card.id)) return
              await commit($, x => ({ ...x, loreSeen: [...x.loreSeen, card.id] }))
              await award($, 15, `Lore: ${card.title}`, ['lore'])
            }} />
        )}
        <Button key="next" label="Next >" hotkey="n" onPress={() => update($, cardA, n => (n + 1) % cards.length)} />
      </Box>
      {showQuiz ? (
        <Box flexDirection="column">
          <Text bold color="#ffd166">❓ {card.q}</Text>
          {card.options.map((opt, i) => {
            const mark = picked === null ? '' : i === card.answer ? '  ✅' : i === picked ? '  ❌' : ''
            return (
              <Button key={`opt-${i}`} label={`${'abc'[i]}) ${opt}${mark}`} plain hotkey={'abc'[i]}
                onPress={async () => {
                  if (picked !== null) return
                  await update($, quizA, () => ({ cardId: card.id, picked: i }))
                  const right = i === card.answer
                  const cur = await read($, saveA)
                  if (cur.loreSeen.includes(`q:${card.id}`)) return
                  await commit($, x => ({
                    ...x, loreSeen: [...x.loreSeen, `q:${card.id}`],
                    quizTotal: x.quizTotal + 1, quizRight: x.quizRight + (right ? 1 : 0),
                  }))
                  if (right) await award($, 25, `Quiz: ${card.title}`, ['quizright'])
                  else $.ui.toast('❌ Not quite. Read the card again!')
                }} />
            )
          })}
          {picked !== null && <Text color={picked === card.answer ? '#5fff87' : '#ff8787'}>{picked === card.answer ? (quizzed ? 'Correct!' : 'Correct! +25 XP') : 'Wrong. The right answer is marked ✅.'}</Text>}
        </Box>
      ) : (
        <Text dimColor>Learn “Oracle Quiz” (Sage) to quiz yourself for XP.</Text>
      )}
      {isActive(s, 'oracle') && <Text dimColor>🔮 /quest oracle &lt;topic&gt; conjures a new card.</Text>}
    </Box>
  )
}

function rulesTab($: $T, e: RenderE, ss: Session) {
  const { Box, Text } = $.ui.resolve(e)
  const Raster = e.surface === 'terminal' ? ($.ui.resolve(e) as Record<string, any>).Raster : undefined
  const g = ss.last?.grade ?? null
  const mode = g?.mode ?? (g ? 'task' : null)
  const order = ['F', 'D', 'C', 'B', 'A', 'S'] as const
  const sign = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0')

  const ladder = (
    <Box flexDirection="column">
      {Raster && <Raster key="meter" {...scoreMeterCells(g ? g.rank : null, frame)} />}
      <Box>
        {order.map(r => <Text color={RANK_COLOR[r]} bold>{`${r}`.padEnd(6)}</Text>)}
      </Box>
      <Box>
        {LADDER.map(l => <Text dimColor>{l.points.padEnd(6)}</Text>)}
      </Box>
      <Box>
        {order.map(r => <Text color={RANK_COLOR[r]}>{sign(RANK_XP[r]).padEnd(6)}</Text>)}
      </Box>
      <Text dimColor>points → rank → XP</Text>
    </Box>
  )

  let breakdown
  if (!g) breakdown = <Text dimColor>Send a prompt and its breakdown appears here.</Text>
  else if (mode === 'reply') breakdown = (
    <Box flexDirection="column">
      <Text>Judged as a <Text bold>reply to Claude</Text> (short, starts with yes/no/ok/sure…).</Text>
      <Text dimColor>Replies are neutral: rank C, 0 XP, no tips. Steering Claude is never punished.</Text>
    </Box>
  )
  else if (mode === 'question') breakdown = (
    <Box flexDirection="column">
      <Text>Judged as a <Text bold>question</Text> (ends with ? or starts with where/what/how/is/can…).</Text>
      <Text>{g.reasons.includes('grounded') ? '✅' : '⬜'} Points at a file, error or screenshot → A (+20), otherwise B (+10)</Text>
      <Text dimColor>Questions never lose XP for a missing file/why/done: you ask because you don’t know.</Text>
    </Box>
  )
  else breakdown = (
    <Box flexDirection="column">
      {(g.parts ?? []).filter(p => !p.penalty || p.hit).map(p => (
        <Box gap={1}>
          <Text>{p.penalty ? '⚠️' : p.hit ? '✅' : '⬜'}</Text>
          <Text color={p.hit ? (p.pts > 0 ? '#5fff87' : '#ff5f5f') : '#7f849c'} bold>{(p.hit ? sign(p.pts) : '0').padStart(2)}</Text>
          <Text dimColor={!p.hit}>{p.label}{!p.hit && !p.penalty ? `  (worth ${sign(p.pts)})` : ''}</Text>
        </Box>
      ))}
      <Text> </Text>
      <Text>Score <Text bold>{g.score ?? '?'}</Text> → Rank <Text bold color={RANK_COLOR[g.rank]}>{g.rank}</Text> → <Text bold color={g.xp >= 0 ? '#5fff87' : '#ff5f5f'}>{sign(g.xp)} XP</Text></Text>
    </Box>
  )

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold color="#ffd166">📏 How ranking works</Text>
      <Box flexDirection="column">
        <Text bold>Your last prompt</Text>
        {breakdown}
      </Box>
      <Box flexDirection="column">
        <Text bold>The ladder</Text>
        {ladder}
      </Box>
      <Box flexDirection="column">
        <Text bold>Then the turn adds</Text>
        <Text>🪙 <Text color="#5fff87">+5</Text> cache hit: ≥80% of input read from the prompt cache (real API counts)</Text>
        <Text>🗺 <Text color="#5fff87">+5</Text> Plan mode: Claude planned before changing anything</Text>
        <Text>🪶 <Text color="#5fff87">+5</Text> lean reply: under 600 output tokens (text-only turns)</Text>
        <Text>✋ <Text color="#ff5f5f">−5</Text> interrupted turn · 🐘 <Text color="#ff5f5f">−5</Text> text reply over 8k tokens</Text>
        <Text>🔀 <Text dimColor>tip</Text> cache break: model switched mid-session and the cache went cold (no XP lost; opusplan does this on purpose)</Text>
        <Text>🧹 <Text color="#5fff87">+10</Text> /clear after 50k+ tokens of history (starting fresh is cheaper)</Text>
      </Box>
      <Text dimColor>All of this runs locally, with no tokens spent. Full guide: HELP.md · Wrong rank? Press Report on the Hero tab.</Text>
    </Box>
  )
}

// ── Oracle's Eye: a new lore card from Haiku ──────────────────────────────

async function oracle($: $T, topic: string, open: (t: Tab) => Promise<void>) {
  const s = await read($, saveA)
  if (!isActive(s, 'oracle')) return { text: "Oracle's Eye is not learned yet (Sage tier 4)." }
  if (!topic) return { text: 'Usage: /quest oracle <AI topic>, e.g. /quest oracle attention sinks' }
  $.ui.toast(`🔮 The Oracle gazes into “${topic}”…`)
  const r = await $.model.complete({
    model: 'claude-haiku-4-5',
    maxTokens: 500,
    system: 'You write short, accurate educational flashcards about AI/ML. Reply with JSON only.',
    prompt: `Topic: ${topic}\nReturn JSON: {"title": string (<=5 words), "body": string (2-3 plain sentences, accurate, beginner-friendly), "q": string (one quiz question), "options": [3 short strings], "answer": 0|1|2}`,
  })
  if (!r.isAnswered) return { text: `The Oracle is silent (${r.reason}).` }
  const m = r.text.match(/\{[\s\S]*\}/)
  try {
    const j = JSON.parse(m ? m[0] : r.text) as Partial<Card>
    if (!j.title || !j.body || !j.q || !Array.isArray(j.options) || j.options.length !== 3 || typeof j.answer !== 'number') throw new Error('shape')
    const card: Card = { id: `oracle-${Date.now()}`, deck: 'oracle', title: j.title, body: j.body, q: j.q, options: j.options.map(String), answer: j.answer }
    const next = await commit($, cur => ({ ...cur, custom: [...cur.custom, card].slice(-40) }))
    await update($, cardA, () => deck(next).length - 1)
    await open('lore')
    const cost = r.usage.input_tokens + r.usage.output_tokens
    return { text: `🔮 New lore card: ${card.title} (${cost} Haiku tokens).` }
  } catch {
    return { text: 'The Oracle mumbled something unreadable. Try another topic.' }
  }
}

// ── Feedback: a pre-filled GitHub issue the person reviews and submits ────

const REPO = 'https://github.com/tomikng/prompt-quest'

async function report($: $T, kind: 'rank' | 'idea', comment: string, withPrompt: boolean) {
  const ss = await read($, sessionA)
  const last = ss.last
  const g = last?.grade
  const version = await $.session.version().then(v => v.version).catch(() => 'unknown')
  const params = new URLSearchParams()
  if (kind === 'idea') {
    params.set('template', 'idea.yml')
    params.set('title', `Idea: ${comment.slice(0, 60) || '…'}`)
    if (comment) params.set('idea', comment)
  } else {
    if (!g || !last) return { text: 'No graded prompt yet. Send a prompt first, then report its rank.' }
    params.set('template', 'rank-feedback.yml')
    params.set('title', `Rank ${g.rank} felt wrong${comment ? `: ${comment.slice(0, 50)}` : ''}`)
    params.set('rank', g.rank)
    params.set('details', [
      `Rank: ${g.rank} (${g.xp >= 0 ? '+' : ''}${g.xp} XP), turn total ${last.xp >= 0 ? '+' : ''}${last.xp} XP`,
      `Signals: ${g.reasons.join(', ') || 'none'}`,
      `Missing: ${(g.missing ?? []).join(', ') || 'none'}`,
      `Notes: ${last.notes.join(', ')}`,
      `Words: ${(last.prompt ?? '').split(/\s+/).filter(Boolean).length}`,
      `Plugin 0.4.1 · Claude Code ${version}`,
    ].join('\n'))
    if (comment) params.set('why', comment)
    if (withPrompt && last.prompt) params.set('prompt', last.prompt.slice(0, 1500))
  }
  const url = `${REPO}/issues/new?${params.toString().replace(/\+/g, '%20')}`
  let opened = false
  for (const argv of [['xdg-open', url], ['open', url]]) {
    try {
      const r = await $.process.run(argv, { timeoutMs: 5000 })
      if (r.exitCode === 0) { opened = true; break }
    } catch { /* not this platform */ }
  }
  const today = dayOf(await $.clock.now())
  const s = await read($, saveA)
  if (s.feedbackDay !== today) {
    await commit($, cur => ({ ...cur, feedbackDay: today }))
    await award($, 10, kind === 'idea' ? 'Shared an idea' : 'Reported a rank')
  }
  $.ui.toast(opened ? '🐞 Opened a pre-filled issue in your browser. Review it and press Submit.' : '🐞 Issue link ready (see the transcript).')
  const privacy = kind === 'rank' ? (withPrompt ? ' Your prompt text is included; edit it out if you like.' : ' Your prompt text is NOT included.') : ''
  return { text: `${opened ? 'Opened' : 'Open this link to file it'}: ${url}\nNothing is sent until you press Submit on GitHub.${privacy}` }
}

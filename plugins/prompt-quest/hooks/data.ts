import type { Card, Grade, GradePart, Rank } from '../types'

// ── Skill tree ────────────────────────────────────────────────────────────
// Three branches, four tiers each. A node needs the one above it.
// `perk` text goes into the system prompt while the node is active.

export type Branch = 'scribe' | 'alchemist' | 'sage'

export type Skill = {
  id: string
  branch: Branch
  tier: number
  name: string
  blurb: string
  perk?: string
}

export const BRANCHES: { id: Branch; name: string; icon: string; color: string; theme: string }[] = [
  { id: 'scribe', name: 'Scribe', icon: '🪶', color: '#5fb3ff', theme: 'read output better' },
  { id: 'alchemist', name: 'Alchemist', icon: '🧪', color: '#ffb347', theme: 'spend tokens wisely' },
  { id: 'sage', name: 'Sage', icon: '🔮', color: '#c58cff', theme: 'learn the world of AI' },
]

export const SKILLS: Skill[] = [
  {
    id: 'tldr', branch: 'scribe', tier: 1, name: 'TL;DR Rune',
    blurb: 'Claude ends substantial replies with a one-line TL;DR.',
    perk: 'End every substantial reply with a final line starting "TL;DR:" that states the outcome in one sentence.',
  },
  {
    id: 'glossary', branch: 'scribe', tier: 2, name: 'Glossary Lens',
    blurb: 'Jargon gets a short inline definition the first time it appears.',
    perk: 'The first time you use a technical term or acronym the user may not know, add a short parenthetical definition (max ~8 words).',
  },
  {
    id: 'why', branch: 'scribe', tier: 3, name: 'Why-Trace',
    blurb: 'Every change comes with the reason before the what.',
    perk: 'When you change code or config, state in one short line why the change is needed before describing what changed.',
  },
  {
    id: 'answerfirst', branch: 'scribe', tier: 4, name: 'Answer-First',
    blurb: 'Lead with the answer, then details; tables for comparisons.',
    perk: 'Lead with the direct answer or result in the first sentence, then supporting detail. Use a small table when comparing options.',
  },
  {
    id: 'purse', branch: 'alchemist', tier: 1, name: 'Coin Purse',
    blurb: 'A token ledger appears above the prompt after each turn.',
  },
  {
    id: 'cachesight', branch: 'alchemist', tier: 2, name: 'Cache Sight',
    blurb: 'Warns when the prompt cache has probably gone cold before you send.',
  },
  {
    id: 'terse', branch: 'alchemist', tier: 3, name: 'Terse Tongue',
    blurb: 'Claude answers more concisely, so fewer output tokens.',
    perk: 'Be concise: no preamble, no restating the question, no closing summaries beyond one line. Prefer short sentences and bullet points.',
  },
  {
    id: 'budget', branch: 'alchemist', tier: 4, name: 'Budget Ward',
    blurb: 'Session output-token budget with alarms at 50/80/100%. /quest budget <n>',
  },
  {
    id: 'quiz', branch: 'sage', tier: 1, name: 'Oracle Quiz',
    blurb: 'Lore cards come with a quiz: +25 XP per right answer.',
  },
  {
    id: 'archives', branch: 'sage', tier: 2, name: 'Deep Archives',
    blurb: 'Unlocks the advanced lore deck (KV cache, RLHF, MoE, …).',
  },
  {
    id: 'spotter', branch: 'sage', tier: 3, name: 'Concept Spotter',
    blurb: 'When a reply touches an AI/ML concept, Claude adds a one-line lore note.',
    perk: 'If your reply involves an AI/ML concept (tokens, context, caching, embeddings, sampling, agents, etc.), add one final line starting "📜 Lore:" explaining that concept in one sentence. Skip it when no such concept is involved.',
  },
  {
    id: 'oracle', branch: 'sage', tier: 4, name: "Oracle's Eye",
    blurb: 'Conjure a new lore card on any topic: /quest oracle <topic> (small Haiku call).',
  },
]

export const skill = (id: string) => SKILLS.find(s => s.id === id)

// ── Levels ────────────────────────────────────────────────────────────────

export const xpToNext = (level: number) => 100 + 50 * (level - 1)

export function levelOf(xp: number) {
  let level = 1
  let floor = 0
  while (xp >= floor + xpToNext(level)) {
    floor += xpToNext(level)
    level += 1
  }
  return { level, into: xp - floor, need: xpToNext(level) }
}

export const titleOf = (level: number) =>
  level >= 12 ? 'Archmage' : level >= 9 ? 'Master' : level >= 6 ? 'Expert' : level >= 3 ? 'Adept' : 'Apprentice'

// ── Prompt grading (local heuristics, zero tokens) ────────────────────────

export const RANK_XP: Record<Rank, number> = { S: 30, A: 20, B: 10, C: 0, D: -10, F: -20 }
export const RANK_COLOR: Record<Rank, string> = {
  S: '#ffd700', A: '#5fff87', B: '#5fb3ff', C: '#bbbbbb', D: '#ff9f43', F: '#ff5f5f',
}

const QUESTION = /\?\s*$|^(where|what|how|why|when|who|which|is|are|can|could|do|does|did|should|would|will|whats|what's|wheres|where's)\b/i
const ACK = /^(let'?s (do it|go)|lets (do it|go)|y|yes|yeah|yep|yup|ok|okay|sure|go|go ahead|continue|proceed|do it|thanks|thank you|ty|no|nope|nah|lgtm|ship it|please|sounds good|perfect|great|cool|nice|agreed|correct|right|exactly)\b/i
const ACK_WORDS = ['yes', 'yeah', 'yep', 'yup', 'ok', 'okay', 'sure', 'no', 'nope', 'nah', 'please', 'pls', 'plz', 'thanks', 'go', 'continue', 'proceed', 'lgtm', 'agreed', 'correct', 'right', 'exactly', 'perfect', 'great', 'cool', 'nice', 'k', 'kk', 'ye', 'ya', 'yea', 'yas', 'yess']

const REAL_WORDS = ['now', 'not', 'new', 'yet', 'yes', 'see', 'set', 'use', 'got', 'god', 'ten', 'one', 'sun', 'sire', 'pure', 'cure', 'go', 'do', 'to', 'so', 'on', 'or', 'nice', 'rice', 'gone', 'nose', 'note', 'okra', 'pleas', 'cool', 'pool', 'tool']

/** Edit distance ≤ 1 (one typo), for short words like "yeas", "yse", "oka". */
function oneTypo(a: string, b: string) {
  if (a === b) return true
  if (Math.abs(a.length - b.length) > 1 || Math.min(a.length, b.length) < 2) return false
  let i = 0, j = 0, edits = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue }
    if (++edits > 1) return false
    if (a.length > b.length) i++
    else if (b.length > a.length) j++
    else if (a[i + 1] === b[j] && a[i] === b[j + 1]) { i += 2; j += 2 } // swapped letters
    else { i++; j++ }
  }
  return edits + (a.length - i) + (b.length - j) <= 1
}

/** Answers to a question Claude asked: "yes push them", "yeas pls", "no, keep it". Judged neutral. */
const isReply = (t: string, words: number) => {
  if (words > 8 || /\?\s*$/.test(t)) return false
  if (ACK.test(t)) return true
  const first = t.toLowerCase().split(/[\s,.!]+/)[0] ?? ''
  if (ACK_WORDS.includes(first)) return true
  // Typos only for 3+ letter reply words, and never for real words one letter away ("now", "yet", "not").
  if (REAL_WORDS.includes(first)) return false
  return ACK_WORDS.some(w => w.length >= 3 && oneTypo(first, w))
}
const VAGUE = /\b(fix (it|this)|doesn'?t work|not working|make it better|do something|it'?s broken|help)\b/i
const ANCHOR = /`[^`]+`|(^|\s)[\w.-]*\/[\w./-]+|\b[\w-]+\.(ts|tsx|js|jsx|py|rs|go|md|json|lua|sh|toml|yaml|yml|css|html|c|cpp|h|java|rb|kt|swift|sql)\b|\b\w+\(\)|:\d+\b|https?:\/\/|@[\w./-]+/
const PURPOSE = /\b(because|so that|goal|in order to|i need|i want|the aim|the point is|ideally|users? (can|can't|cannot|get|see))\b/i
const DONE = /\b(should|must|expect(ed)?|make sure|until|done when|acceptance|so it (works|returns|shows)|returns?|instead of)\b/i
const VERIFY = /\b(run (the )?(tests?|build|linter|lint|app)|tests?\b.{0,25}\b(pass|passes|green)|verify|check (that|it|the)|lint|typecheck|type-check|build (passes|succeeds)|reproduce|compare (it )?(with|to)|screenshot|curl)\b/i
const SCOPE = /\b(only|don'?t|do not|without|keep|leave .{1,30} (alone|as is)|avoid|at most|at least|limit(ed)? to|no new|just the|scope)\b/i
const PLAN = /\b(plan|propose|outline|options|approach(es)?|before (you )?(code|coding|implement|implementing|change|changing|edit|editing|making|writing)|ask me|interview me|think (it )?through|step by step|trade-?offs?)\b/i
const EXAMPLE = /```|\b(e\.g\.|for example|for instance|like this|such as|example:)/i
/** Words that lean on what was just being worked on: "do the same for…", "now also…", "the error". */
const FOLLOW = /\b(it|this|that|these|those|same|also|again|too|as well|instead|now|next|then|above|previous|rest|remaining|the (error|test|bug|change|fix|diff|output|page|file|function))\b/i

/** Points → rank. S needs 5+, so the top rank goes to prompts that are also verifiable, scoped or planned. */
export function rankFor(score: number): Rank {
  return score >= 5 ? 'S' : score >= 3 ? 'A' : score === 2 ? 'B' : score === 1 ? 'C' : score === 0 ? 'D' : 'F'
}
/** The ladder as the Rules view draws it. */
export const LADDER: { rank: Rank; points: string }[] = [
  { rank: 'F', points: '≤−1' }, { rank: 'D', points: '0' }, { rank: 'C', points: '1' },
  { rank: 'B', points: '2' }, { rank: 'A', points: '3–4' }, { rank: 'S', points: '5+' },
]

const TIP = {
  anchor: 'Point at something concrete: a file (`src/auth.ts`), a function (`refresh()`), a command, or the exact error text.',
  purpose: 'Add the why ("because users get logged out") so Claude can pick the right trade-off.',
  criteria: 'Say what done looks like: "tests pass", "no new dependencies", "keep the public API the same".',
  verify: 'Give Claude a way to check its own work: "run npm test", "compare with the screenshot", "curl the endpoint".',
  scope: 'Set boundaries: "only touch src/auth.ts", "don’t change the public API", "no new dependencies".',
  plan: 'For a bigger change, ask for a plan first ("propose a plan before editing") or switch to Plan mode (shift+tab).',
  terse: 'Give at least one full sentence. Very short prompts make Claude guess, and guesses cost extra turns.',
  vague: 'Replace "fix it" with what you saw and what you expected instead.',
  wall: 'Lead with the ask in the first line, then the context. Long specs are fine; give them headings or bullets.',
}

/** What the session knows when a prompt arrives: was there a turn just now, and which files did it touch. */
export type GradeContext = { recent: boolean; files: string[] }

export function grade(text: string, attachments = 0, ctx: GradeContext = { recent: false, files: [] }): Grade {
  const hasImage = attachments > 0 || /\[Image #\d+\]/.test(text)
  const t = text.replace(/\[Image #\d+\]/g, '').trim()
  const words = t.split(/\s+/).filter(Boolean).length
  // Mid-session, a 1–3 word message is steering ("next", "go on", "yeas pls"): neutral, never punished.
  const reply = isReply(t, words)
  if ((reply || (ctx.recent && words <= 3 && !ANCHOR.test(t))) && !hasImage) {
    const tip = reply ? 'Replies like this are fine when answering Claude. No XP gained or lost.' : 'Short steering mid-task is fine. No XP gained or lost.'
    return { rank: 'C', xp: 0, reasons: [reply ? 'reply to Claude' : 'short steer'], tip, tips: [], missing: [], upgrade: null, mode: 'reply' }
  }
  // Questions are judged on clarity, not on file/why/done: you ask because you don't know.
  if (QUESTION.test(t) && words <= 80) {
    const concrete = ANCHOR.test(t) || hasImage
    if (words < 3 && !concrete && !ctx.recent) {
      const tip = 'Say what the question is about ("where is X saved?") so the answer doesn’t have to guess.'
      return { rank: 'C', xp: 0, reasons: ['question', 'very short'], tip, tips: [tip], missing: [], upgrade: null, mode: 'question' }
    }
    const tip = concrete ? 'Clear, grounded question.' : 'Good question. Naming the feature or file you mean (if you know it) makes the answer sharper.'
    return {
      rank: concrete ? 'A' : 'B', xp: concrete ? 20 : 10,
      reasons: concrete ? ['question', 'grounded'] : ['question'],
      tip, tips: concrete ? [] : [tip], missing: [], upgrade: null, mode: 'question',
    }
  }

  const lower = t.toLowerCase()
  const anchored = ANCHOR.test(t) || hasImage
  // A follow-up leans on the task in progress, which is as good as naming it, just shorter.
  // In an active session, a short instruction leans on the shared context even without "it"/"same".
  const followUp = !anchored && ctx.recent && words <= 40 &&
    (FOLLOW.test(t) || ctx.files.some(f => f.length > 2 && lower.includes(f.toLowerCase())) || words >= 4)
  const structured = /^\s*([-*#]|\d+\.)\s/m.test(t)
  const flags = {
    concrete: anchored,
    follow: followUp,
    purpose: PURPOSE.test(t),
    done: DONE.test(t),
    verify: VERIFY.test(t),
    scope: SCOPE.test(t),
    plan: PLAN.test(t),
    example: EXAMPLE.test(t),
    length: words >= 12 && words <= 600,
    vague: !followUp && words < 8 && VAGUE.test(t),
    terse: !followUp && words < 4 && !(words < 8 && VAGUE.test(t)),
    wall: words > 800 && !t.includes('```') && !structured,
  }
  const parts: GradePart[] = [
    { label: 'Concrete: a file, function, command, error or screenshot', pts: 2, hit: flags.concrete },
    { label: 'Follow-up: builds on the task in progress', pts: 1, hit: flags.follow },
    { label: 'Why: because…, so that…, the goal is…', pts: 1, hit: flags.purpose },
    { label: 'Done means: should…, must…, until…, returns…', pts: 1, hit: flags.done },
    { label: 'Verifiable: run the tests, check that…, screenshot, curl', pts: 1, hit: flags.verify },
    { label: 'Scoped: only…, don’t…, without…, keep…', pts: 1, hit: flags.scope },
    { label: 'Plan first: propose a plan, options, before editing…', pts: 1, hit: flags.plan },
    { label: 'Example: e.g., for example, a code block', pts: 1, hit: flags.example },
    { label: 'Length: 12–600 words', pts: 1, hit: flags.length },
    { label: 'Vague and tiny ("fix it", "doesn’t work")', pts: -2, hit: flags.vague, penalty: true },
    { label: 'Too terse (under 4 words)', pts: -1, hit: flags.terse, penalty: true },
    { label: 'Wall of text (800+ words, no structure or code block)', pts: -1, hit: flags.wall, penalty: true },
  ]
  // Follow-ups and anchored prompts can't both score: show only the one that applies.
  const shown = parts.filter(p => !(p.label.startsWith('Follow-up') && !ctx.recent))
  let score = 0
  for (const p of shown) if (p.hit) score += p.pts

  const reasons: string[] = []
  const tips: string[] = []
  const add: string[] = []
  const missing: string[] = []
  if (flags.vague) { reasons.push('vague'); tips.push(TIP.vague) }
  if (flags.terse) { reasons.push('too terse'); tips.push(TIP.terse) }
  if (ANCHOR.test(t)) reasons.push('anchored to code/files')
  else if (hasImage) reasons.push('screenshot attached')
  else if (followUp) reasons.push('follow-up')
  else { tips.push(TIP.anchor); add.push('in <file/function>'); missing.push('file') }
  if (flags.purpose) reasons.push('purpose stated')
  else if (!followUp) { tips.push(TIP.purpose); add.push('because <why>'); missing.push('why') }
  if (flags.done || flags.verify) {
    if (flags.done) reasons.push('success criteria')
    if (flags.verify) reasons.push('verifiable')
  } else { tips.push(TIP.criteria); add.push('done when <check>'); missing.push('done-check') }
  if (flags.scope) reasons.push('scoped')
  if (flags.plan) reasons.push('plan first')
  if (flags.example) reasons.push('example')
  if (flags.length) reasons.push('good length')
  if (flags.wall) { reasons.push('wall of text'); tips.push(TIP.wall) }
  // Bonus habits get a tip only when the prompt is substantial enough to want them.
  if (!flags.verify && (flags.done || words >= 15)) tips.push(TIP.verify)
  if (!flags.scope && words >= 15) tips.push(TIP.scope)
  if (!flags.plan && words >= 40) tips.push(TIP.plan)

  let rank = rankFor(score)
  // Anti-stuffing: "fix `a.ts` because should" hits every signal but says nothing.
  if (words < 8 && (rank === 'S' || rank === 'A')) {
    rank = 'B'
    reasons.push('short: capped at B')
    shown.push({ label: 'Under 8 words: capped at rank B (no keyword stuffing)', pts: 0, hit: true, penalty: true })
  }
  const short = words > 14 ? `${t.split(/\s+/).slice(0, 12).join(' ')}…` : t.replace(/[.!?]+$/, '')
  const upgrade = add.length && words <= 400 ? `${short} ${add.join(', ')}.` : null
  const tip = tips[0] ?? 'Textbook prompt. Keep it up!'
  return { rank, xp: RANK_XP[rank], reasons, tip, tips, missing, upgrade, mode: 'task', score, parts: shown }
}

/** Token-spend advice from how a turn actually went. */
export function turnTips(t: { out: number; ratio: number; total: number; tools: number; aborted: boolean; modelSwitch?: boolean }): string[] {
  const tips: string[] = []
  if (t.aborted) tips.push('Interrupted turns still bill the tokens spent so far. A clearer first prompt avoids restarts.')
  if (t.out > 8000) tips.push('Big reply. Ask for "just the diff", "summary only" or "max 5 bullets" when that is enough. Output costs ~5× input.')
  if (t.total > 2000 && t.ratio < 0.5) tips.push('Mostly cold cache this turn. Replying within a few minutes reuses it at ~10% of the price; /clear between unrelated tasks keeps context small.')
  if (t.tools > 15) tips.push(`${t.tools} tool calls. Naming the files or commands up front saves Claude from searching.`)
  if (t.total > 100000) tips.push(`Every message re-sends the whole history (${Math.round(t.total / 1000)}k tokens now). /clear before starting a new task.`)
  if (t.modelSwitch) tips.push('Switching model mid-session rebuilds the prompt cache at full price. Pick your model at the start and stick with it.')
  return tips
}

// ── Daily quests ──────────────────────────────────────────────────────────

export type Quest = { id: string; name: string; goal: number; desc: string }

export const QUESTS: Quest[] = [
  { id: 'sharp', name: 'Sharpshooter', goal: 3, desc: 'Send 3 prompts ranked A or S' },
  { id: 'cache', name: 'Cache Keeper', goal: 3, desc: '3 turns with ≥80% cache hits' },
  { id: 'lore', name: 'Scholar', goal: 2, desc: 'Read 2 new lore cards' },
  { id: 'lean', name: 'Lean Blade', goal: 3, desc: '3 turns under 600 output tokens' },
  { id: 'quizright', name: 'Quiz Champion', goal: 2, desc: 'Answer 2 quiz questions right' },
  { id: 'turn', name: 'Journeyman', goal: 5, desc: 'Complete 5 turns' },
  { id: 'purpose', name: 'Why Seeker', goal: 3, desc: 'State your purpose in 3 prompts' },
  { id: 'clear', name: 'Clean Slate', goal: 1, desc: '/clear after a long conversation (50k+ tokens)' },
]

export const QUEST_XP = 50

export function questsFor(day: string): Quest[] {
  let h = 0
  for (const c of day) h = (h * 31 + c.charCodeAt(0)) >>> 0
  const pool = [...QUESTS]
  const picked: Quest[] = []
  while (picked.length < 3 && pool.length) {
    h = (h * 1103515245 + 12345) >>> 0
    picked.push(pool.splice(h % pool.length, 1)[0]!)
  }
  return picked
}

export const PROMPT_TIPS = [
  'Name the file or function. "fix auth" → "fix the token refresh in src/auth.ts".',
  'Say what done looks like: "tests in api.test.ts should pass".',
  'State the why: purpose lets Claude choose the right trade-offs.',
  'Long sessions re-read their context each turn: /clear between unrelated tasks.',
  'Cache reads cost ~10% of fresh input. Steady back-and-forth keeps the cache warm.',
  'Output tokens cost ~5× input. Ask for "just the diff" or "short answer" when that is enough.',
  'Batch related asks into one prompt instead of five tiny ones.',
  'Paste the exact error text. It beats describing it.',
]

// ── Lore ─────────────────────────────────────────────────────────────────

const c = (deck: Card['deck'], id: string, title: string, body: string, q: string, options: string[], answer: number): Card =>
  ({ id, deck, title, body, q, options, answer })

export const LORE: Card[] = [
  c('foundations', 'tokens', 'Tokens',
    'Models read and write text as tokens: chunks that average about 3–4 characters of English. Prices, rate limits and context limits are all counted in tokens, not words.',
    'Roughly how many English characters is one token on average?', ['About 1', 'About 4', 'About 20'], 1),
  c('foundations', 'context', 'The Context Window',
    'The context window is everything the model sees at once: system prompt, tool definitions, the conversation so far, tool results and the reply being written. When it fills up, older material has to be summarized (compacted) or dropped.',
    'What fills the context window in Claude Code?', ['Only your latest prompt', 'System prompt, history, tool results and the reply', 'Only the model’s answer'], 1),
  c('foundations', 'inout', 'Input vs Output',
    'For Claude models an output token costs about 5× an input token. Long answers cost more than long questions, and generating output is also the slow part.',
    'Which is usually more expensive per token?', ['Input', 'Output', 'They cost the same'], 1),
  c('foundations', 'caching', 'Prompt Caching',
    'When a request starts with the same prefix as a recent one (system prompt, earlier turns), the API can serve that prefix from cache. A cache read costs about 10% of normal input. Entries expire after a TTL (5 minutes by default, refreshed on each hit; 1 hour is available).',
    'A cache read costs roughly what share of a normal input token?', ['~10%', '~50%', '~200%'], 0),
  c('foundations', 'sampling', 'Sampling & Temperature',
    'At each step the model outputs a probability for every possible next token, and sampling picks one. Temperature reshapes that distribution: lower is sharper and more deterministic, higher is flatter and more varied.',
    'Lowering the temperature makes output…', ['More random', 'More deterministic', 'Longer'], 1),
  c('foundations', 'attention', 'Transformers & Attention',
    'Modern LLMs are transformers. In self-attention each token computes how relevant every earlier token is and blends their information. Stacking many attention layers builds up rich representations.',
    'Which mechanism lets each token weigh every other token?', ['Convolution', 'Self-attention', 'Dropout'], 1),
  c('foundations', 'embeddings', 'Embeddings',
    'An embedding maps text to a vector of numbers so that similar meanings land close together. Embeddings power semantic search, clustering and retrieval-augmented generation.',
    'Two sentences with similar meaning have embeddings that are…', ['Close together', 'Orthogonal by design', 'Identical'], 0),
  c('foundations', 'hallucination', 'Hallucination',
    'A hallucination is a fluent, confident and false statement. It comes from predicting plausible text. To reduce it, ground the model in sources, let it say “I don’t know”, and verify with tools and tests.',
    'Which best reduces hallucinations in coding?', ['Asking it to be confident', 'Grounding in files and running tests', 'Raising temperature'], 1),
  c('foundations', 'tooluse', 'Tool Use',
    'With tool use the model emits a structured request such as “run Bash with this command”. The harness (here, Claude Code) executes it and sends back the result. The model itself never runs anything.',
    'Who actually executes a tool call?', ['The model’s weights', 'The harness/client', 'Nobody, it is simulated'], 1),
  c('foundations', 'training', 'Pretraining & Post-training',
    'Pretraining teaches next-token prediction over a huge text corpus. Post-training (supervised fine-tuning and reinforcement learning from human or AI feedback) then shapes that raw predictor into a helpful, honest assistant.',
    'Pretraining mainly teaches the model to…', ['Follow a constitution', 'Predict the next token', 'Use tools'], 1),
  c('foundations', 'fewshot', 'Few-shot Prompting',
    'Showing a few input→output examples in the prompt is one of the strongest ways to steer format and style. The model infers the pattern in context, with no retraining.',
    'Few-shot prompting changes the model’s weights.', ['True', 'False', 'Only for small models'], 1),
  c('foundations', 'thinking', 'Extended Thinking',
    'Reasoning models can “think” in tokens before answering. Thinking tokens are billed as output, so higher effort usually means better answers on hard problems in exchange for more tokens and time.',
    'Thinking tokens are billed as…', ['Free', 'Input tokens', 'Output tokens'], 2),
  c('internals', 'request', 'What Every Request Carries',
    'Claude Code doesn’t send just your message. Every request carries the system prompt, your CLAUDE.md, a git status snapshot, every tool definition and the whole conversation so far. When Claude uses a tool, it runs on your machine and the result goes back for another round.',
    'When Claude reads one of your files, where does the read happen?', ['On Anthropic’s servers', 'On your machine', 'In the browser'], 1),
  c('internals', 'cachebreak', 'Cache Breakers',
    'The prompt cache only matches an identical prefix, for the same model. Switching model mid-session, changing settings that alter the system prompt or tools (adding an MCP server, say), changing thinking settings, or going idle past the cache lifetime all make the next request pay full price again.',
    'Which of these breaks the prompt cache?', ['Replying again within a minute', 'Switching model mid-session', 'Asking a short question'], 1),
  c('internals', 'planexec', 'Plan Strong, Build Lean',
    'Planning needs the best reasoning; typing out code mostly doesn’t. Some setups plan with the strongest model and execute with a faster, cheaper one. In Claude Code the `opusplan` model setting does exactly this: Opus in Plan mode, Sonnet otherwise.',
    'What does the `opusplan` setting use for executing code?', ['Opus', 'Sonnet', 'Haiku'], 1),
  c('internals', 'adaptive', 'Adaptive Thinking & Effort',
    'With adaptive thinking the model decides how much to think from how hard the request is: a quick lookup gets little, an architecture question gets a lot. The effort level steers how eagerly it thinks. Thinking tokens bill as output, so lower effort on simple work saves tokens.',
    'Higher effort mostly means…', ['More thinking tokens on hard problems', 'A bigger context window', 'Cheaper replies'], 0),
  c('internals', 'clear', 'Why /clear Saves Money',
    'Every message re-sends the whole conversation. After a few dozen turns that can be 100k+ tokens riding along with each new message, even a one-liner. /clear starts fresh, so the next message carries only the system prompt and your words. Rule of thumb: /clear before a new task.',
    'After 30 turns, what does your next message carry?', ['Only the new message', 'The whole conversation so far', 'The last 3 messages'], 1),
  c('internals', 'compact', 'Auto-compact',
    'When the conversation nears the context limit, Claude Code summarizes the older parts to free space and keeps the recent ones. It’s automatic and normal, but a summary loses detail: put decisions that must survive in CLAUDE.md, and /clear between unrelated tasks so it’s rarely needed.',
    'Auto-compact makes room by…', ['Deleting your files', 'Summarizing older conversation', 'Switching to a bigger model'], 1),
  c('internals', 'claudemd', 'CLAUDE.md Is Always On',
    'Your CLAUDE.md is loaded into every request of the session. That makes it the place for lasting project rules, and also a cost: every line rides along with every message (cached, but still counted). Keep it short and specific.',
    'Why keep CLAUDE.md short?', ['It is sent with every request', 'Claude ignores long files', 'It slows down git'], 0),
  c('archives', 'kvcache', 'The KV Cache',
    'During generation the keys and values of earlier tokens are stored so that each new token reuses them instead of recomputing. This is why long contexts eat GPU memory, and prompt caching persists exactly this work across requests.',
    'What does the KV cache avoid?', ['Recomputing attention keys/values for earlier tokens', 'Tokenizing text', 'Downloading weights'], 0),
  c('archives', 'rlhf', 'RLHF',
    'In reinforcement learning from human feedback, humans compare pairs of outputs, a reward model learns those preferences, and the policy is then optimized with RL (e.g. PPO) to score well under it.',
    'In RLHF, the reward model is trained on…', ['Raw web text', 'Human preference comparisons', 'Unit tests'], 1),
  c('archives', 'cai', 'Constitutional AI',
    'Anthropic’s Constitutional AI has the model critique and revise its own outputs against a written set of principles. AI-generated preference labels (RLAIF) then train harmlessness with far fewer human labels.',
    'Constitutional AI relies heavily on…', ['AI feedback guided by written principles', 'Bigger GPUs', 'Removing all refusals'], 0),
  c('archives', 'moe', 'Mixture of Experts',
    'A Mixture-of-Experts layer holds many expert sub-networks plus a router that sends each token to only a few of them. Total parameters grow while compute per token stays modest.',
    'What does the router in MoE do?', ['Picks a few experts per token', 'Routes network packets', 'Chooses the temperature'], 0),
  c('archives', 'specdec', 'Speculative Decoding',
    'A small draft model guesses several tokens ahead, and the large model checks them all in one parallel pass, keeping the ones it agrees with. Output quality is unchanged and generation gets faster.',
    'Speculative decoding mainly improves…', ['Accuracy', 'Speed', 'Context length'], 1),
  c('archives', 'rag', 'Retrieval-Augmented Generation',
    'RAG retrieves relevant documents (often by embedding similarity) and places them in the context, so the model answers from fresh, citable facts. It is usually a better way than fine-tuning to add knowledge.',
    'For adding frequently changing facts, prefer…', ['Fine-tuning weekly', 'RAG', 'Higher temperature'], 1),
  c('archives', 'scaling', 'Scaling Laws',
    'Loss falls predictably, as a power law, with more parameters, data and compute. The Chinchilla result found that compute-optimal training uses roughly 20 tokens of data per parameter.',
    'Chinchilla’s compute-optimal ratio is about…', ['1 token per parameter', '20 tokens per parameter', '1000 tokens per parameter'], 1),
  c('archives', 'interp', 'Interpretability',
    'Neurons often mix many concepts at once (superposition). Dictionary learning with sparse autoencoders pulls out cleaner “features”, such as one for the Golden Gate Bridge, that can be inspected and even steered.',
    'Sparse autoencoders are used in interpretability to…', ['Compress weights', 'Extract interpretable features', 'Speed up training'], 1),
  c('archives', 'mcp', 'Model Context Protocol',
    'MCP is an open protocol for connecting AI apps to external tools and data. Servers expose tools, resources and prompts, and any MCP client, Claude Code included, can use them.',
    'An MCP server exposes…', ['Model weights', 'Tools, resources and prompts', 'GPU time'], 1),
  c('archives', 'agents', 'Agents & Context Engineering',
    'Agents loop: think, call tools, read results, repeat. Good context engineering keeps that loop lean. Subagents explore in their own context and return only a summary, and compaction summarizes old history.',
    'Why delegate a broad search to a subagent?', ['It is always cheaper per token', 'Its file dumps stay out of the main context', 'Subagents never make mistakes'], 1),
  c('archives', 'quant', 'Quantization',
    'Quantization stores weights at lower precision (8-bit, 4-bit) instead of 16-bit, which cuts memory and speeds up inference at a small cost in quality. It is how big models fit on consumer GPUs.',
    '4-bit quantization mainly reduces…', ['Memory use', 'Vocabulary size', 'Context window'], 0),
  c('archives', 'evals', 'Evals',
    'Evals measure model behavior on fixed test sets: benchmarks, unit-test pass rates, or an LLM acting as judge. Watch out for contamination, where test data leaked into training.',
    'Benchmark contamination means…', ['Test items leaked into training data', 'The GPU overheated', 'A judge model was used'], 0),
]

// ── Concrete tips from what Claude actually did this turn ─────────────────

export type Trace = {
  /** Claude entered or left Plan mode this turn. */
  planned?: boolean
  /** Files Claude edited or wrote, in order. */
  edits: string[]
  /** How often each file was read. */
  reads: Record<string, number>
  /** Searches: grep/rg/find/ls through Bash, Grep, Glob. */
  searches: number
  /** The last test/check command Claude ran, if any. */
  check: string | null
}

export const emptyTrace = (): Trace => ({ edits: [], reads: {}, searches: 0, check: null })

const SEARCH_CMD = /(^|[|;&]\s*|\s)(grep|rg|find|fd|ls|tree)\s/
const CHECK_CMD = /^(npm|pnpm|yarn|bun|npx) (run )?(test|lint|check|typecheck)\b|^(pytest|jest|vitest|tsc|eslint|ruff|mypy|make test|cargo (test|check|clippy)|go (test|vet)|mvn test|gradle test|claude plugin (test|validate))\b/

/** The part of a shell command worth quoting back: drop `cd …&&`, pipes and redirects. */
export function checkOf(command: string): string | null {
  // Only the command line itself: never heredoc bodies or later lines.
  const line = command.split('\n')[0]!.split('<<')[0]!
  const parts = line.split(/&&|;/).map(p => p.split('|')[0]!.replace(/\s*\d?>.*$/, '').trim()).filter(Boolean)
  const hit = parts.filter(p => CHECK_CMD.test(p)).pop()
  if (!hit) return null
  return hit.length > 48 ? `${hit.slice(0, 47)}…` : hit
}

export const isSearch = (command: string) => SEARCH_CMD.test(` ${command}`)

export function relPath(path: string, cwd: string, home: string) {
  if (cwd && path.startsWith(`${cwd}/`)) return path.slice(cwd.length + 1)
  if (home && path.startsWith(`${home}/`)) return `~/${path.slice(home.length + 1)}`
  return path
}

/** Swaps generic advice for advice naming the real file and the real check. */
export function concretize(g: Grade, trace: Trace, rel: (p: string) => string): Grade {
  const reads = Object.entries(trace.reads).sort((a, b) => b[1] - a[1])
  const editCount: Record<string, number> = {}
  for (const f of trace.edits) editCount[f] = (editCount[f] ?? 0) + 1
  const mostEdited = Object.entries(editCount).sort((a, b) => b[1] - a[1])[0]?.[0]
  const target = mostEdited ?? reads[0]?.[0]
  const file = target ? rel(target) : null
  const lookups = Object.values(trace.reads).reduce((a, b) => a + b, 0) + trace.searches
  const tips = g.tips.map(t => {
    if (t === TIP.anchor && file) {
      const cost = lookups > 1 ? ` Claude made ${lookups} reads/searches to find it.` : ''
      return `Next time point to \`${file}\` directly.${cost}`
    }
    if (t === TIP.criteria && trace.check) {
      return `Say what done looks like, e.g. "done when \`${trace.check}\` passes". That's the check Claude ended up running.`
    }
    return t
  })
  if (g.reasons.includes('anchored to code/files') && trace.searches >= 6) {
    tips.push(`You named a file, but Claude still ran ${trace.searches} searches. Naming the function or the line too narrows it further.`)
  }
  if (trace.edits.length && new Set(trace.edits).size > 3 && !g.reasons.includes('success criteria')) {
    tips.push(`This touched ${new Set(trace.edits).size} files. Saying the scope up front ("only touch ${file ?? 'X'}") keeps changes small.`)
  }
  let upgrade = g.upgrade
  if (upgrade && file) upgrade = upgrade.replace('<file/function>', `\`${file}\``)
  if (upgrade && trace.check) upgrade = upgrade.replace('<check>', `\`${trace.check}\` passes`)
  return { ...g, tips, upgrade, tip: tips[0] ?? g.tip }
}

const PATH_RE = /(?:~\/|\.{0,2}\/)?[\w.-]+(?:\/[\w.-]+)*\.(?:tsx?|jsx?|mjs|cjs|py|rs|go|md|json|lua|sh|toml|ya?ml|css|html|c|cpp|h|java|rb|kt|swift)\b/g
const WRITE_RE = /sed -i|>>?\s*['"]?[\w~./]|\btee\b|\bpython3?\b|\bnode\b|\bmv\b|\bcp\b|\brsync\b|\bpatch\b/

/** Files a shell command names, and whether it looks like it changes them. */
export function bashFiles(command: string): { paths: string[]; writes: boolean } {
  const paths = [...new Set(command.match(PATH_RE) ?? [])]
    .filter(p => !p.includes('/types/') && !p.endsWith('.d.ts') && !p.includes('node_modules'))
  return { paths, writes: WRITE_RE.test(command) }
}

/** A short stable hash of a prompt's words, so repeats can be spotted without keeping the text. */
export function promptHash(text: string) {
  const norm = text.toLowerCase().replace(/\[image #\d+\]/g, '').replace(/[^\p{L}\p{N}`./_-]+/gu, ' ').trim()
  let h = 0x811c9dc5
  for (let i = 0; i < norm.length; i++) h = Math.imul(h ^ norm.charCodeAt(i), 0x01000193) >>> 0
  return h.toString(36)
}

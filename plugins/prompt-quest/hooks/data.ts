import type { Card, Grade, Rank } from '../types'

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

const RANK_XP: Record<Rank, number> = { S: 30, A: 20, B: 10, C: 0, D: -10, F: -20 }
export const RANK_COLOR: Record<Rank, string> = {
  S: '#ffd700', A: '#5fff87', B: '#5fb3ff', C: '#bbbbbb', D: '#ff9f43', F: '#ff5f5f',
}

const ACK = /^(y|yes|yep|ok|okay|sure|go|go ahead|continue|proceed|do it|thanks|thank you|ty|no|nope|lgtm|ship it)[.!]*$/i
const VAGUE = /\b(fix (it|this)|doesn'?t work|not working|make it better|do something|it'?s broken|help)\b/i
const ANCHOR = /`[^`]+`|(^|\s)[\w.-]*\/[\w./-]+|\b[\w-]+\.(ts|tsx|js|py|rs|go|md|json|lua|sh|toml|yaml|yml|css|html|c|cpp|h)\b|\b\w+\(\)|:\d+\b|https?:\/\//
const PURPOSE = /\b(because|so that|goal|in order to|i need|i want|the aim|the point is|ideally)\b/i
const CRITERIA = /\b(should|must|expect|make sure|verify|test|without|don'?t|do not|only|instead of|until|at most|at least)\b/i

const TIP = {
  anchor: 'Point at something concrete: a file (`src/auth.ts`), a function (`refresh()`), a command, or the exact error text.',
  purpose: 'Add the why ("because users get logged out") so Claude can pick the right trade-off.',
  criteria: 'Say what done looks like: "tests pass", "no new dependencies", "keep the public API the same".',
  terse: 'Give at least one full sentence. Very short prompts make Claude guess, and guesses cost extra turns.',
  vague: 'Replace "fix it" with what you saw and what you expected instead.',
  wall: 'Lead with the ask in the first line, then the context. Put long logs in a file and reference its path.',
}

export function grade(text: string): Grade {
  const t = text.trim()
  const words = t.split(/\s+/).filter(Boolean).length
  if (ACK.test(t)) {
    const tip = 'Short replies are fine when steering. No XP gained or lost.'
    return { rank: 'C', xp: 0, reasons: ['quick reply'], tip, tips: [tip], upgrade: null }
  }
  let score = 0
  const reasons: string[] = []
  const tips: string[] = []
  const add: string[] = []
  if (words < 8 && VAGUE.test(t)) { score -= 2; reasons.push('vague'); tips.push(TIP.vague) }
  else if (words < 4) { score -= 1; reasons.push('too terse'); tips.push(TIP.terse) }
  if (ANCHOR.test(t)) { score += 2; reasons.push('anchored to code/files') } else { tips.push(TIP.anchor); add.push('in <file/function>') }
  if (PURPOSE.test(t)) { score += 1; reasons.push('purpose stated') } else { tips.push(TIP.purpose); add.push('because <why>') }
  if (CRITERIA.test(t)) { score += 1; reasons.push('success criteria') } else { tips.push(TIP.criteria); add.push('done when <check>') }
  if (words >= 12 && words <= 250) { score += 1; reasons.push('good length') }
  if (words > 400 && !t.includes('```')) { score -= 1; reasons.push('wall of text'); tips.push(TIP.wall) }
  const rank: Rank = score >= 4 ? 'S' : score === 3 ? 'A' : score === 2 ? 'B' : score === 1 ? 'C' : score === 0 ? 'D' : 'F'
  const short = words > 14 ? `${t.split(/\s+/).slice(0, 12).join(' ')}…` : t.replace(/[.!?]+$/, '')
  const upgrade = add.length && words <= 400 ? `${short} ${add.join(', ')}.` : null
  const tip = tips[0] ?? 'Textbook prompt. Keep it up!'
  return { rank, xp: RANK_XP[rank], reasons, tip, tips, upgrade }
}

/** Token-spend advice from how a turn actually went. */
export function turnTips(t: { out: number; ratio: number; total: number; tools: number; aborted: boolean }): string[] {
  const tips: string[] = []
  if (t.aborted) tips.push('Interrupted turns still bill the tokens spent so far. A clearer first prompt avoids restarts.')
  if (t.out > 8000) tips.push('Big reply. Ask for "just the diff", "summary only" or "max 5 bullets" when that is enough. Output costs ~5× input.')
  if (t.total > 2000 && t.ratio < 0.5) tips.push('Mostly cold cache this turn. Replying within a few minutes reuses it at ~10% of the price; /clear between unrelated tasks keeps context small.')
  if (t.tools > 15) tips.push(`${t.tools} tool calls. Naming the files or commands up front saves Claude from searching.`)
  if (t.total > 150000) tips.push('Context is getting large, and every turn re-reads it. Consider /compact or /clear when switching topics.')
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
const CHECK_CMD = /\b(test|tests|pytest|jest|vitest|tsc|lint|eslint|validate|check|cargo (test|check|build)|go (test|vet)|make)\b/

/** The part of a shell command worth quoting back: drop `cd …&&`, pipes and redirects. */
export function checkOf(command: string): string | null {
  const parts = command.split(/&&|;|\n/).map(p => p.split('|')[0]!.replace(/\s*\d?>.*$/, '').trim()).filter(Boolean)
  const hit = parts.filter(p => !p.startsWith('cd ') && CHECK_CMD.test(p)).pop()
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
  const target = trace.edits[trace.edits.length - 1] ?? reads[0]?.[0]
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

export type Rank = 'S' | 'A' | 'B' | 'C' | 'D' | 'F'

export type Card = {
  id: string
  deck: 'foundations' | 'internals' | 'archives' | 'oracle'
  title: string
  body: string
  q: string
  options: string[]
  answer: number
}

export type GradePart = { label: string; pts: number; hit: boolean; penalty?: boolean }

export type Grade = {
  rank: Rank
  xp: number
  reasons: string[]
  tip: string
  /** Concrete advice for each thing the prompt was missing. */
  tips: string[]
  /** How it was judged: a task, a question, or a reply to Claude. */
  mode?: 'task' | 'question' | 'reply'
  /** Raw points before mapping to a rank (tasks only). */
  score?: number
  /** Every rule and what it gave, for the Rules view. */
  parts?: GradePart[]
  /** What the prompt lacked: 'file', 'why', 'done-check'. */
  missing?: string[]
  /** The prompt rewritten with placeholders for what was missing. */
  upgrade: string | null
}

export type Save = {
  xp: number
  unlocked: string[]
  perksOff: string[]
  stats: {
    prompts: number
    turns: number
    inTok: number
    outTok: number
    cacheRead: number
    cacheWrite: number
    ranks: Record<string, number>
  }
  day: string
  quests: Record<string, number>
  questsDone: string[]
  streak: number
  lastDay: string
  loreSeen: string[]
  quizRight: number
  quizTotal: number
  custom: Card[]
  budget: number
  showBand: boolean
  /** Hashes of recent prompts (never the text), so repeats earn nothing. */
  recent?: string[]
  /** Day feedback last earned XP (once a day). */
  feedbackDay?: string
  log: string[]
}

export type Session = {
  outTok: number
  alerts: number[]
  lastTurnAt: number
  last: {
    /** The prompt as typed; session-only, never written to the store. */
    prompt?: string
    grade: Grade | null
    xp: number
    notes: string[]
    /** Prompt tips first, then token-spend tips from how the turn went. */
    tips: string[]
    inTok: number
    outTok: number
    cacheRead: number
    cacheWrite: number
  } | null
  mood: 'idle' | 'up' | 'down' | 'hit'
  moodAt: number
  /** XP lost in the last hit, for the damage number. */
  dmg?: number
}

export type Tab = 'hero' | 'skills' | 'quests' | 'lore' | 'rules'

export type Quiz = { cardId: string; picked: number | null }

declare module 'claude-code' {
  interface PluginState {
    'prompt-quest': {
      save: Save
      session: Session
      tab: Tab
      card: number
      quiz: Quiz | null
    }
  }
}

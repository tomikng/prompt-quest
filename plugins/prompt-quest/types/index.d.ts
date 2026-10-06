export type Rank = 'S' | 'A' | 'B' | 'C' | 'D' | 'F'

export type Card = {
  id: string
  deck: 'foundations' | 'archives' | 'oracle'
  title: string
  body: string
  q: string
  options: string[]
  answer: number
}

export type Grade = {
  rank: Rank
  xp: number
  reasons: string[]
  tip: string
  /** Concrete advice for each thing the prompt was missing. */
  tips: string[]
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
  log: string[]
}

export type Session = {
  outTok: number
  alerts: number[]
  lastTurnAt: number
  last: {
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
  mood: 'idle' | 'up' | 'down'
  moodAt: number
}

export type Tab = 'hero' | 'skills' | 'quests' | 'lore'

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

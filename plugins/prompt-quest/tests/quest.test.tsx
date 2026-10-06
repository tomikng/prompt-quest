import { describe, expect, mock, test } from 'claude-code/testing'

import { grade, levelOf, turnTips } from '../hooks/data'

describe('prompt ranks', () => {
  test('a specific prompt ranks S and earns XP', async () => {
    const g = grade('Fix the token refresh in `src/auth.ts` because users get logged out; tests in auth.test.ts should pass.')
    expect(g.rank).toBe('S')
    expect(g.xp).toBe(30)
  })
  test('a vague prompt ranks F and loses XP', async () => {
    const g = grade('fix it')
    expect(g.rank).toBe('F')
    expect(g.xp).toBe(-20)
  })
  test('a weak prompt gets a tip per missing part and a rewrite', async () => {
    const g = grade('looks broken')
    expect(g.tips.length).toBe(4)
    expect(g.upgrade).toBe('looks broken in <file/function>, because <why>, done when <check>.')
  })
  test('a heavy, cold turn gets token-spend tips', async () => {
    const tips = turnTips({ out: 9000, ratio: 0.1, total: 50000, tools: 20, aborted: false })
    expect(tips.length).toBe(3)
  })
  test('a quick acknowledgement is neutral', async () => {
    expect(grade('yes').xp).toBe(0)
  })
  test('losing XP can drop a level', async () => {
    expect(levelOf(110).level).toBe(2)
    expect(levelOf(110 - 20).level).toBe(1)
  })
})

const PANE = {
  component: 'Pane',
  requestId: 'prompt-quest',
  props: { title: 'Quest', isFocused: true, bodyColumns: 90, placement: 'dock' },
} as const

test('pane shows the hero and lets you learn a skill', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'prompt-quest', surface, ...PANE } as never)
    await ui.press({ key: 'tab-hero' })
    expect(await ui.find({ type: 'Text', text: /Wanderer/ })).toBeDefined()
    await ui.press({ key: 'tab-skills' })
    expect(await ui.find({ type: 'Text', text: /SCRIBE/ })).toBeDefined()
    await ui.unmount()
  }
  const ui = await $.ui.mount({ plugin: 'prompt-quest', surface: 'terminal', ...PANE } as never)
  await ui.press({ key: 'learn-tldr' })
  expect(await ui.find({ key: 'toggle-tldr' })).toBeDefined()
  await ui.unmount()
})

test('band draws level, pixel XP bar and skill point hint', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'prompt-quest', surface, component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 120 },
    } as never)
    expect(await ui.find({ type: 'Text', text: /Lv 1/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /skill point/ })).toBeDefined()
    if (surface === 'terminal') expect(await ui.find({ key: 'xpbar' })).toBeDefined()
    await ui.unmount()
  }
})

import { describe, expect, mock, test } from 'claude-code/testing'

import { bashFiles, checkOf, concretize, grade, levelOf, relPath, turnTips } from '../hooks/data'

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
  test('tips name the file Claude had to find and the check it ran', async () => {
    const cwd = '/home/me/proj'
    const g = concretize(grade('looks broken'), {
      edits: ['/home/me/proj/hooks/register.tsx'],
      reads: { '/home/me/proj/hooks/register.tsx': 2, '/home/me/proj/hooks/art.ts': 1 },
      searches: 3,
      check: checkOf('cd /home/me/proj && claude plugin test . 2>&1 | tail -3'),
    }, p => relPath(p, cwd, '/home/me'))
    expect(g.tips).toContain('Next time point to `hooks/register.tsx` directly. Claude made 6 reads/searches to find it.')
    expect(g.tips.some(t => t.includes('done when `claude plugin test .` passes'))).toBe(true)
    expect(g.upgrade).toBe('looks broken in `hooks/register.tsx`, because <why>, done when `claude plugin test .` passes.')
  })
  test('a screenshot counts as pointing at something concrete', async () => {
    const g = grade('Now im getting minus 5xp but the tips does not tell me exactly how [Image #3]')
    expect(g.reasons).toContain('screenshot attached')
    expect(g.missing).toEqual(['why', 'done-check'])
  })
  test('files edited through shell commands are tracked', async () => {
    const f = bashFiles("cd mod; python3 - <<'X'\np='hooks/register.tsx'; s=open(p).read()\nX")
    expect(f.paths).toEqual(['hooks/register.tsx'])
    expect(f.writes).toBe(true)
    expect(bashFiles('grep -n foo hooks/data.ts').writes).toBe(false)
  })
  test('a question is not punished for missing file/why/done', async () => {
    const g = grade('Where do we save this state?')
    expect(g.rank).toBe('B')
    expect(g.missing).toEqual([])
    expect(g.upgrade).toBe(null)
  })
  test('text inside a heredoc is never taken as the check', async () => {
    expect(checkOf("cat > x.html <<'EOF'\nTL;DR: tokens refresh early, tests pass.\nEOF")).toBe(null)
    expect(checkOf('cd app && npm test 2>&1 | tail')).toBe('npm test')
  })
  test('a quick acknowledgement is neutral', async () => {
    expect(grade('yes').xp).toBe(0)
    expect(grade('Yes push them').xp).toBe(0)
    expect(grade('yes push them').upgrade).toBe(null)
    expect(grade('no, keep the old name').xp).toBe(0)
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

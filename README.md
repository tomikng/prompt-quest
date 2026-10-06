# ⚔️ Prompt Quest

An RPG layer for [Claude Code](https://claude.com/claude-code). Get better at prompting, reading output and spending tokens, and learn how modern AI works along the way.

- **Prompt ranks S–F.** Every prompt you type is graded locally (no tokens spent). S/A/B earn XP, D/F lose it. Yes, you can level *down*.
- **Tips that teach.** Each rank comes with concrete advice and a suggested rewrite of your own prompt, plus token-spend tips from how the turn went (heavy output, cold cache, too many tool calls).
- **Skill tree.** One point per level across three branches:
  - 🪶 **Scribe** (read output better): TL;DR line, inline glossary, why-before-what, answer-first
  - 🧪 **Alchemist** (spend tokens wisely): token ledger, cold-cache warnings, terse mode, session budget
  - 🔮 **Sage** (learn AI): lore quizzes, advanced deck, inline lore notes, Oracle cards on any topic
- **Dormant skills.** Drop below the level that covers your skills and the newest go to sleep until you climb back.
- **Daily quests and streaks.**
- **24 AI lore cards with quizzes**, from tokens and caching to KV cache, RLHF, Constitutional AI, MoE and interpretability.
- **Animated pixel art** (terminal): a hero scene that changes with your class and celebrates or sulks with you, plus shining rank badges.

## Install

```
/plugin marketplace add tomikng/prompt-quest
/plugin install prompt-quest@prompt-quest
```

Then type `/quest`.

Requires a Claude Code build with function-hook plugins (2.1.289 or newer). The pixel art needs the terminal. Other surfaces get the text version. The side pane docks at 144+ terminal columns.

## Commands

| Command | What it does |
| --- | --- |
| `/quest` | Open the pane (tabs: Hero, Skills, Quests, Lore; keys 1–4) |
| `/quest skills` / `quests` / `lore` | Open a specific tab |
| `/quest band` | Show or hide the status band above the prompt |
| `/quest budget 50k` | Set the session output-token budget (Budget Ward) |
| `/quest oracle <topic>` | Conjure a new lore card via a small Haiku call (Oracle's Eye) |
| `/quest reset confirm` | Start over at level 1 |

## How XP works

| Source | XP |
| --- | --- |
| Prompt rank S / A / B / C / D / F | +30 / +20 / +10 / 0 / −10 / −20 |
| Cache hit ≥ 80% | +5 |
| Reply under 600 output tokens | +5 |
| Interrupted turn | −5 |
| Reply over 8k output tokens | −5 |
| Lore card read / quiz right / quest done | +15 / +25 / +50 |

A prompt ranks up when it names something concrete (a file, function, command or error), states *why*, and says what *done* looks like.

## Privacy

Everything runs locally. Prompts are graded with heuristics on your machine, and progress is stored in the plugin's local store. The only model call is the optional `/quest oracle`.

## Development

```
claude --plugin-dir ./plugins/prompt-quest
claude plugin validate ./plugins/prompt-quest
claude plugin test ./plugins/prompt-quest
```

MIT licensed.

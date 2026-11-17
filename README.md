# ronin-forge

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/isanssss/ronin-forge/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/isanssss/ronin-forge/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

**RONIN FORGE: Random Hero Arena** — a team auto-battler RPG for the desktop browser. Every hero is rolled, not written: summon fighters from the forge and each one is procedurally generated — name and epithet, element (Fire, Water, Lightning, Earth, Wind), class (Blade, Assassin, Guardian, Medic, Caster), rarity from Common to Legendary, stats, a cooldown skill and a named ultimate, even a hand-drawn-by-code chibi portrait with its own palette, hair, headband and weapon. Build a team of five, set a front and back row, and take on ten stages of the shadow clan — watchable auto-battles you swing by firing ultimates at the right moment (click a glowing portrait or press 1–5). Win gems and XP, merge duplicate spirits to level heroes up, beat the bosses on stages 5 and 10, then chase your best wave in the endless rift. Vanilla JavaScript and Canvas 2D, synthesized WebAudio sound, no libraries, no assets, no network — it runs offline from its own static files and saves your roster in the browser.

## Run it

```sh
node serve.ts
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`node serve.ts` serves the game at http://localhost:8080 — open it in a desktop browser to play. The second command builds the entry: it copies `game/` and `screenshots/` to the output directory and writes the dossier the judges read.

---

<sub>Entered on [make.fun](https://make.fun/?ref=sm62f3x7&utm_source=github&utm_medium=readme&utm_campaign=best-game-01) · AI agents build software for cash rewards</sub>

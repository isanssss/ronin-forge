// Screenshot staging: ?shot=title|summon|battle|victory&seed=N builds one representative,
// deterministic scene per name, from seeded rolls, so the same URL always renders the same
// frame. Shot mode freezes the simulation (the entry point stops calling ui.update), leaving
// only the ambient animation running on a fixed-step clock.

import { Battle } from './battle.js';
import { GameState } from './state.js';
import { Rng } from './random.js';
import { generateHero } from './heroes.js';

/** Parse the query string; returns { name, seed } or null when this is a normal visit. */
export function parseShotParams(search) {
  const params = new URLSearchParams(search);
  const name = params.get('shot');
  if (!name) return null;
  const seed = Number.parseInt(params.get('seed') || '1', 10);
  return { name, seed: Number.isFinite(seed) ? seed : 1 };
}

const LINEUP_CLASSES = ['Blade', 'Guardian', 'Assassin', 'Caster', 'Medic'];
const LINEUP_RARITIES = ['Epic', 'Rare', 'Legendary', 'Rare', 'Epic'];
const LINEUP_ROWS = ['front', 'front', 'back', 'back', 'back'];

function seededTeam(seed, level) {
  const rng = new Rng(seed * 977 + 13);
  return LINEUP_CLASSES.map((cls, i) => {
    const hero = generateHero(rng, { cls, rarity: LINEUP_RARITIES[i] });
    hero.level = level;
    return { hero, row: LINEUP_ROWS[i] };
  });
}

/** Put the UI into the named scene. Unknown names fall back to the title. */
export function stageShot(ui, name, seed) {
  ui.shotMode = true;
  if (name === 'summon') {
    ui.S = new GameState();
    ui.S.gems = 1240;
    const hero = generateHero(new Rng(seed * 31337 + 5), { rarity: 'Legendary' });
    hero.level = 1;
    ui.summon = { phase: 'reveal', t: 0.6, result: { ok: true, merged: false, hero, rolled: hero } };
    ui.screen = 'summon';
    return;
  }
  if (name === 'battle') {
    // Stage the frame directly from engine state instead of simulating a fight: a frozen
    // simulation leaves units mid-lunge and pins decay timers (hit flash, shake) at full
    // strength forever, which is what made the old frame messy. Here every unit stands in
    // its formation slot and only the dressing — health, meters, floaters, one cast — is set.
    const team = seededTeam(seed, 7);
    const battle = new Battle({ team, stage: 5, endless: false, rng: new Rng(seed * 7717) });
    battle.layout(); // the constructor already placed everyone; re-assert the slot positions
    // mid-fight health and meters: bars at varied levels, the Blade's ultimate charged
    const hpFrac = [0.78, 0.55, 0.88, 0.7, 0.92];
    const ultVal = [100, 45, 65, 30, 55];
    battle.players.forEach((u, i) => {
      u.hp = Math.max(1, Math.round(u.maxHp * hpFrac[i]));
      u.ult = ultVal[i];
    });
    const foeHpFrac = [0.62, 0.84, 0.41];
    const foeUltVal = [25, 10, 50];
    battle.foes.forEach((u, i) => {
      u.hp = Math.max(1, Math.round(u.maxHp * foeHpFrac[i]));
      u.ult = foeUltVal[i];
    });
    // Light action dressing: three damage floaters, each floated clear above its unit's
    // name plate (a plate's top edge sits ~171px above the unit's feet), and the Medic
    // mid-cast — castT draws her element glow at her feet. No lunges, no hit flash, no shake.
    const [frontFoe, , backFoe] = battle.foes;
    const assassin = battle.players[2];
    const medic = battle.players[4];
    battle.floaters.push(
      { x: frontFoe.x + 6, y: frontFoe.y - 185, text: '-132', color: '#ffd94d', size: 27, t: 0.1, dur: 0.95 },
      { x: backFoe.x - 6, y: backFoe.y - 182, text: '-89', color: '#ffffff', size: 20, t: 0.25, dur: 0.95 },
      { x: assassin.x + 6, y: assassin.y - 180, text: '-47', color: '#ffffff', size: 19, t: 0.2, dur: 0.95 },
    );
    medic.castT = 0.25;
    battle.banner = null;
    battle.cutin = null;
    ui.battle = battle;
    ui.battleStage = 5;
    ui.screen = 'battle';
    return;
  }
  if (name === 'victory') {
    const team = seededTeam(seed, 8);
    team[1].hero.level = 9; // the one who levelled up on the results list
    ui.S = new GameState();
    ui.S.gems = 1336;
    ui.S.cleared = 5;
    ui.battle = {
      players: team.map(({ hero }) => ({ hero, alive: true })),
    };
    ui.result = {
      won: true,
      endless: false,
      stage: 5,
      waves: 3,
      gems: 96,
      xpGains: team.map(({ hero }, i) => ({
        hero, xp: 180, levels: i === 1 ? 1 : 0, survived: true,
      })),
    };
    ui.resultApplied = true;
    ui.screen = 'result';
    return;
  }
  // title (and any unknown name): the posing lineup
  ui.shotTeam = seededTeam(seed, 9).map(({ hero }) => hero);
  ui.screen = 'title';
}

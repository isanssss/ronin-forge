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
    // The stage-10 boss fight, staged directly from engine state instead of simulating one:
    // a frozen simulation leaves units mid-lunge and pins decay timers (hit flash, shake) at
    // full strength forever. Here the boss wave is spawned for real, everyone stands in their
    // formation slot, and only the dressing — health, meters, statuses, floaters, the active
    // cut-in and its element spectacle — is set by hand.
    const team = seededTeam(seed, 9);
    const battle = new Battle({ team, stage: 10, endless: false, rng: new Rng(seed * 7717) });
    battle.spawnWave(3); // the boss wave: the Umbral Shogun leads the front row
    battle.layout(); // re-assert the slot positions
    const boss = battle.foes[0];
    // mid-fight health and meters: the boss bloodied, one hero low, bars at varied levels
    const hpFrac = [0.82, 0.64, 0.9, 0.35, 0.76];
    battle.players.forEach((u, i) => {
      u.hp = Math.max(1, Math.round(u.maxHp * hpFrac[i]));
    });
    const foeHpFrac = [0.55, 0.7, 0.45, 0.85, 0.6];
    const foeUltVal = [20, 35, 10, 45, 15];
    battle.foes.forEach((u, i) => {
      u.hp = Math.max(1, Math.round(u.maxHp * (foeHpFrac[i] ?? 0.7)));
      u.ult = foeUltVal[i] ?? 0;
    });
    // The Blade has just unleashed: his meter is spent, the cut-in banner is up at full
    // strength, and his element is still exploding across the enemy line. The Caster's
    // ultimate is charged instead — her HUD portrait is the one glowing.
    const blade = battle.players[0];
    const caster = battle.players[3];
    const medic = battle.players[4];
    blade.ult = 0;
    battle.players[1].ult = 40;
    battle.players[2].ult = 55;
    caster.ult = 100;
    medic.ult = 30;
    battle.cutin = { unit: blade, t: 0.5, dur: 1.5 };
    battle.ultFx = {
      element: blade.hero.element,
      kind: blade.hero.ult.kind,
      side: 'player',
      targets: battle.foes.slice(),
      t: 0.3,
      dur: 0.9,
    };
    // status dressing: the boss burns from the Blade's element, the Guardian fights chilled
    boss.statuses.push({ kind: 'Burn', t: 2.4, tickT: 0, tickDmg: 12 });
    battle.players[1].statuses.push({ kind: 'Chill', t: 4, tickT: 0, tickDmg: 0 });
    // Damage floaters, each floated clear of its unit's name plate and of the cut-in band
    // (the boss's plate rides ~239px above its feet; a normal plate's top edge ~171px).
    const backFoe = battle.foes[2];
    const assassin = battle.players[2];
    battle.floaters.push(
      { x: boss.x + 8, y: boss.y - 255, text: '-486', color: '#ffd94d', size: 28, t: 0.1, dur: 0.95 },
      { x: backFoe.x - 6, y: backFoe.y - 185, text: '-121', color: '#ffffff', size: 20, t: 0.25, dur: 0.95 },
      { x: assassin.x + 6, y: assassin.y - 182, text: '-58', color: '#ffffff', size: 19, t: 0.2, dur: 0.95 },
    );
    medic.castT = 0.25;
    battle.banner = null;
    battle.shake = 0;
    ui.battle = battle;
    ui.battleStage = 10;
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

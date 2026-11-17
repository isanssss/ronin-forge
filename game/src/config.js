// RONIN FORGE — central tuning: view size, palette and every balance constant in one place.
// Nothing in this file touches the DOM, storage or the network; it is pure data other modules read.

/** Logical canvas size. The page scales this to fit the window, keeping the 1280x800 frame. */
export const VIEW = { width: 1280, height: 800 };

/** Palette shared by menus, cards and the battle scene. */
export const COLORS = {
  ink: '#0d1020',
  nightTop: '#1b2340',
  nightBottom: '#0a0d1a',
  parchment: '#f3e9d2',
  parchmentDim: '#cbbfa3',
  gold: '#f5c542',
  goldDeep: '#b8860b',
  crimson: '#e5484d',
  jade: '#3fb970',
  azure: '#4da3e5',
  violet: '#9a6ae5',
  panel: 'rgba(16, 20, 38, 0.88)',
  panelEdge: '#3a4470',
  barBack: 'rgba(0, 0, 0, 0.55)',
  hpGreen: '#58d977',
  hpLow: '#e5484d',
  ultYellow: '#ffd94d',
  textDark: '#23203a',
};

/** Economy and roster rules. */
export const ECONOMY = {
  startGems: 300,
  summonCost: 100,
  starterHeroes: 3,
  teamSize: 5,
  frontRowMax: 2,
  backRowMax: 3,
  rosterMax: 60,
};

/** Battle maths: gauges, damage shaping and reward curves. */
export const BATTLE = {
  atbMax: 1000, // action gauge a unit must fill before it may act
  atbPerSpd: 30, // gauge gained per second per point of SPD (SPD 12 acts about every 2.8s)
  ultMax: 100,
  ultGainOnAct: 14, // meter a unit gains when it takes its own action
  ultGainOnHitMax: 26, // meter a defender gains from a full-health hit, scaled by damage taken
  elementStrong: 1.25, // damage multiplier when the attacker's element beats the defender's
  elementWeak: 0.85, // and when it is the other way round
  critChance: 0.12,
  critMult: 1.6,
  varianceLo: 0.9, // per-hit random spread applied to raw damage
  varianceHi: 1.1,
  wavesPerStage: 3,
  lastStage: 10,
  bossStages: [5, 10],
  stageStatGrowth: 0.25, // enemy stat multiplier added per stage above 1 (base scale is 0.70)
  waveStatGrowth: 0.05, // and per wave inside a stage
  endlessStatGrowth: 0.2, // endless mode: per-wave growth on a 1.9 base
  levelStatGrowth: 0.16, // hero stat growth per level above 1
};

/** Gem and XP rewards for clearing a stage: about 60-80 gems early, up to ~120 at the end. */
export function stageGemReward(stage, rng) {
  return 54 + stage * 5 + Math.floor(rng.range(0, 23));
}

/** XP every hero on the team earns for clearing a stage (the fallen earn half, applied by battle).
 *  Sized so a team that clears each stage once reaches about level 6-7 by the final stage,
 *  with duplicate merges and replays carrying it the rest of the way. */
export function stageXpReward(stage) {
  return 70 + stage * 22;
}

/** Endless mode pays per wave survived instead of a clear bonus. */
export function endlessGemReward(wavesCleared) {
  return wavesCleared * 14;
}

export function endlessXpReward(wavesCleared) {
  return wavesCleared * 16;
}

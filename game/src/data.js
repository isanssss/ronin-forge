// Content pools: every name, element, class, skill and ultimate a generated hero can have.
// All names are original to this game. The generator in heroes.js assembles heroes from these
// tables; the battle engine only reads the numbers, never the flavour text.

/** First names for summoned heroes. A hero's identity (for duplicate merges) is this name. */
export const FIRST_NAMES = [
  'Akira', 'Renji', 'Sora', 'Kaede', 'Haruto', 'Yuna', 'Daichi', 'Mei',
  'Kaito', 'Aiko', 'Riku', 'Hana', 'Sho', 'Nami', 'Takeshi', 'Yuki',
  'Arashi', 'Chiyo', 'Goro', 'Emiko', 'Jiro', 'Keiko', 'Masaru', 'Noriko',
  'Osamu', 'Rin', 'Saburo', 'Tama', 'Ume', 'Wataru', 'Yori', 'Zenko',
];

/** Epithets appended to first names: "Kaede the Ember Dancer". */
export const EPITHETS = [
  'the Ember Dancer', 'the Silent Bell', 'the River\'s Heir', 'the Paper Crane',
  'the Night Gardener', 'the Iron Blossom', 'the Laughing Monk', 'the Storm Shepherd',
  'the Ash Walker', 'the Moon Tinker', 'the Fox\'s Bargain', 'the Stone Poet',
  'the Lantern Thief', 'the Cloud Cartographer', 'the Bamboo Saint', 'the Tide Drummer',
  'the Sparrow General', 'the Ink Alchemist', 'the Frost Pilgrim', 'the Ember Archivist',
  'the Wandering Chef', 'the Kite Duelist', 'the Moss Hermit', 'the Brass Ronin',
];

/** Names for the shadow clan: the same generator, darker words. */
export const SHADOW_FIRST = [
  'Kurayami', 'Dokuro', 'Hebi', 'Karasu', 'Onibi', 'Mumyo', 'Zangetsu', 'Raiko',
  'Shigure', 'Tsuchi', 'Venom', 'Hollow', 'Grudge', 'Pale', 'Thorn', 'Umbra',
];
export const SHADOW_EPITHETS = [
  'the Hollow Mask', 'the Ashen Fang', 'the Drowned Bell', 'the Thirteenth Shadow',
  'the Broken Oath', 'the Smokeless Fire', 'the Widow\'s Thread', 'the Iron Widow',
  'the Nameless Debt', 'the Cinder Saint', 'the Last Lantern', 'the Quiet Knife',
];

/** Bosses get fixed grand names instead of rolled ones. */
export const BOSS_NAMES = [
  'General Kurogane, the Ashen Warlord',
  'The Umbral Shogun, Lord of the Ninth Night',
];
export const ENDLESS_BOSS_NAME = 'The Pale Revenant';

/** The five elements and their advantage wheel: each beats exactly one other. */
export const ELEMENTS = {
  Fire: { color: '#ff7043', deep: '#b23c17', beats: 'Wind', glyph: 'F' },
  Water: { color: '#42a5f5', deep: '#1c5f9e', beats: 'Fire', glyph: 'W' },
  Lightning: { color: '#ffd54f', deep: '#a67c00', beats: 'Water', glyph: 'L' },
  Earth: { color: '#a1887f', deep: '#5d4037', beats: 'Lightning', glyph: 'E' },
  Wind: { color: '#66d9a5', deep: '#1f7a4d', beats: 'Earth', glyph: 'A' },
};
export const ELEMENT_LIST = Object.keys(ELEMENTS);

/** 1.25 when the attacker's element beats the defender's, 0.85 when beaten, else 1. */
export function elementMultiplier(attackElement, defendElement) {
  if (ELEMENTS[attackElement].beats === defendElement) return 1.25;
  if (ELEMENTS[defendElement].beats === attackElement) return 0.85;
  return 1;
}

/**
 * Classes: base stats at level 1 for a Common hero, whether the class may strike any row
 * (ranged) or only the front row first (melee), its skill pool and its ultimate.
 * Skill kinds: damage (one target), aoe (all enemies), heal (weakest ally), healAll,
 * buffAtk / buffDef (whole team, a few actions). Power multiplies the user's ATK (or heal).
 */
export const CLASSES = {
  Blade: {
    ranged: false,
    base: { hp: 118, atk: 17, def: 10, spd: 12 },
    blurb: 'A balanced swordfighter of the open road.',
    skills: [
      { name: 'Crescent Slash', desc: 'A sweeping arc of steel for 150% damage.', kind: 'damage', power: 1.5, cooldown: 3 },
      { name: 'Whirlwind Arc', desc: 'Spin through every foe for 90% damage each.', kind: 'aoe', power: 0.9, cooldown: 4 },
      { name: 'Duelist\'s Focus', desc: 'Raise the team\'s attack for 3 rounds.', kind: 'buffAtk', power: 0.18, cooldown: 5 },
    ],
    ult: { name: 'Thousand Petal Storm', desc: 'A storm of blades hits all enemies for 170% damage.', kind: 'aoe', power: 1.7 },
  },
  Assassin: {
    ranged: false,
    base: { hp: 92, atk: 22, def: 6, spd: 17 },
    blurb: 'Fast, fragile, and already behind you.',
    skills: [
      { name: 'Shadow Strike', desc: 'Vanish and strike for 195% damage.', kind: 'damage', power: 1.95, cooldown: 3 },
      { name: 'Venom Fan', desc: 'A fan of poisoned needles for 130% damage.', kind: 'damage', power: 1.3, cooldown: 2 },
      { name: 'Smoke Requiem', desc: 'Strike every foe for 80% damage from the smoke.', kind: 'aoe', power: 0.8, cooldown: 4 },
    ],
    ult: { name: 'Nightfall Execution', desc: 'One perfect cut for 330% damage to a single foe.', kind: 'nuke', power: 3.3 },
  },
  Guardian: {
    ranged: false,
    base: { hp: 168, atk: 13, def: 17, spd: 8 },
    blurb: 'A wall with a sword, and opinions about both.',
    skills: [
      { name: 'Shield Slam', desc: 'Bash a foe for 125% damage.', kind: 'damage', power: 1.25, cooldown: 2 },
      { name: 'Bulwark Stance', desc: 'Raise the team\'s defence for 3 rounds.', kind: 'buffDef', power: 0.22, cooldown: 5 },
      { name: 'Earthsplitter', desc: 'Crack the ground under all foes for 85% damage.', kind: 'aoe', power: 0.85, cooldown: 4 },
    ],
    ult: { name: 'Aegis of the Dawn', desc: 'Heal the team for 90% and raise its defence.', kind: 'guardAll', power: 0.9 },
  },
  Medic: {
    ranged: true,
    base: { hp: 98, atk: 12, def: 8, spd: 13 },
    blurb: 'Stitches wounds and, when pressed, enemies.',
    skills: [
      { name: 'Mend', desc: 'Restore the weakest ally for 190% of attack.', kind: 'heal', power: 1.9, cooldown: 2 },
      { name: 'Renewal Wave', desc: 'Restore the whole team for 95% of attack.', kind: 'healAll', power: 0.95, cooldown: 4 },
      { name: 'Soothing Focus', desc: 'Raise the team\'s attack for 3 rounds.', kind: 'buffAtk', power: 0.15, cooldown: 5 },
    ],
    ult: { name: 'Phoenix Blessing', desc: 'A great renewal restores the team for 250% of attack.', kind: 'healAll', power: 2.5 },
  },
  Caster: {
    ranged: true,
    base: { hp: 88, atk: 21, def: 6, spd: 11 },
    blurb: 'Speaks to the storm in its first language.',
    skills: [
      { name: 'Starfall Bolt', desc: 'Call down a bolt for 175% damage.', kind: 'damage', power: 1.75, cooldown: 3 },
      { name: 'Tempest Call', desc: 'A tempest tears through all foes for 105% damage.', kind: 'aoe', power: 1.05, cooldown: 4 },
      { name: 'Rune of Mending', desc: 'Restore the weakest ally for 150% of attack.', kind: 'heal', power: 1.5, cooldown: 3 },
    ],
    ult: { name: 'Cataclysm Rune', desc: 'Unmake the sky: 195% damage to all enemies.', kind: 'aoe', power: 1.95 },
  },
};
export const CLASS_LIST = Object.keys(CLASSES);

/** Rarity ladder: stat multiplier, summon weight, display colour and glow strength. */
export const RARITIES = {
  Common: { mult: 1.0, weight: 52, color: '#b8c4ce', glow: 0 },
  Rare: { mult: 1.18, weight: 29, color: '#4da3e5', glow: 0.35 },
  Epic: { mult: 1.45, weight: 14, color: '#9a6ae5', glow: 0.7 },
  Legendary: { mult: 1.8, weight: 5, color: '#f5c542', glow: 1 },
};
export const RARITY_LIST = Object.keys(RARITIES);

/** Stage names and the warlord waiting at the end of stages 5 and 10. */
export const STAGE_NAMES = [
  'Bamboo Gate', 'Ember Village', 'The Sunken Shrine', 'Howling Pass', 'Warlord\'s Court',
  'The Ashen Fields', 'Lantern Docks', 'Temple of Ninth Night', 'The Broken Stair', 'Throne of Umbra',
];
export const STAGE_TIPS = [
  'Front rows are struck first. Put Guardians up front.',
  'Elements matter: Fire beats Wind, Wind beats Earth, Earth beats Lightning, Lightning beats Water, Water beats Fire.',
  'Ultimates charge as heroes act and take hits. Save them for the boss wave.',
  'A duplicate summon is not wasted: it raises the hero you own by a level.',
  'Medics and Casters strike from the back row, safe from most blades.',
  'Every element leaves its mark: Fire burns, Water chills, Lightning stuns, Earth roots, Wind poisons.',
  'Each hero carries a passive trait — check the card before you build the team.',
  'Stages can drop gear. Equip it in Formation; a duplicate piece salvages into gems.',
];

/**
 * Status effects. Damaging hits carry the attacker's element with them: skills apply their
 * element's effect outright (Lightning's Stun is a chance, being stronger), basic attacks
 * only sometimes. Burn and Poison tick once a second for a stored slice of the applier's
 * attack; Chill and Root slow the action gauge instead of hurting; Stun eats the victim's
 * next action whole. One instance per kind per unit — reapplying refreshes it.
 */
export const STATUS_EFFECTS = {
  Burn: {
    color: '#ff7043', glyph: 'B', duration: 3, tickDamage: 0.14,
    applyText: 'BURNED!', desc: 'Burns for damage every second.',
  },
  Poison: {
    color: '#a5d64f', glyph: 'P', duration: 4, tickDamage: 0.11,
    applyText: 'POISONED!', desc: 'Poison seeps in every second.',
  },
  Chill: {
    color: '#7fd4ff', glyph: 'C', duration: 5, gaugeRate: 0.55,
    applyText: 'CHILLED!', desc: 'The action gauge fills 45% slower.',
  },
  Root: {
    color: '#c98d4b', glyph: 'R', duration: 4, gaugeRate: 0.35,
    applyText: 'ROOTED!', expireText: 'ROOTS BREAK', desc: 'Roots crawl: the action gauge fills 65% slower.',
  },
  Stun: {
    color: '#ffd54f', glyph: 'S', duration: 6,
    applyText: 'STUNNED!', expireText: 'STUN PASSED', desc: 'Stunned: the next action is lost.',
  },
};

/** Which status each element inflicts, and how reliably: skill hits vs basic attacks. */
export const ELEMENT_STATUS = {
  Fire: { kind: 'Burn', skillChance: 1, basicChance: 0.15 },
  Water: { kind: 'Chill', skillChance: 1, basicChance: 0.15 },
  Lightning: { kind: 'Stun', skillChance: 0.45, basicChance: 0.15 },
  Earth: { kind: 'Root', skillChance: 1, basicChance: 0.15 },
  Wind: { kind: 'Poison', skillChance: 1, basicChance: 0.15 },
};

/**
 * Passive traits: every generated hero rolls exactly one. The battle engine reads the id;
 * the name and description are for the hero card. Values live in battle.js / heroes.js.
 */
export const PASSIVES = [
  { id: 'lifesteal', name: 'Crimson Siphon', desc: 'Heals for 15% of the damage it deals.' },
  { id: 'thorns', name: 'Thorn Mantle', desc: 'Reflects 20% of damage taken back at the attacker.' },
  { id: 'swift', name: 'Swift Start', desc: 'Enters battle with the action gauge half full.' },
  { id: 'ironskin', name: 'Iron Skin', desc: 'Takes 12% less damage from every hit.' },
  { id: 'focus', name: 'Still Mind', desc: 'Critical hits are 12% more likely.' },
  { id: 'aura', name: 'Lantern Aura', desc: 'Allies mend 2% of their health every few seconds.' },
  { id: 'executioner', name: 'Executioner', desc: 'Deals 30% more damage to foes under 35% health.' },
  { id: 'secondwind', name: 'Second Wind', desc: 'Once per battle, refuses death and fights on at 30% health.' },
];

/**
 * Stage omens: from stage 6 the road itself fights. elementBoost empowers the player's
 * heroes of one element; ultRateAll slows (or hastens) every ultimate's charge;
 * ultRatePlayer touches only the player's; enemySpdMult / enemyAtkMult strengthen the clan.
 */
export const STAGE_MODIFIERS = {
  6: {
    id: 'ember', name: 'Ember Night', short: 'Fire heroes +25% damage',
    desc: 'Ember Night: your Fire heroes deal +25% damage.',
    elementBoost: { element: 'Fire', mult: 1.25 },
  },
  7: {
    id: 'thinair', name: 'Thin Air', short: 'Ultimates charge 20% slower',
    desc: 'Thin Air: every ultimate charges 20% slower.',
    ultRateAll: 0.8,
  },
  8: {
    id: 'surge', name: 'Shadow Surge', short: 'Enemies +10% speed',
    desc: 'Shadow Surge: the shadow clan is +10% faster.',
    enemySpdMult: 1.1,
  },
  9: {
    id: 'tide', name: 'High Tide', short: 'Water heroes +25% damage',
    desc: 'High Tide: your Water heroes deal +25% damage.',
    elementBoost: { element: 'Water', mult: 1.25 },
  },
  10: {
    id: 'umbral', name: 'Umbral Eclipse', short: 'Foes +10% ATK · your ults +20%',
    desc: 'Umbral Eclipse: the clan hits +10% harder, but your ultimates charge 20% faster.',
    enemyAtkMult: 1.1, ultRatePlayer: 1.2,
  },
};

/** Battlefield biomes: the road changes its face every two stages; the rift has none. */
export const STAGE_BIOMES = {
  dojo: 'Night Dojo', bamboo: 'Bamboo Grove', ember: 'Ember Shrine',
  frost: 'Frost Pass', court: "Warlord's Court", rift: 'The Rift',
};

/** Which biome a stage fights in (the endless rift overrides everything). */
export function biomeForStage(stage, endless = false) {
  if (endless) return 'rift';
  if (stage <= 2) return 'dojo';
  if (stage <= 4) return 'bamboo';
  if (stage <= 6) return 'ember';
  if (stage <= 8) return 'frost';
  return 'court';
}

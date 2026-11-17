// Hero generation and the procedural chibi-fighter portrait. A hero is plain data rolled from
// a seed: name, element, class, rarity, a skill and an ultimate, plus small per-hero stat jitter
// and the cosmetic rolls (hair, skin) the portrait needs. The portrait is drawn entirely with
// canvas paths — palette from the hero's element, weapon from the class, silhouette darker and
// red-eyed for the shadow clan — so thousands of distinct heroes need no image assets.

import { BATTLE } from './config.js';
import {
  BOSS_NAMES, CLASSES, CLASS_LIST, ELEMENTS, ELEMENT_LIST, EPITHETS, FIRST_NAMES,
  PASSIVES, RARITIES, RARITY_LIST, SHADOW_EPITHETS, SHADOW_FIRST,
} from './data.js';
import { emptyGear, gearBonuses } from './gear.js';

const SKIN_TONES = ['#f2c79b', '#e0ac7e', '#c68863', '#8d5a3b', '#f7d7b0'];
const HAIR_COLORS = ['#2b2b3a', '#5a3a22', '#8a8f98', '#b54434', '#3a5a8c', '#e8e3d5', '#4d7c4d'];

/** Roll a rarity by the table weights (Common most, Legendary rarest). */
export function rollRarity(rng) {
  const weights = RARITY_LIST.map((r) => RARITIES[r].weight);
  return RARITY_LIST[rng.pickWeighted(weights)];
}

/**
 * Generate one hero. Options: { level, rarity, element, cls, shadow, boss, bossIndex } —
 * anything not given is rolled from rng. Shadow heroes are enemies: same generator, dark words.
 */
export function generateHero(rng, opts = {}) {
  const shadow = Boolean(opts.shadow);
  const boss = Boolean(opts.boss);
  const rarity = opts.rarity || rollRarity(rng);
  const element = opts.element || rng.pick(ELEMENT_LIST);
  const cls = opts.cls || rng.pick(CLASS_LIST);
  const first = shadow ? rng.pick(SHADOW_FIRST) : rng.pick(FIRST_NAMES);
  const epithet = shadow ? rng.pick(SHADOW_EPITHETS) : rng.pick(EPITHETS);
  const skill = { ...rng.pick(CLASSES[cls].skills) };
  const hero = {
    id: rng.uid(shadow ? 'shade' : 'hero'),
    seed: rng.seed,
    first,
    epithet,
    name: boss ? (opts.bossName || BOSS_NAMES[opts.bossIndex || 0]) : `${first} ${epithet}`,
    element,
    cls,
    rarity,
    level: opts.level || 1,
    xp: 0,
    skill,
    ult: { ...CLASSES[cls].ult },
    passive: { ...rng.pick(PASSIVES) },
    gear: emptyGear(),
    shadow,
    boss,
    jitter: {
      hp: rng.range(0.94, 1.06),
      atk: rng.range(0.94, 1.06),
      def: rng.range(0.94, 1.06),
      spd: rng.range(0.95, 1.05),
    },
    hair: rng.int(0, 3),
    hairColor: rng.pick(HAIR_COLORS),
    skin: rng.pick(SKIN_TONES),
  };
  return hero;
}

/** XP needed to go from `level` to the next. */
export function xpForNext(level) {
  return Math.round(60 * Math.pow(level, 1.35));
}

/** Add XP, levelling as many times as it covers. Returns the number of levels gained. */
export function gainXp(hero, amount) {
  hero.xp += amount;
  let levels = 0;
  while (hero.xp >= xpForNext(hero.level)) {
    hero.xp -= xpForNext(hero.level);
    hero.level += 1;
    levels += 1;
  }
  return levels;
}

/** A hero's identity for duplicate merges: two summons of the same first name are one spirit. */
export function heroKey(hero) {
  return hero.first;
}

/** Derived combat stats: class base x rarity x level growth x jitter, plus worn gear. */
export function heroStats(hero) {
  const base = CLASSES[hero.cls].base;
  const mult = RARITIES[hero.rarity].mult * (1 + BATTLE.levelStatGrowth * (hero.level - 1));
  const stats = {
    maxHp: Math.round(base.hp * mult * hero.jitter.hp),
    atk: Math.round(base.atk * mult * hero.jitter.atk),
    def: Math.round(base.def * mult * hero.jitter.def),
    spd: Math.round(base.spd * mult * hero.jitter.spd * 10) / 10,
  };
  if (hero.boss) {
    stats.maxHp = Math.round(stats.maxHp * 2.05);
    stats.atk = Math.round(stats.atk * 1.3);
    stats.def = Math.round(stats.def * 1.25);
  }
  const gear = gearBonuses(hero);
  stats.maxHp += gear.hp;
  stats.atk += gear.atk;
  stats.def += gear.def;
  stats.spd = Math.round((stats.spd + gear.spd) * 10) / 10;
  return stats;
}

// --- portrait -------------------------------------------------------------------------------

function ellipse(ctx, x, y, rx, ry) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function rect(ctx, x, y, w, h) {
  ctx.fillRect(x, y, w, h);
}

/**
 * Draw the hero as a chibi fighter, feet at (x, y), roughly 120*scale px tall.
 * opts: { t seconds for idle bob, flip to face left, flash 0..1 hit flash, pose idle|attack|hurt|down|cheer, alpha }.
 */
export function drawHero(ctx, hero, x, y, scale, opts = {}) {
  const t = opts.t || 0;
  const pose = opts.pose || 'idle';
  const el = ELEMENTS[hero.element];
  const main = hero.shadow ? '#454066' : el.color;
  const deep = hero.shadow ? '#2c2947' : el.deep;
  const trim = hero.shadow ? '#8f86c9' : '#f3e9d2';
  const bob = pose === 'idle' ? Math.sin(t * 2.4 + hero.seed % 7) * 2 : 0;
  const cheer = pose === 'cheer' ? Math.abs(Math.sin(t * 6)) * -8 : 0;

  ctx.save();
  ctx.translate(x, y);
  if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
  if (pose === 'down') {
    ctx.rotate(0.35);
    ctx.globalAlpha = (opts.alpha !== undefined ? opts.alpha : 1) * 0.55;
  }
  ctx.scale((opts.flip ? -1 : 1) * scale, scale);
  ctx.translate(0, bob + cheer);

  // rarity aura behind Epic and Legendary heroes
  const glow = RARITIES[hero.rarity].glow;
  if (glow > 0 && pose !== 'down') {
    const pulse = 0.75 + 0.25 * Math.sin(t * 3 + hero.seed);
    ctx.save();
    ctx.globalAlpha = glow * 0.33 * pulse * (opts.alpha !== undefined ? opts.alpha : 1);
    ctx.fillStyle = RARITIES[hero.rarity].color;
    ellipse(ctx, 0, -58, 66, 66);
    ctx.restore();
  }

  // ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ellipse(ctx, 0, 2, 30, 7);

  const lean = pose === 'attack' ? 7 : pose === 'hurt' ? -6 : 0;
  ctx.translate(lean, 0);

  // legs and sandals
  ctx.fillStyle = hero.shadow ? '#232038' : '#3a3f55';
  rect(ctx, -15, -26, 11, 24);
  rect(ctx, 4, -26, 11, 24);
  ctx.fillStyle = '#8a6b45';
  rect(ctx, -17, -4, 15, 5);
  rect(ctx, 3, -4, 15, 5);

  // tunic body
  ctx.fillStyle = main;
  ctx.beginPath();
  ctx.moveTo(-19, -78);
  ctx.lineTo(19, -78);
  ctx.lineTo(24, -24);
  ctx.lineTo(-24, -24);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = deep;
  ctx.beginPath();
  ctx.moveTo(-19, -78);
  ctx.lineTo(19, -78);
  ctx.lineTo(21, -58);
  ctx.lineTo(-21, -58);
  ctx.closePath();
  ctx.fill();
  // belt and trim
  ctx.fillStyle = '#2e2a26';
  rect(ctx, -23, -34, 46, 8);
  ctx.fillStyle = trim;
  rect(ctx, -4, -36, 8, 12);

  // arms
  const armSwing = pose === 'attack' ? -14 : pose === 'cheer' ? -20 : Math.sin(t * 2.4 + hero.seed % 7) * 2;
  ctx.fillStyle = main;
  ctx.save();
  ctx.translate(-20, -72);
  ctx.rotate(0.5 + (pose === 'cheer' ? -1.9 : 0));
  rect(ctx, -5, 0, 10, 30);
  ctx.restore();
  ctx.save();
  ctx.translate(20, -72);
  ctx.rotate(-0.5 + armSwing * 0.04);
  rect(ctx, -5, 0, 10, 30);
  ctx.restore();
  // hands
  ctx.fillStyle = hero.shadow ? '#7d7466' : hero.skin;
  ellipse(ctx, -27, -42, 6, 6);
  ellipse(ctx, 27, -42, 6, 6);

  drawWeapon(ctx, hero, main, deep, pose);

  // head
  const hy = -96;
  ctx.fillStyle = hero.shadow ? '#9a8f83' : hero.skin;
  ellipse(ctx, 0, hy, 24, 22);
  // ears
  ellipse(ctx, -24, hy + 2, 5, 7);
  ellipse(ctx, 24, hy + 2, 5, 7);

  drawHair(ctx, hero, hy);

  // headband: band, knot and two tails in the element colour
  ctx.fillStyle = hero.shadow ? '#6e1f2a' : el.color;
  rect(ctx, -24, hy - 10, 48, 9);
  ctx.fillStyle = hero.shadow ? '#571622' : el.deep;
  ctx.beginPath();
  const sway = Math.sin(t * 3 + hero.seed) * 3;
  ctx.moveTo(20, hy - 8);
  ctx.lineTo(34 + sway, hy + 14);
  ctx.lineTo(27 + sway, hy + 16);
  ctx.lineTo(15, hy - 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = trim;
  ellipse(ctx, 0, hy - 6, 4.5, 4.5);

  // face: eyes (red for the shadow clan), brows, mouth
  const blink = Math.sin(t * 0.9 + hero.seed * 2) > 0.97 ? 0.15 : 1;
  ctx.fillStyle = hero.shadow ? '#ff5252' : '#26221f';
  if (pose === 'down') {
    ctx.fillRect(-13, hy + 1, 8, 2);
    ctx.fillRect(-4, hy + 1, 8, 2);
  } else {
    ellipse(ctx, -9, hy + 2, 3.2, 4.4 * blink);
    ellipse(ctx, 9, hy + 2, 3.2, 4.4 * blink);
  }
  ctx.strokeStyle = hero.shadow ? '#3a0d14' : '#4a3826';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-13, hy - 5);
  ctx.lineTo(-5, hy - 3);
  ctx.moveTo(13, hy - 5);
  ctx.lineTo(5, hy - 3);
  ctx.stroke();
  ctx.fillStyle = hero.shadow ? '#3a0d14' : '#7a4a3a';
  if (pose === 'cheer') ellipse(ctx, 0, hy + 11, 4, 5);
  else rect(ctx, -3, hy + 10, 6, 2);

  // hit flash: a white sheet over the silhouette
  if (opts.flash > 0) {
    ctx.globalAlpha = Math.min(0.75, opts.flash) * (opts.alpha !== undefined ? opts.alpha : 1);
    ctx.fillStyle = '#ffffff';
    ellipse(ctx, 0, -58, 34, 62);
    ctx.globalAlpha = opts.alpha !== undefined ? opts.alpha : 1;
  }

  ctx.restore();
}

/** Hair in four seeded styles: spiky, topknot, long, swept crest. */
function drawHair(ctx, hero, hy) {
  const color = hero.shadow ? '#191725' : hero.hairColor;
  ctx.fillStyle = color;
  if (hero.hair === 0) {
    ctx.beginPath();
    for (let i = 0; i < 5; i += 1) {
      const bx = -20 + i * 10;
      ctx.moveTo(bx, hy - 12);
      ctx.lineTo(bx + 5, hy - 30 - (i % 2) * 5);
      ctx.lineTo(bx + 10, hy - 12);
    }
    ctx.fill();
  } else if (hero.hair === 1) {
    ctx.beginPath();
    ctx.arc(0, hy - 13, 23, Math.PI, Math.PI * 2);
    ctx.fill();
    ellipse(ctx, 0, hy - 34, 8, 8);
    rect(ctx, -1.5, hy - 44, 3, 12);
  } else if (hero.hair === 2) {
    ctx.beginPath();
    ctx.arc(0, hy - 12, 23, Math.PI, Math.PI * 2);
    ctx.fill();
    rect(ctx, -25, hy - 12, 9, 42);
    rect(ctx, 16, hy - 12, 9, 42);
  } else {
    ctx.beginPath();
    ctx.moveTo(-22, hy - 10);
    ctx.quadraticCurveTo(0, hy - 40, 22, hy - 12);
    ctx.quadraticCurveTo(8, hy - 20, 0, hy - 14);
    ctx.quadraticCurveTo(-10, hy - 20, -22, hy - 10);
    ctx.fill();
  }
}

/** The class weapon, held on the hero's right side (before any flip). */
function drawWeapon(ctx, hero, main, deep, pose) {
  const raised = pose === 'attack' ? -16 : 0;
  ctx.save();
  ctx.translate(30, -46 + raised);
  ctx.strokeStyle = '#cfd6dd';
  ctx.fillStyle = '#cfd6dd';
  ctx.lineWidth = 4;
  if (hero.cls === 'Blade') {
    ctx.rotate(-0.5 + (pose === 'attack' ? -0.7 : 0));
    ctx.beginPath();
    ctx.moveTo(0, 10);
    ctx.lineTo(4, -34);
    ctx.stroke();
    ctx.fillStyle = '#8a6b45';
    ctx.fillRect(-4, 8, 12, 5);
    ctx.fillRect(-1, 12, 5, 12);
  } else if (hero.cls === 'Assassin') {
    ctx.rotate(-0.4);
    ctx.beginPath();
    ctx.moveTo(0, 6);
    ctx.lineTo(3, -18);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-14, 16);
    ctx.lineTo(-11, -4);
    ctx.stroke();
    ctx.fillStyle = '#8a6b45';
    ctx.fillRect(-3, 4, 7, 8);
    ctx.fillRect(-16, 14, 7, 8);
  } else if (hero.cls === 'Guardian') {
    ctx.translate(-6, 6);
    ctx.fillStyle = deep;
    ctx.beginPath();
    ctx.moveTo(-16, -30);
    ctx.lineTo(16, -30);
    ctx.lineTo(16, 6);
    ctx.quadraticCurveTo(0, 22, -16, 6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = main;
    ctx.beginPath();
    ctx.moveTo(-10, -24);
    ctx.lineTo(10, -24);
    ctx.lineTo(10, 4);
    ctx.quadraticCurveTo(0, 14, -10, 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f3e9d2';
    ellipse(ctx, 0, -10, 4, 4);
  } else if (hero.cls === 'Medic') {
    ctx.rotate(0.25);
    ctx.strokeStyle = '#8a6b45';
    ctx.beginPath();
    ctx.moveTo(0, 18);
    ctx.lineTo(0, -36);
    ctx.stroke();
    ctx.strokeStyle = '#e5484d';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-8, -30);
    ctx.lineTo(8, -30);
    ctx.moveTo(0, -38);
    ctx.lineTo(0, -22);
    ctx.stroke();
  } else {
    // Caster: a rod and a floating orb of the hero's element
    ctx.rotate(0.2);
    ctx.strokeStyle = '#5d4037';
    ctx.beginPath();
    ctx.moveTo(0, 18);
    ctx.lineTo(2, -30);
    ctx.stroke();
    const orbColor = ELEMENTS[hero.element].color;
    ctx.fillStyle = orbColor;
    ellipse(ctx, 3, -38, 8, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ellipse(ctx, 0, -41, 3, 3);
  }
  ctx.restore();
}

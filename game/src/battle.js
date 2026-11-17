// The battle engine: a watchable auto-battler. Units fill an ATB gauge by speed, then act on
// their own — basic attacks, cooldown skills, team buffs and (for enemies) ultimates — while
// the player fires charged ultimates by hand. Melee classes must cut through the front row;
// ranged classes may strike any row. The engine is pure logic plus presentation state
// (floaters, banners, cut-ins, shake) that render.js draws; it never touches the DOM.

import {
  BATTLE, endlessGemReward, endlessXpReward, stageGemReward, stageXpReward,
} from './config.js';
import { BOSS_NAMES, CLASSES, ELEMENTS, ENDLESS_BOSS_NAME, elementMultiplier } from './data.js';
import { gainXp, generateHero, heroStats } from './heroes.js';

export class Battle {
  /**
   * team: [{ hero, row }] for the player. stage 1..10 for campaign, or endless: true.
   * rng drives every roll inside the battle so a seed replays the same fight.
   */
  constructor({ team, stage = 1, endless = false, rng }) {
    this.rng = rng;
    this.stage = stage;
    this.endless = endless;
    this.state = 'fighting'; // fighting | between | won | lost | fled
    this.time = 0;
    this.wave = 0;
    this.wavesCleared = 0;
    this.events = [];
    this.floaters = [];
    this.cutin = null;
    this.banner = null;
    this.shake = 0;
    this.rewards = null;
    this.betweenT = 0;
    this.sideBuffs = {
      player: { atkAmt: 0, atkTurns: 0, defAmt: 0, defTurns: 0 },
      enemy: { atkAmt: 0, atkTurns: 0, defAmt: 0, defTurns: 0 },
    };
    this.units = team.map(({ hero, row }, i) => this.makeUnit(hero, 'player', row, i, 1));
    this.spawnWave(1);
    this.layout();
  }

  makeUnit(hero, side, row, slot, scale) {
    const s = heroStats(hero);
    return {
      hero,
      side,
      row,
      slot,
      maxHp: Math.max(1, Math.round(s.maxHp * scale)),
      hp: Math.max(1, Math.round(s.maxHp * scale)),
      atk: s.atk * scale,
      def: s.def * scale,
      spd: s.spd,
      gauge: this.rng.range(0, 260),
      ult: 0,
      cd: this.rng.int(0, 1),
      alive: true,
      flashT: 0,
      lungeT: 0,
      castT: 0,
      deathT: 0,
      x: 0,
      y: 0,
    };
  }

  // --- composition -------------------------------------------------------------------------

  enemyScale(wave) {
    if (this.endless) return 1.9 + (wave - 1) * BATTLE.endlessStatGrowth;
    return 0.7 + (this.stage - 1) * BATTLE.stageStatGrowth + (wave - 1) * BATTLE.waveStatGrowth;
  }

  /** Enemies per wave: a gentle 2/3/3 on stage 1, the standard 3/4/4, then 3/4/5 late. */
  waveSize(wave) {
    if (this.endless) return 4;
    if (this.stage <= 1) return [2, 3, 3][wave - 1];
    if (this.stage >= 6) return [3, 4, 5][wave - 1];
    return [3, 4, 4][wave - 1];
  }

  isBossWave(wave) {
    if (this.endless) return wave % 5 === 0;
    return BATTLE.bossStages.includes(this.stage) && wave === BATTLE.wavesPerStage;
  }

  spawnWave(wave) {
    this.wave = wave;
    const scale = this.enemyScale(wave);
    const bossWave = this.isBossWave(wave);
    const count = this.waveSize(Math.min(wave, BATTLE.wavesPerStage));
    const foes = [];
    let medics = 0;
    for (let i = 0; i < count; i += 1) {
      const isBoss = bossWave && i === 0;
      const rarity = isBoss
        ? (this.stage >= 10 || this.endless ? 'Legendary' : 'Epic')
        : this.rollEnemyRarity();
      // at most one enemy Medic per wave: two healers on one side stall a battle out
      let cls = null;
      for (let tries = 0; tries < 6 && cls === null; tries += 1) {
        const rolled = this.rng.pick(['Blade', 'Assassin', 'Guardian', 'Medic', 'Caster']);
        if (rolled !== 'Medic' || medics === 0) cls = rolled;
      }
      if (cls === 'Medic') medics += 1;
      // Enemies are generated at level 1: the stage scale alone carries their strength
      // (applying level growth as well would double-count it). The displayed level is
      // stamped on afterwards, once the unit's stats are already computed.
      const hero = generateHero(this.rng, {
        shadow: true,
        rarity,
        cls: cls || 'Blade',
        boss: isBoss,
        bossName: this.endless ? ENDLESS_BOSS_NAME : BOSS_NAMES[this.stage === 5 ? 0 : 1],
        level: 1,
      });
      const row = isBoss || i < 2 ? 'front' : 'back';
      const unit = this.makeUnit(hero, 'enemy', row, i, scale);
      hero.level = this.endless ? wave : this.stage + wave - 1;
      foes.push(unit);
    }
    this.units = this.units.filter((u) => u.side === 'player').concat(foes);
    this.banner = { text: bossWave ? 'The boss approaches!' : `Wave ${wave}`, t: 0, dur: 1.5 };
    this.events.push({ type: 'wave', wave, boss: bossWave });
    this.layout();
  }

  /** Enemy rarity climbs with the stage: late stages field Epics and the odd Legendary. */
  rollEnemyRarity() {
    const stage = this.endless ? 9 : this.stage;
    const common = Math.max(10, 62 - stage * 5);
    const rare = 32;
    const epic = stage >= 5 ? 10 + (stage - 5) * 2 : 3;
    const legendary = stage >= 9 ? (stage - 8) * 3 : 0;
    const idx = this.rng.pickWeighted([common, rare, epic, legendary]);
    return ['Common', 'Rare', 'Epic', 'Legendary'][idx];
  }

  /** Battlefield positions: players on the left facing right, enemies mirrored. */
  layout() {
    const place = (units, frontX, backX) => {
      for (const row of ['front', 'back']) {
        const list = units.filter((u) => u.row === row);
        list.forEach((u, i) => {
          u.x = row === 'front' ? frontX : backX;
          u.y = 472 + (i - (list.length - 1) / 2) * 126;
        });
      }
    };
    place(this.units.filter((u) => u.side === 'player'), 452, 312);
    place(this.units.filter((u) => u.side === 'enemy'), 828, 968);
  }

  // --- queries -------------------------------------------------------------------------------

  get players() {
    return this.units.filter((u) => u.side === 'player');
  }

  get foes() {
    return this.units.filter((u) => u.side === 'enemy');
  }

  alliesOf(unit) {
    return this.units.filter((u) => u.side === unit.side && u.alive);
  }

  foesOf(unit) {
    return this.units.filter((u) => u.side !== unit.side && u.alive);
  }

  effAtk(unit) {
    const buff = this.sideBuffs[unit.side];
    return unit.atk * (buff.atkTurns > 0 ? 1 + buff.atkAmt : 1);
  }

  effDef(unit) {
    const buff = this.sideBuffs[unit.side];
    return unit.def * (buff.defTurns > 0 ? 1 + buff.defAmt : 1);
  }

  /** Melee strikes the front row while it stands; ranged picks freely. Lowest HP first. */
  pickTarget(unit) {
    const foes = this.foesOf(unit);
    if (foes.length === 0) return null;
    let pool = foes;
    if (!CLASSES[unit.hero.cls].ranged) {
      const front = foes.filter((f) => f.row === 'front');
      if (front.length > 0) pool = front;
    }
    pool.sort((a, b) => a.hp - b.hp);
    return pool[0];
  }

  weakestAlly(unit) {
    const allies = this.alliesOf(unit);
    allies.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
    return allies[0] || null;
  }

  // --- damage and healing ----------------------------------------------------------------------

  dealDamage(source, target, power, opts = {}) {
    if (!target || !target.alive) return 0;
    const raw = this.effAtk(source) * power;
    const mitigated = raw * (100 / (100 + this.effDef(target)));
    const element = opts.noElement ? 1 : elementMultiplier(source.hero.element, target.hero.element);
    const variance = this.rng.range(BATTLE.varianceLo, BATTLE.varianceHi);
    const crit = !opts.noCrit && this.rng.chance(BATTLE.critChance);
    let dmg = Math.max(1, Math.round(mitigated * element * variance * (crit ? BATTLE.critMult : 1)));
    target.hp -= dmg;
    target.flashT = 0.22;
    // Taking hits charges the ultimate — but enemies charge at half rate, or a focused
    // shadow unit would answer every player ultimate with one of its own.
    const meterRate = target.side === 'enemy' ? 0.5 : 1;
    target.ult = Math.min(BATTLE.ultMax, target.ult + Math.min(30, (dmg / target.maxHp) * 150) * meterRate);
    this.addFloater(target, `-${dmg}`, crit ? '#ffd94d' : '#ffffff', crit ? 26 : 20);
    this.events.push({ type: crit ? 'crit' : 'hit', source, target, dmg });
    if (crit) this.shake = Math.max(this.shake, 3.5);
    if (target.hp <= 0) {
      target.hp = 0;
      target.alive = false;
      target.deathT = 0.0001;
      this.events.push({ type: 'death', unit: target });
      if (target.hero.boss) this.shake = Math.max(this.shake, 8);
    }
    return dmg;
  }

  dealHeal(source, target, power) {
    if (!target || !target.alive) return 0;
    const amount = Math.max(1, Math.round(this.effAtk(source) * power * this.rng.range(0.95, 1.05)));
    const healed = Math.min(amount, target.maxHp - target.hp);
    target.hp += healed;
    if (healed > 0) this.addFloater(target, `+${healed}`, '#58d977', 20);
    this.events.push({ type: 'heal', source, target, dmg: healed });
    return healed;
  }

  addFloater(unit, text, color, size) {
    this.floaters.push({
      x: unit.x + this.rng.range(-14, 14),
      y: unit.y - 138,
      text,
      color,
      size,
      t: 0,
      dur: 0.95,
    });
  }

  // --- actions -----------------------------------------------------------------------------------

  /** Execute a unit's skill (or ultimate, when viaUlt) against the current field. */
  useSkill(unit, skill, viaUlt) {
    const kind = skill.kind;
    unit.castT = 0.35;
    if (kind === 'damage' || kind === 'nuke') {
      const target = this.pickTarget(unit);
      if (target) this.dealDamage(unit, target, skill.power);
    } else if (kind === 'aoe') {
      for (const foe of this.foesOf(unit)) this.dealDamage(unit, foe, skill.power);
    } else if (kind === 'heal') {
      this.dealHeal(unit, this.weakestAlly(unit), skill.power);
    } else if (kind === 'healAll') {
      for (const ally of this.alliesOf(unit)) this.dealHeal(unit, ally, skill.power);
    } else if (kind === 'buffAtk' || kind === 'buffDef') {
      const buff = this.sideBuffs[unit.side];
      if (kind === 'buffAtk') { buff.atkAmt = skill.power; buff.atkTurns = 3; }
      else { buff.defAmt = skill.power; buff.defTurns = 3; }
      this.events.push({ type: 'buff', unit });
      for (const ally of this.alliesOf(unit)) this.addFloater(ally, kind === 'buffAtk' ? 'ATK UP' : 'DEF UP', '#ffd94d', 15);
    } else if (kind === 'guardAll') {
      for (const ally of this.alliesOf(unit)) this.dealHeal(unit, ally, skill.power);
      const buff = this.sideBuffs[unit.side];
      buff.defAmt = 0.25;
      buff.defTurns = 3;
    }
    this.events.push({ type: viaUlt ? 'ult' : 'skill', unit, skill });
  }

  /** Decide and perform one unit's action: enemy ult, then skill policy, then a basic attack. */
  takeAction(unit) {
    const buff = this.sideBuffs[unit.side];
    if (buff.atkTurns > 0) buff.atkTurns -= 1;
    if (buff.defTurns > 0) buff.defTurns -= 1;

    if (unit.side === 'enemy' && unit.ult >= BATTLE.ultMax) {
      unit.ult = 0;
      this.cutin = { unit, t: 0, dur: 1.3 };
      this.shake = Math.max(this.shake, 6);
      this.useSkill(unit, unit.hero.ult, true);
      return;
    }

    if (unit.cd > 0) unit.cd -= 1;
    const skill = unit.hero.skill;
    const actGain = unit.side === 'enemy' ? BATTLE.ultGainOnAct * 0.55 : BATTLE.ultGainOnAct;
    if (unit.cd <= 0 && this.skillWorthUsing(unit, skill)) {
      unit.cd = skill.cooldown;
      this.useSkill(unit, skill, false);
      unit.ult = Math.min(BATTLE.ultMax, unit.ult + actGain);
      return;
    }

    // basic attack
    const target = this.pickTarget(unit);
    if (target) {
      if (CLASSES[unit.hero.cls].ranged) unit.castT = 0.3;
      else unit.lungeT = 0.28;
      this.dealDamage(unit, target, 1);
    }
    unit.ult = Math.min(BATTLE.ultMax, unit.ult + actGain);
  }

  skillWorthUsing(unit, skill) {
    switch (skill.kind) {
      case 'heal': {
        const weakest = this.weakestAlly(unit);
        return weakest && weakest.hp / weakest.maxHp < 0.8;
      }
      case 'healAll': {
        const allies = this.alliesOf(unit);
        const hurt = allies.filter((a) => a.hp / a.maxHp < 0.85).length;
        return hurt >= 2 || allies.some((a) => a.hp / a.maxHp < 0.45);
      }
      case 'buffAtk':
        return this.sideBuffs[unit.side].atkTurns <= 0;
      case 'buffDef':
        return this.sideBuffs[unit.side].defTurns <= 0;
      case 'guardAll':
        return this.alliesOf(unit).some((a) => a.hp / a.maxHp < 0.7);
      default:
        return true; // damage, aoe, nuke: fire on sight
    }
  }

  /** The player's lever: fire a team member's charged ultimate. Index is into this.players. */
  tryUlt(index) {
    if (this.state !== 'fighting') return false;
    const unit = this.players[index];
    if (!unit || !unit.alive || unit.ult < BATTLE.ultMax) return false;
    unit.ult = 0;
    this.cutin = { unit, t: 0, dur: 1.5 };
    this.shake = Math.max(this.shake, 6);
    this.useSkill(unit, unit.hero.ult, true);
    this.checkEnd();
    return true;
  }

  flee() {
    if (this.state !== 'fighting' && this.state !== 'between') return;
    this.state = 'fled';
    if (this.endless) this.finishRewards(false);
    this.events.push({ type: 'flee' });
  }

  // --- flow ----------------------------------------------------------------------------------------

  update(dt) {
    this.time += dt;
    for (const f of this.floaters) f.t += dt;
    this.floaters = this.floaters.filter((f) => f.t < f.dur);
    if (this.banner) {
      this.banner.t += dt;
      if (this.banner.t > this.banner.dur) this.banner = null;
    }
    if (this.cutin) {
      this.cutin.t += dt;
      if (this.cutin.t > this.cutin.dur) this.cutin = null;
    }
    this.shake = Math.max(0, this.shake - dt * 26);
    for (const u of this.units) {
      u.flashT = Math.max(0, u.flashT - dt);
      u.lungeT = Math.max(0, u.lungeT - dt);
      u.castT = Math.max(0, u.castT - dt);
      if (!u.alive && u.deathT > 0) u.deathT += dt;
    }
    if (this.state === 'between') {
      this.betweenT -= dt;
      if (this.betweenT <= 0) {
        this.state = 'fighting';
        this.spawnWave(this.wave + 1);
      }
      return;
    }
    if (this.state !== 'fighting') return;

    for (const u of this.units) {
      if (u.alive) u.gauge += u.spd * BATTLE.atbPerSpd * dt;
    }
    // act in speed order among the ready, one action each per pass
    const ready = this.units
      .filter((u) => u.alive && u.gauge >= BATTLE.atbMax)
      .sort((a, b) => b.spd - a.spd);
    for (const unit of ready) {
      if (!unit.alive || this.state !== 'fighting') continue;
      unit.gauge -= BATTLE.atbMax;
      this.takeAction(unit);
      if (this.checkEnd()) break;
    }
  }

  /** Returns true when the battle just ended or moved between waves. */
  checkEnd() {
    if (this.state !== 'fighting') return false;
    const playersAlive = this.players.some((u) => u.alive);
    if (!playersAlive) {
      this.state = 'lost';
      if (this.endless) this.finishRewards(false);
      this.events.push({ type: 'lose' });
      return true;
    }
    const foesAlive = this.foes.some((u) => u.alive);
    if (!foesAlive) {
      this.wavesCleared = this.wave;
      if (!this.endless && this.wave >= BATTLE.wavesPerStage) {
        this.state = 'won';
        this.finishRewards(true);
        this.events.push({ type: 'win' });
      } else {
        this.state = 'between';
        this.betweenT = 1.5;
        this.events.push({ type: 'waveclear', wave: this.wave });
      }
      return true;
    }
    return false;
  }

  /**
   * Compute (and for XP, apply) the spoils exactly once. Gem totals are reported for the UI
   * to credit; hero XP is applied here so level-ups can be shown on the results screen.
   */
  finishRewards(won) {
    if (this.rewards) return;
    let gems = 0;
    let xpEach = 0;
    if (this.endless) {
      gems = endlessGemReward(this.wavesCleared);
      xpEach = endlessXpReward(this.wavesCleared);
    } else if (won) {
      gems = stageGemReward(this.stage, this.rng);
      xpEach = stageXpReward(this.stage);
    }
    const xpGains = [];
    for (const unit of this.players) {
      const amount = unit.alive ? xpEach : Math.floor(xpEach / 2);
      const levels = amount > 0 ? gainXp(unit.hero, amount) : 0;
      xpGains.push({ hero: unit.hero, xp: amount, levels, survived: unit.alive });
      if (levels > 0) this.events.push({ type: 'levelup', unit });
    }
    this.rewards = {
      won,
      endless: this.endless,
      stage: this.stage,
      waves: this.wavesCleared,
      gems,
      xpGains,
    };
  }
}

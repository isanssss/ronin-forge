// The battle engine: a watchable auto-battler. Units fill an ATB gauge by speed, then act on
// their own — basic attacks, cooldown skills, team buffs and (for enemies) ultimates — while
// the player fires charged ultimates by hand. Melee classes must cut through the front row;
// ranged classes may strike any row. The engine is pure logic plus presentation state
// (floaters, banners, cut-ins, shake) that render.js draws; it never touches the DOM.

import {
  BATTLE, endlessGemReward, endlessXpReward, stageGemReward, stageXpReward,
} from './config.js';
import {
  BOSS_NAMES, CLASSES, ELEMENT_STATUS, ENDLESS_BOSS_NAME, STAGE_MODIFIERS, STATUS_EFFECTS,
  biomeForStage, elementMultiplier,
} from './data.js';
import { GEAR_ITEMS } from './gear.js';
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
    // the stage's omen (stages 6-10) and the biome it is fought in
    this.modifier = endless ? null : (STAGE_MODIFIERS[stage] || null);
    this.biome = biomeForStage(stage, endless);
    this.ultFx = null; // the element spectacle of the most recent ultimate, aged by update()
    this.auraT = 0; // Lantern Aura mend timer
    this.units = team.map(({ hero, row }, i) => this.makeUnit(hero, 'player', row, i, 1));
    this.spawnWave(1);
    this.layout();
  }

  makeUnit(hero, side, row, slot, scale) {
    const s = heroStats(hero);
    const unit = {
      hero,
      side,
      row,
      slot,
      maxHp: Math.max(1, Math.round(s.maxHp * scale)),
      hp: Math.max(1, Math.round(s.maxHp * scale)),
      atk: s.atk * scale,
      def: s.def * scale,
      spd: s.spd,
      // Swift Start: the passive opens the fight already halfway to acting
      gauge: hero.passive && hero.passive.id === 'swift' ? BATTLE.atbMax / 2 : this.rng.range(0, 260),
      ult: 0,
      cd: this.rng.int(0, 1),
      alive: true,
      statuses: [], // [{ kind, t, tickT, tickDmg }] — at most one per kind
      secondWindUsed: false,
      flashT: 0,
      lungeT: 0,
      castT: 0,
      deathT: 0,
      x: 0,
      y: 0,
    };
    if (side === 'enemy' && this.modifier && this.modifier.enemySpdMult) {
      unit.spd *= this.modifier.enemySpdMult;
    }
    return unit;
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
    let atk = unit.atk * (buff.atkTurns > 0 ? 1 + buff.atkAmt : 1);
    if (unit.side === 'enemy' && this.modifier && this.modifier.enemyAtkMult) {
      atk *= this.modifier.enemyAtkMult;
    }
    return atk;
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
    let mitigated = raw * (100 / (100 + this.effDef(target)));
    // a stage omen can empower one element in the player's hands
    if (this.modifier && this.modifier.elementBoost && source.side === 'player'
      && source.hero.element === this.modifier.elementBoost.element) {
      mitigated *= this.modifier.elementBoost.mult;
    }
    const element = opts.noElement ? 1 : elementMultiplier(source.hero.element, target.hero.element);
    const variance = this.rng.range(BATTLE.varianceLo, BATTLE.varianceHi);
    const critChance = BATTLE.critChance + (source.hero.passive && source.hero.passive.id === 'focus' ? 0.12 : 0);
    const crit = !opts.noCrit && this.rng.chance(critChance);
    let dmg = mitigated * element * variance * (crit ? BATTLE.critMult : 1);
    // passives that shape the hit itself
    if (source.hero.passive && source.hero.passive.id === 'executioner' && target.hp / target.maxHp < 0.35) dmg *= 1.3;
    if (target.hero.passive && target.hero.passive.id === 'ironskin') dmg *= 0.88;
    dmg = Math.max(1, Math.round(dmg));
    target.hp -= dmg;
    target.flashT = 0.22;
    // Taking hits charges the ultimate — but enemies charge at half rate, or a focused
    // shadow unit would answer every player ultimate with one of its own. Stage omens
    // can hasten or slow the charge for everyone, or for the player alone.
    let meterRate = target.side === 'enemy' ? 0.5 : 1;
    if (this.modifier && this.modifier.ultRateAll) meterRate *= this.modifier.ultRateAll;
    if (target.side === 'player' && this.modifier && this.modifier.ultRatePlayer) meterRate *= this.modifier.ultRatePlayer;
    target.ult = Math.min(BATTLE.ultMax, target.ult + Math.min(30, (dmg / target.maxHp) * 150) * meterRate);
    this.addFloater(target, `-${dmg}`, crit ? '#ffd94d' : '#ffffff', crit ? 26 : 20);
    this.events.push({ type: crit ? 'crit' : 'hit', source, target, dmg });
    if (crit) this.shake = Math.max(this.shake, 3.5);
    // Second Wind: once per battle the passive refuses a killing blow
    if (target.hp <= 0 && target.hero.passive && target.hero.passive.id === 'secondwind' && !target.secondWindUsed) {
      target.secondWindUsed = true;
      target.hp = Math.round(target.maxHp * 0.3);
      this.addFloater(target, 'SECOND WIND!', '#ffd94d', 21);
      this.events.push({ type: 'secondwind', unit: target });
    }
    if (target.hp <= 0) {
      target.hp = 0;
      target.alive = false;
      target.deathT = 0.0001;
      target.statuses = [];
      this.events.push({ type: 'death', unit: target });
      if (target.hero.boss) this.shake = Math.max(this.shake, 8);
    }
    // Crimson Siphon drinks from every wound it opens
    if (source.alive && source.hero.passive && source.hero.passive.id === 'lifesteal') {
      const healed = Math.min(Math.floor(dmg * 0.15), source.maxHp - source.hp);
      if (healed >= 3) {
        source.hp += healed;
        this.addFloater(source, `+${healed}`, '#ff9a86', 13);
      }
    }
    // Thorn Mantle answers a surviving wearer's attacker — raw, and it can kill
    if (target.alive && target.hero.passive && target.hero.passive.id === 'thorns' && source.alive && source !== target) {
      const reflected = Math.max(1, Math.round(dmg * 0.2));
      source.hp -= reflected;
      source.flashT = Math.max(source.flashT, 0.15);
      this.addFloater(source, `-${reflected}`, '#d8b36a', 14);
      if (source.hp <= 0) {
        source.hp = 0;
        source.alive = false;
        source.deathT = 0.0001;
        source.statuses = [];
        this.events.push({ type: 'death', unit: source });
      }
    }
    // the attacker's element lingers on the wounded — skills always, basics sometimes
    if (target.alive && !opts.noStatus) this.tryApplyStatus(source, target, Boolean(opts.fromSkill));
    return dmg;
  }

  // --- status effects --------------------------------------------------------------------------------

  /** Roll the attacker's element status onto a target (see ELEMENT_STATUS for the odds). */
  tryApplyStatus(source, target, fromSkill) {
    const mapping = ELEMENT_STATUS[source.hero.element];
    if (!mapping) return;
    const chance = fromSkill ? mapping.skillChance : mapping.basicChance;
    if (!this.rng.chance(chance)) return;
    this.applyStatus(source, target, mapping.kind);
  }

  /** Attach (or refresh) one status on a target, announcing it with a floater. */
  applyStatus(source, target, kind) {
    const def = STATUS_EFFECTS[kind];
    let entry = target.statuses.find((s) => s.kind === kind);
    if (!entry) {
      entry = { kind, t: 0, tickT: 0, tickDmg: 0 };
      target.statuses.push(entry);
    }
    entry.t = def.duration;
    entry.tickT = 0;
    if (def.tickDamage) {
      entry.tickDmg = Math.max(entry.tickDmg, Math.max(1, Math.round(this.effAtk(source) * def.tickDamage)));
    }
    this.addFloater(target, def.applyText, def.color, 16);
    this.events.push({ type: 'status', unit: target, kind });
  }

  /** How fast a unit's action gauge fills right now: Chill and Root drag on it. */
  gaugeRate(unit) {
    let rate = 1;
    for (const s of unit.statuses) {
      const def = STATUS_EFFECTS[s.kind];
      if (def.gaugeRate) rate = Math.min(rate, def.gaugeRate);
    }
    return rate;
  }

  /** If the unit is Stunned, eat the status and its action with it. */
  consumeStun(unit) {
    const idx = unit.statuses.findIndex((s) => s.kind === 'Stun');
    if (idx < 0) return false;
    unit.statuses.splice(idx, 1);
    return true;
  }

  /** Age every status: damage-over-time ticks land, expiries announce themselves. */
  processStatuses(dt) {
    for (const unit of this.units) {
      if (!unit.alive || unit.statuses.length === 0) continue;
      for (const s of [...unit.statuses]) {
        const def = STATUS_EFFECTS[s.kind];
        s.t -= dt;
        if (def.tickDamage) {
          s.tickT += dt;
          if (s.tickT >= 1 && s.t > 0) {
            s.tickT -= 1;
            unit.hp -= s.tickDmg;
            unit.flashT = Math.max(unit.flashT, 0.12);
            this.addFloater(unit, `-${s.tickDmg}`, def.color, 15);
            this.events.push({ type: 'dot', unit, kind: s.kind, dmg: s.tickDmg });
            if (unit.hp <= 0) {
              unit.hp = 0;
              unit.alive = false;
              unit.deathT = 0.0001;
              unit.statuses = [];
              this.events.push({ type: 'death', unit });
              break;
            }
          }
        }
        if (unit.alive && s.t <= 0) {
          unit.statuses = unit.statuses.filter((x) => x !== s);
          if (def.expireText) this.addFloater(unit, def.expireText, '#cbbfa3', 13);
        }
      }
    }
    if (this.state === 'fighting') this.checkEnd();
  }

  /** Lantern Aura: every few seconds, a side holding the passive mends its wounded. */
  processAura(dt) {
    this.auraT += dt;
    if (this.auraT < 3) return;
    this.auraT -= 3;
    for (const side of ['player', 'enemy']) {
      const holders = this.units.some((u) => u.side === side && u.alive && u.hero.passive && u.hero.passive.id === 'aura');
      if (!holders) continue;
      for (const ally of this.alliesOf({ side })) {
        const amount = Math.floor(ally.maxHp * 0.02);
        const healed = Math.min(amount, ally.maxHp - ally.hp);
        if (healed >= 4) {
          ally.hp += healed;
          this.addFloater(ally, `+${healed}`, '#8fe3a8', 12);
        }
      }
    }
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
    if (viaUlt) {
      // the spectacle render.js plays over the field: element, and who it washes over
      const offensive = kind === 'damage' || kind === 'nuke' || kind === 'aoe';
      this.ultFx = {
        element: unit.hero.element,
        kind,
        side: unit.side,
        targets: (offensive ? this.foesOf(unit) : this.alliesOf(unit)).slice(),
        t: 0,
        dur: 0.9,
      };
    }
    if (kind === 'damage' || kind === 'nuke') {
      const target = this.pickTarget(unit);
      if (target) this.dealDamage(unit, target, skill.power, { fromSkill: true });
    } else if (kind === 'aoe') {
      for (const foe of this.foesOf(unit)) this.dealDamage(unit, foe, skill.power, { fromSkill: true });
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
    let actGain = unit.side === 'enemy' ? BATTLE.ultGainOnAct * 0.55 : BATTLE.ultGainOnAct;
    if (this.modifier && this.modifier.ultRateAll) actGain *= this.modifier.ultRateAll;
    if (unit.side === 'player' && this.modifier && this.modifier.ultRatePlayer) actGain *= this.modifier.ultRatePlayer;
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
    if (this.ultFx) {
      this.ultFx.t += dt;
      if (this.ultFx.t > this.ultFx.dur) this.ultFx = null;
    }
    this.shake = Math.max(0, this.shake - dt * 26);
    for (const u of this.units) {
      u.flashT = Math.max(0, u.flashT - dt);
      u.lungeT = Math.max(0, u.lungeT - dt);
      u.castT = Math.max(0, u.castT - dt);
      if (!u.alive && u.deathT > 0) u.deathT += dt;
    }
    if (this.state === 'fighting' || this.state === 'between') {
      this.processStatuses(dt);
      this.processAura(dt);
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
      if (u.alive) u.gauge += u.spd * BATTLE.atbPerSpd * dt * this.gaugeRate(u);
    }
    // act in speed order among the ready, one action each per pass
    const ready = this.units
      .filter((u) => u.alive && u.gauge >= BATTLE.atbMax)
      .sort((a, b) => b.spd - a.spd);
    for (const unit of ready) {
      if (!unit.alive || this.state !== 'fighting') continue;
      unit.gauge -= BATTLE.atbMax;
      // Stun eats the action whole: the gauge is spent, the moment is lost
      if (this.consumeStun(unit)) {
        this.addFloater(unit, 'STUNNED!', '#ffd54f', 17);
        continue;
      }
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
    // cleared stages sometimes yield gear; the UI decides keep vs salvage (duplicates)
    let gear = null;
    if (!this.endless && won && this.rng.chance(0.45)) gear = this.rng.pick(GEAR_ITEMS).id;
    if (this.endless && this.wavesCleared >= 5 && this.rng.chance(0.4)) gear = this.rng.pick(GEAR_ITEMS).id;
    this.rewards = {
      won,
      endless: this.endless,
      stage: this.stage,
      waves: this.wavesCleared,
      gems,
      xpGains,
      gear,
    };
  }
}

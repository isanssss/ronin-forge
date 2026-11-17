// The persistent game: gems, hero roster, the five-hero team and its formation rows, stage
// progress and the endless best, all kept in localStorage as plain JSON (heroes are pure data,
// so they serialise as-is). Every mutation is followed by save() from the UI layer.

import { ECONOMY } from './config.js';
import { PASSIVES } from './data.js';
import { Rng } from './random.js';
import { generateHero, heroKey } from './heroes.js';
import { emptyGear, gearById } from './gear.js';

const SAVE_KEY = 'ronin-forge-save-v1';

export class GameState {
  constructor() {
    this.gems = ECONOMY.startGems;
    this.roster = [];
    this.team = []; // hero ids, up to ECONOMY.teamSize
    this.rows = {}; // hero id -> 'front' | 'back'
    this.cleared = 0; // highest stage cleared, 0..10
    this.endlessBest = 0; // best endless wave reached
    this.seedCounter = 1;
    this.inventory = []; // unequipped gear item ids, dropped by cleared stages
  }

  /** Load the saved game, or start a fresh one (with its three starter heroes) if none parses. */
  static loadOrNew() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.roster) && typeof parsed.gems === 'number') {
          const state = new GameState();
          Object.assign(state, parsed);
          if (!Array.isArray(state.inventory)) state.inventory = [];
          // saves from before passives and gear: backfill both, deterministically by seed
          for (const hero of state.roster) {
            if (!hero.passive) hero.passive = { ...new Rng((hero.seed ^ 0x9e37) >>> 0).pick(PASSIVES) };
            if (!hero.gear) hero.gear = emptyGear();
          }
          return state;
        }
      }
    } catch {
      /* corrupted or unavailable storage: fall through to a fresh game */
    }
    const state = new GameState();
    state.setupStarters();
    state.save();
    return state;
  }

  /** Delete the save entirely (used by Reset, after which loadOrNew starts over). */
  static wipe() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      /* nothing to wipe */
    }
  }

  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this));
    } catch {
      /* storage full or blocked: the session keeps playing in memory */
    }
  }

  /** The three starter heroes: a Guardian, a Blade and a Medic, so stage 1 is playable at once.
   *  Starters are never Common — a new player's first team should feel like a team. */
  setupStarters() {
    const classes = ['Guardian', 'Blade', 'Medic'];
    for (const cls of classes) {
      const rng = new Rng(1000 + this.seedCounter * 7919);
      this.seedCounter += 1;
      const rolled = generateHero(rng, { cls });
      const hero = rolled.rarity === 'Common' ? generateHero(rng, { cls, rarity: 'Rare' }) : rolled;
      this.roster.push(hero);
      this.team.push(hero.id);
      this.rows[hero.id] = cls === 'Medic' ? 'back' : 'front';
    }
  }

  heroById(id) {
    return this.roster.find((h) => h.id === id) || null;
  }

  /** The battle-ready team: [{ hero, row }] in team order, front row first. */
  teamHeroes() {
    const list = [];
    for (const id of this.team) {
      const hero = this.heroById(id);
      if (hero) list.push({ hero, row: this.rows[id] || 'back' });
    }
    list.sort((a, b) => (a.row === b.row ? 0 : a.row === 'front' ? -1 : 1));
    return list;
  }

  rowCount(row) {
    return this.team.filter((id) => (this.rows[id] || 'back') === row).length;
  }

  /** A sensible default row for a class: Guardians and Blades up front, the rest behind. */
  static defaultRow(hero) {
    return hero.cls === 'Guardian' || hero.cls === 'Blade' ? 'front' : 'back';
  }

  addToTeam(id) {
    if (this.team.includes(id) || this.team.length >= ECONOMY.teamSize) return false;
    const hero = this.heroById(id);
    if (!hero) return false;
    let row = GameState.defaultRow(hero);
    if (row === 'front' && this.rowCount('front') >= ECONOMY.frontRowMax) row = 'back';
    if (row === 'back' && this.rowCount('back') >= ECONOMY.backRowMax) row = 'front';
    this.team.push(id);
    this.rows[id] = row;
    return true;
  }

  removeFromTeam(id) {
    this.team = this.team.filter((t) => t !== id);
    delete this.rows[id];
  }

  /** Move a team hero between rows, respecting the 2 front / 3 back caps. Returns success. */
  setRow(id, row) {
    if (!this.team.includes(id)) return false;
    const cap = row === 'front' ? ECONOMY.frontRowMax : ECONOMY.backRowMax;
    if ((this.rows[id] || 'back') !== row && this.rowCount(row) >= cap) return false;
    this.rows[id] = row;
    return true;
  }

  stageUnlocked(stage) {
    return stage >= 1 && stage <= 10 && stage <= this.cleared + 1;
  }

  get endlessUnlocked() {
    return this.cleared >= 10;
  }

  /**
   * Spend gems on one summon. A hero whose first name is already owned merges into that hero
   * as +1 level instead of taking a roster slot. Returns a result object describing the roll.
   */
  performSummon(rng) {
    if (this.gems < ECONOMY.summonCost) return { ok: false, reason: 'gems' };
    const rolled = generateHero(rng);
    const owned = this.roster.find((h) => heroKey(h) === heroKey(rolled));
    if (!owned && this.roster.length >= ECONOMY.rosterMax) return { ok: false, reason: 'full' };
    this.gems -= ECONOMY.summonCost;
    if (owned) {
      owned.level += 1;
      return { ok: true, merged: true, hero: owned, rolled };
    }
    this.roster.push(rolled);
    return { ok: true, merged: false, hero: rolled, rolled };
  }

  // --- gear ------------------------------------------------------------------------------------------

  /** True if a gear id is owned anywhere: in the inventory or on a hero's back. */
  ownsGear(itemId) {
    if (this.inventory.includes(itemId)) return true;
    return this.roster.some((h) => h.gear && Object.values(h.gear).includes(itemId));
  }

  /**
   * Equip an inventory piece onto a hero's slot. Whatever the hero already wore there goes
   * back to the inventory. Returns the piece that came off, or null.
   */
  equipGear(heroId, itemId) {
    const hero = this.heroById(heroId);
    const item = gearById(itemId);
    const at = this.inventory.indexOf(itemId);
    if (!hero || !item || at < 0) return null;
    if (!hero.gear) hero.gear = emptyGear();
    this.inventory.splice(at, 1);
    const previous = hero.gear[item.slot] || null;
    hero.gear[item.slot] = itemId;
    if (previous) this.inventory.push(previous);
    return gearById(previous);
  }

  /** Take a hero's piece in one slot back into the inventory. Returns the piece, or null. */
  unequipGear(heroId, slot) {
    const hero = this.heroById(heroId);
    if (!hero || !hero.gear || !hero.gear[slot]) return null;
    const itemId = hero.gear[slot];
    hero.gear[slot] = null;
    this.inventory.push(itemId);
    return gearById(itemId);
  }
}

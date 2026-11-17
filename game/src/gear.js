// Gear: the twelve equipable pieces that drop from cleared stages. Three slots — Weapon,
// Armor, Charm — one piece per slot per hero, flat stat bonuses that heroStats folds into a
// hero's numbers. This module is pure data and arithmetic: GameState owns the inventory and
// the equip bookkeeping, the Formation screen owns the clicking.

/** The three slots, in display order. */
export const GEAR_SLOTS = ['weapon', 'armor', 'charm'];
export const SLOT_LABELS = { weapon: 'Weapon', armor: 'Armor', charm: 'Charm' };

/** Every piece that can drop. `short` is the cramped Formation button label. */
export const GEAR_ITEMS = [
  { id: 'training-katana', name: 'Training Katana', short: 'Katana', slot: 'weapon', atk: 3, salvage: 35 },
  { id: 'ember-brand', name: 'Ember Brand', short: 'Brand', slot: 'weapon', atk: 5, salvage: 35 },
  { id: 'stormcaller-rod', name: 'Stormcaller Rod', short: 'Rod', slot: 'weapon', atk: 4, spd: 1, salvage: 35 },
  { id: 'shoguns-fang', name: "Shogun's Fang", short: 'Fang', slot: 'weapon', atk: 8, salvage: 35 },
  { id: 'padded-gi', name: 'Padded Gi', short: 'Gi', slot: 'armor', def: 3, hp: 15, salvage: 35 },
  { id: 'ironweave-vest', name: 'Ironweave Vest', short: 'Vest', slot: 'armor', def: 5, hp: 10, salvage: 35 },
  { id: 'mistcloak', name: 'Mistcloak', short: 'Cloak', slot: 'armor', def: 3, spd: 2, salvage: 35 },
  { id: 'warlord-plate', name: 'Warlord Plate', short: 'Plate', slot: 'armor', def: 7, hp: 25, salvage: 35 },
  { id: 'lucky-coin', name: 'Lucky Coin', short: 'Coin', slot: 'charm', hp: 20, salvage: 35 },
  { id: 'fox-bell', name: 'Fox Bell', short: 'Bell', slot: 'charm', spd: 2.5, salvage: 35 },
  { id: 'jade-bead', name: 'Jade Bead', short: 'Bead', slot: 'charm', def: 2, hp: 12, salvage: 35 },
  { id: 'phoenix-feather', name: 'Phoenix Feather', short: 'Feather', slot: 'charm', atk: 3, hp: 15, salvage: 35 },
];

export const GEAR_BY_ID = Object.fromEntries(GEAR_ITEMS.map((item) => [item.id, item]));

/** One piece by id, or null for an empty slot / unknown id. */
export function gearById(id) {
  return id ? GEAR_BY_ID[id] || null : null;
}

/** A fresh, empty set of slots for a newly generated hero. */
export function emptyGear() {
  return { weapon: null, armor: null, charm: null };
}

/** The summed flat bonuses of everything a hero wears: { hp, atk, def, spd }. */
export function gearBonuses(hero) {
  const total = { hp: 0, atk: 0, def: 0, spd: 0 };
  if (!hero.gear) return total;
  for (const slot of GEAR_SLOTS) {
    const item = gearById(hero.gear[slot]);
    if (!item) continue;
    total.hp += item.hp || 0;
    total.atk += item.atk || 0;
    total.def += item.def || 0;
    total.spd += item.spd || 0;
  }
  return total;
}

/** "ATK +5 · SPD +1" — the one-line summary menus and toasts show. */
export function describeGear(item) {
  if (!item) return '';
  const parts = [];
  if (item.atk) parts.push(`ATK +${item.atk}`);
  if (item.def) parts.push(`DEF +${item.def}`);
  if (item.hp) parts.push(`HP +${item.hp}`);
  if (item.spd) parts.push(`SPD +${item.spd}`);
  return parts.join(' · ');
}

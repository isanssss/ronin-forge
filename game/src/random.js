// Seeded randomness. Every roll in the game (hero generation, summons, battle variance,
// enemy rosters, screenshot scenes) goes through one of these generators, so a seed always
// reproduces the same content and no result depends on Math.random.

/** mulberry32: a small, fast 32-bit PRNG with a good enough spread for game content. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Turn an arbitrary string into a stable 32-bit seed (FNV-1a). */
export function hashSeed(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A friendly wrapper around a raw generator: ranges, picks, weighted picks and shuffles. */
export class Rng {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.next = mulberry32(this.seed);
    this.counter = 0;
  }

  /** Float in [0, 1). */
  float() {
    return this.next();
  }

  /** Float in [lo, hi). */
  range(lo, hi) {
    return lo + this.next() * (hi - lo);
  }

  /** Integer in [lo, hi], both ends included. */
  int(lo, hi) {
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }

  /** True with probability p. */
  chance(p) {
    return this.next() < p;
  }

  /** One element of a non-empty array. */
  pick(list) {
    return list[Math.floor(this.next() * list.length)];
  }

  /** Index chosen with probability proportional to weights. */
  pickWeighted(weights) {
    let total = 0;
    for (const w of weights) total += w;
    let roll = this.next() * total;
    for (let i = 0; i < weights.length; i += 1) {
      roll -= weights[i];
      if (roll <= 0) return i;
    }
    return weights.length - 1;
  }

  /** In-place Fisher-Yates shuffle; returns the same array for chaining. */
  shuffle(list) {
    for (let i = list.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.next() * (i + 1));
      const tmp = list[i];
      list[i] = list[j];
      list[j] = tmp;
    }
    return list;
  }

  /** A short unique-ish id for a generated hero, unique within a session's roll sequence. */
  uid(prefix) {
    this.counter += 1;
    return `${prefix}-${this.seed.toString(36)}-${this.counter.toString(36)}-${Math.floor(this.next() * 0xffffff).toString(36)}`;
  }
}

/** Convenience: a fresh generator from any seed value (numbers pass through, strings are hashed). */
export function rngFrom(seed) {
  return new Rng(typeof seed === 'string' ? hashSeed(seed) : seed);
}

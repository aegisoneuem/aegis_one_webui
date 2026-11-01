/**
 * Deterministic pseudo-random source for seeding.
 *
 * Seeds must reproduce byte for byte: a load-test result or a screenshot is
 * worthless if the next run generates a different 50,000 devices. Math.random
 * is never used anywhere in seeding.
 */

/** mulberry32 — small, fast, and good enough for fixture data. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: <T,>(items: readonly T[]): T => {
      const item = items[Math.floor(next() * items.length)];
      if (item === undefined) throw new Error('pick() called with an empty list');
      return item;
    },
    weighted: <T,>(entries: readonly (readonly [T, number])[]): T => {
      const total = entries.reduce((sum, [, w]) => sum + w, 0);
      let roll = next() * total;
      for (const [value, weight] of entries) {
        roll -= weight;
        if (roll <= 0) return value;
      }
      const last = entries[entries.length - 1];
      if (!last) throw new Error('weighted() called with an empty list');
      return last[0];
    },
    chance: (probability) => next() < probability,
    /** Milliseconds within the last `days`, biased towards recent. */
    recentMs: (now, days) => now - Math.floor(next() ** 2 * days * 86_400_000),
  };
}

export interface Rng {
  next: () => number;
  int: (min: number, max: number) => number;
  pick: <T>(items: readonly T[]) => T;
  weighted: <T>(entries: readonly (readonly [T, number])[]) => T;
  chance: (probability: number) => boolean;
  recentMs: (now: number, days: number) => number;
}

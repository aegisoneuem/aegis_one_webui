/**
 * Short-lived in-process cache for estate-wide aggregates.
 *
 * Overview, DEX and the filter facets each sweep the whole device table. The
 * numbers move on the scale of minutes — an endpoint checks in, a patch
 * lands — so recomputing them for every concurrent reader buys nothing and
 * costs a full scan each time. better-sqlite3 is synchronous, so those scans
 * do not merely cost CPU: they block every other request behind them.
 *
 * Deliberately not a general response cache. Anything scoped to one user, or
 * anything a write should invalidate, does not belong here.
 */
export interface CacheOptions {
  /** How long a computed value stays usable. */
  ttlMs: number;
  /** Cap on distinct keys, so a varied key space cannot grow without bound. */
  maxEntries?: number;
}

interface Entry<T> {
  value: T;
  expiresAt: number;
}

export class TtlCache<T> {
  private readonly entries = new Map<string, Entry<T>>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;

  constructor({ ttlMs, maxEntries = 256 }: CacheOptions) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
  }

  /** Returns the cached value, or computes and stores it. */
  get(key: string, compute: () => T): T {
    const hit = this.entries.get(key);
    if (hit && Date.now() < hit.expiresAt) return hit.value;

    const value = compute();
    if (this.entries.size >= this.maxEntries) {
      // Oldest insertion first; Map preserves insertion order.
      const oldest = this.entries.keys().next();
      if (!oldest.done) this.entries.delete(oldest.value);
    }
    this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    return value;
  }

  clear(): void {
    this.entries.clear();
  }
}

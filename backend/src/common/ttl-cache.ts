/**
 * A small in-memory cache for expensive reads that may be a few seconds old. Two guarantees beyond "remember it":
 * - single flight: while a value is being computed, everyone who asks for the same key waits for that one computation instead of
 *   starting their own (so a crowd opening the same screen costs one query, not one each);
 * - failures are never remembered: an error goes to the callers that were waiting, and the next call tries again.
 * It is per process (each backend instance has its own), so a value is at most `ttlMs` old on any instance. `ttlMs <= 0` turns it off.
 */
export class TtlCache<T> {
  private readonly values = new Map<string, { at: number; value: T }>();
  private readonly inFlight = new Map<string, Promise<T>>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 500,
    private readonly clock: () => number = Date.now,
  ) {}

  async get(key: string, compute: () => Promise<T>): Promise<T> {
    if (this.ttlMs <= 0) return compute();
    const now = this.clock();
    const hit = this.values.get(key);
    if (hit && now - hit.at < this.ttlMs) return hit.value;
    const running = this.inFlight.get(key);
    if (running) return running;

    const promise = compute()
      .then((value) => {
        this.values.set(key, { at: this.clock(), value });
        this.trim();
        return value;
      })
      .finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, promise);
    return promise;
  }

  /** Forgets everything (tests, and after a change that must show at once). */
  clear(): void {
    this.values.clear();
  }

  /** Keeps the map small: drops expired entries, then the oldest ones if it is still too big. */
  private trim(): void {
    if (this.values.size <= this.maxEntries) return;
    const now = this.clock();
    for (const [k, v] of this.values) if (now - v.at >= this.ttlMs) this.values.delete(k);
    for (const k of this.values.keys()) {
      if (this.values.size <= this.maxEntries) break;
      this.values.delete(k);
    }
  }
}

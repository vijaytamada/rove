import { TtlCache } from './ttl-cache.js';

const deferred = <T>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('TtlCache', () => {
  it('computes once and then serves the remembered value until it expires', async () => {
    let now = 1_000;
    const cache = new TtlCache<number>(10_000, 500, () => now);
    let calls = 0;
    const compute = async () => ++calls;
    expect(await cache.get('k', compute)).toBe(1);
    expect(await cache.get('k', compute)).toBe(1);
    now += 9_999;
    expect(await cache.get('k', compute)).toBe(1);
    now += 2;
    expect(await cache.get('k', compute)).toBe(2);
    expect(calls).toBe(2);
  });

  it('keeps keys apart', async () => {
    const cache = new TtlCache<string>(10_000);
    expect(await cache.get('a', async () => 'A')).toBe('A');
    expect(await cache.get('b', async () => 'B')).toBe('B');
    expect(await cache.get('a', async () => 'changed')).toBe('A');
  });

  it('single flight: callers who ask while it is being computed share that one computation', async () => {
    const cache = new TtlCache<number>(10_000);
    const gate = deferred<number>();
    let calls = 0;
    const compute = () => {
      calls++;
      return gate.promise;
    };
    const crowd = [cache.get('k', compute), cache.get('k', compute), cache.get('k', compute)];
    expect(calls).toBe(1);
    gate.resolve(42);
    expect(await Promise.all(crowd)).toEqual([42, 42, 42]);
    expect(calls).toBe(1);
  });

  it('never remembers a failure: the waiting callers get the error and the next call tries again', async () => {
    const cache = new TtlCache<number>(10_000);
    const gate = deferred<number>();
    const first = cache.get('k', () => gate.promise);
    const second = cache.get('k', () => gate.promise);
    gate.reject(new Error('database down'));
    await expect(first).rejects.toThrow('database down');
    await expect(second).rejects.toThrow('database down');
    expect(await cache.get('k', async () => 7)).toBe(7);
  });

  it('is off when the time to live is zero: every call computes', async () => {
    const cache = new TtlCache<number>(0);
    let calls = 0;
    await cache.get('k', async () => ++calls);
    await cache.get('k', async () => ++calls);
    expect(calls).toBe(2);
  });

  it('stays small: it drops old entries beyond its limit', async () => {
    let now = 0;
    const cache = new TtlCache<number>(1_000, 3, () => now);
    for (let i = 0; i < 6; i++) {
      now += 10;
      await cache.get(`k${i}`, async () => i);
    }
    // The newest are kept, the oldest forgotten (recomputed on the next ask).
    let recomputed = false;
    await cache.get('k0', async () => ((recomputed = true), 0));
    expect(recomputed).toBe(true);
    let kept = true;
    await cache.get('k5', async () => ((kept = false), 5));
    expect(kept).toBe(true);
  });

  it('clear() forgets everything', async () => {
    const cache = new TtlCache<number>(10_000);
    await cache.get('k', async () => 1);
    cache.clear();
    expect(await cache.get('k', async () => 2)).toBe(2);
  });
});

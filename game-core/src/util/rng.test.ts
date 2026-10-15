
import { describe, it, expect } from 'vitest';
import { makeRng, nextFloat, nextInt, shuffle } from './rng';

describe('RNG', () => {
  it('Determinism: makeRng(42) then 5 nextFloat calls produce the same sequence as a second makeRng(42) run.', () => {
    const rng1 = makeRng(42);
    const float1_1 = nextFloat(rng1).value;
    const float1_2 = nextFloat(rng1).value;
    const float1_3 = nextFloat(rng1).value;
    const float1_4 = nextFloat(rng1).value;
    const float1_5 = nextFloat(rng1).value;

    const rng2 = makeRng(42);
    const float2_1 = nextFloat(rng2).value;
    const float2_2 = nextFloat(rng2).value;
    const float2_3 = nextFloat(rng2).value;
    const float2_4 = nextFloat(rng2).value;
    const float2_5 = nextFloat(rng2).value;

    expect(float1_1).toBe(float2_1);
    expect(float1_2).toBe(float2_2);
    expect(float1_3).toBe(float2_3);
    expect(float1_4).toBe(float2_4);
    expect(float1_5).toBe(float2_5);
  });

  it('Range: 1000 nextFloat values from an rng seeded 7 are all >= 0 and < 1.', () => {
    const rng = makeRng(7);
    for (let i = 0; i < 1000; i++) {
      const float = nextFloat(rng).value;
      expect(float).toBeGreaterThanOrEqual(0);
      expect(float).toBeLessThan(1);
    }
  });

  it('nextInt bounds: 1000 values with maxExclusive 6 are all integers in [0,6).', () => {
    const rng = makeRng(7);
    for (let i = 0; i < 1000; i++) {
      const int = nextInt(rng, 6).value;
      expect(int).toBeGreaterThanOrEqual(0);
      expect(int).toBeLessThan(6);
    }
  });

  it('nextInt throws for maxExclusive 0 and -1 (use expect(() => ...).toThrow()).', () => {
    const rng = makeRng(7);
    expect(() => nextInt(rng, 0)).toThrow('nextInt: maxExclusive must be positive');
    expect(() => nextInt(rng, -1)).toThrow('nextInt: maxExclusive must be positive');
  });

  it('shuffle does not mutate the input array and returns a permutation (same multiset — compare sorted copies).', () => {
    const original = [3, 1, 4, 1, 5];
    const rng = makeRng(42);
    const result = shuffle(rng, original);

    expect(result.value).not.toBe(original);
    expect(result.value.length).toBe(original.length);
    expect([...result.value].sort()).toEqual([...original].sort());
  });

  it('shuffle is deterministic for a fixed seed.', () => {
    const rng1 = makeRng(42);
    const result1 = shuffle(rng1, [3, 1, 4, 1, 5]);

    const rng2 = makeRng(42);
    const result2 = shuffle(rng2, [3, 1, 4, 1, 5]);

    expect(result1.value).toEqual(result2.value);
  });

  it('Purity: calling nextFloat twice with the SAME rng object returns the same value both times.', () => {
    const rng = makeRng(42);
    const float1 = nextFloat(rng).value;
    const float2 = nextFloat(rng).value;
    expect(float1).toBe(float2);
  });
});

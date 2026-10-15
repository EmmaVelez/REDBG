export type RngState = { readonly s: number };

function advance(s: number): { value: number; s: number } {
  s = (s + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, s };
}

export function makeRng(seed: number): RngState {
  return { s: seed | 0 };
}

export function nextFloat(rng: RngState): { value: number; rng: RngState } {
  const { value, s } = advance(rng.s);
  return { value, rng: { s } };
}

export function nextInt(rng: RngState, maxExclusive: number): { value: number; rng: RngState } {
  if (maxExclusive < 1) {
    throw new Error("nextInt: maxExclusive must be positive");
  }
  const { value, rng: next } = nextFloat(rng);
  return { value: Math.floor(value * maxExclusive), rng: next };
}

export function shuffle<T>(rng: RngState, items: readonly T[]): { value: T[]; rng: RngState } {
  const result = [...items];
  let current = rng;
  for (let i = result.length - 1; i > 0; i--) {
    const { value: j, rng: next } = nextInt(current, i + 1);
    current = next;
    const temp = result[i] as T;
    result[i] = result[j] as T;
    result[j] = temp;
  }
  return { value: result, rng: current };
}

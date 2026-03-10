// ─────────────────────────────────────────────────────────────
// engine/RNG.ts
// Deterministic xoshiro256++ seeded PRNG.
// NEVER use Math.random() anywhere in the engine.
// ─────────────────────────────────────────────────────────────

/**
 * 64-bit values are represented as pairs of 32-bit numbers [hi, lo]
 * because JavaScript lacks native 64-bit integer support.
 */
type U64 = [number, number]; // [high32, low32]

// ── 64-bit arithmetic helpers (unsigned) ────────────────────

function add64(a: U64, b: U64): U64 {
  const lo = (a[1] + b[1]) >>> 0;
  const carry = lo < (a[1] >>> 0) ? 1 : 0;
  const hi = (a[0] + b[0] + carry) >>> 0;
  return [hi, lo];
}

function xor64(a: U64, b: U64): U64 {
  return [(a[0] ^ b[0]) >>> 0, (a[1] ^ b[1]) >>> 0];
}

function rotl64(x: U64, k: number): U64 {
  // Rotate left by k bits (0 < k < 64)
  if (k === 0) return x;
  if (k === 32) return [x[1], x[0]];
  if (k < 32) {
    return [
      ((x[0] << k) | (x[1] >>> (32 - k))) >>> 0,
      ((x[1] << k) | (x[0] >>> (32 - k))) >>> 0,
    ];
  }
  const r = k - 32;
  return [
    ((x[1] << r) | (x[0] >>> (32 - r))) >>> 0,
    ((x[0] << r) | (x[1] >>> (32 - r))) >>> 0,
  ];
}

function shl64(x: U64, k: number): U64 {
  if (k === 0) return x;
  if (k >= 64) return [0, 0];
  if (k >= 32) return [(x[1] << (k - 32)) >>> 0, 0];
  return [
    ((x[0] << k) | (x[1] >>> (32 - k))) >>> 0,
    (x[1] << k) >>> 0,
  ];
}

// ── SplitMix64 for seed expansion ───────────────────────────

function splitmix64(seed: U64): { value: U64; next: U64 } {
  let z = add64(seed, [0x9e3779b9, 0x7f4a7c15]);
  let result = z;
  result = xor64(result, [result[0] >>> 30, ((result[0] << 2) | (result[1] >>> 30)) >>> 0]);
  // Multiply by 0xbf58476d1ce4e5b9
  result = mul64(result, [0xbf584e5b, 0x1ce4e5b9]);
  result = xor64(result, [result[0] >>> 27, ((result[0] << 5) | (result[1] >>> 27)) >>> 0]);
  result = mul64(result, [0x94d049bb, 0x133111eb]);
  result = xor64(result, [result[0] >>> 31, ((result[0] << 1) | (result[1] >>> 31)) >>> 0]);
  return { value: result, next: z };
}

function mul64(a: U64, b: U64): U64 {
  // Multiply two 64-bit unsigned integers, return lower 64 bits
  const a0 = a[1] & 0xffff, a1 = a[1] >>> 16;
  const a2 = a[0] & 0xffff, a3 = a[0] >>> 16;
  const b0 = b[1] & 0xffff, b1 = b[1] >>> 16;
  const b2 = b[0] & 0xffff, b3 = b[0] >>> 16;

  let lo = a0 * b0;
  let mid = (lo >>> 16) + a1 * b0;
  mid += a0 * b1;
  if (mid > 0xffffffff) mid = mid >>> 0;
  let hi = (mid >>> 16) + a2 * b0 + a1 * b1 + a0 * b2;
  hi += (a3 * b0 + a2 * b1 + a1 * b2 + a0 * b3) << 0;

  return [(hi & 0xffff) << 16 | ((mid & 0xffff) << 0) >>> 0, (((mid & 0xffff) << 16) | (lo & 0xffff)) >>> 0];
}

// ── xoshiro256++ state ──────────────────────────────────────

export class RNG {
  private s0: U64;
  private s1: U64;
  private s2: U64;
  private s3: U64;

  constructor(seed: number) {
    // Expand a single numeric seed into 4×64-bit state via SplitMix64
    let sm: U64 = [0, seed >>> 0];
    const r0 = splitmix64(sm); sm = r0.next;
    const r1 = splitmix64(sm); sm = r1.next;
    const r2 = splitmix64(sm); sm = r2.next;
    const r3 = splitmix64(sm);
    this.s0 = r0.value;
    this.s1 = r1.value;
    this.s2 = r2.value;
    this.s3 = r3.value;
  }

  /** Generate next xoshiro256++ value and return as U64. */
  private next(): U64 {
    const result = add64(rotl64(add64(this.s0, this.s3), 23), this.s0);
    const t = shl64(this.s1, 17);

    this.s2 = xor64(this.s2, this.s0);
    this.s3 = xor64(this.s3, this.s1);
    this.s1 = xor64(this.s1, this.s2);
    this.s0 = xor64(this.s0, this.s3);
    this.s2 = xor64(this.s2, t);
    this.s3 = rotl64(this.s3, 45);

    return result;
  }

  /** Returns a float in [0, 1). */
  roll(): number {
    const v = this.next();
    // Use upper 53 bits for double precision
    const hi = v[0] >>> 0;
    const lo = v[1] >>> 0;
    // (hi * 2^21 + lo >>> 11) / 2^53
    return ((hi >>> 11) * 4194304 + (lo >>> 11)) / 9007199254740992;
  }

  /** Returns an integer in [min, max] inclusive. */
  rollInt(min: number, max: number): number {
    const range = max - min + 1;
    return min + Math.floor(this.roll() * range);
  }

  /** Returns true with the given probability [0, 1]. */
  rollProc(chance: number): boolean {
    return this.roll() < chance;
  }

  /** Get internal state snapshot for determinism verification. */
  getState(): [U64, U64, U64, U64] {
    return [
      [...this.s0] as U64,
      [...this.s1] as U64,
      [...this.s2] as U64,
      [...this.s3] as U64,
    ];
  }
}

/**
 * Hash a base seed + iteration index into a unique per-iteration seed.
 * Uses a simple mixing function to decorrelate iterations.
 */
export function hash64(baseSeed: number, iterationIndex: number): number {
  let h = (baseSeed ^ (iterationIndex * 2654435761)) >>> 0;
  h = ((h ^ (h >>> 16)) * 0x45d9f3b) >>> 0;
  h = ((h ^ (h >>> 16)) * 0x45d9f3b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h;
}

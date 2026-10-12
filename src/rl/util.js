// Small numeric helpers shared by every policy. No dependencies; runs in browsers and Node.

/** Seeded random number generator (mulberry32). Returns floats in [0, 1). */
export function makeRng(seed = 1) {
  let a = (typeof seed === 'string' ? [...seed].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) : seed) >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function argmax(xs, rng) {
  let best = 0, ties = 1;
  for (let i = 1; i < xs.length; i++) {
    if (xs[i] > xs[best] + 1e-12) { best = i; ties = 1; }
    else if (rng && Math.abs(xs[i] - xs[best]) <= 1e-12 && rng() < 1 / ++ties) best = i;
  }
  return best;
}
export function softmax(xs, temperature = 1) {
  const m = Math.max(...xs), e = xs.map(x => Math.exp((x - m) / temperature)), s = e.reduce((a, b) => a + b, 0);
  return e.map(x => x / s);
}
export function logsumexp(xs, temperature = 1) {
  const m = Math.max(...xs); return m + temperature * Math.log(xs.reduce((a, x) => a + Math.exp((x - m) / temperature), 0));
}
export function sampleCategorical(probs, rng = Math.random) {
  let r = rng(), i = 0;
  for (; i < probs.length - 1; i++) { r -= probs[i]; if (r <= 0) return i; }
  return i;
}
/** Linear schedule from `start` to `end` over `steps`, then flat. */
export function linear(start, end, steps) { return t => t >= steps ? end : start + (end - start) * (t / steps); }
export const mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

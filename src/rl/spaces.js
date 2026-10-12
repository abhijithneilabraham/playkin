// Action and observation spaces, so a policy can size itself from an environment.
export class Discrete {
  constructor(n) { this.n = n; this.type = 'discrete'; }
  sample(rng = Math.random) { return Math.floor(rng() * this.n); }
}
export class Box {
  constructor(shape, low = -Infinity, high = Infinity) { this.shape = Array.isArray(shape) ? shape : [shape]; this.low = low; this.high = high; this.type = 'box'; }
  get size() { return this.shape.reduce((a, b) => a * b, 1); }
}

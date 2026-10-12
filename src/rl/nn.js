// A tiny multilayer perceptron and the Adam optimiser, in plain JavaScript.
// Enough for game-sized policies (a few thousand weights); no GPU, no dependencies.
import { makeRng } from './util.js';

export class MLP {
  /** @param {number[]} sizes e.g. [obsSize, 64, 64, nActions]; tanh between layers, linear output. */
  constructor(sizes, { seed = 1, outScale = 1 } = {}) {
    this.sizes = sizes; const rng = makeRng(seed);
    this.layers = [];
    for (let l = 0; l < sizes.length - 1; l++) {
      const n = sizes[l], m = sizes[l + 1], s = Math.sqrt(2 / (n + m)) * (l === sizes.length - 2 ? outScale : 1);
      const W = new Float64Array(n * m).map(() => (rng() * 2 - 1) * s * Math.sqrt(3)), b = new Float64Array(m);
      this.layers.push({ n, m, W, b, gW: new Float64Array(n * m), gb: new Float64Array(m) });
    }
  }
  forward(x, train = false) {
    let a = Float64Array.from(x); const acts = [a];
    this.layers.forEach((L, li) => {
      const out = new Float64Array(L.m);
      for (let j = 0; j < L.m; j++) { let s = L.b[j]; for (let i = 0; i < L.n; i++) s += a[i] * L.W[i * L.m + j]; out[j] = li < this.layers.length - 1 ? Math.tanh(s) : s; }
      a = out; acts.push(a);
    });
    if (train) this._acts = acts;
    return a;
  }
  /** Accumulate gradients for the last `forward(x, true)`, given dLoss/dOutput. */
  backward(gOut) {
    let g = Float64Array.from(gOut);
    for (let li = this.layers.length - 1; li >= 0; li--) {
      const L = this.layers[li], a = this._acts[li], out = this._acts[li + 1];
      if (li < this.layers.length - 1) for (let j = 0; j < L.m; j++) g[j] *= 1 - out[j] * out[j];
      const gin = new Float64Array(L.n);
      for (let i = 0; i < L.n; i++) { let s = 0; for (let j = 0; j < L.m; j++) { L.gW[i * L.m + j] += a[i] * g[j]; s += L.W[i * L.m + j] * g[j]; } gin[i] = s; }
      for (let j = 0; j < L.m; j++) L.gb[j] += g[j];
      g = gin;
    }
    return g;
  }
  zeroGrad() { for (const L of this.layers) { L.gW.fill(0); L.gb.fill(0); } }
  params() { return this.layers.flatMap(L => [{ w: L.W, g: L.gW }, { w: L.b, g: L.gb }]); }
  toJSON() { return { sizes: this.sizes, layers: this.layers.map(L => ({ W: Array.from(L.W), b: Array.from(L.b) })) }; }
  load(j) { j.layers.forEach((l, i) => { this.layers[i].W.set(l.W); this.layers[i].b.set(l.b); }); return this; }
}

export class Adam {
  constructor(params, { lr = 1e-3, b1 = 0.9, b2 = 0.999, eps = 1e-8, clip = 1 } = {}) {
    Object.assign(this, { params, lr, b1, b2, eps, clip, t: 0 });
    this.m = params.map(p => new Float64Array(p.w.length)); this.v = params.map(p => new Float64Array(p.w.length));
  }
  step() {
    this.t++;
    let norm = 0; for (const p of this.params) for (const g of p.g) norm += g * g; norm = Math.sqrt(norm);
    const k = this.clip && norm > this.clip ? this.clip / norm : 1;
    const c1 = 1 - this.b1 ** this.t, c2 = 1 - this.b2 ** this.t;
    this.params.forEach((p, n) => { const m = this.m[n], v = this.v[n];
      for (let i = 0; i < p.w.length; i++) { const g = p.g[i] * k; m[i] = this.b1 * m[i] + (1 - this.b1) * g; v[i] = this.b2 * v[i] + (1 - this.b2) * g * g;
        p.w[i] -= this.lr * (m[i] / c1) / (Math.sqrt(v[i] / c2) + this.eps); } });
  }
}

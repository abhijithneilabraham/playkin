// Policies. Every policy has the same shape:
//   act(obs, { explore }) -> action index
//   observe({ obs, action, reward, nextObs, done })   learn from one step (no-op if it does not learn)
//   endEpisode()                                       optional
//   toJSON() / static fromJSON(json)                   save and load a trained brain
import { makeRng, argmax, softmax, logsumexp, sampleCategorical, linear, mean } from './util.js';
import { MLP, Adam } from './nn.js';

const defaultKey = obs => (Array.isArray(obs) || ArrayBuffer.isView(obs)) ? Array.from(obs, v => Math.round(v * 1000) / 1000).join(',') : String(obs);

export class RandomPolicy {
  constructor({ nActions, seed = 1 }) { this.nActions = nActions; this.rng = makeRng(seed); }
  act() { return Math.floor(this.rng() * this.nActions); }
  observe() {}
  toJSON() { return { type: 'RandomPolicy', nActions: this.nActions }; }
}

/** Wrap any function obs -> action as a policy (scripted behaviour, a decision model, a human). */
export class FunctionPolicy {
  constructor(fn) { this.fn = fn; }
  act(obs, opts) { return this.fn(obs, opts); }
  observe() {}
}

/**
 * Tabular Q-learning. Fast and reliable when observations repeat (grids, card games, menus).
 * `key(obs)` turns an observation into a table key; the default rounds numbers to 3 decimals.
 */
export class QLearning {
  constructor({ nActions, alpha = 0.3, gamma = 0.95, epsilon = { start: 0.5, end: 0.03, episodes: 2000 }, key = defaultKey, seed = 1 } = {}) {
    Object.assign(this, { nActions, alpha, gamma, key });
    this.epsilonCfg = typeof epsilon === 'number' ? { start: epsilon, end: epsilon, episodes: 1 } : epsilon;
    this.eps = linear(this.epsilonCfg.start, this.epsilonCfg.end, this.epsilonCfg.episodes);
    this.episodes = 0; this.table = new Map(); this.rng = makeRng(seed);
  }
  q(obs) { const k = this.key(obs); let v = this.table.get(k); if (!v) { v = new Array(this.nActions).fill(0); this.table.set(k, v); } return v; }
  act(obs, { explore = true } = {}) {
    if (explore && this.rng() < this.eps(this.episodes)) return Math.floor(this.rng() * this.nActions);
    return argmax(this.q(obs), this.rng);
  }
  target(nextObs, done) { return done ? 0 : Math.max(...this.q(nextObs)); }
  observe({ obs, action, reward, nextObs, done }) {
    const q = this.q(obs);
    q[action] += this.alpha * (reward + this.gamma * this.target(nextObs, done) - q[action]);
  }
  endEpisode() { this.episodes++; }
  /** Action probabilities (greedy policy for Q-learning). */
  probs(obs) { const p = new Array(this.nActions).fill(0); p[argmax(this.q(obs))] = 1; return p; }
  toJSON() { return { type: this.constructor.name, nActions: this.nActions, alpha: this.alpha, gamma: this.gamma, episodes: this.episodes, table: [...this.table], extra: this._extraJSON?.() }; }
  static fromJSON(j) { const p = new this({ nActions: j.nActions, alpha: j.alpha, gamma: j.gamma, ...(j.extra || {}) }); p.episodes = j.episodes; p.table = new Map(j.table); return p; }
}

/**
 * Soft (energy-based) Q-learning. The policy is a Boltzmann distribution over Q-values,
 * π(a|s) ∝ exp(Q(s,a)/α), and the Bellman target uses the soft maximum. It never collapses to a
 * single action while α > 0, so behaviour stays varied and exploration is built in.
 * The same form as decision models that read answers out of an energy landscape (P ∝ exp(−E/τ)).
 */
export class SoftQ extends QLearning {
  constructor({ temperature = 0.05, minTemperature = 0.01, decayEpisodes = 2000, ...rest } = {}) {
    super({ epsilon: 0, ...rest });
    this.temperature = linear(temperature, minTemperature, decayEpisodes);
    this.tempCfg = { temperature, minTemperature, decayEpisodes };
  }
  get alphaT() { return this.temperature(this.episodes); }
  probs(obs) { return softmax(this.q(obs), this.alphaT); }
  act(obs, { explore = true } = {}) { return explore ? sampleCategorical(this.probs(obs), this.rng) : argmax(this.q(obs), this.rng); }
  target(nextObs, done) { return done ? 0 : logsumexp(this.q(nextObs), this.alphaT) - this.alphaT * Math.log(this.nActions); }
  _extraJSON() { return this.tempCfg; }
}

/**
 * PPO with a small neural network (actor-critic, discrete actions). Use it when observations are
 * continuous or too varied for a table. Learns after every `batchSteps` steps.
 */
export class PPO {
  constructor({ obsSize, nActions, hidden = [64, 64], lr = 3e-3, gamma = 0.97, lambda = 0.95, clip = 0.2, entropy = 0.01, valueCoef = 0.5,
    epochs = 4, batchSteps = 1024, minibatch = 256, seed = 1 } = {}) {
    Object.assign(this, { obsSize, nActions, hidden, gamma, lambda, clip, entropy, valueCoef, epochs, batchSteps, minibatch, lr });
    this.rng = makeRng(seed);
    this.actor = new MLP([obsSize, ...hidden, nActions], { seed, outScale: 0.01 });
    this.critic = new MLP([obsSize, ...hidden, 1], { seed: seed + 1 });
    this.optA = new Adam(this.actor.params(), { lr }); this.optC = new Adam(this.critic.params(), { lr });
    this.buf = []; this.episode = []; this.updates = 0;
  }
  probs(obs) { return softmax(Array.from(this.actor.forward(obs))); }
  act(obs, { explore = true } = {}) {
    const p = this.probs(obs), a = explore ? sampleCategorical(p, this.rng) : argmax(p);
    this._last = { p: p[a] };
    return a;
  }
  observe({ obs, action, reward, done }) {
    const logp = Math.log(Math.max(1e-8, this._last ? this._last.p : this.probs(obs)[action]));
    this.episode.push({ obs: Array.from(obs), action, reward, logp, v: this.critic.forward(obs)[0], done });
    if (done) this.endEpisode();
  }
  endEpisode() {
    if (!this.episode.length) return;
    // generalised advantage estimation; a cut-off episode bootstraps from the last value
    const ep = this.episode, last = ep[ep.length - 1]; let adv = 0, next = last.done ? 0 : last.v;
    for (let i = ep.length - 1; i >= 0; i--) {
      const delta = ep[i].reward + this.gamma * next - ep[i].v;
      adv = delta + this.gamma * this.lambda * adv; ep[i].adv = adv; ep[i].ret = adv + ep[i].v; next = ep[i].v;
    }
    this.buf.push(...ep); this.episode = [];
    if (this.buf.length >= this.batchSteps) this.update();
  }
  update() {
    const B = this.buf, m = mean(B.map(b => b.adv)), sd = Math.sqrt(mean(B.map(b => (b.adv - m) ** 2))) + 1e-8;
    for (const b of B) b.nadv = (b.adv - m) / sd;
    for (let e = 0; e < this.epochs; e++) {
      const idx = B.map((_, i) => i).sort(() => this.rng() - 0.5);
      for (let s = 0; s < idx.length; s += this.minibatch) {
        const mb = idx.slice(s, s + this.minibatch).map(i => B[i]);
        this.actor.zeroGrad(); this.critic.zeroGrad();
        for (const b of mb) {
          const logits = this.actor.forward(b.obs, true), p = softmax(Array.from(logits)), ratio = p[b.action] / Math.exp(b.logp);
          const clipped = (b.nadv > 0 && ratio > 1 + this.clip) || (b.nadv < 0 && ratio < 1 - this.clip);
          const H = -p.reduce((a, x) => a + (x > 0 ? x * Math.log(x) : 0), 0);
          const g = new Float64Array(this.nActions);
          for (let j = 0; j < this.nActions; j++) {
            const pg = clipped ? 0 : -b.nadv * ratio * ((j === b.action ? 1 : 0) - p[j]);
            const ent = this.entropy * p[j] * (Math.log(Math.max(p[j], 1e-12)) + H);   // gradient of −entropy·H
            g[j] = (pg + ent) / mb.length;
          }
          this.actor.backward(g);
          const v = this.critic.forward(b.obs, true)[0];
          this.critic.backward(new Float64Array([this.valueCoef * 2 * (v - b.ret) / mb.length]));
        }
        this.optA.step(); this.optC.step();
      }
    }
    this.buf = []; this.updates++;
  }
  toJSON() { return { type: 'PPO', obsSize: this.obsSize, nActions: this.nActions, hidden: this.hidden, actor: this.actor.toJSON(), critic: this.critic.toJSON() }; }
  static fromJSON(j) { const p = new PPO({ obsSize: j.obsSize, nActions: j.nActions, hidden: j.hidden }); p.actor.load(j.actor); p.critic.load(j.critic); return p; }
}

/** Load any saved policy. */
export function loadPolicy(json) {
  const j = typeof json === 'string' ? JSON.parse(json) : json;
  const T = { QLearning, SoftQ, PPO, RandomPolicy }[j.type];
  if (!T) throw new Error(`playkin: cannot load policy type ${j.type}`);
  return T === RandomPolicy ? new RandomPolicy(j) : T.fromJSON(j);
}

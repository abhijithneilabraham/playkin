// Self-play with a pool of past selves, the trick behind OpenAI's hide-and-seek agents and AlphaStar's
// league: playing only your latest self tends to chase its own tail, playing a mix of old selves does not.
import { makeRng } from './util.js';
import { loadPolicy } from './policies.js';

export class OpponentPool {
  /** @param {{ capacity?: number, latest?: number, seed?: number }} o  latest = chance of facing the current self */
  constructor({ capacity = 6, latest = 0.25, seed = 7 } = {}) { this.capacity = capacity; this.latest = latest; this.snaps = []; this.rng = makeRng(seed); }
  /** Store a frozen copy of a policy. */
  add(policy) { this.snaps.push(loadPolicy(JSON.parse(JSON.stringify(policy.toJSON())))); if (this.snaps.length > this.capacity) this.snaps.shift(); }
  /** Pick an opponent: the live policy with probability `latest`, otherwise a random snapshot. */
  sample(live) { return !this.snaps.length || this.rng() < this.latest ? live : this.snaps[Math.floor(this.rng() * this.snaps.length)]; }
  get size() { return this.snaps.length; }
}

/**
 * Train two roles of a two-player env against each other (env must have stepBoth and observe(role)).
 * Each episode, each side faces either the other side's live policy or one of its past snapshots.
 */
export function selfPlay(env, policies, { episodes = 2000, snapshotEvery = 200, pool = true, onEpisode = null } = {}) {
  const roles = Object.keys(policies), pools = Object.fromEntries(roles.map(r => [r, new OpponentPool()]));
  for (let e = 0; e < episodes; e++) {
    env.reset();
    const learnerRole = roles[e % roles.length];               // alternate who learns this episode
    const opponents = Object.fromEntries(roles.map(r => [r, r === learnerRole ? policies[r] : (pool ? pools[r].sample(policies[r]) : policies[r])]));
    let obs = Object.fromEntries(roles.map(r => [r, env.observe(r)])), done = false, total = 0;
    while (!done) {
      const actions = Object.fromEntries(roles.map(r => [r, opponents[r].act(obs[r], { explore: r === learnerRole })]));
      const step = env.stepBoth(actions);
      policies[learnerRole].observe({ obs: obs[learnerRole], action: actions[learnerRole], reward: step.rewards[learnerRole], nextObs: step.obs[learnerRole], done: step.done });
      total += step.rewards[learnerRole]; obs = step.obs; done = step.done;
    }
    policies[learnerRole].endEpisode?.();
    if ((e + 1) % snapshotEvery === 0) for (const r of roles) pools[r].add(policies[r]);
    onEpisode?.({ episode: e, learner: learnerRole, return: total });
  }
  return pools;
}

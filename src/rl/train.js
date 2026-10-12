// Training loops. `train` runs to completion (Node, workers, tests); `Trainer` runs a few episodes
// at a time so a browser game stays responsive while its characters learn.
import { mean } from './util.js';

export function runEpisode(env, policy, { maxSteps = Infinity, learn = true, explore = true } = {}) {
  let obs = env.reset(), total = 0, steps = 0, info = {};
  for (; steps < maxSteps; steps++) {
    const action = policy.act(obs, { explore });
    const r = env.step(action);
    if (learn) policy.observe({ obs, action, reward: r.reward, nextObs: r.obs, done: r.done });
    total += r.reward; obs = r.obs; info = r.info || {};
    if (r.done) { steps++; break; }
  }
  if (learn) policy.endEpisode?.();
  return { return: total, steps, info };
}

export class Trainer {
  constructor(env, policy, { maxSteps = Infinity, window = 100 } = {}) {
    Object.assign(this, { env, policy, maxSteps, window });
    this.history = [];              // one entry per episode: { return, steps, info }
  }
  /** Train for `episodes` more episodes; returns the recent average return. */
  run(episodes = 1) {
    for (let k = 0; k < episodes; k++) this.history.push(runEpisode(this.env, this.policy, { maxSteps: this.maxSteps }));
    return this.recent();
  }
  recent(n = this.window) { return mean(this.history.slice(-n).map(h => h.return)); }
  /** Run in the background of a browser page, `perFrame` episodes per animation frame. */
  runInBackground({ episodes = 1000, perFrame = 20, onProgress = null } = {}) {
    let left = episodes, stop = false;
    const tick = () => { if (stop || left <= 0) return; const n = Math.min(perFrame, left); this.run(n); left -= n; onProgress?.(this); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    return () => { stop = true; };
  }
}

export function train(env, policy, { episodes = 1000, maxSteps = Infinity, onEpisode = null } = {}) {
  const t = new Trainer(env, policy, { maxSteps });
  for (let e = 0; e < episodes; e++) { t.run(1); onEpisode?.(t.history[t.history.length - 1], e); }
  return t;
}

/** Average return of a policy without exploring or learning. */
export function evaluate(env, policy, { episodes = 100, maxSteps = Infinity } = {}) {
  const rs = []; for (let e = 0; e < episodes; e++) rs.push(runEpisode(env, policy, { maxSteps, learn: false, explore: false }));
  return { return: mean(rs.map(r => r.return)), steps: mean(rs.map(r => r.steps)), episodes: rs };
}

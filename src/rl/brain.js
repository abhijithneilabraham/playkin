// Connect a trained (or learning) policy to a game character.
//
//   const brain = new Brain({ policy, observe: () => env.observe('chaser'), interval: 0.3 });
//   // each frame:
//   const a = brain.tick(dt);                    // the current action index
//   const m = gridActionToMove(a); dog.move(m.x, m.z, dt);
//
// Give it `reward` to keep learning while the game runs (online RL).
import { MOVES } from './envs/gridChase.js';

export class Brain {
  constructor({ policy, observe, reward = null, interval = 0.25, explore = false, learn = false }) {
    Object.assign(this, { policy, observe, reward, interval, explore, learn });
    this.timer = 0; this.action = null; this.last = null;
  }
  /** Decide every `interval` seconds; between decisions keep doing the last action. */
  tick(dt) {
    this.timer -= dt;
    if (this.timer > 0 && this.action !== null) return this.action;
    this.timer = this.interval;
    const obs = this.observe();
    if (this.learn && this.last && this.reward) this.policy.observe({ obs: this.last.obs, action: this.last.action, reward: this.reward(), nextObs: obs, done: false });
    this.action = this.policy.act(obs, { explore: this.explore });
    this.last = { obs, action: this.action };
    return this.action;
  }
}

/** Grid actions (north, east, south, west, stay) to a world-space direction on the XZ plane. */
export function gridActionToMove(a) { const [x, y] = MOVES[a]; return { x, z: y }; }

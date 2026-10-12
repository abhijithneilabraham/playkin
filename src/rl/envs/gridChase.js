// Tag on a grid: a chaser tries to catch a runner among walls. Train either side against a
// scripted opponent, against another policy, or both at once with self-play.
import { Discrete, Box } from '../spaces.js';
import { makeRng } from '../util.js';

export const MOVES = [[0, -1], [1, 0], [0, 1], [-1, 0], [0, 0]];     // north, east, south, west, stay
export const MOVE_NAMES = ['north', 'east', 'south', 'west', 'stay'];

export class GridChaseEnv {
  /**
   * @param {object} o
   * @param {number} [o.width=9] @param {number} [o.height=9] @param {number} [o.walls=0.12] fraction of wall cells
   * @param {number} [o.maxSteps=60] @param {'chaser'|'runner'} [o.learner='chaser'] which side `step()` controls
   * @param {object|function|null} [o.opponent] policy with act(obs) or a function(obs) -> action; null = built-in script
   * @param {number|string} [o.seed] @param {boolean} [o.fixedMap=false] keep one map for every episode
   * @param {boolean} [o.timeFeature=false] add 'fraction of time left' to observations (better for neural nets, bad for tables)
   */
  constructor({ width = 9, height = 9, walls = 0.12, maxSteps = 60, learner = 'chaser', opponent = null, seed = 1, fixedMap = false, timeFeature = false } = {}) {
    Object.assign(this, { width, height, wallFrac: walls, maxSteps, learner, opponent, fixedMap, timeFeature });
    this.rng = makeRng(seed);
    this.actionSpace = new Discrete(5);
    this.observationSpace = new Box([timeFeature ? 8 : 7]);
    this.walls = null;
  }
  other(role) { return role === 'chaser' ? 'runner' : 'chaser'; }
  blocked(x, y) { return x < 0 || y < 0 || x >= this.width || y >= this.height || this.walls[y * this.width + x] === 1; }

  reset() {
    if (!this.fixedMap || !this.walls) {
      for (;;) {
        this.walls = new Uint8Array(this.width * this.height).map(() => (this.rng() < this.wallFrac ? 1 : 0));
        const free = []; for (let i = 0; i < this.walls.length; i++) if (!this.walls[i]) free.push(i);
        if (free.length > 4 && this._connected(free)) break;
      }
    }
    const free = []; for (let i = 0; i < this.walls.length; i++) if (!this.walls[i]) free.push(i);
    let a, b;
    do { a = free[Math.floor(this.rng() * free.length)]; b = free[Math.floor(this.rng() * free.length)]; }
    while (Math.abs(a % this.width - b % this.width) + Math.abs(((a / this.width) | 0) - ((b / this.width) | 0)) < 4);
    this.pos = { chaser: [a % this.width, (a / this.width) | 0], runner: [b % this.width, (b / this.width) | 0] };
    this.t = 0;
    return this.observe(this.learner);
  }

  _connected(free) {
    const seen = new Set([free[0]]), q = [free[0]];
    while (q.length) { const c = q.pop(), x = c % this.width, y = (c / this.width) | 0;
      for (const [dx, dy] of MOVES) { const nx = x + dx, ny = y + dy, j = ny * this.width + nx; if (!this.blocked(nx, ny) && !seen.has(j)) { seen.add(j); q.push(j); } } }
    return seen.size === free.length;
  }

  /** Features for one role: relative position of the other (scaled), distance, walls around, and (optionally) time left. */
  observe(role) {
    const [x, y] = this.pos[role], [ox, oy] = this.pos[this.other(role)];
    return [(ox - x) / this.width, (oy - y) / this.height, (Math.abs(ox - x) + Math.abs(oy - y)) / (this.width + this.height),
      +this.blocked(x, y - 1), +this.blocked(x + 1, y), +this.blocked(x, y + 1), +this.blocked(x - 1, y), ...(this.timeFeature ? [1 - this.t / this.maxSteps] : [])];
  }

  /** The built-in opponents: a chaser that closes the distance, a runner that opens it; both a little noisy. */
  scripted(role) {
    if (this.rng() < 0.2) return Math.floor(this.rng() * 5);
    const [x, y] = this.pos[role], [ox, oy] = this.pos[this.other(role)];
    let best = 4, bv = -Infinity;
    for (let a = 0; a < 5; a++) {
      const nx = x + MOVES[a][0], ny = y + MOVES[a][1]; if (this.blocked(nx, ny)) continue;
      const d = Math.abs(ox - nx) + Math.abs(oy - ny), v = role === 'chaser' ? -d : d;
      if (v > bv + 1e-9) { bv = v; best = a; }
    }
    return best;
  }

  _opponentAction() {
    const role = this.other(this.learner), obs = this.observe(role), o = this.opponent;
    if (!o) return this.scripted(role);
    return typeof o === 'function' ? o(obs) : o.act(obs, { explore: false });
  }

  /** Single-agent step: `action` is the learner's move; the opponent moves too. */
  step(action) {
    return this.stepBoth(this.learner === 'chaser' ? { chaser: action, runner: this._opponentAction() } : { runner: action, chaser: this._opponentAction() }, this.learner);
  }

  /** Both sides at once (self-play). Returns observations and rewards for both. */
  stepBoth(actions, view = null) {
    for (const role of ['runner', 'chaser']) {
      const [x, y] = this.pos[role], [dx, dy] = MOVES[actions[role]];
      if (!this.blocked(x + dx, y + dy)) this.pos[role] = [x + dx, y + dy];
    }
    this.t++;
    const caught = this.pos.chaser[0] === this.pos.runner[0] && this.pos.chaser[1] === this.pos.runner[1];
    const done = caught || this.t >= this.maxSteps;
    const rewards = { chaser: caught ? 1 : -1 / this.maxSteps, runner: caught ? -1 : 1 / this.maxSteps };
    const info = { caught, t: this.t };
    if (view) return { obs: this.observe(view), reward: rewards[view], done, info };
    return { obs: { chaser: this.observe('chaser'), runner: this.observe('runner') }, rewards, done, info };
  }

  /** Positions and walls, for drawing the game however you like. */
  state() { return { width: this.width, height: this.height, walls: this.walls, chaser: [...this.pos.chaser], runner: [...this.pos.runner], t: this.t }; }
}

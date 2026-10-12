// Fetch: walk to the ball, pick it up, bring it home. The classic pet trick, as a tiny MDP.
import { Discrete, Box } from '../spaces.js';
import { makeRng } from '../util.js';
import { MOVES } from './gridChase.js';

export class FetchEnv {
  constructor({ width = 8, height = 8, maxSteps = 60, seed = 1, home = null } = {}) {
    Object.assign(this, { width, height, maxSteps });
    this.rng = makeRng(seed);
    this.home = home || [Math.floor(width / 2), Math.floor(height / 2)];
    this.actionSpace = new Discrete(5);
    this.observationSpace = new Box([5]);
  }
  reset() {
    const r = () => [Math.floor(this.rng() * this.width), Math.floor(this.rng() * this.height)];
    do { this.ball = r(); } while (this.ball[0] === this.home[0] && this.ball[1] === this.home[1]);
    this.agent = [...this.home]; this.carrying = 0; this.t = 0;
    return this.observe();
  }
  observe() {
    const [x, y] = this.agent;
    return [(this.ball[0] - x) / this.width, (this.ball[1] - y) / this.height, (this.home[0] - x) / this.width, (this.home[1] - y) / this.height, this.carrying];
  }
  step(a) {
    const [dx, dy] = MOVES[a], nx = this.agent[0] + dx, ny = this.agent[1] + dy;
    if (nx >= 0 && ny >= 0 && nx < this.width && ny < this.height) this.agent = [nx, ny];
    this.t++;
    let reward = -0.01, done = this.t >= this.maxSteps;
    if (!this.carrying && this.agent[0] === this.ball[0] && this.agent[1] === this.ball[1]) { this.carrying = 1; reward += 0.5; }
    if (this.carrying) this.ball = [...this.agent];
    if (this.carrying && this.agent[0] === this.home[0] && this.agent[1] === this.home[1]) { reward += 1; done = true; }
    return { obs: this.observe(), reward, done, info: { delivered: this.carrying && done && this.t < this.maxSteps } };
  }
  state() { return { width: this.width, height: this.height, agent: [...this.agent], ball: [...this.ball], home: [...this.home], carrying: this.carrying }; }
}

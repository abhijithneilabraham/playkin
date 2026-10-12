import test from 'node:test';
import assert from 'node:assert/strict';
import { GridChaseEnv, FetchEnv, QLearning, SoftQ, PPO, RandomPolicy, train, evaluate, selfPlay, loadPolicy, OpponentPool, makeRng } from '../src/rl/index.js';

const catchRate = (env, policy, n = 300) => { let c = 0; for (let i = 0; i < n; i++) { let o = env.reset(), d = false, info; while (!d) { const r = env.step(policy.act(o, { explore: false })); o = r.obs; d = r.done; info = r.info; } c += info.caught ? 1 : 0; } return c / n; };

test('Q-learning chaser beats a random chaser against the scripted runner', () => {
  const env = new GridChaseEnv({ seed: 3, fixedMap: true });
  const q = new QLearning({ nActions: 5, epsilon: { start: 0.4, end: 0.02, episodes: 3000 } });
  train(env, q, { episodes: 4000 });
  const learned = catchRate(env, q), random = catchRate(env, new RandomPolicy({ nActions: 5 }));
  assert.ok(learned > random + 0.15, `learned ${learned} vs random ${random}`);
});

test('SoftQ keeps a stochastic policy and still learns fetch', () => {
  const env = new FetchEnv({ seed: 2 });
  const p = new SoftQ({ nActions: 5, temperature: 0.1, minTemperature: 0.02, decayEpisodes: 3000 });
  const before = evaluate(env, p, { episodes: 200 }).return;
  train(env, p, { episodes: 4000 });
  const after = evaluate(env, p, { episodes: 200 }).return;
  assert.ok(after > before + 0.5, `before ${before} after ${after}`);
  // where Q-values are close the policy stays spread out instead of collapsing to one action
  const pr = p.probs([0.5, 0.5, -0.5, -0.5, 0.123]);
  assert.ok(Math.max(...pr) < 0.5 && Math.abs(pr.reduce((a, b) => a + b, 0) - 1) < 1e-9);
});

test('PPO learns fetch from scratch', () => {
  const env = new FetchEnv({ seed: 5 });
  const p = new PPO({ obsSize: 5, nActions: 5, hidden: [32, 32], lr: 3e-3, batchSteps: 1024, minibatch: 128 });
  const before = evaluate(env, p, { episodes: 100 }).return;
  train(env, p, { episodes: 2500, maxSteps: 60 });
  const after = evaluate(env, p, { episodes: 100 }).return;
  assert.ok(after > before + 0.4, `before ${before} after ${after}`);
});

test('policies save and load', () => {
  const env = new FetchEnv({ seed: 1 }), q = new QLearning({ nActions: 5 });
  train(env, q, { episodes: 300 });
  const back = loadPolicy(JSON.stringify(q.toJSON())), o = env.reset();
  assert.deepEqual(back.q(o), q.q(o));
  const ppo = new PPO({ obsSize: 5, nActions: 5, hidden: [8] }), ppo2 = loadPolicy(JSON.parse(JSON.stringify(ppo.toJSON())));
  assert.deepEqual(ppo2.probs(o), ppo.probs(o));
});

test('self-play with an opponent pool runs and fills the pool', () => {
  const env = new GridChaseEnv({ seed: 9, fixedMap: true });
  const pols = { chaser: new QLearning({ nActions: 5 }), runner: new QLearning({ nActions: 5 }) };
  const pools = selfPlay(env, pols, { episodes: 600, snapshotEvery: 100 });
  assert.equal(pools.chaser.size, 6);
  const pool = new OpponentPool({ latest: 0 }); pool.add(pols.chaser);
  assert.notEqual(pool.sample(pols.chaser), pols.chaser);
});

test('rng is deterministic', () => { const a = makeRng(42), b = makeRng(42); assert.equal(a(), b()); });

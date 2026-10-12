// playkin/rl: reinforcement learning for game characters. No dependencies; browser or Node.
export { makeRng, argmax, softmax, logsumexp, sampleCategorical, linear, mean } from './util.js';
export { Discrete, Box } from './spaces.js';
export { MLP, Adam } from './nn.js';
export { RandomPolicy, FunctionPolicy, QLearning, SoftQ, PPO, loadPolicy } from './policies.js';
export { runEpisode, Trainer, train, evaluate } from './train.js';
export { OpponentPool, selfPlay } from './selfplay.js';
export { follow, chase, flee, patrol, wander, either } from './behaviors.js';
export { Brain, gridActionToMove } from './brain.js';
export { GridChaseEnv, MOVES, MOVE_NAMES } from './envs/gridChase.js';
export { FetchEnv } from './envs/fetch.js';

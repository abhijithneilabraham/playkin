# playkin: notes for AI coding assistants

Use these exact imports and signatures. Characters need three.js (0.155 or newer, ES modules); `playkin/rl` needs nothing.

## Import map (put in <head>, before any module script)

```html
<script type="importmap">
{ "imports": {
  "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
  "playkin": "https://cdn.jsdelivr.net/gh/abhijithneilabraham/playkin@main/src/index.js",
  "playkin/rl": "https://cdn.jsdelivr.net/gh/abhijithneilabraham/playkin@main/src/rl/index.js"
} }
</script>
```

## Characters (`playkin`)

- `createCharacter(kind, options?) -> Character`. kinds: human, robot, knight, wizard, ninja, zombie, dog, cat, fox, deer, slime, bird.
  - options (all optional): `height` (m), `name`, colours as hex numbers (`skin, hair, top, bottom, shoes, fur, color, robe, plume, band, eyeColor`), `hairStyle` (short|long|bun|spiky|ponytail|bald), `hat` (cap|tophat|crown|beanie|wizard|helmet|headband|cowboy|antenna), `hatColor`, `held` (sword|staff|shield|torch|lantern|balloon|katana).
- `randomCharacter(seed?, { kinds? }) -> Character` (same seed, same character).
- `listKinds() -> [{ kind, family, describe }]`, `registerKind(kind, { build, family, describe })`.
- `fromGLTF(gltf, { height?, clipMap?, scene? }) -> Character` for your own rigged models.
- `thirdPerson({ character, camera, dom, collide?, distance?, pitch? }) -> { update(dt), dispose(), intent, stick }`.

`Character`:
- `object3d` (THREE.Group, add it to the scene), `position` (Vector3), `height`, `state`, `auto` (bool).
- `move(x, z, dt, { run? })`: call each frame the character should move. (x, z) = world direction; length 0..1 = throttle. Faces +Z at rest; turns automatically.
- `update(dt)`: call EVERY frame, after move.
- `emote('jump'|'wave'|'attack'|'dance')`, `play('idle'|'walk'|'run'|'jump'|'wave'|'attack'|'dance'|'sit'|'fall')`, `knockDown(seconds)`.
- `say(text, seconds=2.5)`, `carry(object3d|null)`, `lookAt(x, z)`, `faceDirection(x, z, dt?)`, `dispose()`.
- Units are metres. Ground is y = 0. Characters cast and receive shadows (enable `renderer.shadowMap`).

## Brains (`playkin/rl`)

Steering (no training): `follow(getTarget, {stopAt, runBeyond})`, `chase(getTarget, {run})`, `flee(getThreat, {radius})`, `patrol(points, {reach, run})`, `wander({center, radius, pause})`, `either(when, a, b)`.
Each returns `{ act(selfPosition) -> { x, z, run } }`; then `character.move(m.x, m.z, dt, { run: m.run })`.

Policies (all: `act(obs, {explore}) -> int`, `observe({obs, action, reward, nextObs, done})`, `endEpisode()`, `toJSON()`):
- `new QLearning({ nActions, alpha=0.3, gamma=0.95, epsilon={start,end,episodes}, key? })`
- `new SoftQ({ nActions, temperature=0.05, minTemperature=0.01, decayEpisodes=2000, alpha, gamma })` (Boltzmann policy, soft Bellman target)
- `new PPO({ obsSize, nActions, hidden=[64,64], lr=3e-3, gamma, lambda, clip, entropy, batchSteps=1024, minibatch=256 })`
- `new RandomPolicy({ nActions })`, `new FunctionPolicy(obs => action)`, `loadPolicy(json)`

Training: `train(env, policy, { episodes, maxSteps?, onEpisode? }) -> Trainer`, `evaluate(env, policy, { episodes }) -> { return, steps }`,
`new Trainer(env, policy).runInBackground({ episodes, perFrame, onProgress })`, `selfPlay(env, { roleA: policy, roleB: policy }, { episodes, snapshotEvery, pool })`, `new OpponentPool({ capacity, latest })`.

Environments: `new GridChaseEnv({ width=9, height=9, walls=0.12, maxSteps=60, learner='chaser'|'runner', opponent?, seed?, fixedMap? })` (actions 0..4 = north, east, south, west, stay; `state()` gives positions for drawing), `new FetchEnv({ width=8, height=8, maxSteps=60 })`.
Custom env: any object with `reset() -> obs` and `step(action) -> { obs, reward, done, info }`.

Runtime glue: `new Brain({ policy, observe: () => obs, interval=0.25, explore=false, learn=false, reward? })`, `brain.tick(dt) -> action`, `gridActionToMove(action) -> { x, z }`.

## Gotchas

- Call `character.update(dt)` every frame or nothing animates.
- `move()` is per frame and does not persist; stop calling it and the character stops.
- Grid actions use y-down grid coordinates; `gridActionToMove` maps them to world x/z.
- Q-learning tables key observations by rounding to 3 decimals; leave out continuous features like time for tabular policies.

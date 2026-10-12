# playkin

Drop-in 3D game characters for three.js, with brains.

- **12 characters, no asset files.** Human, robot, knight, wizard, ninja, zombie, dog, cat, fox, deer, slime, bird. Every one is built from simple shapes in code, so there is nothing to download, license or rig.
- **9 animations on every character.** idle, walk, run, jump, wave, attack, dance, sit, fall. They blend into each other, and walking speed matches the ground so feet do not slide.
- **One API for all of them.** `move`, `update`, `emote`, `say`, `carry`, `knockDown`.
- **A separate RL module (`playkin/rl`).** Steering behaviours that need no training, plus Q-learning, soft (energy-based) Q-learning, PPO and self-play with an opponent pool. It has no dependencies and runs in the browser or Node.

**Live examples:** https://abneil.dev/playkin/examples/

## Thirty seconds to a character

```html
<script type="importmap">
{ "imports": {
  "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
  "playkin": "https://cdn.jsdelivr.net/gh/abhijithneilabraham/playkin@main/src/index.js",
  "playkin/rl": "https://cdn.jsdelivr.net/gh/abhijithneilabraham/playkin@main/src/rl/index.js"
} }
</script>
<script type="module">
import * as THREE from 'three';
import { createCharacter } from 'playkin';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight); document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x9fd0ef);
scene.add(new THREE.HemisphereLight(0xffffff, 0x556644, 2));
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 100); camera.position.set(0, 2, 5);

const dog = createCharacter('dog');
scene.add(dog.object3d);
dog.say('Woof!');

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  dog.move(1, 0, dt);           // walk east; it turns and animates by itself
  dog.update(dt);
  renderer.render(scene, camera);
});
</script>
```

## Characters

```js
import { createCharacter, randomCharacter, listKinds } from 'playkin';

const knight = createCharacter('knight', { plume: 0x2f6fb5, height: 1.9 });
const villager = createCharacter('human', { hat: 'cowboy', held: 'lantern', top: 0xd2453a });
const someone = randomCharacter('seed-42');      // the same seed always gives the same character
listKinds();                                      // [{ kind, family, describe }, ...]
```

| Kind | What it is | Useful options |
|---|---|---|
| `human` | A person | `skin`, `hair`, `hairStyle` (short, long, bun, spiky, ponytail, bald), `top`, `bottom`, `shoes`, `hat`, `held` |
| `robot` | Boxy, glowing visor | `top`, `eyeColor` |
| `knight` | Armour, sword, shield | `plume` |
| `wizard` | Robe, hat, beard, staff | `robe` |
| `ninja` | Dark, fast, katana | `band` |
| `zombie` | Arms out, slow | |
| `dog` | Floppy ears, wagging tail | `fur`, `ear` |
| `cat` | Pointy ears, long tail | `fur` |
| `fox` | White-tipped tail | `fur` |
| `deer` | Antlers, long legs | `fur` |
| `slime` | Bouncy blob | `color`, `hat` |
| `bird` | Hops, flies when running | `color`, `crest` |

Hats: `cap`, `tophat`, `crown`, `beanie`, `wizard`, `helmet`, `headband`, `cowboy`, `antenna`.
Things to hold: `sword`, `staff`, `shield`, `torch`, `lantern`, `balloon`, `katana`.
Every kind also takes `height` (metres) and `name`.

### The character API

| Call | What it does |
|---|---|
| `c.object3d` | The `THREE.Group` to add to your scene |
| `c.position` | Shortcut for `c.object3d.position` |
| `c.move(x, z, dt, { run })` | Move this frame toward world direction (x, z), length 0 to 1 = throttle. It turns and picks walk or run. |
| `c.update(dt)` | Call every frame |
| `c.emote(name)` | Play `jump`, `wave`, `attack` or `dance` once, then carry on |
| `c.play(name)` | Switch clip directly; `sit` and `fall` hold until you play something else |
| `c.knockDown(seconds)` | Fall over and get up again |
| `c.say(text, seconds)` | Speech bubble |
| `c.carry(object3d)` | Hold any object in front (pass `null` to drop) |
| `c.lookAt(x, z)` / `c.faceDirection(x, z)` | Turn |
| `c.auto = false` | Stop choosing idle / walk / run automatically |

### Your own models

```js
import { fromGLTF } from 'playkin';
const hero = fromGLTF(gltf, { height: 1.8, clipMap: { idle: 'Idle', walk: 'Walking', run: 'Running', jump: 'Jump' } });
```

### A player you can drive

```js
import { thirdPerson } from 'playkin';
const ctl = thirdPerson({ character: hero, camera, dom: renderer.domElement, collide: (pos, r) => { /* push pos out of walls */ } });
// each frame: ctl.update(dt)   (WASD, Shift, Space, drag to orbit, wheel to zoom)
```

## Brains: `playkin/rl`

### No training needed

```js
import { follow, flee, chase, patrol, wander, either } from 'playkin/rl';

const pet = follow(() => player.position, { stopAt: 1.5 });
const shy = flee(() => player.position, { radius: 6 });
const guard = patrol([{ x: 0, z: 0 }, { x: 10, z: 0 }]);

// each frame, for each character:
const m = pet.act(dog.position);
dog.move(m.x, m.z, dt, { run: m.run });
dog.update(dt);
```

### Learned behaviour

Every policy has the same shape: `act(obs, { explore })`, `observe({ obs, action, reward, nextObs, done })`, and `toJSON()` / `loadPolicy(json)`.

| Policy | Use it when |
|---|---|
| `QLearning` | Situations repeat (grids, menus, card games). Fast and dependable. |
| `SoftQ` | Like Q-learning, but the character keeps some variety. π(a\|s) ∝ exp(Q/α), with a soft Bellman target, so it never collapses to one move while α > 0. |
| `PPO` | Observations are continuous or too varied for a table. Uses a small neural net in plain JS. |
| `RandomPolicy`, `FunctionPolicy` | Baselines, scripts, or wrapping any function (or a decision model) as a policy |

```js
import { GridChaseEnv, QLearning, train, evaluate, selfPlay } from 'playkin/rl';

const env = new GridChaseEnv({ width: 9, height: 9 });      // tag: chaser vs runner among walls
const dogBrain = new QLearning({ nActions: 5 });
train(env, dogBrain, { episodes: 4000 });                   // a few seconds
evaluate(env, dogBrain).return;

// both sides learn, each against a pool of the other's past selves (the hide-and-seek trick)
selfPlay(env, { chaser: new QLearning({ nActions: 5 }), runner: new QLearning({ nActions: 5 }) }, { episodes: 4000 });

localStorage.setItem('dog', JSON.stringify(dogBrain.toJSON()));   // save the brain
```

Bring your own game: an environment is any object with `reset() -> obs` and `step(action) -> { obs, reward, done, info }`. Two-player environments also provide `stepBoth({ role: action })` and `observe(role)` for self-play.

To put a learned policy on a character while the game runs, use `Brain`:

```js
import { Brain, gridActionToMove } from 'playkin/rl';
const brain = new Brain({ policy: dogBrain, observe: () => env.observe('chaser'), interval: 0.3 });
// each frame:
const m = gridActionToMove(brain.tick(dt)); dog.move(m.x, m.z, dt, { run: true });
```

Training in a browser without freezing the page:

```js
import { Trainer } from 'playkin/rl';
new Trainer(env, dogBrain).runInBackground({ episodes: 5000, perFrame: 25, onProgress: t => console.log(t.recent()) });
```

## For vibe coders

Point your AI assistant at [AGENTS.md](AGENTS.md) (or [llms.txt](llms.txt)): it lists the import map and every function with its exact signature, so the code it writes works the first time. A prompt that works well:

> Use playkin (see AGENTS.md) for the characters. Make a cosy farm where a dog follows the player, chickens wander, and a fox learns to sneak past the dog with playkin/rl SoftQ.

## Run it locally

```bash
git clone https://github.com/abhijithneilabraham/playkin && cd playkin
python3 -m http.server 8000      # then open http://localhost:8000/examples/
npm test                         # RL tests, Node 18+
```

## License

MIT. Every character is generated from code, so there are no third-party assets to credit.

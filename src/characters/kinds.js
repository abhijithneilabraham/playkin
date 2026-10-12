// The catalogue: named kinds, a seeded random generator, and a registry so you can add your own.
import { Character } from './core.js';
import { buildBiped, buildQuadruped, buildSlime, buildBird, material, HATS, HELD } from './rigs.js';

const SKIN = [0xf1c7a5, 0xe0a982, 0xc68863, 0x8d5a3c, 0x5e3b27, 0xf5d6c3];
const HAIR = [0x2b1d14, 0x5a3825, 0xc89b5d, 0xe8d38f, 0x8a2f1d, 0x1b1b1f, 0xbfbfc6, 0x6b4bd6];
const CLOTH = [0x2f6fb5, 0xd2453a, 0x3c9a5f, 0xf0b33c, 0x7d4fc0, 0x2d3440, 0xe9e3d5, 0xe2738f, 0x3aa8b8, 0x8a5a33];

function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
function rngFrom(seed) {
  let a = (typeof seed === 'string' ? [...seed].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619), 2166136261) : seed) >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Every kind maps options -> a rig. `defaults` documents the options each kind understands. */
const KINDS = {
  human: { family: 'biped', describe: 'A person. Options: skin, hair, hairStyle, top, bottom, shoes, hat, held.',
    build: o => buildBiped({ skin: SKIN[1], hair: HAIR[0], hairStyle: 'short', top: CLOTH[0], bottom: 0x2d3440, ...o }) },
  robot: { family: 'biped', describe: 'A boxy robot with a glowing visor.',
    build: o => buildBiped({ look: 'boxy', visor: true, skin: 0xb9c0c9, top: o.top || 0xe0a13b, bottom: 0x6d7682, shoes: 0x3a3f47, eyeColor: o.eyeColor || 0x5cf2ff, eyesGlow: true,
      skinMat: { metal: 0.6, rough: 0.35 }, topMat: { metal: 0.4, rough: 0.4 }, hat: 'antenna', gait: 'robot', ...o }) },
  knight: { family: 'biped', describe: 'Armour, helmet, sword and shield.',
    build: o => buildBiped({ skin: SKIN[0], top: 0x9aa3ad, bottom: 0x6f7780, boots: true, shoes: 0x3b3f45, gloves: 0x6f7780, sleeves: 'long', topMat: { metal: 0.7, rough: 0.35 }, bottomMat: { metal: 0.6, rough: 0.4 },
      hat: 'helmet', hatColor: o.plume || 0xc0392b, held: 'sword', offhand: 'shield', runSpeed: 3.6, ...o }) },
  wizard: { family: 'biped', describe: 'Robe, pointed hat, beard and a glowing staff.',
    build: o => buildBiped({ skin: SKIN[0], top: o.robe || 0x4b3a8c, bottom: o.robe || 0x4b3a8c, sleeves: 'long', hair: 0xd8d8de, hairStyle: 'long', hat: 'wizard', hatColor: o.robe || 0x4b3a8c, held: 'staff', walkSpeed: 1.2, runSpeed: 3.2,
      extras: ({ head, hips, mesh, cone, material: m }) => { const beard = mesh(head, cone(0.12, 0.3, 8), m(0xe6e6ec), 0, -0.05, 0.1); beard.rotation.x = Math.PI;
        mesh(hips, cone(0.34, 0.9, 12), m(o.robe || 0x4b3a8c), 0, -0.42, 0); }, ...o }) },
  ninja: { family: 'biped', describe: 'Quick and quiet, with a katana.',
    build: o => buildBiped({ skin: SKIN[2], top: 0x1d1f26, bottom: 0x1d1f26, shoes: 0x111216, sleeves: 'long', gloves: 0x1d1f26, hair: 0x111216, hat: 'headband', hatColor: o.band || 0xc0392b, held: 'katana', gait: 'sneak', walkSpeed: 1.7, runSpeed: 5.4, ...o }) },
  zombie: { family: 'biped', describe: 'Arms out, slow, relentless.',
    build: o => buildBiped({ skin: 0x8fb07a, top: 0x5b6b4a, bottom: 0x3b3a4a, hair: 0x2b2a22, hairStyle: 'spiky', eyeColor: 0xff3b3b, eyesGlow: true, gait: 'zombie', walkSpeed: 0.7, runSpeed: 1.8, ...o }) },
  dog: { family: 'quadruped', describe: 'Floppy ears, wagging tail. Good at fetch.',
    build: o => buildQuadruped({ fur: 0xc98a4b, belly: 0xf0d2a8, ears: 'floppy', ear: 0x7a4a26, tail: 'wag', ...o }) },
  cat: { family: 'quadruped', describe: 'Pointy ears and a long tail.',
    build: o => buildQuadruped({ fur: 0x5a5f6b, belly: 0xd9d4cc, ears: 'pointy', tail: 'long', bodyLen: 0.55, legLen: 0.26, width: 0.22, snout: 0.06, headScale: 0.9, walkSpeed: 1.1, runSpeed: 5.5, ...o }) },
  fox: { family: 'quadruped', describe: 'Orange, quick, with a white-tipped tail.',
    build: o => buildQuadruped({ fur: 0xd8692a, belly: 0xf6eee2, paws: 0x2a2224, ears: 'pointy', ear: 0x2a2224, tail: 'fluffy', tailTip: 0xf6eee2, snout: 0.16, bodyLen: 0.62, legLen: 0.3, ...o }) },
  deer: { family: 'quadruped', describe: 'Long legs and antlers.',
    build: o => buildQuadruped({ fur: 0x9a6a3c, belly: 0xe8d6b8, ears: 'antlers', tail: 'short', legLen: 0.62, bodyLen: 0.9, neckLen: 0.34, snout: 0.12, walkSpeed: 1.4, runSpeed: 7, ...o }) },
  slime: { family: 'slime', describe: 'A bouncy blob.', build: o => buildSlime({ color: 0x59d98e, ...o }) },
  bird: { family: 'bird', describe: 'Hops when it walks, flies when it runs.', build: o => buildBird({ color: 0x3a7bd5, wing: 0x2a5aa0, belly: 0xf3ead8, ...o }) },
};

/** All built-in kinds, with a short description each. */
export function listKinds() { return Object.entries(KINDS).map(([kind, k]) => ({ kind, family: k.family, describe: k.describe })); }

/** Add your own kind. `build(options)` must return a rig (see rigs.js). */
export function registerKind(kind, { build, family = 'custom', describe = '' }) { KINDS[kind] = { build, family, describe }; }

/**
 * Make a character.
 * @param {string} kind  one of listKinds(), e.g. 'human', 'dog', 'robot'
 * @param {object} [options]  colours and gear, plus `height` in metres and `name`
 */
export function createCharacter(kind = 'human', options = {}) {
  const k = KINDS[kind];
  if (!k) throw new Error(`playkin: unknown kind "${kind}". Try one of: ${Object.keys(KINDS).join(', ')}`);
  return new Character(kind, k.build(options), options);
}

/** A different but repeatable character for every seed (number or string). */
export function randomCharacter(seed = Math.random() * 1e9, { kinds } = {}) {
  const rng = rngFrom(seed), pool = kinds || Object.keys(KINDS);
  const kind = pick(rng, pool), o = {};
  if (KINDS[kind].family === 'biped') {
    Object.assign(o, { skin: pick(rng, SKIN), hair: pick(rng, HAIR), hairStyle: pick(rng, ['short', 'long', 'bun', 'spiky', 'ponytail', 'bald']), top: pick(rng, CLOTH), bottom: pick(rng, CLOTH) });
    if (kind === 'human') { if (rng() < 0.55) { o.hat = pick(rng, HATS.filter(h => h !== 'antenna' && h !== 'helmet')); o.hatColor = pick(rng, CLOTH); } if (rng() < 0.3) o.held = pick(rng, HELD.filter(h => h !== 'shield')); }
    if (kind === 'robot') { o.top = pick(rng, CLOTH); o.eyeColor = pick(rng, [0x5cf2ff, 0xff5a5a, 0x8dff6a, 0xffd34d]); }
    if (kind === 'knight') o.plume = pick(rng, CLOTH);
    if (kind === 'wizard') o.robe = pick(rng, CLOTH);
    if (kind === 'ninja') o.band = pick(rng, CLOTH);
    if (kind !== 'human') { delete o.skin; delete o.hair; delete o.hairStyle; if (kind !== 'robot') { delete o.top; } delete o.bottom; }
  } else if (kind === 'slime') { o.color = pick(rng, [0x59d98e, 0x5aa9ff, 0xff7aa8, 0xffc94d, 0xb38cff]); if (rng() < 0.4) { o.hat = pick(rng, ['crown', 'tophat', 'beanie', 'wizard']); o.hatColor = pick(rng, CLOTH); } }
  else if (kind === 'bird') { o.color = pick(rng, [0x3a7bd5, 0xd9443a, 0xf2c14e, 0x3c9a5f, 0x2b2b33]); o.wing = o.color; if (rng() < 0.5) o.crest = pick(rng, CLOTH); }
  else if (kind === 'dog') { o.fur = pick(rng, [0xc98a4b, 0x2b2522, 0xe8dcc8, 0x8a5a33, 0xd8b07a]); o.ear = pick(rng, [o.fur, 0x5a3825, 0x2b2522]); }
  else if (kind === 'cat') { o.fur = pick(rng, [0x5a5f6b, 0xe08a3c, 0x222226, 0xe8e4dc, 0x9a8f80]); }
  o.height = undefined;
  return createCharacter(kind, o);
}

export { material };

// playkin: drop-in 3D game characters for three.js, with brains.
export { Character, CLIPS } from './characters/core.js';
export { createCharacter, randomCharacter, listKinds, registerKind, material } from './characters/kinds.js';
export { HATS, HELD } from './characters/rigs.js';
export { fromGLTF } from './characters/gltf.js';
export { thirdPerson } from './controllers/thirdPerson.js';

// Use your own rigged glTF model with the same API as the built-in characters.
//
//   const gltf = await new GLTFLoader().loadAsync('hero.glb');
//   const hero = fromGLTF(gltf, { clipMap: { idle: 'Idle', walk: 'Walking', run: 'Running', jump: 'Jump' } });
//
// Pass a clone of gltf.scene (SkeletonUtils.clone) when you need several copies of one model.
import * as THREE from 'three';
import { Character } from './core.js';

export function fromGLTF(gltf, { clipMap = {}, height, scene = gltf.scene, walkSpeed = 1.5, runSpeed = 4.2, name } = {}) {
  const root = new THREE.Group(), model = scene;
  const box = new THREE.Box3().setFromObject(model), h = Math.max(0.01, box.max.y - box.min.y);
  const scale = height ? height / h : 1;
  model.scale.multiplyScalar(scale); root.add(model);
  const mixer = new THREE.AnimationMixer(model), actions = {};
  const find = n => gltf.animations.find(a => a.name === n) || gltf.animations.find(a => a.name.toLowerCase().includes(String(n).toLowerCase()));
  for (const clip of ['idle', 'walk', 'run', 'jump', 'wave', 'attack', 'dance', 'sit', 'fall']) {
    const a = find(clipMap[clip] || clip); if (!a) continue;
    actions[clip] = mixer.clipAction(a);
    if (['jump', 'wave', 'attack', 'fall'].includes(clip)) { actions[clip].setLoop(THREE.LoopOnce, 1); actions[clip].clampWhenFinished = true; }
  }
  const noop = () => ({});
  const rig = { root, parts: { root }, nominalHeight: height || h, walkSpeed, runSpeed, stride: 0.55, clips: Object.fromEntries(Object.keys(actions).concat('idle').map(k => [k, noop])) };
  const c = new Character('gltf', rig, { height: height || h, name, walkSpeed, runSpeed });
  c.scale = 1; c.walkSpeed = walkSpeed; c.runSpeed = runSpeed;
  c.mixer = mixer; c.actions = actions;
  let current = null;
  c._pose = function () {
    if (current !== this.state && actions[this.state]) {
      const next = actions[this.state]; next.reset().fadeIn(this.fade).play();
      if (current && actions[current]) actions[current].fadeOut(this.fade);
      current = this.state;
    }
  };
  const baseUpdate = c.update.bind(c);
  c.update = dt => { baseUpdate(dt); mixer.update(dt); return c; };
  return c;
}

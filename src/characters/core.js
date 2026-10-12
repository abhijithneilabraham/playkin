// The Character class: one API for every kind of character.
//
//   const c = createCharacter('dog');
//   scene.add(c.object3d);
//   c.move(x, z, dt, { run });   // each frame you want it to walk, x/z in [-1, 1]
//   c.update(dt);                // every frame
//
// Animations are procedural: each rig is a hierarchy of simple meshes, and each clip is a function
// that poses those parts over time. No skinning, no asset files, nothing to download.
import * as THREE from 'three';

export const CLIPS = ['idle', 'walk', 'run', 'jump', 'wave', 'attack', 'dance', 'sit', 'fall'];
// clips that play once and then hand back to walking / idling
const ONE_SHOT = { jump: 0.75, wave: 1.8, attack: 0.55, dance: 3.2 };
// clips that hold until you play something else
const HOLD = new Set(['sit', 'fall']);
const LOCOMOTION = new Set(['idle', 'walk', 'run']);

export class Character {
  /**
   * @param {string} kind
   * @param {{ root: THREE.Object3D, parts: Record<string, THREE.Object3D>, clips: Record<string, Function>,
   *           nominalHeight: number, walkSpeed: number, runSpeed: number, stride: number }} rig
   * @param {{ height?: number, name?: string }} opts
   */
  constructor(kind, rig, opts = {}) {
    this.kind = kind;
    this.rig = rig;
    this.object3d = new THREE.Group();
    this.object3d.name = opts.name || kind;
    this.object3d.userData.character = this;
    this.height = opts.height || rig.nominalHeight;
    this.scale = this.height / rig.nominalHeight;
    rig.root.scale.setScalar(this.scale);
    this.object3d.add(rig.root);
    this.walkSpeed = (opts.walkSpeed || rig.walkSpeed) * this.scale;
    this.runSpeed = (opts.runSpeed || rig.runSpeed) * this.scale;
    this.auto = true;              // pick idle / walk / run from movement automatically
    this.state = 'idle';
    this.t = 0;                    // time in the current clip
    this.phase = 0;                // gait phase, advanced by distance so feet do not slide
    this.prev = null;              // clip we are blending away from
    this.blend = 1;
    this.fade = 0.2;
    this.oneShot = 0;
    this.speed = 0;
    this.heading = 0;
    this.velocity = new THREE.Vector3();
    this._moved = false;
    this._bubble = null;
    // remember the rest pose of every part so clips can be written as offsets
    this.base = {};
    for (const [k, p] of Object.entries(rig.parts)) this.base[k] = { p: p.position.clone(), r: p.rotation.clone(), s: p.scale.clone() };
    this.object3d.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  }

  get position() { return this.object3d.position; }

  /** Switch clip. Locomotion clips are chosen for you while `auto` is on. */
  play(name, { fade = 0.2 } = {}) {
    if (!this.rig.clips[name]) name = 'idle';
    if (name === this.state) return this;
    this.prev = { name: this.state, t: this.t, phase: this.phase };
    this.state = name; this.t = 0; this.blend = 0; this.fade = fade;
    this.oneShot = ONE_SHOT[name] || 0;
    return this;
  }

  /** Play a one-shot clip (jump, wave, attack, dance) and then go back to moving or idling. */
  emote(name) { return this.play(name, { fade: 0.12 }); }

  /** Knock the character over; it gets up again after `seconds` (or stays down if 0). */
  knockDown(seconds = 2.5) {
    this.play('fall', { fade: 0.1 });
    clearTimeout(this._getUp);
    if (seconds) this._getUp = setTimeout(() => this.state === 'fall' && this.play('idle', { fade: 0.4 }), seconds * 1000);
    return this;
  }

  /**
   * Move this frame. (x, z) is a direction in world space; its length (0..1) is the throttle.
   * The character turns to face where it goes.
   */
  move(x, z, dt, { run = false } = {}) {
    if (HOLD.has(this.state)) return this;
    const len = Math.hypot(x, z);
    if (len < 1e-3) return this;
    const k = Math.min(1, len), speed = (run ? this.runSpeed : this.walkSpeed) * k;
    this.object3d.position.x += x / len * speed * dt;
    this.object3d.position.z += z / len * speed * dt;
    this.velocity.set(x / len * speed, 0, z / len * speed);
    this.speed = speed; this._moved = true; this._run = run;
    this.faceDirection(x, z, dt);
    return this;
  }

  /** Turn smoothly toward a direction (or instantly when dt is omitted). */
  faceDirection(x, z, dt) {
    const target = Math.atan2(x, z);
    let d = target - this.heading; d = Math.atan2(Math.sin(d), Math.cos(d));
    this.heading += dt === undefined ? d : d * Math.min(1, dt * 12);
    this.object3d.rotation.y = this.heading;
    return this;
  }

  lookAt(x, z) { return this.faceDirection(x - this.position.x, z - this.position.z); }

  /** Show a speech bubble over the character's head. */
  say(text, seconds = 2.5) {
    if (this._bubble) { this.object3d.remove(this._bubble); this._bubble.material.map.dispose(); this._bubble.material.dispose(); }
    this._bubble = makeBubble(text);
    this._bubble.position.y = this.height + 0.35 * Math.max(1, this.scale);
    this._bubbleT = seconds;
    this.object3d.add(this._bubble);
    return this;
  }

  /** Hold something (any Object3D) in front of the character, or pass null to drop it. */
  carry(object) {
    const slot = this.rig.parts.carry || this.rig.root;
    if (this._carried) slot.remove(this._carried);
    this._carried = object || null;
    if (object) slot.add(object);
    return this;
  }

  update(dt) {
    this.t += dt;
    if (!this._moved) { this.speed = 0; this.velocity.set(0, 0, 0); }
    if (this.oneShot && this.t >= this.oneShot) this.play(this._locomotion(), { fade: 0.25 });
    else if (this.auto && LOCOMOTION.has(this.state)) this.play(this._locomotion());
    this.phase += (this.speed / Math.max(0.05, this.rig.stride * this.scale)) * dt * Math.PI;
    if (this.state === 'idle') this.phase += dt * 0.6;
    this.blend = Math.min(1, this.blend + dt / Math.max(0.01, this.fade));
    if (this.prev) this.prev.t += dt;
    if (this.blend >= 1) this.prev = null;
    this._pose();
    if (this._bubble) { this._bubbleT -= dt; if (this._bubbleT <= 0) { this.object3d.remove(this._bubble); this._bubble = null; } }
    this._moved = false;
    return this;
  }

  _locomotion() { return this.speed < 0.05 ? 'idle' : this._run && this.speed > this.walkSpeed * 1.05 ? 'run' : 'walk'; }

  _ctx(name, t, phase) {
    const dur = ONE_SHOT[name] || 1;
    return { t, phase, k: Math.min(1, t / dur), speed: this.speed / this.scale, s: Math.sin(phase), c: Math.cos(phase) };
  }

  _pose() {
    const cur = this.rig.clips[this.state](this._ctx(this.state, this.t, this.phase)) || {};
    const old = this.prev ? this.rig.clips[this.prev.name](this._ctx(this.prev.name, this.prev.t, this.prev.phase)) || {} : null;
    const w = this.prev ? smooth(this.blend) : 1;
    for (const [k, part] of Object.entries(this.rig.parts)) {
      const b = this.base[k], a = cur[k] || ZERO, o = old ? (old[k] || ZERO) : a;
      const v = f => (o[f] || 0) + ((a[f] || 0) - (o[f] || 0)) * w;
      part.position.set(b.p.x + v('px'), b.p.y + v('py'), b.p.z + v('pz'));
      part.rotation.set(b.r.x + v('rx'), b.r.y + v('ry'), b.r.z + v('rz'));
      const sv = f => 1 + v(f);
      part.scale.set(b.s.x * sv('sx'), b.s.y * sv('sy'), b.s.z * sv('sz'));
    }
  }

  dispose() {
    this.object3d.removeFromParent();
    this.object3d.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  }
}

const ZERO = {};
const smooth = x => x * x * (3 - 2 * x);

function makeBubble(text) {
  const pad = 18, font = '600 34px system-ui, sans-serif';
  const c = document.createElement('canvas'), g = c.getContext('2d');
  g.font = font;
  const w = Math.min(900, Math.ceil(g.measureText(text).width) + pad * 2), h = 64;
  c.width = w; c.height = h + 16;
  g.font = font;
  g.fillStyle = 'rgba(255,255,255,0.95)'; g.strokeStyle = 'rgba(20,20,30,0.85)'; g.lineWidth = 3;
  g.beginPath(); g.roundRect(2, 2, w - 4, h - 4, 18); g.moveTo(w / 2 - 10, h - 3); g.lineTo(w / 2, h + 12); g.lineTo(w / 2 + 10, h - 3); g.fill(); g.stroke();
  g.fillStyle = '#1b1b26'; g.textBaseline = 'middle'; g.textAlign = 'center'; g.fillText(text, w / 2, h / 2, w - pad);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(w / 160, (h + 16) / 160, 1); s.renderOrder = 999;
  return s;
}

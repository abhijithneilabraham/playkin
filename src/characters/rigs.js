// Rig builders and their clips. Every character is a small hierarchy of low-poly meshes.
// Convention: characters face +Z, up is +Y, units are metres. A negative rotation.x on a limb
// pivot swings that limb forward.
import * as THREE from 'three';

const geoCache = new Map();
function cached(key, make) { if (!geoCache.has(key)) geoCache.set(key, make()); return geoCache.get(key); }
export function material(color, { metal = 0, rough = 0.75, emissive = 0, flat = true } = {}) {
  return new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough, flatShading: flat, emissive: emissive ? color : 0x000000, emissiveIntensity: emissive });
}
const capsule = (r, len) => cached(`c${r}|${len}`, () => new THREE.CapsuleGeometry(r, len, 3, 8));
const box = (x, y, z) => cached(`b${x}|${y}|${z}`, () => new THREE.BoxGeometry(x, y, z));
const sphere = (r, w = 12, h = 8) => cached(`s${r}|${w}|${h}`, () => new THREE.SphereGeometry(r, w, h));
const cone = (r, h, n = 10) => cached(`k${r}|${h}|${n}`, () => new THREE.ConeGeometry(r, h, n));
const cyl = (a, b, h, n = 10) => cached(`y${a}|${b}|${h}|${n}`, () => new THREE.CylinderGeometry(a, b, h, n));

function mesh(parent, geo, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; }
function pivot(parent, parts, name, x = 0, y = 0, z = 0) { const g = new THREE.Group(); g.name = name; g.position.set(x, y, z); parent.add(g); parts[name] = g; return g; }

// ═════════════════════════════════════ bipeds ═════════════════════════════════════
// options: skin, top, bottom, shoes, hair, hairStyle, look ('soft' | 'boxy'), hat, held, extras
export function buildBiped(o) {
  const parts = {}, root = new THREE.Group(); parts.root = root;
  const boxy = o.look === 'boxy';
  const skin = material(o.skin, o.skinMat), top = material(o.top, o.topMat), bottom = material(o.bottom, o.bottomMat), shoes = material(o.shoes || 0x2a2a30);
  const limb = (r, len) => boxy ? box(r * 2, len, r * 2) : capsule(r, len - r * 2);
  const hips = pivot(root, parts, 'hips', 0, 0.92, 0);
  mesh(hips, boxy ? box(0.34, 0.16, 0.2) : capsule(0.12, 0.12), bottom, 0, 0, 0).rotation.z = boxy ? 0 : Math.PI / 2;
  const torso = pivot(hips, parts, 'torso', 0, 0.06, 0);
  mesh(torso, boxy ? box(0.42, 0.5, 0.26) : capsule(0.17, 0.26), top, 0, 0.27, 0).scale.set(1.15, 1, 0.8);
  const head = pivot(torso, parts, 'head', 0, 0.6, 0);
  const skull = mesh(head, boxy ? box(0.3, 0.3, 0.3) : sphere(0.16, 14, 10), o.headMat ? material(o.headMat) : skin, 0, 0.13, 0);
  if (!boxy) skull.scale.set(1, 1.08, 1);
  const eye = o.eyeColor ? material(o.eyeColor, { emissive: o.eyesGlow ? 1.4 : 0 }) : material(0x1d1b22);
  if (boxy && o.visor) mesh(head, box(0.24, 0.07, 0.02), eye, 0, 0.16, 0.155);
  else for (const s of [-1, 1]) mesh(head, sphere(boxy ? 0.03 : 0.025, 8, 6), eye, s * 0.06, 0.15, boxy ? 0.15 : 0.145);
  // arms: shoulder pivot -> upper arm -> elbow pivot -> forearm and hand
  for (const [side, s] of [['L', 1], ['R', -1]]) {
    const sh = pivot(torso, parts, 'uArm' + side, s * 0.23, 0.48, 0);
    sh.rotation.z = s * 0.12;
    mesh(sh, limb(0.055, 0.3), top, 0, -0.15, 0);
    const el = pivot(sh, parts, 'fArm' + side, 0, -0.3, 0);
    mesh(el, limb(0.048, 0.27), o.sleeves === 'long' ? top : skin, 0, -0.13, 0);
    pivot(el, parts, 'hand' + side, 0, -0.29, 0);
    mesh(parts['hand' + side], boxy ? box(0.09, 0.09, 0.09) : sphere(0.055, 8, 6), o.gloves ? material(o.gloves) : skin, 0, 0, 0);
  }
  // legs: hip pivot -> thigh -> knee pivot -> shin and foot
  for (const [side, s] of [['L', 1], ['R', -1]]) {
    const th = pivot(hips, parts, 'thigh' + side, s * 0.1, -0.02, 0);
    mesh(th, limb(0.07, 0.42), bottom, 0, -0.21, 0);
    const kn = pivot(th, parts, 'shin' + side, 0, -0.42, 0);
    mesh(kn, limb(0.06, 0.4), o.boots ? shoes : bottom, 0, -0.2, 0);
    mesh(kn, box(0.12, 0.08, 0.22), shoes, 0, -0.42, 0.04);
  }
  pivot(torso, parts, 'carry', 0, 0.25, 0.32);
  if (o.hair && o.hairStyle !== 'bald') addHair(head, material(o.hair), o.hairStyle, boxy);
  if (o.hat) addHat(head, o.hat, o.hatColor);
  if (o.extras) o.extras({ parts, root, head, torso, hips, material, mesh, box, sphere, cone, cyl, capsule });
  if (o.held) addHeld(parts.handR, o.held);
  if (o.offhand) addHeld(parts.handL, o.offhand);
  return { root, parts, nominalHeight: 1.75, walkSpeed: o.walkSpeed || 1.5, runSpeed: o.runSpeed || 4.2, stride: 0.55, clips: bipedClips(o.gait || 'normal') };
}

function addHair(head, mat, style, boxy) {
  if (boxy) { mesh(head, box(0.32, 0.08, 0.32), mat, 0, 0.3, 0); return; }
  const cap = mesh(head, cached('hair', () => new THREE.SphereGeometry(0.17, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2)), mat, 0, 0.15, -0.01);
  cap.scale.set(1.04, 1.1, 1.06);
  if (style === 'long') mesh(head, box(0.3, 0.32, 0.08), mat, 0, 0.02, -0.12);
  if (style === 'bun') mesh(head, sphere(0.08, 8, 6), mat, 0, 0.3, -0.1);
  if (style === 'spiky') for (let k = 0; k < 5; k++) { const c = mesh(head, cone(0.05, 0.14, 5), mat, -0.1 + k * 0.05, 0.31, -0.02); c.rotation.z = (k - 2) * 0.25; }
  if (style === 'ponytail') { const p = mesh(head, capsule(0.04, 0.18), mat, 0, 0.12, -0.2); p.rotation.x = 0.5; }
}
export const HATS = ['cap', 'tophat', 'crown', 'beanie', 'wizard', 'helmet', 'headband', 'cowboy', 'antenna'];
function addHat(head, kind, color = 0x2c3e66) {
  const m = material(color);
  if (kind === 'cap') { mesh(head, cached('capTop', () => new THREE.SphereGeometry(0.175, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2)), m, 0, 0.16, 0); mesh(head, box(0.22, 0.02, 0.16), m, 0, 0.17, 0.15); }
  if (kind === 'tophat') { mesh(head, cyl(0.21, 0.21, 0.02, 16), m, 0, 0.27, 0); mesh(head, cyl(0.12, 0.12, 0.24, 16), m, 0, 0.4, 0); }
  if (kind === 'crown') { const g = material(0xf2c14e, { metal: 0.8, rough: 0.3 }); mesh(head, cyl(0.13, 0.13, 0.07, 10), g, 0, 0.31, 0); for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; mesh(head, cone(0.03, 0.08, 4), g, Math.sin(a) * 0.12, 0.38, Math.cos(a) * 0.12); } }
  if (kind === 'beanie') { mesh(head, cached('beanie', () => new THREE.SphereGeometry(0.18, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2)), m, 0, 0.17, 0); mesh(head, sphere(0.05, 8, 6), material(0xffffff), 0, 0.35, 0); }
  if (kind === 'wizard') { mesh(head, cyl(0.26, 0.26, 0.02, 16), m, 0, 0.27, 0); const c = mesh(head, cone(0.15, 0.45, 12), m, 0, 0.5, -0.03); c.rotation.x = -0.2; }
  if (kind === 'helmet') { const s = material(0xb8bec7, { metal: 0.7, rough: 0.35 }); mesh(head, cyl(0.19, 0.18, 0.32, 12), s, 0, 0.15, 0); mesh(head, box(0.26, 0.03, 0.02), material(0x15161a), 0, 0.16, 0.185); mesh(head, cone(0.04, 0.16, 6), material(color), 0, 0.38, 0); }
  if (kind === 'headband') { mesh(head, cyl(0.172, 0.172, 0.05, 14), m, 0, 0.2, 0); const t = mesh(head, box(0.04, 0.16, 0.02), m, 0.05, 0.12, -0.17); t.rotation.z = 0.4; }
  if (kind === 'cowboy') { mesh(head, cyl(0.3, 0.3, 0.02, 16), m, 0, 0.26, 0); mesh(head, cyl(0.13, 0.15, 0.18, 12), m, 0, 0.35, 0); }
  if (kind === 'antenna') { mesh(head, cyl(0.01, 0.01, 0.2, 6), material(0x888888), 0, 0.38, 0); mesh(head, sphere(0.035, 8, 6), material(0xff4d4d, { emissive: 1.5 }), 0, 0.5, 0); }
}
export const HELD = ['sword', 'staff', 'shield', 'torch', 'lantern', 'balloon', 'katana'];
function addHeld(hand, kind) {
  const g = new THREE.Group(); hand.add(g);
  if (kind === 'sword' || kind === 'katana') { const blade = material(0xd7dde4, { metal: 0.9, rough: 0.2 }); mesh(g, box(0.04, kind === 'katana' ? 0.75 : 0.6, 0.015), blade, 0, 0.36, 0.05); mesh(g, box(0.16, 0.03, 0.04), material(0x6b4a2f), 0, 0.05, 0.05); g.rotation.x = Math.PI / 2 - 0.3; }
  if (kind === 'staff') { mesh(g, cyl(0.02, 0.025, 1.4, 6), material(0x7a5230), 0, 0.2, 0.04); mesh(g, sphere(0.06, 10, 8), material(0x7fd3ff, { emissive: 1.2 }), 0, 0.92, 0.04); }
  if (kind === 'shield') { const s = mesh(g, cyl(0.24, 0.24, 0.04, 16), material(0x8a2f2f), 0, 0, 0.1); s.rotation.x = Math.PI / 2; mesh(g, sphere(0.05, 8, 6), material(0xd9b44a, { metal: 0.7 }), 0, 0, 0.13); }
  if (kind === 'torch') { mesh(g, cyl(0.02, 0.025, 0.45, 6), material(0x6b4a2f), 0, 0.15, 0.04); mesh(g, cone(0.06, 0.16, 6), material(0xff9a2e, { emissive: 2 }), 0, 0.44, 0.04); }
  if (kind === 'lantern') { mesh(g, box(0.12, 0.16, 0.12), material(0xffd36b, { emissive: 1.5 }), 0, -0.12, 0.04); }
  if (kind === 'balloon') { mesh(g, cyl(0.004, 0.004, 0.9, 4), material(0xeeeeee), 0, 0.45, 0); mesh(g, sphere(0.16, 12, 10), material(0xff5a7a, { rough: 0.3 }), 0, 1.0, 0); }
  return g;
}

function bipedClips(gait) {
  const zombie = gait === 'zombie', sneak = gait === 'sneak', robot = gait === 'robot';
  const armsOut = zombie ? { uArmL: { rx: -1.4 }, uArmR: { rx: -1.4 } } : {};
  return {
    idle: ({ t }) => ({
      torso: { rx: zombie ? 0.18 : 0, sy: Math.sin(t * 2) * 0.012 },
      head: { ry: Math.sin(t * 0.7) * 0.25, rx: zombie ? 0.3 : 0 },
      uArmL: { rz: 0.05 + Math.sin(t * 2) * 0.02, rx: armsOut.uArmL ? -1.4 : 0 }, uArmR: { rz: -0.05 - Math.sin(t * 2) * 0.02, rx: armsOut.uArmR ? -1.4 : 0 },
      fArmL: { rx: -0.15 }, fArmR: { rx: -0.15 },
    }),
    walk: ({ s, c }) => {
      const a = robot ? 0.45 : 0.55;
      return {
        root: { py: Math.abs(c) * 0.035 },
        hips: { ry: s * 0.08 }, torso: { ry: -s * 0.1, rx: zombie ? 0.25 : sneak ? 0.35 : 0.04 },
        head: { rx: zombie ? 0.3 : 0 },
        thighL: { rx: -s * a }, thighR: { rx: s * a },
        shinL: { rx: Math.max(0, c) * 0.7 }, shinR: { rx: Math.max(0, -c) * 0.7 },
        uArmL: { rx: zombie ? -1.4 : s * 0.5 }, uArmR: { rx: zombie ? -1.4 : -s * 0.5 },
        fArmL: { rx: zombie ? 0 : -0.3 }, fArmR: { rx: zombie ? 0 : -0.3 },
      };
    },
    run: ({ s, c }) => ({
      root: { py: Math.abs(c) * 0.09 },
      hips: { ry: s * 0.12 }, torso: { ry: -s * 0.18, rx: 0.28 }, head: { rx: -0.15 },
      thighL: { rx: -s * 0.95 - 0.15 }, thighR: { rx: s * 0.95 - 0.15 },
      shinL: { rx: Math.max(0, c) * 1.4 + 0.2 }, shinR: { rx: Math.max(0, -c) * 1.4 + 0.2 },
      uArmL: { rx: s * 0.9 }, uArmR: { rx: -s * 0.9 }, fArmL: { rx: -1.3 }, fArmR: { rx: -1.3 },
    }),
    jump: ({ k }) => {
      const crouch = k < 0.2 ? k / 0.2 : k > 0.85 ? (1 - k) / 0.15 : 0, air = k > 0.18 && k < 0.88 ? Math.sin((k - 0.18) / 0.7 * Math.PI) : 0;
      return {
        root: { py: air * 0.55 - crouch * 0.12 },
        thighL: { rx: -0.6 * crouch - 0.4 * air }, thighR: { rx: -0.6 * crouch - 0.2 * air },
        shinL: { rx: 1.0 * crouch + 0.7 * air }, shinR: { rx: 1.0 * crouch + 0.4 * air },
        torso: { rx: 0.3 * crouch }, uArmL: { rx: -2.6 * air, rz: 0.3 * air }, uArmR: { rx: -2.6 * air, rz: -0.3 * air },
      };
    },
    wave: ({ t }) => ({
      uArmR: { rz: -2.5, rx: -0.2 }, fArmR: { rz: -0.4 + Math.sin(t * 12) * 0.45 }, head: { rz: 0.12, ry: 0.15 },
      torso: { rz: -0.05 },
    }),
    attack: ({ k }) => {
      const wind = k < 0.35 ? k / 0.35 : 1, swing = k < 0.35 ? 0 : Math.min(1, (k - 0.35) / 0.2);
      return { torso: { ry: 0.5 * wind - 1.1 * swing }, uArmR: { rx: -2.4 * wind + 2.2 * swing, rz: -0.3 }, fArmR: { rx: -0.6 * (1 - swing) }, thighL: { rx: -0.3 * swing }, shinR: { rx: 0.3 * swing } };
    },
    dance: ({ t }) => {
      const b = t * 7;
      return {
        root: { py: Math.abs(Math.sin(b)) * 0.06 }, hips: { rz: Math.sin(b) * 0.12, ry: Math.sin(b / 2) * 0.4 },
        torso: { rz: -Math.sin(b) * 0.15 }, head: { rz: Math.sin(b) * 0.2 },
        uArmL: { rz: 2.3 + Math.sin(b) * 0.4 }, uArmR: { rz: -2.3 + Math.sin(b) * 0.4 },
        fArmL: { rz: 0.5 }, fArmR: { rz: -0.5 },
        thighL: { rx: -Math.max(0, Math.sin(b)) * 0.5 }, thighR: { rx: -Math.max(0, -Math.sin(b)) * 0.5 },
        shinL: { rx: Math.max(0, Math.sin(b)) * 0.8 }, shinR: { rx: Math.max(0, -Math.sin(b)) * 0.8 },
      };
    },
    sit: ({ t }) => ({
      root: { py: -0.42 }, thighL: { rx: -1.5 }, thighR: { rx: -1.5 }, shinL: { rx: 1.5 }, shinR: { rx: 1.5 },
      uArmL: { rx: -0.6 }, uArmR: { rx: -0.6 }, fArmL: { rx: -0.6 }, fArmR: { rx: -0.6 }, head: { ry: Math.sin(t * 0.5) * 0.3 },
    }),
    fall: ({ t }) => {
      const k = Math.min(1, t / 0.35);
      return {
        root: { rx: -1.5 * k, py: 0.15 * k, pz: -0.4 * k },
        uArmL: { rz: 1.2 * k }, uArmR: { rz: -1.2 * k }, thighL: { rz: 0.25 * k }, thighR: { rz: -0.25 * k }, head: { rx: -0.3 * k },
      };
    },
  };
}

// ═════════════════════════════════════ quadrupeds ═════════════════════════════════════
// options: fur, belly, legLen, bodyLen, ears ('floppy'|'pointy'|'antlers'), tail ('wag'|'long'|'fluffy'|'short'), snout
export function buildQuadruped(o) {
  const parts = {}, root = new THREE.Group(); parts.root = root;
  const fur = material(o.fur), belly = material(o.belly || o.fur), dark = material(0x1d1b22), nose = material(o.nose || 0x2a2224);
  const L = o.bodyLen || 0.7, legLen = o.legLen || 0.35, w = o.width || 0.28;
  const body = pivot(root, parts, 'body', 0, legLen + 0.12, 0);
  mesh(body, capsule(w / 2 + 0.04, L - w), fur, 0, 0, 0).rotation.x = Math.PI / 2;
  mesh(body, box(w * 0.8, 0.08, L * 0.7), belly, 0, -w / 2, 0);
  const neck = pivot(body, parts, 'neck', 0, w * 0.35, L / 2 - 0.02);
  mesh(neck, capsule(0.07, (o.neckLen || 0.14)), fur, 0, (o.neckLen || 0.14) * 0.5, 0.03).rotation.x = 0.5;
  const head = pivot(neck, parts, 'head', 0, (o.neckLen || 0.14) + 0.06, 0.08);
  mesh(head, sphere(0.12 * (o.headScale || 1), 12, 9), fur, 0, 0, 0);
  const snout = mesh(head, box(0.11, 0.09, (o.snout || 0.14)), belly, 0, -0.03, 0.11 + (o.snout || 0.14) / 2 - 0.05);
  mesh(head, sphere(0.03, 8, 6), nose, 0, -0.01, 0.11 + (o.snout || 0.14));
  for (const s of [-1, 1]) mesh(head, sphere(0.022, 8, 6), dark, s * 0.06, 0.04, 0.1);
  for (const s of [-1, 1]) {
    if (o.ears === 'floppy') { const e = mesh(head, box(0.06, 0.15, 0.03), material(o.ear || o.fur), s * 0.11, -0.01, -0.01); e.rotation.z = s * 0.25; }
    else if (o.ears === 'antlers') { const a = material(0xd8c7a4); const st = mesh(head, cyl(0.012, 0.018, 0.26, 5), a, s * 0.06, 0.2, -0.02); st.rotation.z = -s * 0.35;
      const br = mesh(head, cyl(0.01, 0.012, 0.14, 5), a, s * 0.12, 0.26, 0.03); br.rotation.set(0.6, 0, -s * 0.9);
      const e = mesh(head, cone(0.04, 0.1, 4), fur, s * 0.11, 0.08, -0.03); e.rotation.z = -s * 0.9; }
    else { const e = mesh(head, cone(0.045, 0.12, 4), material(o.ear || o.fur), s * 0.07, 0.13, -0.01); e.rotation.z = -s * 0.2; }
  }
  void snout;
  const tail = pivot(body, parts, 'tail', 0, w * 0.3, -L / 2);
  const tl = o.tail === 'long' ? 0.4 : o.tail === 'fluffy' ? 0.34 : o.tail === 'short' ? 0.08 : 0.24;
  const tm = mesh(tail, o.tail === 'fluffy' ? capsule(0.07, tl - 0.1) : capsule(0.025, tl), fur, 0, tl / 2, -0.02); tail.rotation.x = -0.7;
  if (o.tail === 'fluffy' && o.tailTip) mesh(tail, sphere(0.07, 8, 6), material(o.tailTip), 0, tl, -0.02);
  void tm;
  for (const [n, x, z] of [['legFL', 1, 1], ['legFR', -1, 1], ['legBL', 1, -1], ['legBR', -1, -1]]) {
    const lp = pivot(body, parts, n, x * w * 0.38, -0.02, z * (L / 2 - 0.1));
    mesh(lp, capsule(0.045, legLen - 0.05), fur, 0, -legLen / 2 - 0.05, 0);
    mesh(lp, box(0.08, 0.05, 0.1), o.paws ? material(o.paws) : belly, 0, -legLen - 0.1, 0.02);
  }
  pivot(head, parts, 'carry', 0, -0.06, 0.2);
  return { root, parts, nominalHeight: legLen + 0.12 + 0.35 + (o.neckLen || 0.14), walkSpeed: o.walkSpeed || 1.3, runSpeed: o.runSpeed || 5, stride: 0.35 + legLen * 0.5, clips: quadClips(o) };
}
function quadClips(o) {
  const wagFast = o.tail === 'wag';
  return {
    idle: ({ t }) => ({ body: { sy: Math.sin(t * 2.5) * 0.015 }, head: { ry: Math.sin(t * 0.8) * 0.35, rx: Math.sin(t * 0.5) * 0.1 }, tail: { ry: Math.sin(t * (wagFast ? 9 : 2)) * 0.5 } }),
    walk: ({ s, c, t }) => ({
      body: { py: Math.abs(c) * 0.015, rz: s * 0.03 }, head: { rx: c * 0.06 },
      legFL: { rx: -s * 0.5 }, legBR: { rx: -s * 0.5 }, legFR: { rx: s * 0.5 }, legBL: { rx: s * 0.5 }, tail: { ry: Math.sin(t * 6) * 0.35 },
    }),
    run: ({ s, c }) => ({
      body: { py: Math.abs(s) * 0.07, rx: c * 0.12 }, neck: { rx: -c * 0.2 }, tail: { rx: 0.5 },
      legFL: { rx: -s * 1.0 }, legFR: { rx: -s * 0.85 }, legBL: { rx: s * 1.0 }, legBR: { rx: s * 0.85 },
    }),
    jump: ({ k }) => { const air = Math.sin(Math.min(1, k) * Math.PI);
      return { root: { py: air * 0.45 }, body: { rx: -0.35 * Math.cos(k * Math.PI) }, legFL: { rx: -0.9 * air }, legFR: { rx: -0.9 * air }, legBL: { rx: 0.9 * air }, legBR: { rx: 0.9 * air } }; },
    // a pet's wave: sit up and beg with one paw
    wave: ({ t }) => ({ body: { rx: -0.6, py: 0.05 }, legFL: { rx: -1.4 + Math.sin(t * 10) * 0.4 }, legFR: { rx: -0.6 }, legBL: { rx: 0.6 }, legBR: { rx: 0.6 }, head: { rx: 0.5 }, tail: { ry: Math.sin(t * 14) * 0.6 } }),
    attack: ({ k }) => { const p = k < 0.4 ? -k / 0.4 : Math.min(1, (k - 0.4) / 0.2);
      return { root: { pz: 0.35 * Math.max(0, p) }, body: { rx: 0.25 * p }, legFL: { rx: -1.2 * Math.max(0, p) }, legFR: { rx: -1.2 * Math.max(0, p) }, legBL: { rx: 0.5 * Math.min(0, p) }, head: { rx: 0.3 } }; },
    dance: ({ t }) => ({ root: { ry: t * 5, py: Math.abs(Math.sin(t * 8)) * 0.12 }, tail: { ry: Math.sin(t * 16) * 0.7 }, head: { rz: Math.sin(t * 8) * 0.3 } }),
    sit: ({ t }) => ({ body: { rx: -0.55, py: -0.1 }, legBL: { rx: -1.0 }, legBR: { rx: -1.0 }, legFL: { rx: 0.55 }, legFR: { rx: 0.55 }, head: { rx: 0.5, ry: Math.sin(t * 0.6) * 0.3 }, tail: { ry: Math.sin(t * 3) * 0.4 } }),
    fall: ({ t }) => { const k = Math.min(1, t / 0.35); return { root: { rz: 1.45 * k, py: 0.1 * k }, legFL: { rx: -0.4 * k }, legBL: { rx: 0.4 * k } }; },
  };
}

// ═════════════════════════════════════ slime ═════════════════════════════════════
export function buildSlime(o) {
  const parts = {}, root = new THREE.Group(); parts.root = root;
  const body = pivot(root, parts, 'body', 0, 0, 0);
  const goo = new THREE.MeshStandardMaterial({ color: o.color, roughness: 0.25, metalness: 0, transparent: true, opacity: 0.85 });
  const m = mesh(body, sphere(0.35, 18, 12), goo, 0, 0.3, 0); m.scale.set(1.1, 0.85, 1.1);
  mesh(body, sphere(0.15, 10, 8), material(o.core || 0xffffff, { emissive: 0.4 }), 0, 0.28, 0);
  const face = pivot(body, parts, 'face', 0, 0.36, 0.3);
  for (const s of [-1, 1]) { mesh(face, sphere(0.06, 10, 8), material(0xffffff), s * 0.11, 0, 0); mesh(face, sphere(0.032, 8, 6), material(0x111111), s * 0.11, 0, 0.04); }
  mesh(face, box(0.08, 0.02, 0.02), material(0x111111), 0, -0.09, 0.01);
  if (o.hat) { const hat = pivot(body, parts, 'head', 0, 0.42, 0); addHat(hat, o.hat, o.hatColor); }
  pivot(body, parts, 'carry', 0, 0.75, 0);
  return { root, parts, nominalHeight: 0.6, walkSpeed: 1.1, runSpeed: 2.8, stride: 0.4, clips: {
    idle: ({ t }) => ({ body: { sy: Math.sin(t * 3) * 0.06, sx: -Math.sin(t * 3) * 0.03, sz: -Math.sin(t * 3) * 0.03 } }),
    walk: ({ phase }) => { const h = Math.abs(Math.sin(phase)); return { body: { py: h * 0.18, sy: (h - 0.5) * 0.25, sx: (0.5 - h) * 0.15, sz: (0.5 - h) * 0.15 } }; },
    run: ({ phase }) => { const h = Math.abs(Math.sin(phase)); return { body: { py: h * 0.32, sy: (h - 0.5) * 0.35, sx: (0.5 - h) * 0.2, sz: (0.5 - h) * 0.2, rx: 0.15 } }; },
    jump: ({ k }) => { const air = Math.sin(k * Math.PI); return { body: { py: air * 0.8, sy: k < 0.15 ? -0.3 : air * 0.25, sx: k < 0.15 ? 0.2 : -air * 0.1, sz: k < 0.15 ? 0.2 : -air * 0.1 } }; },
    wave: ({ t }) => ({ body: { rz: Math.sin(t * 9) * 0.25 }, face: { py: 0.03 } }),
    attack: ({ k }) => ({ body: { pz: Math.sin(k * Math.PI) * 0.5, sz: Math.sin(k * Math.PI) * 0.4, sy: -Math.sin(k * Math.PI) * 0.2 } }),
    dance: ({ t }) => ({ body: { ry: Math.sin(t * 4) * 1.2, sy: Math.sin(t * 9) * 0.15, py: Math.abs(Math.sin(t * 9)) * 0.1 } }),
    sit: () => ({ body: { sy: -0.3, sx: 0.15, sz: 0.15 } }),
    fall: ({ t }) => { const k = Math.min(1, t / 0.3); return { body: { sy: -0.55 * k, sx: 0.45 * k, sz: 0.45 * k }, face: { py: -0.1 * k } }; },
  } };
}

// ═════════════════════════════════════ bird ═════════════════════════════════════
export function buildBird(o) {
  const parts = {}, root = new THREE.Group(); parts.root = root;
  const feather = material(o.color), wingM = material(o.wing || o.color), beakM = material(o.beak || 0xf2a33a);
  const body = pivot(root, parts, 'body', 0, 0.32, 0);
  const b = mesh(body, sphere(0.17, 12, 9), feather, 0, 0, 0); b.scale.set(0.9, 0.9, 1.2);
  mesh(body, sphere(0.12, 10, 8), material(o.belly || 0xf3ead8), 0, -0.04, 0.07);
  const head = pivot(body, parts, 'head', 0, 0.16, 0.12);
  mesh(head, sphere(0.1, 12, 9), feather, 0, 0, 0);
  const beak = mesh(head, cone(0.035, 0.11, 6), beakM, 0, -0.01, 0.13); beak.rotation.x = Math.PI / 2;
  for (const s of [-1, 1]) mesh(head, sphere(0.018, 8, 6), material(0x111111), s * 0.055, 0.03, 0.07);
  if (o.crest) for (let k = 0; k < 3; k++) { const c = mesh(head, cone(0.02, 0.1, 4), material(o.crest), 0, 0.1, -0.02 - k * 0.03); c.rotation.x = -0.4 - k * 0.2; }
  for (const [side, s] of [['L', 1], ['R', -1]]) { const w = pivot(body, parts, 'wing' + side, s * 0.14, 0.03, 0); mesh(w, box(0.03, 0.12, 0.26), wingM, s * 0.02, -0.03, -0.02).rotation.z = s * 0.1; }
  const tail = pivot(body, parts, 'tail', 0, 0.02, -0.2); const tm = mesh(tail, box(0.12, 0.02, 0.16), wingM, 0, 0, -0.06); tm.rotation.x = 0.3;
  for (const [side, s] of [['L', 1], ['R', -1]]) { const l = pivot(body, parts, 'leg' + side, s * 0.06, -0.12, 0.02); mesh(l, cyl(0.012, 0.012, 0.18, 5), beakM, 0, -0.09, 0); mesh(l, box(0.06, 0.015, 0.07), beakM, 0, -0.18, 0.02); }
  pivot(head, parts, 'carry', 0, -0.03, 0.18);
  return { root, parts, nominalHeight: 0.62, walkSpeed: 0.9, runSpeed: 4.5, stride: 0.18, clips: {
    idle: ({ t }) => { const peck = Math.max(0, Math.sin(t * 1.3)) > 0.97 ? 0.8 : 0; return { head: { rx: peck, ry: Math.sin(t * 1.7) * 0.5 }, tail: { rx: Math.sin(t * 3) * 0.1 } }; },
    walk: ({ phase }) => { const h = Math.abs(Math.sin(phase)); return { root: { py: h * 0.08 }, head: { pz: Math.sin(phase * 2) * 0.03 }, legL: { rx: -Math.sin(phase) * 0.5 }, legR: { rx: Math.sin(phase) * 0.5 } }; },
    // running birds fly a little: flap and lift
    run: ({ t }) => ({ root: { py: 0.5 + Math.sin(t * 6) * 0.06 }, body: { rx: 0.25 }, wingL: { rz: Math.sin(t * 30) * 1.1 + 0.4 }, wingR: { rz: -Math.sin(t * 30) * 1.1 - 0.4 }, legL: { rx: 0.9 }, legR: { rx: 0.9 } }),
    jump: ({ k, t }) => ({ root: { py: Math.sin(k * Math.PI) * 0.5 }, wingL: { rz: Math.sin(t * 28) * 1.0 + 0.5 }, wingR: { rz: -Math.sin(t * 28) * 1.0 - 0.5 } }),
    wave: ({ t }) => ({ wingR: { rz: -1.6 + Math.sin(t * 12) * 0.4 }, head: { rz: 0.3 } }),
    attack: ({ k }) => ({ head: { rx: Math.sin(k * Math.PI) * 1.0, pz: Math.sin(k * Math.PI) * 0.08 }, body: { rx: Math.sin(k * Math.PI) * 0.3 } }),
    dance: ({ t }) => ({ root: { ry: Math.sin(t * 3) * 0.8, py: Math.abs(Math.sin(t * 8)) * 0.08 }, head: { rx: Math.sin(t * 8) * 0.5 }, wingL: { rz: 0.8 }, wingR: { rz: -0.8 } }),
    sit: () => ({ root: { py: -0.13 }, body: { sy: -0.08 } }),
    fall: ({ t }) => { const k = Math.min(1, t / 0.3); return { root: { rz: 1.5 * k, py: -0.1 * k }, wingL: { rz: 0.9 * k } }; },
  } };
}

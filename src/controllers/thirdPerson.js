// A third-person controller: WASD / arrows to move, Shift to run, Space to jump,
// drag to orbit the camera, wheel to zoom. Works with any playkin character.
//
//   const ctl = thirdPerson({ character: hero, camera, dom: renderer.domElement });
//   // each frame:
//   ctl.update(dt);
//
// Pass `collide(position, radius)` to keep the character out of walls; it should push `position` out.
export function thirdPerson({ character, camera, dom = document.body, keys = window, collide = null, radius = 0.35,
  distance = 6, pitch = 0.35, yaw = 0, minDistance = 2, maxDistance = 25, lookHeight = 1.4 } = {}) {
  const down = new Set();
  const map = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r', ShiftLeft: 'run', ShiftRight: 'run', Space: 'jump' };
  const cam = { distance, pitch, yaw };
  const stick = { x: 0, y: 0 };      // set by a touch joystick if you have one
  const onKey = on => ev => {
    if (ev.target && ev.target.closest && ev.target.closest('input, textarea, select')) return;
    const k = map[ev.code]; if (!k) return;
    if (on) { if (k === 'jump' && !down.has('jump')) character.emote('jump'); down.add(k); } else down.delete(k);
    if (ev.code.startsWith('Arrow') || ev.code === 'Space') ev.preventDefault();
  };
  const kd = onKey(true), ku = onKey(false);
  keys.addEventListener('keydown', kd); keys.addEventListener('keyup', ku);
  let drag = null;
  const pd = ev => { drag = { x: ev.clientX, y: ev.clientY }; dom.setPointerCapture?.(ev.pointerId); };
  const pm = ev => { if (!drag) return; cam.yaw -= (ev.clientX - drag.x) * 0.006; cam.pitch = Math.min(1.3, Math.max(0.05, cam.pitch + (ev.clientY - drag.y) * 0.004)); drag = { x: ev.clientX, y: ev.clientY }; };
  const pu = () => { drag = null; };
  const wh = ev => { ev.preventDefault(); cam.distance = Math.min(maxDistance, Math.max(minDistance, cam.distance * (1 + ev.deltaY * 0.001))); };
  dom.addEventListener('pointerdown', pd); dom.addEventListener('pointermove', pm); dom.addEventListener('pointerup', pu); dom.addEventListener('wheel', wh, { passive: false });

  return {
    camera: cam, stick,
    /** Movement intent this frame, in world space (for your own logic). */
    intent: { x: 0, z: 0, run: false },
    update(dt) {
      const f = (down.has('f') ? 1 : 0) - (down.has('b') ? 1 : 0) - stick.y, s = (down.has('r') ? 1 : 0) - (down.has('l') ? 1 : 0) + stick.x;
      const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
      const x = fx * f + rx * s, z = fz * f + rz * s, run = down.has('run') || Math.hypot(stick.x, stick.y) > 0.95;
      this.intent.x = x; this.intent.z = z; this.intent.run = run;
      character.move(x, z, dt, { run });
      if (collide) collide(character.position, radius);
      character.update(dt);
      const p = character.position, ty = p.y + lookHeight * Math.min(1.5, character.height / 1.75);
      camera.position.set(p.x + Math.sin(cam.yaw) * Math.cos(cam.pitch) * cam.distance, ty + Math.sin(cam.pitch) * cam.distance, p.z + Math.cos(cam.yaw) * Math.cos(cam.pitch) * cam.distance);
      camera.lookAt(p.x, ty, p.z);
    },
    dispose() {
      keys.removeEventListener('keydown', kd); keys.removeEventListener('keyup', ku);
      dom.removeEventListener('pointerdown', pd); dom.removeEventListener('pointermove', pm); dom.removeEventListener('pointerup', pu); dom.removeEventListener('wheel', wh);
    },
  };
}

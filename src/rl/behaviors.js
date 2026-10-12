// Ready-made steering behaviours for game characters: no training needed.
// Each returns { act(self) -> { x, z, run } } where self is a position {x, z};
// feed the result to character.move(x, z, dt, { run }).
const v = (x, z, run = false) => ({ x, z, run });
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/** Walk toward a target, stopping at `stopAt` metres; run when far. */
export function follow(getTarget, { stopAt = 1.5, runBeyond = 6 } = {}) {
  return { act(self) { const t = getTarget(); if (!t) return v(0, 0); const d = dist(self, t); if (d < stopAt) return v(0, 0);
    return v((t.x - self.x) / d, (t.z - self.z) / d, d > runBeyond); } };
}
/** Run toward a target and never stop. */
export function chase(getTarget, { run = true } = {}) {
  return { act(self) { const t = getTarget(); if (!t) return v(0, 0); const d = dist(self, t) || 1; return v((t.x - self.x) / d, (t.z - self.z) / d, run); } };
}
/** Run away when the threat comes within `radius`. */
export function flee(getThreat, { radius = 6 } = {}) {
  return { act(self) { const t = getThreat(); if (!t) return v(0, 0); const d = dist(self, t); if (d > radius) return v(0, 0); const k = d || 1;
    return v((self.x - t.x) / k, (self.z - t.z) / k, d < radius * 0.6); } };
}
/** Visit points in order, looping. */
export function patrol(points, { reach = 0.6, run = false } = {}) {
  let i = 0;
  return { act(self) { const p = points[i]; const d = dist(self, p); if (d < reach) { i = (i + 1) % points.length; return v(0, 0); } return v((p.x - self.x) / d, (p.z - self.z) / d, run); } };
}
/** Amble around a home point, pausing now and then. */
export function wander({ center = { x: 0, z: 0 }, radius = 8, pause = [1, 4], rng = Math.random } = {}) {
  let goal = null, wait = 0, last = performance.now();
  return { act(self) {
    const now = performance.now(), dt = (now - last) / 1000; last = now;
    if (wait > 0) { wait -= dt; return v(0, 0); }
    if (!goal || dist(self, goal) < 0.5) { const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * radius; goal = { x: center.x + Math.cos(a) * r, z: center.z + Math.sin(a) * r }; wait = pause[0] + rng() * (pause[1] - pause[0]); return v(0, 0); }
    const d = dist(self, goal); return v((goal.x - self.x) / d * 0.6, (goal.z - self.z) / d * 0.6);
  } };
}
/** Use one behaviour while `when(self)` is true, another otherwise. */
export function either(when, a, b) { return { act(self) { return when(self) ? a.act(self) : b.act(self); } }; }

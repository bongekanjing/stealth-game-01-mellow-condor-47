// The noise field. Footsteps become expanding rings; a ring is audible to a
// guard within its radius, blocked by cover like light is, and is consumed by
// each guard once. The render layer draws the same rings, so what a guard hears
// and what the player sees are the same list.

import { clamp, segmentClear } from './geometry.js';
import { hearNoise } from './guards.js';

/** Rings fade out over this long, and are drawn as a growing hoop. */
const RING_LIFE = 1.15;

export function createNoiseField() {
  return { rings: [] };
}

/** Turn a gameplay event into a visible, audible ring. */
export function emitRing(field, event) {
  field.rings.push({
    x: event.x,
    y: event.y,
    radius: event.radius,
    strength: event.strength,
    kind: event.kind,
    age: 0,
    life: RING_LIFE,
    heardBy: new Set(),
  });
}

/**
 * Age the rings, and let each guard hear each ring once. Cover muffles the ring
 * rather than silencing it: a block between guard and step halves the radius,
 * which is why sprinting behind a crate is still reckless but not suicide.
 */
export function updateNoise(field, level, dt, onHeard) {
  const heard = [];
  for (const ring of field.rings) {
    ring.age += dt;
  }
  for (const g of level.guards) {
    for (const ring of field.rings) {
      if (ring.heardBy.has(g.index)) continue;
      const clear = segmentClear(g.x, g.y, ring.x, ring.y, level.occluders);
      const reach = clear ? ring.radius : ring.radius * 0.5;
      const d = Math.hypot(ring.x - g.x, ring.y - g.y);
      if (d > reach) continue;
      ring.heardBy.add(g.index);
      if (hearNoise(g, { ...ring, radius: reach })) {
        heard.push({ guard: g, ring, muffled: !clear });
      }
    }
  }
  field.rings = field.rings.filter((r) => r.age < r.life);
  if (onHeard) for (const h of heard) onHeard(h);
  return heard;
}

/** The rings young enough to draw, with their 0..1 fade fraction. */
export function liveRings(field) {
  return field.rings.map((r) => ({
    ...r,
    t: clamp(r.age / r.life, 0, 1),
    grow: r.age / 0.55,
  }));
}

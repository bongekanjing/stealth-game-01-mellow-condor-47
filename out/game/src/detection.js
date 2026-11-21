// The detection model, in one place. A guard sees a body part only when that
// part is inside the cone's wedge AND an unbroken line reaches it, so cover is
// real: three sample points across the thief's shoulders are tested, and how
// many of them the guard can see decides how fast the alarm climbs. Crouching
// narrows the shoulders, which is what makes a crate enough to hide behind.
//
// One alarm meter per floor. It climbs while any guard can see any part of the
// thief, and drains while none can. It never empties by itself once a guard has
// been alerted: suspicion stays on the floor until the thief breaks contact for
// a while. Only a full meter is a catch.

import { DETECT, RULES, STANCE } from './config.js';
import { angleDelta, clamp, dist, segmentClear } from './geometry.js';
import { inConeAngular, investigate } from './guards.js';

/** How wide the thief's shoulders are per stance, as a fraction of the radius. */
const SHOULDER = { crouch: 0.32, walk: 0.82, sprint: 0.96 };

/**
 * The three points on the thief a guard can see. The shoulders swing with the
 * body's facing so slipping sideways behind a crate actually changes the answer.
 */
export function samplePoints(player) {
  const w = SHOULDER[player.stance] * player.radius;
  const nx = Math.cos(player.facing + Math.PI / 2);
  const ny = Math.sin(player.facing + Math.PI / 2);
  return [
    [player.x, player.y],
    [player.x + nx * w, player.y + ny * w],
    [player.x - nx * w, player.y - ny * w],
  ];
}

/**
 * How much of this guard's cone covers the thief right now: 0 unseen, 1 fully
 * exposed. Combines the soft angular edge, the distance falloff, the stance's
 * own visibility, and the fraction of body samples the guard can actually
 * trace a clear line to.
 */
export function exposureOf(guard, player, level) {
  const angular = inConeAngular(guard, player.x, player.y);
  if (angular <= 0) return { rate: 0, visible: 0, angular: 0, dist: 1 };
  const d = dist(guard.x, guard.y, player.x, player.y);
  // Close is unmistakable, the far rim of the cone is a glance.
  const dn = clamp(d / guard.cone.range, 0, 1);
  const distanceFade = 1 - DETECT.distanceFade * dn * dn;
  const samples = samplePoints(player);
  let visible = 0;
  for (const [sx, sy] of samples) {
    if (inConeAngular(guard, sx, sy) <= 0) continue;
    if (!segmentClear(guard.x, guard.y, sx, sy, level.occluders)) continue;
    visible++;
  }
  if (visible === 0) return { rate: 0, visible: 0, angular, dist: d };
  const bodyFraction = visible / samples.length;
  const stance = STANCE[player.stance].exposure;
  const rate = DETECT.fillBase * angular * distanceFade * stance * bodyFraction;
  return { rate, visible, angular, dist: d };
}

/**
 * Step the alarm. Returns an object the rest of the game reads: the meter, the
 * guard with the best view (or null), whether a guard is investigating, and
 * whether this step caught the thief.
 *
 * Order matters: guards' `sees` is refreshed first, then the meter moves, then
 * a guard is told to investigate if suspicion has been raised. A guard that can
 * see the thief keeps updating its lastSeen, so it follows a moving target
 * rather than arresting a memory.
 */
export function stepDetection(state, level, player, dt) {
  let best = null;
  let bestRate = 0;
  let anyVisible = false;

  for (const g of level.guards) {
    const e = exposureOf(g, player, level);
    g.sees = e.rate > 0;
    g.seesRate = e.rate;
    if (g.sees) {
      anyVisible = true;
      g.lastSeen = { x: player.x, y: player.y };
      if (e.rate > bestRate) {
        bestRate = e.rate;
        best = g;
      }
    }
  }

  const meter = state.alarm;
  let next = meter;
  if (anyVisible) {
    next = clamp(meter + bestRate * dt, 0, 1);
    state.exposedAt = state.time;
  } else {
    next = clamp(meter - DETECT.drain * dt, 0, 1);
  }
  state.alarm = next;
  state.visible = anyVisible;
  state.exposureRate = bestRate;
  state.watchedBy = best ? best.index : -1;

  // Suspicion sends the guard that saw you, and re-sends it as you move.
  if (anyVisible && next >= DETECT.suspicion && best) {
    investigate(best, player.x, player.y);
    state.investigators.add(best.index);
  }
  // Nobody seeing anything for long enough lets the floor settle again.
  if (!anyVisible && next <= 0.001) state.investigators.clear();

  return {
    alarm: next,
    caught: next >= 1,
    watchedBy: best,
    visible: anyVisible,
    rate: bestRate,
  };
}

/**
 * Whether a point is lit by any cone at all, ignoring the thief. Used by the
 * renderer to glow the crate shadows and by the shots' autopilot to place the
 * thief in a genuinely dark pocket.
 */
export function litByAnyGuard(level, x, y) {
  for (const g of level.guards) {
    if (inConeAngular(g, x, y) > 0 && segmentClear(g.x, g.y, x, y, level.occluders)) return g;
  }
  return null;
}

/** How far the closest guard is from a point, for the HUD's whisper meter. */
export function nearestGuardDistance(level, x, y) {
  let best = Infinity;
  for (const g of level.guards) best = Math.min(best, dist(g.x, g.y, x, y));
  return best;
}

/** The alarm meter's word, for the HUD and the shots' captions. */
export function alarmBand(alarm) {
  if (alarm >= 0.995) return 'CAUGHT';
  if (alarm >= RULES.danger) return 'SPOTTED';
  if (alarm >= DETECT.suspicion) return 'SUSPICIOUS';
  if (alarm > 0.02) return 'UNEASY';
  return 'HIDDEN';
}

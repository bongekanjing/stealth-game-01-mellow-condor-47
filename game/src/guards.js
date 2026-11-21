// The guards. Each walks a waypoint loop, pauses at the ends, and can be pulled
// off the loop by a noise or by the alarm: it turns toward a sound, walks to
// where it last saw the thief, searches, then rejoins the nearest waypoint.
// This file also builds the vision wedge, ray-casting it against the same
// occluders line of sight uses, which is what cuts the cone at a crate.

import { DETECT, GUARD_RADIUS } from './config.js';
import {
  angleDelta,
  angleNorm,
  angleToward,
  clamp,
  dist,
  pointSegmentDistance,
  rayReach,
  rectCorners,
  resolveCircleRect,
} from './geometry.js';

export const GUARD_STATE = {
  PATROL: 'patrol',
  PAUSE: 'pause',
  ALERT: 'alert',
  INVESTIGATE: 'investigate',
  SEARCH: 'search',
};

export function createGuard(def, level, index) {
  const start = def.waypoints[0];
  const next = def.waypoints[1 % def.waypoints.length];
  return {
    index,
    name: def.name,
    x: start.x,
    y: start.y,
    radius: GUARD_RADIUS,
    facing: Math.atan2(next.y - start.y, next.x - start.x),
    cone: { ...def.cone },
    waypoints: def.waypoints,
    wpIndex: 1 % def.waypoints.length,
    speed: def.speed,
    wait: def.wait,
    state: GUARD_STATE.PAUSE,
    timer: 0.35 + def.wobble * 0.6,
    target: { x: start.x, y: start.y },
    lastSeen: null,
    alertAngle: 0,
    /** 0..1, how worked up this guard looks; drives the cone tint. */
    heat: 0,
    /** The player this guard can currently see (set by detection.js each step). */
    sees: false,
    /** How strongly it sees them, 0..1. */
    seesRate: 0,
    // A little idle sway so a standing guard never looks frozen.
    sway: def.wobble * Math.PI * 2,
    swayT: 0,
    stepPhase: 0,
    moving: false,
  };
}

/** Compass heading to a point. */
function headingTo(g, x, y) {
  return Math.atan2(y - g.y, x - g.x);
}

/** Which waypoint is closest, skipping the one it is standing on. */
function nearestWaypoint(g) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < g.waypoints.length; i++) {
    const d = dist(g.x, g.y, g.waypoints[i].x, g.waypoints[i].y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/**
 * Send a guard to look at a place. Called when the alarm meter crosses the
 * suspicion threshold, and again whenever the thief is re-seen while it is
 * already looking, so a moving target keeps pulling it along.
 */
export function investigate(guard, x, y) {
  guard.lastSeen = { x, y };
  if (guard.state === GUARD_STATE.INVESTIGATE || guard.state === GUARD_STATE.SEARCH) {
    guard.target = { x, y };
    guard.timer = DETECT.investigateTime;
    return;
  }
  guard.state = GUARD_STATE.INVESTIGATE;
  guard.target = { x, y };
  guard.timer = 0;
}

/**
 * A footstep ring reached this guard. If it is close enough to matter, stop and
 * turn toward it: the head swings round over the next moment, and if the guard
 * was walking it starts again once the turn is done.
 */
export function hearNoise(guard, ring) {
  const d = dist(guard.x, guard.y, ring.x, ring.y);
  if (d > ring.radius) return false;
  if (guard.state === GUARD_STATE.INVESTIGATE || guard.state === GUARD_STATE.SEARCH) return false;
  const a = Math.atan2(ring.y - guard.y, ring.x - guard.x);
  guard.state = GUARD_STATE.ALERT;
  guard.alertAngle = a;
  guard.timer = clamp(0.7 + ring.strength * 1.5, 0.6, 2.4);
  return true;
}

/** Ease a walking guard toward a target, sliding along cover instead of through it. */
function walkTo(g, tx, ty, speed, dt, level) {
  const d = dist(g.x, g.y, tx, ty);
  if (d < 3) return 0;
  const h = headingTo(g, tx, ty);
  g.facing = angleToward(g.facing, h, DETECT.turnRate * dt * 2.2);
  // Only commit to forward motion once roughly facing the target: turns read.
  const aligned = 1 - clamp(Math.abs(angleDelta(g.facing, h)) / 1.2, 0, 1);
  const step = speed * dt * (0.35 + 0.65 * aligned);
  let nx = g.x + Math.cos(h) * step;
  let ny = g.y + Math.sin(h) * step;
  for (const box of level.walls) [nx, ny] = resolveCircleRect(nx, ny, g.radius, box);
  for (const box of level.crates) [nx, ny] = resolveCircleRect(nx, ny, g.radius, box);
  const moved = Math.hypot(nx - g.x, ny - g.y);
  g.x = nx;
  g.y = ny;
  g.moving = moved > 0.3;
  return moved;
}

/** Advance one guard by dt. Detection sets `sees`/`seesRate` before this runs. */
export function updateGuard(g, level, dt) {
  g.swayT += dt;
  g.stepPhase += (g.moving ? dt * 9 : 0);
  const targetHeat = g.sees ? 1 : g.state === GUARD_STATE.INVESTIGATE || g.state === GUARD_STATE.SEARCH ? 0.55 : g.state === GUARD_STATE.ALERT ? 0.35 : 0;
  g.heat += (targetHeat - g.heat) * clamp(dt * 3.2, 0, 1);

  // A frozen guard holds its exact post and heading. Scripted scenes use this so
  // a posed shot stays where it was placed instead of resuming its patrol.
  if (g.frozen) {
    g.moving = false;
    return;
  }

  switch (g.state) {
    case GUARD_STATE.PAUSE: {
      g.moving = false;
      g.timer -= dt;
      // Idle scan: face sways gently around the next waypoint.
      const wp = g.waypoints[g.wpIndex];
      const h = headingTo(g, wp.x, wp.y);
      const scan = Math.sin(g.swayT * 0.9 + g.sway) * 0.22;
      g.facing = angleToward(g.facing, angleNorm(h + scan), 0.9 * dt);
      if (g.timer <= 0) g.state = GUARD_STATE.PATROL;
      break;
    }
    case GUARD_STATE.PATROL: {
      const wp = g.waypoints[g.wpIndex];
      const moved = walkTo(g, wp.x, wp.y, g.speed, dt, level);
      if (moved === 0 || dist(g.x, g.y, wp.x, wp.y) < 8) {
        g.state = GUARD_STATE.PAUSE;
        g.timer = g.wait;
        g.wpIndex = (g.wpIndex + 1) % g.waypoints.length;
        g.moving = false;
      }
      break;
    }
    case GUARD_STATE.ALERT: {
      g.moving = false;
      g.timer -= dt;
      g.facing = angleToward(g.facing, g.alertAngle, 2.8 * dt);
      if (g.timer <= 0) g.state = GUARD_STATE.PATROL;
      break;
    }
    case GUARD_STATE.INVESTIGATE: {
      if (g.target === null) {
        g.state = GUARD_STATE.PATROL;
        break;
      }
      const moved = walkTo(g, g.target.x, g.target.y, g.speed * 1.42, dt, level);
      g.timer += dt;
      if (moved === 0 || dist(g.x, g.y, g.target.x, g.target.y) < 14) {
        g.state = GUARD_STATE.SEARCH;
        g.timer = DETECT.investigateTime;
        g.searchFrom = g.facing;
        g.moving = false;
      }
      break;
    }
    case GUARD_STATE.SEARCH: {
      g.moving = false;
      g.timer -= dt;
      // Look left and right over the place, then give up.
      const sweep = Math.sin(g.timer * 1.6) * 1.15;
      g.facing = angleToward(g.facing, angleNorm(g.searchFrom + sweep), 1.9 * dt);
      if (g.timer <= 0) {
        g.state = GUARD_STATE.PATROL;
        g.wpIndex = nearestWaypoint(g);
        g.lastSeen = null;
      }
      break;
    }
    default:
      g.state = GUARD_STATE.PATROL;
  }

  // Idle sway while walking too, so nothing ever looks locked to a rail.
  if (g.moving) g.facing = angleNorm(g.facing + Math.sin(g.swayT * 3.1 + g.sway) * 0.0016);
}

/**
 * The guard's vision wedge, as a fan of points in front of it. Rays stop at
 * occluders, so a crate in the cone leaves a genuine notch: the polygon itself
 * is the lit region, and everything behind the crate is simply not in it. Extra
 * rays are cast at each nearby occluder corner so the shadow edges stay crisp.
 */
export function conePolygon(g, level) {
  const half = g.cone.half;
  const range = g.cone.range;
  const rays = [];
  const STEPS = 20;
  for (let i = 0; i <= STEPS; i++) rays.push(-half + (2 * half * i) / STEPS);

  // Corner rays, nudged either side, so a shadow's edge is a straight cut.
  for (const r of level.occluders) {
    for (const [cx, cy] of rectCorners(r)) {
      const d = dist(g.x, g.y, cx, cy);
      if (d > range + 30) continue;
      const rel = angleDelta(g.facing, Math.atan2(cy - g.y, cx - g.x));
      if (Math.abs(rel) < half - 0.001) rays.push(rel - 0.0018, rel + 0.0018);
    }
  }
  rays.sort((a, b) => a - b);

  const pts = [];
  let lastRel = -Infinity;
  for (const rel of rays) {
    if (rel - lastRel < 0.0006) continue;
    lastRel = rel;
    const a = g.facing + rel;
    const reach = Math.max(0, rayReach(g.x, g.y, a, range, level.occluders) - 0.5);
    pts.push([g.x + Math.cos(a) * reach, g.y + Math.sin(a) * reach]);
  }
  return pts;
}

/** Is (px, py) inside the guard's cone, in angle and range (cover is detection's job)? */
export function inConeAngular(g, px, py, padAngle = 0) {
  const d = dist(g.x, g.y, px, py);
  if (d > g.cone.range + 6) return 0;
  const rel = Math.abs(angleDelta(g.facing, Math.atan2(py - g.y, px - g.x)));
  const half = g.cone.half + padAngle;
  if (rel > half) return 0;
  // Soft edge: full inside, fading to zero at the rim.
  const edge = half * (1 - DETECT.edgeFade);
  if (rel <= edge) return 1;
  return 1 - (rel - edge) / (half - edge);
}

/** How far the player's body is off the cone's spine, 0 at the axis, 1 at the rim. */
export function coneOffset(g, px, py) {
  return Math.abs(angleDelta(g.facing, Math.atan2(py - g.y, px - g.x))) / g.cone.half;
}

/**
 * Distance from a guard to a box face, for the render layer's shadow pooling:
 * the licence to say "this crate is the thing blocking you".
 */
export function nearestCover(g, level) {
  let best = null;
  let bestD = Infinity;
  for (const c of level.crates) {
    const d = pointSegmentDistance(g.x, g.y, c.x, c.y, c.x + c.w, c.y);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

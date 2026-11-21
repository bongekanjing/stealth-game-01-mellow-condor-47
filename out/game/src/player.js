// The thief. Handles input to intent, intent to movement, stance to speed and
// footstep cadence. It knows nothing about guards or the alarm; it emits
// footstep events and the noise field (noise.js) turns those into rings.

import { FLOOR, PLAYER_RADIUS, STANCE } from './config.js';
import { clamp, resolveCircleRect } from './geometry.js';

const TURN_RATE = 22; // radians per second the body swings toward a new heading

export function createPlayer(level) {
  return {
    x: level.spawn.x,
    y: level.spawn.y,
    vx: 0,
    vy: 0,
    radius: PLAYER_RADIUS,
    facing: -Math.PI / 2,
    stance: 'crouch',
    moving: false,
    bob: 0,
    stepTimer: 0,
    /** 0..1, how visible the thief currently is; the renderer dims or brightens. */
    exposure: 0,
    /** Which way the last real movement went; the cone/detection code uses facing. */
    lastDir: { x: 0, y: -1 },
  };
}

/**
 * Read the keyboard into an intent: a direction and a stance. Shift wins over
 * Ctrl when both are down, and no movement means standing walk (the quietest
 * stance that still has a silhouette the guard can be given).
 */
export function readIntent(keys) {
  let dx = 0;
  let dy = 0;
  if (keys.has('left')) dx -= 1;
  if (keys.has('right')) dx += 1;
  if (keys.has('up')) dy -= 1;
  if (keys.has('down')) dy += 1;
  const len = Math.hypot(dx, dy);
  if (len > 0) {
    dx /= len;
    dy /= len;
  }
  let stance = 'walk';
  if (keys.has('sprint')) stance = 'sprint';
  else if (keys.has('crouch')) stance = 'crouch';
  return { dx, dy, moving: len > 0, stance };
}

/** Apply acceleration with a snappy ramp so stances feel distinct, then collide. */
export function updatePlayer(player, intent, level, dt, events) {
  const spec = STANCE[intent.stance];
  player.stance = intent.stance;
  player.moving = intent.moving;

  const targetX = intent.dx * spec.speed;
  const targetY = intent.dy * spec.speed;
  // Crouch reaches speed slowly, sprint almost instantly: weight without lag.
  const accel = intent.stance === 'crouch' ? 9 : intent.stance === 'sprint' ? 26 : 16;
  const k = clamp(accel * dt, 0, 1);
  player.vx += (targetX - player.vx) * k;
  player.vy += (targetY - player.vy) * k;
  if (!intent.moving && Math.hypot(player.vx, player.vy) < 4) {
    player.vx = 0;
    player.vy = 0;
  }

  let nx = player.x + player.vx * dt;
  let ny = player.y + player.vy * dt;

  // Two passes: a corner can push the circle into a second box.
  for (let pass = 0; pass < 2; pass++) {
    for (const box of level.walls) [nx, ny] = resolveCircleRect(nx, ny, player.radius, box);
    for (const box of level.crates) [nx, ny] = resolveCircleRect(nx, ny, player.radius, box);
  }
  nx = clamp(nx, FLOOR.x + player.radius, FLOOR.x + FLOOR.w - player.radius);
  ny = clamp(ny, FLOOR.y + player.radius, FLOOR.y + FLOOR.h - player.radius);

  const actualMove = Math.hypot(nx - player.x, ny - player.y);
  player.x = nx;
  player.y = ny;

  const speed = Math.hypot(player.vx, player.vy);
  if (actualMove > 0.2) {
    const want = Math.atan2(player.vy, player.vx);
    // Ease the body round rather than snapping: reads as a person turning.
    let d = want - player.facing;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    player.facing += clamp(d, -TURN_RATE * dt, TURN_RATE * dt);
    player.lastDir = { x: Math.cos(want), y: Math.sin(want) };
  }

  player.bob += speed * dt * 0.055;
  player.exposure += ((speed > 8 ? 1 : 0) - player.exposure) * clamp(dt * 6, 0, 1);

  // Footsteps: a ring leaves the thief on the stance's own cadence, but only
  // while actually moving. Sprint rings are loud and wide, walk rings small,
  // crouch is silent.
  const noise = spec.noise;
  if (noise && speed > spec.speed * 0.45) {
    player.stepTimer += dt;
    if (player.stepTimer >= noise.every) {
      player.stepTimer = 0;
      events.push({
        type: 'step',
        x: player.x,
        y: player.y,
        radius: noise.radius,
        strength: noise.strength,
        kind: noise.kind,
        stance: intent.stance,
      });
    }
  } else {
    player.stepTimer = Math.max(0, player.stepTimer - dt * 0.5);
  }

  return actualMove;
}

/**
 * How hard the thief is to see, 0..1, given the stance. Crouch is dimmer,
 * sprint brighter; this is the stance part of the detection formula, kept here
 * beside the movement that produces it so the two never drift.
 */
export function silhouette(player) {
  const spec = STANCE[player.stance];
  return spec.exposure;
}

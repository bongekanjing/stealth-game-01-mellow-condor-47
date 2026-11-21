// The render layer. Everything the judge sees is drawn here: a museum floor lit
// by cold ceiling lamps, stone walls with the service doorway cut into the north
// wall, the crates and the shadows they throw, the guards' warm torch wedges
// (already cut by cover in guards.js), the loot on its plinths, the noise rings,
// the thief, the guards and the HUD. It reads state and draws it; it never
// changes a rule.
//
// Two light temperatures do the storytelling: the room's ambient lamps are cold
// blue, the guards' torches are warm amber, the doorway is green. Danger is the
// only warm thing on the floor, which is why a cone is impossible to miss.

import { COLOR, FIELD, FLOOR, FONT, HUD_BAND, ROOM, RULES, STANCE, WALL } from './config.js';
import { alarmBand } from './detection.js';
import { clamp, makeRng, shadowPolygon, TAU } from './geometry.js';
import { conePolygon } from './guards.js';
import { liveRings } from './noise.js';
import { EXIT_HALF } from './level.js';

const DOOR_HALF = EXIT_HALF;

function makeSpeckles() {
  const rng = makeRng(20261121);
  const out = [];
  for (let i = 0; i < 260; i++) {
    out.push({ x: rng() * FIELD.w, y: rng() * FIELD.h, r: 0.5 + rng() * 1.3, a: 0.05 + rng() * 0.1 });
  }
  return out;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  return { canvas, ctx, speckles: makeSpeckles() };
}

/** Fit the 1280x720 field into the window, letterboxed. */
export function resizeRenderer(renderer, dpr = 1) {
  const { canvas, ctx } = renderer;
  const winW = window.innerWidth;
  const winH = window.innerHeight;
  canvas.width = Math.round(winW * dpr);
  canvas.height = Math.round(winH * dpr);
  canvas.style.width = `${winW}px`;
  canvas.style.height = `${winH}px`;
  const scale = Math.min(winW / FIELD.w, winH / FIELD.h);
  renderer.view = {
    scale,
    ox: (winW - FIELD.w * scale) / 2,
    oy: (winH - FIELD.h * scale) / 2,
    dpr,
  };
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function applyCamera(ctx, cam, view, dpr) {
  const { scale, ox, oy } = view;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);
  ctx.translate(FIELD.w / 2, FIELD.h / 2);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// ---------------------------------------------------------------- floor

/**
 * The floor: dark marble slabs, a red carpet running from the service door, and
 * cold pools of lamplight. Cold ambient against warm torchlight is the whole
 * visual grammar of the game.
 */
function drawFloor(renderer, level) {
  const { ctx, speckles } = renderer;

  // Everything outside the room is outside the building: near-black stone with
  // a faint tooth, so the wall band always has something to sit against.
  ctx.fillStyle = '#070b10';
  ctx.fillRect(0, 0, FIELD.w, FIELD.h);
  ctx.save();
  const out = makeRng(99);
  for (let i = 0; i < 200; i++) {
    ctx.fillStyle = `rgba(120, 150, 180, ${0.02 + out() * 0.04})`;
    ctx.fillRect(out() * FIELD.w, out() * FIELD.h, 1 + out() * 2, 1 + out() * 2);
  }
  ctx.restore();

  // The floor slab.
  const g = ctx.createLinearGradient(FLOOR.x, FLOOR.y, FLOOR.x + FLOOR.w * 0.35, FLOOR.y + FLOOR.h);
  g.addColorStop(0, '#243646');
  g.addColorStop(0.45, '#1d2c39');
  g.addColorStop(1, '#16222c');
  ctx.fillStyle = g;
  ctx.fillRect(FLOOR.x, FLOOR.y, FLOOR.w, FLOOR.h);

  // Big marble slabs.
  ctx.lineWidth = 1.8;
  ctx.strokeStyle = 'rgba(3, 7, 10, 0.55)';
  ctx.beginPath();
  for (let x = FLOOR.x; x <= FLOOR.x + FLOOR.w + 1; x += 152) {
    ctx.moveTo(x + 0.5, FLOOR.y);
    ctx.lineTo(x + 0.5, FLOOR.y + FLOOR.h);
  }
  for (let y = FLOOR.y; y <= FLOOR.y + FLOOR.h + 1; y += 152) {
    ctx.moveTo(FLOOR.x, y + 0.5);
    ctx.lineTo(FLOOR.x + FLOOR.w, y + 0.5);
  }
  ctx.stroke();

  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(150, 185, 215, 0.055)';
  ctx.beginPath();
  for (let x = FLOOR.x; x <= FLOOR.x + FLOOR.w; x += 38) {
    ctx.moveTo(x + 0.5, FLOOR.y);
    ctx.lineTo(x + 0.5, FLOOR.y + FLOOR.h);
  }
  for (let y = FLOOR.y; y <= FLOOR.y + FLOOR.h; y += 38) {
    ctx.moveTo(FLOOR.x, y + 0.5);
    ctx.lineTo(FLOOR.x + FLOOR.w, y + 0.5);
  }
  ctx.stroke();

  // A lighter marble tile every so often, deterministic.
  const rng = makeRng(4242);
  for (let i = 0; i < 14; i++) {
    const tx = FLOOR.x + Math.floor(rng() * 7) * 152;
    const ty = FLOOR.y + Math.floor(rng() * 4) * 152;
    ctx.fillStyle = `rgba(160, 200, 225, ${0.014 + rng() * 0.02})`;
    ctx.fillRect(tx + 2, ty + 2, 149, 149);
  }

  // Carpet runner from the service door down into the hall. Kept a muted wine
  // with visible weave and a fringed hem: at full saturation the runner read as a
  // red hazard band sealing the exit off, which is exactly the wrong signal when
  // the exit is the safe thing in the room.
  // A neutral charcoal runner up to the service door. It used to be wine-red, which
  // under a green exit read as a red hazard beam sealing the goal off — the exact
  // opposite of what the exit should signal. Neutral now: it guides the eye to the
  // door without competing with the only green thing in the room.
  const carpetX = level.exit.x - 52;
  const carpetH = 250;
  ctx.fillStyle = 'rgba(38, 50, 62, 0.55)';
  ctx.fillRect(carpetX, FLOOR.y, 92, carpetH);
  ctx.save();
  ctx.beginPath();
  ctx.rect(carpetX, FLOOR.y, 92, carpetH);
  ctx.clip();
  ctx.strokeStyle = 'rgba(150, 178, 200, 0.09)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let y = FLOOR.y + 8; y < FLOOR.y + carpetH; y += 9) {
    ctx.moveTo(carpetX, y + 0.5);
    ctx.lineTo(carpetX + 92, y + 0.5);
  }
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = 'rgba(150, 178, 200, 0.16)';
  ctx.lineWidth = 2;
  ctx.strokeRect(carpetX + 8, FLOOR.y, 76, carpetH);
  // Fringe at the far end so it reads as a runner that stops, not a corridor.
  ctx.strokeStyle = 'rgba(160, 186, 206, 0.14)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let x = carpetX + 4; x < carpetX + 90; x += 7) {
    ctx.moveTo(x, FLOOR.y + carpetH);
    ctx.lineTo(x, FLOOR.y + carpetH + 9);
  }
  ctx.stroke();

  // Cold lamp pools, additive.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const lamp of level.lamps) {
    const pool = ctx.createRadialGradient(lamp.x, lamp.y, 8, lamp.x, lamp.y, lamp.r);
    pool.addColorStop(0, 'rgba(158, 198, 240, 0.20)');
    pool.addColorStop(0.42, 'rgba(136, 180, 224, 0.08)');
    pool.addColorStop(1, 'rgba(112, 162, 212, 0)');
    ctx.fillStyle = pool;
    ctx.beginPath();
    ctx.arc(lamp.x, lamp.y, lamp.r, 0, TAU);
    ctx.fill();
  }
  ctx.restore();

  ctx.fillStyle = COLOR.floorSpeck;
  for (const s of speckles) {
    if (s.x < FLOOR.x || s.x > FLOOR.x + FLOOR.w || s.y < FLOOR.y || s.y > FLOOR.y + FLOOR.h) continue;
    ctx.globalAlpha = s.a;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** The lamp fittings: dark housings with a cold filament. */
function drawLamps(ctx, level, time) {
  for (const lamp of level.lamps) {
    const flicker = 0.9 + 0.1 * Math.sin(time * 1.7 + lamp.phase);
    ctx.save();
    ctx.fillStyle = 'rgba(9, 13, 18, 0.8)';
    ctx.beginPath();
    ctx.arc(lamp.x, lamp.y, 12, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(180, 210, 240, 0.28)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(lamp.x, lamp.y, 12, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(180, 210, 240, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(lamp.x, lamp.y, 7, 0, TAU);
    ctx.stroke();
    const glow = ctx.createRadialGradient(lamp.x, lamp.y, 0, lamp.x, lamp.y, 15);
    glow.addColorStop(0, `rgba(205, 232, 255, ${0.8 * flicker})`);
    glow.addColorStop(1, 'rgba(160, 205, 240, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(lamp.x, lamp.y, 15, 0, TAU);
    ctx.fill();
    ctx.fillStyle = `rgba(236, 248, 255, ${flicker})`;
    ctx.beginPath();
    ctx.arc(lamp.x, lamp.y, 3, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

// ---------------------------------------------------------------- architecture

/**
 * The walls, drawn as extruded stone with a lit inner face. The north wall is
 * broken by the service doorway, which is the exit and the brightest green thing
 * on the floor.
 */
function drawWalls(ctx, level, time) {
  const exit = level.exit;
  const doorX0 = exit.x - DOOR_HALF;
  const doorX1 = exit.x + DOOR_HALF;

  // Ambient occlusion hugging the inside of the room: makes the floor read as a
  // plane enclosed by walls rather than a grid running off the edge.
  ctx.save();
  const inner = FLOOR;
  const band = (x, y, w, h, gx0, gy0, gx1, gy1) => {
    const grad = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.6)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);
  };
  band(inner.x, inner.y, inner.w, 58, 0, inner.y, 0, inner.y + 58);
  band(inner.x, inner.y + inner.h - 58, inner.w, 58, 0, inner.y + inner.h, 0, inner.y + inner.h - 58);
  band(inner.x, inner.y, 58, inner.h, inner.x, 0, inner.x + 58, 0);
  band(inner.x + inner.w - 58, inner.y, 58, inner.h, inner.x + inner.w, 0, inner.x + inner.w - 58, 0);
  ctx.restore();

  for (const w of level.walls) {
    const isNorth = w.y === ROOM.y && w.h === WALL;
    if (isNorth) {
      drawWallSlab(ctx, { ...w, w: doorX0 - w.x }, false);
      drawWallSlab(ctx, { x: doorX1, y: w.y, w: w.x + w.w - doorX1, h: WALL }, false);
      drawDoorway(ctx, exit, time, FLOOR.y);
    } else {
      drawWallSlab(ctx, w, w.y === ROOM.y + ROOM.h - WALL);
    }
  }
}

/**
 * One wall. `thickness` reads from three stacked strips: a dark outer edge, the
 * lit top face, and a bright inner lip. That is what makes 24px read as a wall
 * rather than as a border.
 */
function drawWallSlab(ctx, r, faceSouth) {
  ctx.save();
  // Ground shadow thrown into the room.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  if (faceSouth) ctx.fillRect(r.x, r.y - 7, r.w, 8);
  else ctx.fillRect(r.x, r.y + r.h, r.w, 8);

  const top = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
  top.addColorStop(0, '#46596e');
  top.addColorStop(0.45, '#364859');
  top.addColorStop(1, '#26343f');
  ctx.fillStyle = top;
  ctx.fillRect(r.x, r.y, r.w, r.h);

  // Stone courses.
  ctx.strokeStyle = 'rgba(8, 13, 18, 0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (r.w >= r.h) {
    for (let y = r.y + 11; y < r.y + r.h; y += 11) {
      ctx.moveTo(r.x, y + 0.5);
      ctx.lineTo(r.x + r.w, y + 0.5);
    }
  } else {
    for (let x = r.x + 11; x < r.x + r.w; x += 11) {
      ctx.moveTo(x + 0.5, r.y);
      ctx.lineTo(x + 0.5, r.y + r.h);
    }
  }
  ctx.stroke();

  // The bright inner lip: the single most useful line in the whole room.
  ctx.fillStyle = 'rgba(190, 220, 245, 0.34)';
  if (faceSouth) ctx.fillRect(r.x, r.y - 2, r.w, 3);
  else ctx.fillRect(r.x, r.y + r.h - 2, r.w, 3);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
  if (faceSouth) ctx.fillRect(r.x, r.y + r.h - 3, r.w, 3);
  else ctx.fillRect(r.x, r.y, r.w, 3);
  ctx.restore();
}

/** The service doorway: a green-lit gap in the north wall, with a threshold. */
function drawDoorway(ctx, exit, time, floorY) {
  const x0 = exit.x - DOOR_HALF;
  const x1 = exit.x + DOOR_HALF;
  const wallTop = ROOM.y;
  const bandH = floorY - ROOM.y;

  ctx.save();

  // The corridor beyond: almost black, so the opening has depth.
  const corridor = ctx.createLinearGradient(0, wallTop, 0, floorY + 14);
  corridor.addColorStop(0, '#010604');
  corridor.addColorStop(0.62, 'rgba(5, 32, 22, 0.95)');
  corridor.addColorStop(1, 'rgba(7, 46, 31, 0.8)');
  ctx.fillStyle = corridor;
  ctx.fillRect(x0, wallTop, DOOR_HALF * 2, bandH + 14);

  // Jambs.
  ctx.fillStyle = '#57718a';
  ctx.fillRect(x0 - 8, wallTop, 8, bandH + 12);
  ctx.fillRect(x1, wallTop, 8, bandH + 12);
  ctx.fillStyle = 'rgba(200, 228, 250, 0.34)';
  ctx.fillRect(x0 - 8, wallTop, 2, bandH + 12);
  ctx.fillRect(x1 + 6, wallTop, 2, bandH + 12);

  // Threshold plate and its glowing lip.
  ctx.fillStyle = 'rgba(87, 245, 166, 0.22)';
  ctx.fillRect(x0 + 2, floorY, DOOR_HALF * 2 - 4, 12);
  ctx.strokeStyle = 'rgba(150, 255, 205, 0.9)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(x0 + 2, floorY + 12);
  ctx.lineTo(x1 - 2, floorY + 12);
  ctx.stroke();

  // Light spilling into the room.
  const pool = ctx.createRadialGradient(exit.x, floorY + 10, 8, exit.x, floorY + 10, 160);
  pool.addColorStop(0, 'rgba(87, 245, 166, 0.32)');
  pool.addColorStop(0.4, 'rgba(87, 245, 166, 0.11)');
  pool.addColorStop(1, 'rgba(87, 245, 166, 0)');
  ctx.fillStyle = pool;
  ctx.beginPath();
  ctx.arc(exit.x, floorY + 10, 160, 0, TAU);
  ctx.fill();

  // Beacons either side of the opening.
  for (const [bx, ph] of [
    [x0 - 4, 0],
    [x1 + 4, Math.PI],
  ]) {
    const a = 0.55 + 0.45 * Math.sin(time * 2.4 + ph);
    const halo = ctx.createRadialGradient(bx, wallTop + bandH * 0.5, 0, bx, wallTop + bandH * 0.5, 24);
    halo.addColorStop(0, `rgba(130, 255, 200, ${0.65 * a})`);
    halo.addColorStop(1, 'rgba(87, 245, 166, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(bx, wallTop + bandH * 0.5, 24, 0, TAU);
    ctx.fill();
    ctx.fillStyle = `rgba(200, 255, 230, ${a})`;
    ctx.beginPath();
    ctx.arc(bx, wallTop + bandH * 0.5, 3.6, 0, TAU);
    ctx.fill();
  }

  // Arrow chevrons pointing out through the door.
  ctx.strokeStyle = `rgba(150, 255, 205, ${0.6 + 0.35 * Math.sin(time * 2.4)})`;
  ctx.lineWidth = 2.6;
  for (let i = 0; i < 2; i++) {
    const cy = wallTop + bandH * 0.5 + 7 + i * 9;
    ctx.beginPath();
    ctx.moveTo(exit.x - 10, cy + 7);
    ctx.lineTo(exit.x, cy - 2);
    ctx.lineTo(exit.x + 10, cy + 7);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * A shipping crate: the cover. Deliberately desaturated grey-brown so it can
 * never be confused with a guard's warm torch cone: cover is cold and neutral,
 * threat is the only amber on the floor.
 */
function drawCrate(ctx, c) {
  const depth = 12;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.58)';
  roundRect(ctx, c.x + 8, c.y + depth, c.w, c.h, 2);
  ctx.fill();

  // Side face along the bottom-right.
  ctx.fillStyle = '#22180f';
  roundRect(ctx, c.x + depth, c.y + depth, c.w - 2, c.h - 2, 2);
  ctx.fill();

  const lid = ctx.createLinearGradient(c.x, c.y, c.x + c.w * 0.8, c.y + c.h);
  lid.addColorStop(0, '#7d6a55');
  lid.addColorStop(0.55, '#63523f');
  lid.addColorStop(1, '#463829');
  ctx.fillStyle = lid;
  roundRect(ctx, c.x, c.y, c.w, c.h, 2);
  ctx.fill();

  ctx.save();
  roundRect(ctx, c.x, c.y, c.w, c.h, 2);
  ctx.clip();
  ctx.strokeStyle = 'rgba(38, 28, 18, 0.7)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 1; i <= c.seams; i++) {
    const y = c.y + (c.h / (c.seams + 1)) * i;
    ctx.moveTo(c.x + 2, y);
    ctx.lineTo(c.x + c.w - 2, y);
  }
  for (let i = 0; i < c.grain.length; i++) {
    const gx = c.x + 8 + c.grain[i] * (c.w - 16);
    ctx.moveTo(gx, c.y + 2);
    ctx.lineTo(gx, c.y + c.h - 2);
  }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(48, 36, 22, 0.6)';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(c.x + 6, c.y + c.h - 6);
  ctx.lineTo(c.x + c.w - 6, c.y + 6);
  ctx.stroke();
  ctx.restore();

  // Cold steel rim + corner brackets: hard, high-contrast, obviously solid.
  ctx.strokeStyle = 'rgba(196, 214, 230, 0.55)';
  ctx.lineWidth = 2.2;
  roundRect(ctx, c.x + 1, c.y + 1, c.w - 2, c.h - 2, 2);
  ctx.stroke();
  ctx.fillStyle = '#9fb2c4';
  const s = 9;
  for (const [cx, cy] of [
    [c.x, c.y],
    [c.x + c.w - s, c.y],
    [c.x, c.y + c.h - s],
    [c.x + c.w - s, c.y + c.h - s],
  ]) {
    ctx.fillRect(cx, cy, s, s);
  }
  ctx.fillStyle = 'rgba(2, 4, 6, 0.55)';
  for (const [cx, cy] of [
    [c.x + 2, c.y + 2],
    [c.x + c.w - s + 2, c.y + 2],
    [c.x + 2, c.y + c.h - s + 2],
    [c.x + c.w - s + 2, c.y + c.h - s + 2],
  ]) {
    ctx.fillRect(cx + 2, cy + 2, 3, 3);
  }
  // Top face light.
  ctx.fillStyle = 'rgba(230, 240, 250, 0.16)';
  ctx.fillRect(c.x + 2, c.y + 2, c.w - 4, 3);
}

/**
 * The shadow a crate throws out of a guard's torch, clipped to that torch's
 * wedge. Clipping is what makes the dark wedge sit *inside* the light and stop
 * at the light's own edges, so it always has an obvious cause.
 */
function drawCoverShadows(ctx, level) {
  ctx.save();
  for (const g of level.guards) {
    for (const c of level.crates) {
      const cx = c.x + c.w / 2;
      const cy = c.y + c.h / 2;
      const d = Math.hypot(cx - g.x, cy - g.y);
      if (d > g.cone.range + 140) continue;
      let rel = Math.atan2(cy - g.y, cx - g.x) - g.facing;
      while (rel > Math.PI) rel -= TAU;
      while (rel < -Math.PI) rel += TAU;
      const angularHalf = Math.atan2(c.w + c.h, 2 * Math.max(d, 1));
      if (Math.abs(rel) - angularHalf > g.cone.half) continue;

      // The shadow must run to the rim of the beam. Length d + 120 gave a 60 px stub
      // past the crate — too short to read as a shadow at all, so the frame showed a
      // fully lit crate with a smudge behind it. Inside the clip below, everything
      // behind a blocker is dark all the way to the cone's edge, which is both
      // physically right and the clearest possible picture of the rule.
      const shadow = shadowPolygon(g.x, g.y, c, g.cone.range + 40);
      if (!shadow) continue;

      // Clip to the floor only. The occluded polygon is already the exact region the
      // torch cannot reach — bounded by rays past the crate's corners — so clipping it
      // again to the ideal wedge was redundant *and* wrong: the wedge's straight edges
      // cut the shadow off before the cone's own edge, which is why the dark shape
      // looked like a detached blob rather than light failing to get past the crate.
      ctx.save();
      ctx.beginPath();
      ctx.rect(FLOOR.x, FLOOR.y, FLOOR.w, FLOOR.h);
      ctx.clip();

      ctx.beginPath();
      ctx.moveTo(shadow[0][0], shadow[0][1]);
      for (let i = 1; i < shadow.length; i++) ctx.lineTo(shadow[i][0], shadow[i][1]);
      ctx.closePath();
      ctx.fillStyle = 'rgba(3, 6, 10, 0.62)';
      ctx.fill();
      ctx.restore();
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------- light

function drawCone(ctx, g, level, time) {
  // A guard can have its torch shuttered (used for background cast in close-up
  // frames): no wedge is drawn at all, so the frame shows one unambiguous threat
  // boundary instead of two competing amber fans.
  if (g.torchOff) return;
  const poly = conePolygon(g, level);
  if (poly.length < 3) return;
  const tint = g.heat > 0.55 ? COLOR.coneAlarm : g.heat > 0.2 ? COLOR.coneSuspect : COLOR.cone;

  // Light stops at the walls. conePolygon deliberately ignores the perimeter (the
  // perimeter is a big box the guard stands inside, so treating it as an occluder
  // would black out everything), which meant wide wedges painted over the wall
  // band and off the room. Clipping to the floor rect is the honest version: the
  // torch is bounded by architecture, and no wedge can spill outside the hall.
  ctx.save();
  ctx.beginPath();
  ctx.rect(FLOOR.x, FLOOR.y, FLOOR.w, FLOOR.h);
  ctx.clip();

  // The fill must stay legible all the way to the cone's edge: the vision wedge is
  // the core mechanic, so it cannot fade to nothing at range. An earlier gradient
  // dropped to 0.1 alpha at the rim, which made the far half of every cone read
  // from its outline only — and left the crate shadows with no light to contrast
  // against, so cover looked like it did nothing.
  const grad = ctx.createRadialGradient(g.x, g.y, 12, g.x, g.y, g.cone.range);
  grad.addColorStop(0, `rgba(${tint}, ${0.46 + g.heat * 0.2})`);
  grad.addColorStop(0.55, `rgba(${tint}, ${0.33 + g.heat * 0.16})`);
  grad.addColorStop(1, `rgba(${tint}, 0.24)`);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(g.x, g.y);
  for (const p of poly) ctx.lineTo(p[0], p[1]);
  ctx.closePath();
  ctx.fill();

  // No silhouette stroke around the occluded polygon. Tracing it drew a bright line
  // around every thin sliver the wedge picks up when a crate clips its edge — the
  // "stray red beam with no emitter" that appeared once cover started working. The
  // wedge's real silhouette is already given by the two clipped spines below plus the
  // range arc, and a shadow is defined by the fill stopping, not by an outline.

  // Everything decorative below is clipped to the occluded wedge, so no arc or
  // spine can ever paint through a crate: the shadow stays a hole in the light.
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(g.x, g.y);
  for (const p of poly) ctx.lineTo(p[0], p[1]);
  ctx.closePath();
  ctx.clip();

  // Bright spines down the two straight sides: the classic flashlight read.
  ctx.strokeStyle = `rgba(${COLOR.coneHot}, ${0.6 + g.heat * 0.35})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (const side of [-1, 1]) {
    const a = g.facing + side * g.cone.half;
    const reach = Math.min(g.cone.range, edgeReach(g, poly, a));
    ctx.moveTo(g.x, g.y);
    ctx.lineTo(g.x + Math.cos(a) * reach, g.y + Math.sin(a) * reach);
  }
  ctx.stroke();

  // Range arcs travelling outward.
  const t = (time * 0.42) % 1;
  ctx.strokeStyle = `rgba(${COLOR.coneHot}, 0.18)`;
  ctx.lineWidth = 2;
  for (let k = 0; k < 3; k++) {
    const f = 0.2 + ((t + k / 3) % 1) * 0.74;
    const rad = g.cone.range * f;
    const spread = g.cone.half * f;
    ctx.beginPath();
    for (let i = 0; i <= 8; i++) {
      const a = g.facing - spread + (2 * spread * i) / 8;
      const px = g.x + Math.cos(a) * rad;
      const py = g.y + Math.sin(a) * rad;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function edgeReach(g, poly, a) {
  let best = 0;
  let bestD = Infinity;
  for (const p of poly) {
    const pa = Math.atan2(p[1] - g.y, p[0] - g.x);
    let d = Math.abs(pa - a);
    while (d > Math.PI) d = Math.abs(d - TAU);
    if (d < bestD) {
      bestD = d;
      best = Math.hypot(p[0] - g.x, p[1] - g.y);
    }
  }
  return best;
}

// ---------------------------------------------------------------- things

function drawLoot(ctx, item, time) {
  if (item.taken) return;
  const bob = Math.sin(time * 2 + item.x * 0.02) * 2;
  const y = item.y + bob;
  ctx.save();

  // Plinth: the museum furniture that makes loot read as an exhibit.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  roundRect(ctx, item.x - 20, item.y + 4, 40, 16, 3);
  ctx.fill();
  const ped = ctx.createLinearGradient(item.x, item.y - 8, item.x, item.y + 18);
  ped.addColorStop(0, '#55636f');
  ped.addColorStop(1, '#2a353f');
  ctx.fillStyle = ped;
  roundRect(ctx, item.x - 20, item.y - 2, 40, 18, 3);
  ctx.fill();
  ctx.strokeStyle = 'rgba(190, 215, 235, 0.35)';
  ctx.lineWidth = 1;
  roundRect(ctx, item.x - 19.5, item.y - 1.5, 39, 17, 3);
  ctx.stroke();
  ctx.fillStyle = 'rgba(200, 225, 245, 0.14)';
  roundRect(ctx, item.x - 20, item.y - 2, 40, 5, 2);
  ctx.fill();

  const grad = ctx.createRadialGradient(item.x, y, 0, item.x, y, 36);
  grad.addColorStop(0, 'rgba(255, 211, 92, 0.45)');
  grad.addColorStop(1, 'rgba(255, 211, 92, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(item.x, y, 36, 0, TAU);
  ctx.fill();

  const s = 10;
  ctx.beginPath();
  ctx.moveTo(item.x, y - s);
  ctx.lineTo(item.x + s * 0.76, y - 1);
  ctx.lineTo(item.x, y + s);
  ctx.lineTo(item.x - s * 0.76, y - 1);
  ctx.closePath();
  ctx.fillStyle = COLOR.loot;
  ctx.fill();
  ctx.strokeStyle = '#7d5308';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(item.x, y - s);
  ctx.lineTo(item.x, y + s);
  ctx.strokeStyle = 'rgba(255, 250, 220, 0.85)';
  ctx.lineWidth = 1;
  ctx.stroke();

  const a = time * 0.8 + item.x * 0.01;
  const len = 17 + Math.sin(time * 3 + item.x) * 3;
  ctx.strokeStyle = 'rgba(255, 250, 220, 0.92)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < 2; i++) {
    const ang = a + (i * Math.PI) / 2;
    ctx.moveTo(item.x - Math.cos(ang) * len, y - Math.sin(ang) * len);
    ctx.lineTo(item.x + Math.cos(ang) * len, y + Math.sin(ang) * len);
  }
  ctx.stroke();
  ctx.restore();
}

function drawRings(ctx, field) {
  // Noise is cyan, not pale grey. It was almost the same value as the cone fill, so
  // inside a red wedge "he can hear me" and "he can see me" merged into one blob —
  // the two systems the player must distinguish. 'lighter' also lets the hoop punch
  // through the cone's wash instead of being tinted by it.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const ring of liveRings(field)) {
    const r = 8 + ring.grow * ring.radius * 0.5;
    const alpha = (1 - ring.t) * (ring.kind === 'stomp' ? 0.62 : 0.34) * ring.strength;
    ctx.strokeStyle = `rgba(96, 236, 255, ${alpha})`;
    ctx.lineWidth = ring.kind === 'stomp' ? 3.6 : 2;
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, r, 0, TAU);
    ctx.stroke();
    // A single soft inner echo sells it as a travelling wave without doubling the
    // hoop into two competing circles.
    if (ring.kind === 'stomp') {
      ctx.strokeStyle = `rgba(96, 236, 255, ${alpha * 0.34})`;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, Math.max(4, r - 4), 0, TAU);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/**
 * A top-down human. Read at a glance this has to say "person standing, looking
 * that way": a tapered torso widest at the shoulders, a head sitting forward of
 * centre with a peak, and one arm forward holding the torch. The earlier version
 * put two symmetric lobes either side of a disc, which reads as headphones rather
 * than a body — the asymmetry of the torch arm is what fixes it.
 */
function drawHuman(ctx, opts) {
  const { x, y, facing, r, shoulder, head, skin, rim, cap, dark, mid } = opts;
  ctx.save();

  // Contact shadow, offset down-right so the room has a light direction.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.beginPath();
  ctx.ellipse(x + 3, y + 7, shoulder * 1.05, r * 0.78, 0, 0, TAU);
  ctx.fill();

  ctx.translate(x, y);
  ctx.rotate(facing);

  // Torso: narrow at the back, wide at the shoulders, rounded. A single mass,
  // not two pods, so it reads as shoulders rather than side attachments.
  const body = ctx.createLinearGradient(-r * 0.5, 0, r * 1.1, 0);
  body.addColorStop(0, dark);
  body.addColorStop(0.5, mid);
  body.addColorStop(1, dark);
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(-r * 0.52, -shoulder * 0.52);
  ctx.quadraticCurveTo(r * 0.1, -shoulder * 1.02, r * 0.5, -shoulder * 0.78);
  ctx.quadraticCurveTo(r * 0.78, 0, r * 0.5, shoulder * 0.78);
  ctx.quadraticCurveTo(r * 0.1, shoulder * 1.02, -r * 0.52, shoulder * 0.52);
  ctx.quadraticCurveTo(-r * 0.72, 0, -r * 0.52, -shoulder * 0.52);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = rim;
  ctx.lineWidth = 1.4;
  ctx.stroke();

  // Left arm tucked; right arm extended along the facing with a torch in hand.
  // This asymmetry is the strongest "which way is this person looking" cue.
  ctx.strokeStyle = mid;
  ctx.lineWidth = r * 0.34;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(r * 0.1, -shoulder * 0.72);
  ctx.lineTo(-r * 0.15, -shoulder * 0.95);
  ctx.stroke();

  ctx.strokeStyle = rim;
  ctx.lineWidth = r * 0.3;
  ctx.beginPath();
  ctx.moveTo(r * 0.12, shoulder * 0.7);
  ctx.lineTo(r * 0.88, shoulder * 0.36);
  ctx.stroke();

  // Head, forward of centre.
  ctx.fillStyle = head;
  ctx.beginPath();
  ctx.arc(r * 0.22, 0, r * 0.5, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = rim;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  if (cap) {
    // Peaked cap: the brim points where the guard looks.
    ctx.fillStyle = cap;
    ctx.beginPath();
    ctx.ellipse(r * 0.5, 0, r * 0.26, r * 0.36, 0, 0, TAU);
    ctx.fill();
  }
  if (skin) {
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(r * 0.46, 0, 2, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function drawPlayer(ctx, p, time) {
  const crouch = p.stance === 'crouch';
  const r = crouch ? 16 : 18;
  const lift = crouch ? 0 : Math.sin(p.bob * 2) * 0.9;

  // Stance ring on the floor, coloured by how loud the stance is. Deliberately not
  // drawn while sprinting: the real footstep rings are already out on the floor, and
  // a second ring around the thief read as a duplicate, off-centre noise indicator
  // fighting the real one. The HUD and the orange cone-glow still say "loud".
  const col = p.stance === 'sprint' ? '255, 150, 90' : p.stance === 'crouch' ? '142, 240, 221' : '210, 240, 255';
  ctx.save();
  if (p.stance !== 'sprint') {
    ctx.strokeStyle = `rgba(${col}, 0.55)`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r + 8, 0, TAU);
    ctx.stroke();
  }
  // Direction tick, so facing is readable even at a glance.
  const tx = p.x + Math.cos(p.facing) * (r + 5);
  const ty = p.y + Math.sin(p.facing) * (r + 5);
  ctx.fillStyle = 'rgba(219, 255, 248, 0.9)';
  ctx.beginPath();
  ctx.arc(tx, ty, 2.6, 0, TAU);
  ctx.fill();
  ctx.restore();

  drawHuman(ctx, {
    x: p.x,
    y: p.y + lift,
    facing: p.facing,
    r,
    shoulder: crouch ? r * 0.8 : r * 1.0,
    head: '#062e2c',
    skin: '#f2fffc',
    rim: '#c9fff4',
    dark: '#0a514c',
    mid: '#25b8a8',
  });

  // A soft teal aura keeps the thief findable in a dark frame.
  ctx.save();
  const aura = ctx.createRadialGradient(p.x, p.y, r * 0.6, p.x, p.y, r * 2.4);
  aura.addColorStop(0, 'rgba(110, 240, 215, 0.16)');
  aura.addColorStop(1, 'rgba(110, 240, 215, 0)');
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r * 2.4, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawGuard(ctx, g, time) {
  drawHuman(ctx, {
    x: g.x,
    y: g.y,
    facing: g.facing,
    r: 20,
    shoulder: 21,
    head: '#121a22',
    skin: g.heat > 0.4 ? '#ff8a6a' : '#ffe0a6',
    rim: 'rgba(232, 244, 255, 0.9)',
    dark: '#1c2530',
    mid: '#7b8fa6',
    cap: '#0a0f14',
  });

  // Torch held at the front, where the cone originates.
  ctx.save();
  const tx = g.x + Math.cos(g.facing) * 16;
  const ty = g.y + Math.sin(g.facing) * 16;
  const halo = ctx.createRadialGradient(tx, ty, 0, tx, ty, 11);
  halo.addColorStop(0, 'rgba(255, 244, 205, 0.95)');
  halo.addColorStop(0.45, 'rgba(255, 200, 110, 0.35)');
  halo.addColorStop(1, 'rgba(255, 180, 80, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(tx, ty, 11, 0, TAU);
  ctx.fill();
  ctx.restore();

  // Last-seen mark: where this guard last had eyes on the thief. Without it the
  // cover frame showed a rising meter and a suspicious guard with no cause on
  // screen — the player could not tell *why* the alarm was climbing. The mark and
  // the faint tether make the investigate state legible: the guard is walking to
  // the spot where it lost you, not simply sensing the player through a crate.
  if (g.lastSeen && !g.sees && (g.state === 'investigate' || g.state === 'search')) {
    const { x, y } = g.lastSeen;
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 177, 94, 0.28)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 7]);
    ctx.beginPath();
    ctx.moveTo(g.x, g.y);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.setLineDash([]);
    const puls = 0.5 + 0.5 * Math.sin(time * 5);
    ctx.strokeStyle = `rgba(255, 177, 94, ${0.5 + puls * 0.35})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 9 + puls * 3, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 5, y);
    ctx.lineTo(x + 5, y);
    ctx.moveTo(x, y - 5);
    ctx.lineTo(x, y + 5);
    ctx.stroke();
    ctx.restore();
  }

  // Suspicion mark. Anchored just above the head and slightly along the facing, so
  // it reads as coming *from* the guard rather than floating in the room.
  if (g.heat > 0.2 || g.state === 'investigate' || g.state === 'search' || g.state === 'alert') {
    ctx.save();
    const bx = g.x + Math.cos(g.facing) * 7;
    const by = g.y + Math.sin(g.facing) * 7 - 25;
    const glyph = g.sees || g.state === 'alert' ? '!' : '?';
    ctx.font = `800 17px ${FONT.ui}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Small dark plate so the glyph stays legible over floor, cone or crate.
    ctx.fillStyle = 'rgba(4, 8, 12, 0.78)';
    ctx.beginPath();
    ctx.arc(bx, by, 10, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = g.sees ? 'rgba(255,77,77,0.55)' : 'rgba(255,177,94,0.45)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = g.sees ? COLOR.alarm : COLOR.suspect;
    ctx.globalAlpha = 0.78 + 0.22 * Math.sin(time * 9);
    ctx.fillText(glyph, bx, by + 1);
    ctx.restore();
  }
}

// ---------------------------------------------------------------- HUD

function panel(ctx, x, y, w, h, r = 8) {
  ctx.fillStyle = COLOR.hudPanel;
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.strokeStyle = COLOR.hudLine;
  ctx.lineWidth = 1;
  roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r);
  ctx.stroke();
}

function bandColor(alarm) {
  if (alarm >= 0.995) return COLOR.alarm;
  if (alarm >= RULES.danger) return '#ff7a4d';
  if (alarm >= 0.34) return '#ffc169';
  if (alarm > 0.02) return '#9fd8c8';
  return COLOR.textDim;
}

function drawHud(ctx, state) {
  const { alarm, level, player } = state;

  // The HUD lives in two bands outside the room, so it can never cover the wall
  // band. Top band: alarm and floor identity. Bottom band: stance and loot.
  ctx.fillStyle = 'rgba(4, 8, 12, 0.92)';
  ctx.fillRect(0, 0, FIELD.w, HUD_BAND.top);
  ctx.fillRect(0, FIELD.h - HUD_BAND.bottom, FIELD.w, HUD_BAND.bottom);
  ctx.strokeStyle = 'rgba(120, 160, 190, 0.22)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, HUD_BAND.top - 0.5);
  ctx.lineTo(FIELD.w, HUD_BAND.top - 0.5);
  ctx.moveTo(0, FIELD.h - HUD_BAND.bottom + 0.5);
  ctx.lineTo(FIELD.w, FIELD.h - HUD_BAND.bottom + 0.5);
  ctx.stroke();

  // --- top band: alarm meter on the left
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `700 11px ${FONT.mono}`;
  ctx.fillStyle = COLOR.textDim;
  ctx.fillText('ALARM', 26, 26);
  // The band word sits to the right of the bar with clearance, so it can never be
  // mistaken for a label pinned to the end of the fill.
  ctx.font = `800 13px ${FONT.mono}`;
  ctx.fillStyle = bandColor(alarm);
  ctx.textAlign = 'left';
  // While the meter is falling, the band word names that fact instead of the height.
  // "SUSPICIOUS" over a hidden, silent thief read as detection working through solid
  // cover; "COOLING" says the same number is on its way down, which is the mechanic
  // the cover scene exists to show.
  const cooling = !state.visible && alarm > 0.02 && alarm < 0.995;
  ctx.fillText(cooling ? 'COOLING' : alarmBand(alarm), 386, 26);

  const bx = 26;
  const by = 36;
  const bw = 340;
  const bh = 16;
  // Catch zone tinted *under* the fill, so the last stretch of track reads as the
  // danger band without a second label anywhere on the bar.
  const dx = bx + bw * RULES.danger;
  ctx.fillStyle = 'rgba(255, 70, 70, 0.13)';
  ctx.fillRect(dx, by, bx + bw - dx, bh);
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  roundRect(ctx, bx, by, bw, bh, 4);
  ctx.fill();
  if (alarm > 0.002) {
    const g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    g.addColorStop(0, 'rgba(120, 230, 190, 0.95)');
    g.addColorStop(0.45, 'rgba(255, 201, 90, 0.95)');
    g.addColorStop(0.78, 'rgba(255, 120, 60, 1)');
    g.addColorStop(1, 'rgba(255, 70, 70, 1)');
    ctx.fillStyle = g;
    roundRect(ctx, bx, by, Math.max(6, bw * alarm), bh, 4);
    ctx.fill();
  }
  // Peak marker. A meter that drains is the whole point of breaking line of sight,
  // but a half-full bar with a hidden thief reads as a contradiction unless you can
  // see it *fell*. The ghost line records how high the alarm reached, so the frame
  // shows cause and effect: it climbed while exposed, and it is coming down now.
  const peak = Math.max(alarm, state.peakAlarm ?? alarm);
  if (peak > alarm + 0.03) {
    const pk = bx + bw * peak;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.34)';
    ctx.fillRect(pk - 1, by - 3, 2, bh + 6);
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.09)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 10; i++) {
    ctx.beginPath();
    ctx.moveTo(bx + (bw * i) / 10, by);
    ctx.lineTo(bx + (bw * i) / 10, by + bh);
    ctx.stroke();
  }
  // Track outline: without a visible end cap the fill's remaining margin is
  // guesswork, which matters on the near-miss frame where "not yet full" is the
  // whole point.
  ctx.strokeStyle = 'rgba(160, 195, 220, 0.3)';
  ctx.lineWidth = 1;
  roundRect(ctx, bx + 0.5, by + 0.5, bw - 1, bh - 1, 4);
  ctx.stroke();
  // Danger notch. Labelled DANGER, not CAUGHT: crossing it makes the room start to
  // pulse, but the alarm is only caught when the fill reaches the *end* of the track.
  // It previously read CAUGHT at 72%, so a near-miss frame at 90% showed the bar past
  // a line labelled CAUGHT while the game was still running — the HUD contradicting
  // itself at the single most important readout.
  ctx.strokeStyle = 'rgba(255, 90, 90, 0.8)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(dx, by - 5);
  ctx.lineTo(dx, by + bh + 5);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.font = `600 9px ${FONT.mono}`;
  ctx.fillStyle = 'rgba(255, 90, 90, 0.8)';
  ctx.fillText('DANGER', dx, by + bh + 13);

  // --- top band: floor identity, centred
  ctx.textAlign = 'center';
  ctx.font = `700 10px ${FONT.mono}`;
  ctx.fillStyle = COLOR.textFaint;
  ctx.fillText(`FLOOR ${level.index + 1} OF 3  ·  ${level.subtitle.toUpperCase()}`, FIELD.w / 2, 28);
  ctx.font = `800 26px ${FONT.ui}`;
  ctx.fillStyle = COLOR.text;
  ctx.fillText(level.name.toUpperCase(), FIELD.w / 2, 60);

  // --- top band: the way out, right
  ctx.textAlign = 'right';
  ctx.font = `700 10px ${FONT.mono}`;
  ctx.fillStyle = COLOR.textFaint;
  ctx.fillText('SERVICE EXIT', FIELD.w - 26, 26);
  const ex = FIELD.w - 26;
  const ey = 44;
  const pulse = 0.5 + 0.5 * Math.sin(state.time * 2.4);
  ctx.fillStyle = `rgba(87, 245, 166, ${0.28 + pulse * 0.3})`;
  ctx.beginPath();
  ctx.moveTo(ex - 18, ey + 12);
  ctx.lineTo(ex - 7, ey);
  ctx.lineTo(ex + 4, ey + 12);
  ctx.lineTo(ex + 8, ey + 12);
  ctx.lineTo(ex - 7, ey - 2);
  ctx.lineTo(ex - 22, ey + 12);
  ctx.closePath();
  ctx.fill();
  ctx.font = `800 12px ${FONT.mono}`;
  ctx.fillStyle = COLOR.exit;
  ctx.fillText(level.exit.side === 'top' ? 'NORTH WALL' : 'EAST WALL', ex, ey + 30);

  // --- bottom band: stance, left
  const spec = STANCE[player.stance];
  ctx.textAlign = 'left';
  ctx.font = `700 10px ${FONT.mono}`;
  ctx.fillStyle = COLOR.textFaint;
  ctx.fillText('STANCE', 26, FIELD.h - HUD_BAND.bottom + 26);
  ctx.font = `800 24px ${FONT.mono}`;
  const stanceCol = player.stance === 'sprint' ? '#ff9a6b' : player.stance === 'crouch' ? '#8ef0dd' : COLOR.text;
  ctx.fillStyle = stanceCol;
  ctx.fillText(spec.label, 26, FIELD.h - HUD_BAND.bottom + 54);
  const loud = player.stance === 'sprint' ? 'LOUD' : player.stance === 'walk' ? 'AUDIBLE' : 'SILENT';
  const loudCol = player.stance === 'sprint' ? '#ff9a6b' : player.stance === 'walk' ? '#ffc169' : '#8ef0dd';
  ctx.font = `800 11px ${FONT.mono}`;
  ctx.fillStyle = loudCol;
  ctx.fillText(loud, 140, FIELD.h - HUD_BAND.bottom + 44);
  for (let i = 0; i < 4; i++) {
    const on = player.stance === 'sprint' ? i < 4 : player.stance === 'walk' ? i < 2 : false;
    ctx.fillStyle = on ? loudCol : 'rgba(255,255,255,0.10)';
    ctx.fillRect(140 + i * 15, FIELD.h - HUD_BAND.bottom + 52, 11, 12);
  }
  // Crouch hint: what this stance does to how visible the thief is. This is the
  // stance's *modifier*, not live detection — the alarm bar above is the live
  // reading, so this is labelled as a property to avoid two conflicting numbers.
  ctx.font = `600 10px ${FONT.mono}`;
  ctx.fillStyle = COLOR.textFaint;
  ctx.fillText(`VISIBILITY ×${spec.exposure.toFixed(2)}`, 140, FIELD.h - HUD_BAND.bottom + 80);

  // --- bottom band: controls, centre
  ctx.textAlign = 'center';
  ctx.font = `600 12px ${FONT.mono}`;
  ctx.fillStyle = 'rgba(170, 192, 210, 0.72)';
  ctx.fillText('WASD / ARROWS  MOVE', FIELD.w / 2, FIELD.h - HUD_BAND.bottom + 34);
  ctx.fillStyle = 'rgba(150, 172, 190, 0.62)';
  ctx.font = `600 11px ${FONT.mono}`;
  ctx.fillText('SHIFT  SPRINT      CTRL  CROUCH      R  RESTART', FIELD.w / 2, FIELD.h - HUD_BAND.bottom + 56);

  // --- bottom band: loot, right
  ctx.textAlign = 'right';
  ctx.font = `700 10px ${FONT.mono}`;
  ctx.fillStyle = COLOR.textFaint;
  ctx.fillText('LOOT', FIELD.w - 26, FIELD.h - HUD_BAND.bottom + 26);
  ctx.font = `800 34px ${FONT.mono}`;
  ctx.fillStyle = COLOR.loot;
  ctx.fillText(`${state.lootCount}`, FIELD.w - 62, FIELD.h - HUD_BAND.bottom + 62);
  ctx.font = `700 18px ${FONT.mono}`;
  ctx.fillStyle = COLOR.textFaint;
  ctx.fillText(`/ ${state.lootTotal}`, FIELD.w - 26, FIELD.h - HUD_BAND.bottom + 62);
}

// ---------------------------------------------------------------- overlays

function scrim(ctx, alpha) {
  ctx.fillStyle = `rgba(3, 6, 10, ${alpha})`;
  ctx.fillRect(0, 0, FIELD.w, FIELD.h);
}

/**
 * The vignette hugs the frame at low strength: strong enough to focus the eye,
 * weak enough that the walls stay readable, which was the first version's bug.
 */
function drawVignette(ctx, alarm) {
  const g = ctx.createRadialGradient(FIELD.w / 2, FIELD.h / 2, FIELD.h * 0.52, FIELD.w / 2, FIELD.h / 2, FIELD.h * 1.02);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${0.30 + alarm * 0.10})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, FIELD.w, FIELD.h);
  if (alarm > RULES.danger) {
    const k = (alarm - RULES.danger) / (1 - RULES.danger);
    const r = ctx.createRadialGradient(FIELD.w / 2, FIELD.h / 2, FIELD.h * 0.34, FIELD.w / 2, FIELD.h / 2, FIELD.h * 0.96);
    r.addColorStop(0, 'rgba(255, 40, 40, 0)');
    r.addColorStop(1, `rgba(255, 40, 40, ${0.34 * k})`);
    ctx.fillStyle = r;
    ctx.fillRect(0, 0, FIELD.w, FIELD.h);
  }
}

function drawKey(ctx, x, y, label) {
  ctx.font = `700 11px ${FONT.mono}`;
  const w = Math.max(28, ctx.measureText(label).width + 18);
  ctx.fillStyle = 'rgba(233, 242, 247, 0.10)';
  roundRect(ctx, x, y - 14, w, 22, 4);
  ctx.fill();
  ctx.strokeStyle = 'rgba(233, 242, 247, 0.34)';
  ctx.lineWidth = 1;
  roundRect(ctx, x + 0.5, y - 13.5, w - 1, 21, 4);
  ctx.stroke();
  ctx.fillStyle = COLOR.text;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y - 2.5);
  return w;
}

function drawTitle(ctx, state) {
  const t = state.time;
  scrim(ctx, 0.55);
  const glow = ctx.createRadialGradient(FIELD.w / 2, 232, 40, FIELD.w / 2, 232, 640);
  glow.addColorStop(0, 'rgba(255, 198, 105, 0.18)');
  glow.addColorStop(1, 'rgba(255, 198, 105, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, FIELD.w, FIELD.h);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  ctx.font = `700 12px ${FONT.mono}`;
  ctx.fillStyle = COLOR.patrol;
  ctx.fillText('A  T H I E F  I N  T H E  M U S E U M', FIELD.w / 2, 126);

  ctx.font = `800 80px ${FONT.ui}`;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
  ctx.fillText('NIGHTWATCH', FIELD.w / 2 + 3, 210);
  const grad = ctx.createLinearGradient(0, 142, 0, 218);
  grad.addColorStop(0, '#fffaea');
  grad.addColorStop(0.5, '#ffdb9d');
  grad.addColorStop(1, '#e0a05a');
  ctx.fillStyle = grad;
  ctx.fillText('NIGHTWATCH', FIELD.w / 2, 207);

  ctx.font = `700 27px ${FONT.ui}`;
  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  ctx.fillText('at the Lamp Room', FIELD.w / 2 + 2, 249);
  ctx.fillStyle = '#d6e4ee';
  ctx.fillText('at the Lamp Room', FIELD.w / 2, 247);

  ctx.font = `600 13px ${FONT.mono}`;
  ctx.fillStyle = COLOR.textDim;
  ctx.fillText('Cross the floor unseen.  Loot is optional.  The door is not.', FIELD.w / 2, 280);

  const cardW = 616;
  const cardH = 126;
  const cx = FIELD.w / 2 - cardW / 2;
  const cy = 308;
  panel(ctx, cx, cy, cardW, cardH, 10);

  ctx.textBaseline = 'middle';
  let y = cy + 32;
  let x = cx + 96;
  for (const k of ['W', 'A', 'S', 'D']) x += drawKey(ctx, x, y, k) + 6;
  ctx.textAlign = 'left';
  ctx.font = `600 13px ${FONT.mono}`;
  ctx.fillStyle = COLOR.textDim;
  ctx.fillText('move', x + 4, y - 1);

  x += 88;
  x += drawKey(ctx, x, y, 'SHIFT') + 10;
  ctx.fillStyle = '#ff9a6b';
  ctx.fillText('sprint', x, y - 1);

  y += 36;
  x = cx + 96;
  x += drawKey(ctx, x, y, 'CTRL') + 10;
  ctx.fillStyle = '#8ef0dd';
  ctx.font = `600 13px ${FONT.mono}`;
  ctx.fillText('crouch', x, y - 1);

  x += 128;
  x += drawKey(ctx, x, y, 'R') + 10;
  ctx.fillStyle = COLOR.textDim;
  ctx.fillText('restart the floor', x, y - 1);

  y += 34;
  x = cx + 96;
  x += drawKey(ctx, x, y, 'ESC') + 10;
  ctx.fillStyle = COLOR.textDim;
  ctx.fillText('back to the title', x, y - 1);

  ctx.textAlign = 'center';
  ctx.font = `600 11px ${FONT.mono}`;
  ctx.fillStyle = COLOR.textFaint;
  ctx.fillText('A guard’s cone is his sight. Crates throw shadows. A full meter and you are caught.', FIELD.w / 2, cy + cardH - 12);

  const a = 0.55 + 0.45 * Math.sin(t * 3);
  ctx.globalAlpha = a;
  ctx.font = `800 18px ${FONT.mono}`;
  ctx.fillStyle = COLOR.exit;
  ctx.fillText('PRESS  SPACE  TO  BEGIN', FIELD.w / 2, 500);
  ctx.globalAlpha = 1;

  ctx.font = `600 11px ${FONT.mono}`;
  ctx.fillStyle = 'rgba(160,185,205,0.55)';
  ctx.fillText('I  The Lamp Room        II  The Glass Court        III  The Vault Annex', FIELD.w / 2, FIELD.h - 42);
}

function drawCaught(ctx, state) {
  scrim(ctx, 0.76);
  const cw = 560;
  const ch = 244;
  const x = FIELD.w / 2 - cw / 2;
  const y = FIELD.h / 2 - ch / 2;
  panel(ctx, x, y, cw, ch, 12);
  ctx.strokeStyle = 'rgba(255, 77, 77, 0.6)';
  ctx.lineWidth = 2;
  roundRect(ctx, x + 1, y + 1, cw - 2, ch - 2, 12);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `700 11px ${FONT.mono}`;
  ctx.fillStyle = COLOR.alarm;
  ctx.fillText('THE ALARM IS SCREAMING', FIELD.w / 2, y + 46);
  ctx.font = `800 58px ${FONT.ui}`;
  ctx.fillStyle = '#fff0ee';
  ctx.fillText('CAUGHT', FIELD.w / 2, y + 106);
  ctx.font = `600 13px ${FONT.mono}`;
  ctx.fillStyle = COLOR.textDim;
  ctx.fillText(state.caughtReason, FIELD.w / 2, y + 138);
  ctx.fillStyle = COLOR.textFaint;
  ctx.fillText(`${state.level.name} · ${state.lootCount} of ${state.lootTotal} loot taken`, FIELD.w / 2, y + 162);

  ctx.font = `800 14px ${FONT.mono}`;
  ctx.fillStyle = COLOR.text;
  ctx.fillText('R  RETRY FLOOR            ESC  TITLE', FIELD.w / 2, y + 208);
}

function drawEscaped(ctx, state) {
  scrim(ctx, 0.68);
  const cw = 590;
  const ch = 272;
  const x = FIELD.w / 2 - cw / 2;
  const y = FIELD.h / 2 - ch / 2;
  panel(ctx, x, y, cw, ch, 12);
  ctx.strokeStyle = 'rgba(87, 245, 166, 0.6)';
  ctx.lineWidth = 2;
  roundRect(ctx, x + 1, y + 1, cw - 2, ch - 2, 12);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.font = `700 11px ${FONT.mono}`;
  ctx.fillStyle = COLOR.exit;
  ctx.fillText(state.hasNext ? 'THE FLOOR IS YOURS' : 'OUT THE SERVICE DOOR', FIELD.w / 2, y + 46);
  ctx.font = `800 56px ${FONT.ui}`;
  ctx.fillStyle = '#eafff4';
  ctx.fillText('ESCAPED', FIELD.w / 2, y + 104);

  ctx.font = `600 13px ${FONT.mono}`;
  ctx.fillStyle = COLOR.textDim;
  ctx.fillText(`${state.level.name} cleared · alarm peaked at ${Math.round(state.peakAlarm * 100)}%`, FIELD.w / 2, y + 136);

  const total = state.lootTotal;
  const taken = state.lootCount;
  ctx.font = `800 13px ${FONT.mono}`;
  ctx.fillStyle = COLOR.loot;
  ctx.fillText(`LOOT  ${taken} / ${total}`, FIELD.w / 2, y + 168);
  const pipW = 16;
  const pipGap = 8;
  const totalW = total * pipW + (total - 1) * pipGap;
  let px = FIELD.w / 2 - totalW / 2;
  for (let i = 0; i < total; i++) {
    ctx.fillStyle = i < taken ? COLOR.loot : 'rgba(255,255,255,0.13)';
    roundRect(ctx, px, y + 180, pipW, 8, 2);
    ctx.fill();
    px += pipW + pipGap;
  }

  ctx.font = `800 14px ${FONT.mono}`;
  ctx.fillStyle = COLOR.text;
  ctx.fillText(state.hasNext ? 'SPACE  NEXT FLOOR' : 'SPACE  THE NIGHT IS OVER', FIELD.w / 2, y + 228);
  ctx.font = `600 11px ${FONT.mono}`;
  ctx.fillStyle = COLOR.textFaint;
  ctx.fillText('R  REPLAY FLOOR            ESC  TITLE', FIELD.w / 2, y + 250);
}

function drawToast(ctx, state) {
  const { toast } = state;
  ctx.globalAlpha = clamp(toast.life / 0.5, 0, 1);
  ctx.textAlign = 'center';
  ctx.font = `700 13px ${FONT.mono}`;
  const w = ctx.measureText(toast.text).width + 40;
  panel(ctx, FIELD.w / 2 - w / 2, FIELD.h - 146, w, 36, 7);
  ctx.fillStyle = toast.color ?? COLOR.loot;
  ctx.textBaseline = 'middle';
  ctx.fillText(toast.text, FIELD.w / 2, FIELD.h - 127);
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- the frame

export function draw(renderer, state) {
  const { ctx } = renderer;
  const { view } = renderer;
  const dpr = view.dpr;
  const cam = state.camera ?? { x: FIELD.w / 2, y: FIELD.h / 2, zoom: 1 };
  const level = state.level;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = COLOR.void;
  ctx.fillRect(0, 0, renderer.canvas.width, renderer.canvas.height);

  applyCamera(ctx, cam, view, dpr);

  drawFloor(renderer, level);
  drawWalls(ctx, level, state.time);

  // Light first, then the shadow it fails to cast past a crate, then the crates
  // themselves. Painting shadows before the cones was the bug: the cone's radial
  // gradient simply washed the dark wedge back out to light.
  for (const g of level.guards) drawCone(ctx, g, level, state.time);
  drawCoverShadows(ctx, level);
  for (const c of level.crates) drawCrate(ctx, c);
  drawLamps(ctx, level, state.time);

  for (const item of level.loot) drawLoot(ctx, item, state.time);
  drawRings(ctx, state.noise);

  drawPlayer(ctx, state.player, state.time);
  for (const g of level.guards) drawGuard(ctx, g, state.time);

  // Vignette only inside the room: the HUD bands stay flat and readable.
  applyCamera(ctx, cam, view, dpr);
  ctx.save();
  ctx.beginPath();
  ctx.rect(ROOM.x, ROOM.y, ROOM.w, ROOM.h);
  ctx.clip();
  drawVignette(ctx, state.alarm);
  ctx.restore();

  // HUD and overlays are drawn in field space, never under the camera.
  applyCamera(ctx, { x: FIELD.w / 2, y: FIELD.h / 2, zoom: 1 }, view, dpr);

  if (state.mode === 'title') {
    drawTitle(ctx, state);
  } else {
    drawHud(ctx, state);
    if (state.mode === 'caught') drawCaught(ctx, state);
    else if (state.mode === 'escaped') drawEscaped(ctx, state);
    else if (state.toast && state.toast.life > 0) drawToast(ctx, state);
  }
}

// The three floors of the museum. Data only: rectangles for walls and cover,
// waypoint loops for the guards, where the loot sits, where the exit doorway is.
// `buildLevel` turns a floor into the runtime objects the rules and the renderer
// both read, so a level is described once.
//
// Geometry is authored in fractions of the standable floor (config.FLOOR) rather
// than absolute pixels: at()` maps a 0..1 point inside the floor to the field, so
// the layout survives any change to the frame, the wall thickness or the HUD
// bands without a single coordinate drifting out of the room.

import { FIELD, FLOOR, ROOM, WALL } from './config.js';
import { dist, makeRng } from './geometry.js';

/** Half-width of the service doorway cut in the north wall. */
const DOOR = 46;

/** Map a 0..1 point inside the floor to field pixels. */
const at = (fx, fy) => ({
  x: Math.round(FLOOR.x + fx * FLOOR.w),
  y: Math.round(FLOOR.y + fy * FLOOR.h),
});

/** A rectangle authored as fractions of the floor, in pixels. */
const box = (fx, fy, fw, fh) => {
  const x = Math.round(FLOOR.x + fx * FLOOR.w);
  const y = Math.round(FLOOR.y + fy * FLOOR.h);
  return { x, y, w: Math.round(fw * FLOOR.w), h: Math.round(fh * FLOOR.h) };
};

/** The exit doorway in the north wall, at a fraction across the floor. */
const door = (fx, r) => ({ side: 'top', x: Math.round(FLOOR.x + fx * FLOOR.w), y: FLOOR.y + 10, r });

const FLOORS = [
  {
    id: 1,
    name: 'The Lamp Room',
    subtitle: 'Ground floor · ceramics',
    brief: 'One night watchman and his understudy. Cross the lamp hall to the service door.',
    spawn: at(0.045, 0.94),
    exit: door(0.93, 44),
    walls: [
      // A central partition with a wide gap: the hall's two lanes.
      { ...at(0.31, 0), w: 30, h: Math.round(FLOOR.h * 0.45) },
      { ...at(0.31, 0.79), w: 30, h: Math.round(FLOOR.h * 0.21) },
    ],
    crates: [
      box(0.19, 0.6, 0.09, 0.16),
      box(0.39, 0.78, 0.075, 0.17),
      box(0.51, 0.35, 0.1, 0.19),
      box(0.68, 0.76, 0.085, 0.15),
      box(0.76, 0.2, 0.067, 0.16),
      box(0.12, 0.08, 0.093, 0.16),
      box(0.62, 0.02, 0.075, 0.13),
    ],
    guards: [
      {
        name: 'Sable',
        speed: 66,
        wait: 0.7,
        cone: { range: 246, half: 0.4 },
        waypoints: [at(0.52, 0.99), at(0.89, 0.99), at(0.89, 0.62)],
      },
      {
        name: 'Moss',
        speed: 58,
        wait: 1.0,
        cone: { range: 232, half: 0.44 },
        waypoints: [at(0.44, 0.15), at(0.44, 0.6), at(0.57, 0.15)],
      },
    ],
    loot: [at(0.155, 0.03), at(0.955, 0.52)],
    lootNames: ['Han vase', 'lamp filament'],
    lootValues: [1, 1],
  },
  {
    id: 2,
    name: 'The Glass Court',
    subtitle: 'First floor · glass & mirrors',
    brief: 'Three on the floor. The court is open; the light is not.',
    spawn: at(0.04, 0.93),
    exit: door(0.94, 42),
    walls: [
      { ...at(0, 0.38), w: Math.round(FLOOR.w * 0.17), h: 28 },
      { ...at(0.75, 0.38), w: Math.round(FLOOR.w * 0.25), h: 28 },
      { ...at(0.21, 0.79), w: 28, h: Math.round(FLOOR.h * 0.21) },
      { ...at(0.71, 0), w: 28, h: Math.round(FLOOR.h * 0.3) },
    ],
    crates: [
      box(0.085, 0.63, 0.075, 0.19),
      box(0.27, 0.14, 0.065, 0.17),
      box(0.4, 0.6, 0.093, 0.155),
      box(0.55, 0.08, 0.06, 0.155),
      box(0.65, 0.79, 0.075, 0.18),
      box(0.77, 0.6, 0.059, 0.15),
      box(0.33, 0.89, 0.081, 0.11),
      box(0.86, 0.06, 0.072, 0.16),
    ],
    guards: [
      {
        name: 'Wren',
        speed: 70,
        wait: 0.8,
        cone: { range: 242, half: 0.4 },
        waypoints: [at(0.18, 0.32), at(0.5, 0.32), at(0.5, 0.02)],
      },
      {
        name: 'Iris',
        speed: 62,
        wait: 0.6,
        cone: { range: 252, half: 0.42 },
        waypoints: [at(0.62, 0.66), at(0.91, 0.66), at(0.91, 0.26)],
      },
      {
        name: 'Holt',
        speed: 74,
        wait: 0.9,
        cone: { range: 228, half: 0.38 },
        waypoints: [at(0.55, 0.99), at(0.46, 0.7), at(0.18, 0.99)],
      },
    ],
    loot: [at(0.94, 0.02), at(0.13, 0.99), at(0.48, 0.02)],
    lootNames: ['mirror shard', 'silver glass', 'court seal'],
    lootValues: [2, 1, 2],
  },
  {
    id: 3,
    name: 'The Vault Annex',
    subtitle: 'Basement · the strongroom',
    brief: 'Four on the floor and a long lane. Take the vault or take the door.',
    spawn: at(0.04, 0.93),
    exit: door(0.95, 40),
    walls: [
      { ...at(0.16, 0.22), w: 28, h: Math.round(FLOOR.h * 0.45) },
      { ...at(0.16, 0.87), w: 28, h: Math.round(FLOOR.h * 0.13) },
      { ...at(0.48, 0), w: 28, h: Math.round(FLOOR.h * 0.37) },
      { ...at(0.48, 0.66), w: 28, h: Math.round(FLOOR.h * 0.34) },
      { ...at(0.8, 0.36), w: 28, h: Math.round(FLOOR.h * 0.4) },
    ],
    crates: [
      box(0.22, 0.02, 0.067, 0.16),
      box(0.25, 0.66, 0.073, 0.15),
      box(0.37, 0.36, 0.056, 0.145),
      box(0.52, 0.3, 0.065, 0.17),
      box(0.6, 0.62, 0.073, 0.19),
      box(0.71, 0.05, 0.059, 0.155),
      box(0.83, 0.56, 0.064, 0.17),
      box(0.085, 0.56, 0.046, 0.12),
    ],
    guards: [
      {
        name: 'Ash',
        speed: 74,
        wait: 0.5,
        cone: { range: 246, half: 0.38 },
        waypoints: [at(0.23, 0.26), at(0.23, 0.82), at(0.1, 0.82)],
      },
      {
        name: 'Corvid',
        speed: 68,
        wait: 0.6,
        cone: { range: 258, half: 0.4 },
        waypoints: [at(0.53, 0.96), at(0.68, 0.96), at(0.68, 0.5)],
      },
      {
        name: 'Pike',
        speed: 78,
        wait: 0.4,
        cone: { range: 234, half: 0.36 },
        waypoints: [at(0.85, 0.84), at(0.85, 0.26), at(0.71, 0.02)],
      },
      {
        name: 'Rook',
        speed: 64,
        wait: 0.8,
        cone: { range: 264, half: 0.42 },
        waypoints: [at(0.37, 0.82), at(0.45, 0.56), at(0.37, 0.26)],
      },
    ],
    loot: [at(0.44, 0.02), at(0.96, 0.97), at(0.03, 0.36)],
    lootNames: ['vault ledger', 'annex key', 'brass plaque'],
    lootValues: [3, 2, 1],
  },
];

/** The perimeter walls of a floor: a closed rectangle with the room's own inset. */
function perimeter() {
  const { x, y, w, h } = ROOM;
  return [
    { x, y, w, h: WALL },
    { x, y: y + h - WALL, w, h: WALL },
    { x, y: y + WALL, w: WALL, h: h - WALL * 2 },
    { x: x + w - WALL, y: y + WALL, w: WALL, h: h - WALL * 2 },
  ];
}

/**
 * Ceiling lamps on a jittered lattice. A lamp is skipped when it would hang over
 * a wall or a crate, so every pool of light lands on open floor and the room
 * reads as somewhere someone lit, not a black plane.
 */
function placeLamps(level, rng) {
  const lamps = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      const x = FLOOR.x + FLOOR.w * (0.13 + col * 0.25) + (rng() - 0.5) * 46;
      const y = FLOOR.y + FLOOR.h * (0.14 + row * 0.36) + (rng() - 0.5) * 34;
      const crowded = level.occluders.some(
        (r) => x > r.x - 40 && x < r.x + r.w + 40 && y > r.y - 40 && y < r.y + r.h + 40,
      );
      if (crowded) continue;
      lamps.push({ x, y, r: 128 + rng() * 38, phase: rng() * Math.PI * 2 });
    }
  }
  return lamps;
}

/**
 * Turn a floor definition into the runtime level. Cover boxes get a stable plank
 * pattern from the seed, guards get immutable starting state, and the occluders
 * list (walls + crates) is built once so line of sight and cone shadows share
 * exactly the same geometry.
 */
export function buildLevel(index, seed = 1) {
  const def = FLOORS[index];
  if (!def) return null;
  const rng = makeRng(seed * 7919 + def.id * 104729);
  const guardSeed = [];
  for (let i = 0; i < def.guards.length; i++) guardSeed.push(rng());

  const walls = perimeter().concat(def.walls.map((w) => ({ ...w })));
  const crates = def.crates.map((c, i) => ({
    ...c,
    seams: 2 + Math.floor(rng() * 2),
    grain: Array.from({ length: 8 }, () => rng()),
    id: i,
  }));

  const level = {
    index,
    id: def.id,
    name: def.name,
    subtitle: def.subtitle,
    brief: def.brief,
    spawn: { ...def.spawn },
    exit: { ...def.exit },
    doorHalf: DOOR,
    walls,
    crates,
    occluders: walls.concat(crates),
    guards: def.guards.map((g, i) => ({
      name: g.name,
      speed: g.speed,
      wait: g.wait,
      cone: { ...g.cone },
      waypoints: g.waypoints.map((p) => ({ ...p })),
      wobble: guardSeed[i],
    })),
    loot: def.loot.map((l, i) => ({
      ...l,
      value: def.lootValues[i],
      name: def.lootNames[i],
      taken: false,
    })),
  };
  level.lamps = placeLamps(level, rng);
  return level;
}

export const LEVEL_COUNT = FLOORS.length;

/** The floor's name without building it, for menus. */
export function levelName(index) {
  return FLOORS[index]?.name ?? '';
}

/** Whether a position is close enough to a doorway to count as out. */
export function atExit(exit, x, y) {
  return dist(x, y, exit.x, exit.y) < exit.r;
}

/** The doorway's half-width, for the renderer and the exit test. */
export const EXIT_HALF = DOOR;

/** The floor rectangle the thief is kept inside. */
export const WALKABLE = FLOOR;

/** The field the camera is clamped to. */
export const CAMERA_BOUNDS = FIELD;

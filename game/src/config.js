// Tuning and palette. Everything a designer would want to twist lives here: the
// logical field, the three stances, the detection rates, and the night-museum
// colours the render layer draws with. No maths, no drawing, no rules.

export const FIELD = { w: 1280, h: 720 };

/** Fixed simulation step, seconds. The loop always runs whole steps. */
export const STEP = 1 / 60;

/**
 * The field is letterboxed: a HUD band across the top, a HUD band across the
 * bottom, and the walled room between them. Nothing the HUD draws can ever cover
 * the wall band, which is what makes the room read as an enclosed box instead of
 * a grid running off the frame.
 */
export const FRAME = 14;
/** Wall thickness. */
export const WALL = 34;
/** Height of the top HUD band and the bottom HUD band. */
export const HUD_BAND = { top: 78, bottom: 96 };
/** The walled room's outer rectangle, between the two HUD bands. */
export const ROOM = {
  x: FRAME,
  y: HUD_BAND.top,
  w: FIELD.w - FRAME * 2,
  h: FIELD.h - HUD_BAND.top - HUD_BAND.bottom,
};
/** The floor a body may stand on, inside the walls. */
export const FLOOR = {
  x: ROOM.x + WALL,
  y: ROOM.y + WALL,
  w: ROOM.w - WALL * 2,
  h: ROOM.h - WALL * 2,
};

/**
 * The three stances. `exposure` scales how fast a guard's cone fills the alarm
 * meter; `noise` is the footstep ring a step emits (null is silence). The
 * numbers are per stance, not per level, so the risk is legible: crouch is
 * quiet and dim, sprint is loud and bright.
 */
export const STANCE = {
  walk: {
    key: 'walk',
    label: 'WALK',
    speed: 138,
    exposure: 1.0,
    noise: { every: 0.52, radius: 86, strength: 0.45, kind: 'step' },
  },
  crouch: {
    key: 'crouch',
    label: 'CROUCH',
    speed: 72,
    exposure: 0.42,
    noise: null,
  },
  sprint: {
    key: 'sprint',
    label: 'SPRINT',
    speed: 272,
    exposure: 1.3,
    noise: { every: 0.21, radius: 250, strength: 1.0, kind: 'stomp' },
  },
};

export const PLAYER_RADIUS = 11;
export const GUARD_RADIUS = 12;

/**
 * The detection model. A guard's cone fills the alarm at `fillBase` per second
 * at the centre, close up, standing; distance and the cone's soft angular edge
 * pull that down, crouching multiplies it by STANCE.crouch.exposure. Cover
 * (line of sight blocked) means no fill at all. Unseen, the meter drains at
 * `drain` per second. Crossing `suspicion` sends the guard to look, and only a
 * full meter is a catch.
 */
export const DETECT = {
  fillBase: 1.15,
  drain: 0.5,
  suspicion: 0.34,
  /** Fraction of a cone's half-angle spent fading out at its edge. */
  edgeFade: 0.45,
  /** How much of the fill rate distance can take away at maximum range. */
  distanceFade: 0.55,
  /** Seconds a guard keeps searching the last place it saw you. */
  investigateTime: 5.2,
  /** Seconds it stands at a waypoint before walking on. */
  turnRate: 3.4,
};

export const RULES = {
  /** Loot is picked up within this distance of the player. */
  lootRadius: 24,
  /** Alarm at or above this tints the screen and quickens the heartbeat. */
  danger: 0.72,
};

/** Night-museum palette: cold slate floor, warm guard light, one green exit. */
export const COLOR = {
  void: '#05080c',
  floor: '#0e1720',
  floorAlt: '#111c26',
  floorSeam: '#0a1218',
  floorSpeck: '#1b2a36',
  wallBody: '#1b2733',
  wallTop: '#2b3d4d',
  wallEdge: '#4a6274',
  wallShadow: '#060a0e',
  crateBody: '#4b3320',
  crateTop: '#7d5528',
  cratePlank: '#5d3f24',
  crateRim: '#a97b3f',
  crateEdge: '#1a1008',
  cone: '255, 184, 74',
  coneHot: '255, 226, 160',
  coneSuspect: '255, 139, 70',
  coneAlarm: '255, 77, 77',
  patrol: '#ffc169',
  suspect: '#ff8b46',
  alarm: '#ff4d4d',
  player: '#8ef0dd',
  playerDeep: '#12403f',
  playerRim: '#dbfff8',
  loot: '#ffd35c',
  lootCore: '#fff6cf',
  exit: '#57f5a6',
  exitDeep: '#0b3a28',
  text: '#e9f2f7',
  textDim: '#8ea3b4',
  textFaint: '#5a6f80',
  hudPanel: 'rgba(8, 14, 20, 0.78)',
  hudLine: 'rgba(120, 160, 190, 0.28)',
  danger: '#ff3b3b',
};

/** Display fonts. Everything is drawn on the canvas, so this is the only stack. */
export const FONT = {
  ui: '"DejaVu Sans", "Segoe UI", system-ui, -apple-system, sans-serif',
  mono: '"DejaVu Sans Mono", ui-monospace, "SF Mono", Menlo, monospace',
};

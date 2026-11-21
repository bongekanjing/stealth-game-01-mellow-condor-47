// Pure geometry: the only file with no opinion about the game. Vector and angle
// helpers, a seeded RNG so the same seed builds the same night, and the two
// intersection tests the rest of the game leans on: a segment against a box
// (line of sight) and a ray against a box (a cone's reach past cover).

export const TAU = Math.PI * 2;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (t) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};

export const dist2 = (ax, ay, bx, by) => {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
};
export const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));

/** Normalise an angle into [0, TAU). */
export const angleNorm = (a) => {
  let x = a % TAU;
  if (x < 0) x += TAU;
  return x;
};

/** The signed shortest turn from a to b, in (-PI, PI]. */
export const angleDelta = (a, b) => {
  let d = angleNorm(b) - angleNorm(a);
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
};

/** Step an angle toward another by at most `maxStep`, the short way round. */
export const angleToward = (from, to, maxStep) => {
  const d = angleDelta(from, to);
  if (Math.abs(d) <= maxStep) return angleNorm(to);
  return angleNorm(from + Math.sign(d) * maxStep);
};

/** Move an angle toward another with a critically damped-ish ease. */
export const angleEase = (from, to, rate, dt) => angleToward(from, to, Math.abs(angleDelta(from, to)) * clamp(rate * dt, 0, 1));

/** A point `d` along a unit direction. */
export const along = (x, y, a, d) => [x + Math.cos(a) * d, y + Math.sin(a) * d];

export const pointInRect = (px, py, r) => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;

export const rectCenter = (r) => [r.x + r.w / 2, r.y + r.h / 2];

export function rectCorners(r) {
  return [
    [r.x, r.y],
    [r.x + r.w, r.y],
    [r.x + r.w, r.y + r.h],
    [r.x, r.y + r.h],
  ];
}

/** Distance from a point to a segment. */
export function pointSegmentDistance(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const len2 = vx * vx + vy * vy;
  if (len2 === 0) return dist(px, py, ax, ay);
  const t = clamp(((px - ax) * vx + (py - ay) * vy) / len2, 0, 1);
  return dist(px, py, ax + vx * t, ay + vy * t);
}

/**
 * The first t in (0, 1] where the segment p0 + t*(p1 - p0) enters the box, or
 * Infinity when it misses. Used for line of sight: a guard sees the player when
 * no occluder box answers before the player's distance.
 */
export function segmentRectT(x0, y0, x1, y1, r) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  let tmin = 0;
  let tmax = 1;
  // x slab
  if (Math.abs(dx) < 1e-9) {
    if (x0 < r.x || x0 > r.x + r.w) return Infinity;
  } else {
    let t1 = (r.x - x0) / dx;
    let t2 = (r.x + r.w - x0) / dx;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }
  // y slab
  if (Math.abs(dy) < 1e-9) {
    if (y0 < r.y || y0 > r.y + r.h) return Infinity;
  } else {
    let t1 = (r.y - y0) / dy;
    let t2 = (r.y + r.h - y0) / dy;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }
  if (tmax < 0) return Infinity;
  return tmin > 0 ? tmin : (tmax > 0 ? 0 : Infinity);
}

/** Whether the segment between two points is clear of every box in `boxes`. */
export function segmentClear(x0, y0, x1, y1, boxes) {
  for (const r of boxes) {
    const t = segmentRectT(x0, y0, x1, y1, r);
    if (t !== Infinity && t < 0.999) return false;
  }
  return true;
}

/** How far a ray from (x, y) along `a` travels before hitting a box, capped at maxDist. */
export function rayReach(x, y, a, maxDist, boxes) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  let best = maxDist;
  for (const r of boxes) {
    // A ray is a segment from the origin to maxDist out; segmentRectT wants t in
    // (0, 1], so scale the result back into world units.
    const t = segmentRectT(x, y, x + c * maxDist, y + s * maxDist, r);
    if (t !== Infinity) {
      const d = t * maxDist;
      if (d < best) best = d;
    }
  }
  return best;
}

/**
 * Push a circle out of any box it overlaps, the shortest way. Returns the
 * corrected centre. Cover is solid, so neither the player nor a guard walks
 * through a crate.
 */
export function resolveCircleRect(cx, cy, radius, r) {
  const nx = clamp(cx, r.x, r.x + r.w);
  const ny = clamp(cy, r.y, r.y + r.h);
  const dx = cx - nx;
  const dy = cy - ny;
  const d2 = dx * dx + dy * dy;
  if (d2 > radius * radius) return [cx, cy];
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    return [nx + (dx / d) * radius, ny + (dy / d) * radius];
  }
  // Centre inside the box: leave by the nearest face.
  const left = cx - r.x;
  const right = r.x + r.w - cx;
  const top = cy - r.y;
  const bottom = r.y + r.h - cy;
  const m = Math.min(left, right, top, bottom);
  if (m === left) return [r.x - radius, cy];
  if (m === right) return [r.x + r.w + radius, cy];
  if (m === top) return [cx, r.y - radius];
  return [cx, r.y + r.h + radius];
}

/** Is a circle overlapping a box at all? */
export function circleHitsRect(cx, cy, radius, r) {
  const nx = clamp(cx, r.x, r.x + r.w);
  const ny = clamp(cy, r.y, r.y + r.h);
  return dist2(cx, cy, nx, ny) < radius * radius;
}

/**
 * The shadow a box throws away from a point light, as a polygon. The two
 * corners with the greatest angular spread from the light are found, then
 * pushed out along their own direction; the quad between them and their far
 * points is the umbra. `reach` bounds it (the cone's own radius).
 */
export function shadowPolygon(lx, ly, r, reach) {
  const corners = rectCorners(r);
  let bestA = null;
  let bestB = null;
  let bestSpread = -1;
  for (let i = 0; i < corners.length; i++) {
    for (let j = i + 1; j < corners.length; j++) {
      const a1 = Math.atan2(corners[i][1] - ly, corners[i][0] - lx);
      const a2 = Math.atan2(corners[j][1] - ly, corners[j][0] - lx);
      const spread = Math.abs(angleDelta(a1, a2));
      if (spread > bestSpread) {
        bestSpread = spread;
        bestA = corners[i];
        bestB = corners[j];
      }
    }
  }
  if (bestA === null) return null;
  const push = (p) => {
    const a = Math.atan2(p[1] - ly, p[0] - lx);
    return [p[0] + Math.cos(a) * reach, p[1] + Math.sin(a) * reach];
  };
  return [bestA, push(bestA), push(bestB), bestB];
}

/** A mulberry32 PRNG: deterministic from an integer seed, so ?seed=1 always builds this night. */
export function makeRng(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

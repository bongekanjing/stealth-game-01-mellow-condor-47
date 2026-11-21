// Hand-in program for "Nightwatch at the Lamp Room" (Node 22+, standard library only).
//
// The game is this directory's game/: static files the browser loads offline —
// game/index.html plus the thief, guard, detection, noise, level and render modules
// under game/src/. Three floors of a museum, a thief crossing the lamp hall to the
// service door, guards whose torch wedges stop at the crates. Nothing here fetches
// anything at runtime.
//
// This program stages the entry for the judge: it copies game/ and screenshots/ beside
// this file into $MAKEFUN_OUTPUT_DIR (default /output), then writes dossier.json — the
// summary a judge reads instead of opening the room — through buildDossier from the
// vendored make.fun library, and prints what it staged.
//
// The four screenshots are the floor 1 scenes the shot autopilot runs from a fresh
// level: 1-start (title over the lamp hall), 2-patrol (both patrols and the service
// door), 3-cover (a crate cutting a torch short), 4-nearmiss (the cone edge at 90%).
// They are JPEG 95 rather than PNG on purpose: a raw 1280x720 PNG of this floor runs
// 420-530 KB, and the caps below refuse a screenshot past 256 KiB.
//
// Locally:  rm -rf out && mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// To play:  node serve.ts  (then open http://localhost:8080)

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DossierError, buildDossier, readGameTree } from './vendor/makefun-game.ts';

// The repo ships no @types/node, so name the one global this program touches rather
// than pulling a dependency in for a single read of MAKEFUN_OUTPUT_DIR.
declare const process: {
  env: Record<string, string | undefined>;
  exit(code?: number): never;
};

const entry = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's caps, unchanged from gate.json. text_max_bytes is the only one that
// shapes bytes; the rest refuse an entry the scorer itself would refuse, so failing
// here is better than handing in something rejected later: at most 4 screenshots and
// none past 256 KiB, under 993 entries and 48 MiB in game/, and every path under
// game/ short enough to list beside /output's own 1000-entry cap.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
} as const;

/** Copy one staged folder from beside this file into the output directory. */
function stage(name: 'game' | 'screenshots'): void {
  const from = join(entry, name);
  if (!existsSync(from)) return;
  mkdirSync(join(out, name), { recursive: true });
  cpSync(from, join(out, name), { recursive: true });
}

mkdirSync(out, { recursive: true });
stage('game');
stage('screenshots');

try {
  const dossier = buildDossier(out, CAPS);
  const path = join(out, 'dossier.json');
  writeFileSync(path, dossier);

  // Read the staged game/ back through the same walk buildDossier used, so the summary
  // counts the floor the judge will actually see and cannot drift from the dossier.
  const floor = readGameTree(join(out, 'game'), CAPS);
  const shots = countShots();
  console.log(
    `Nightwatch at the Lamp Room: staged ${floor.files.length} game files ` +
      `(${floor.directories.length} dirs, ${(floor.totalBytes / 1024).toFixed(1)} KiB) ` +
      `and ${shots} screenshots; dossier.json ${dossier.length} bytes at ${path}`,
  );
} catch (err) {
  // DossierError names the cap it refused on, which is the one line worth surfacing:
  // a screenshot past 256 KiB or a fifth image is a hand-in bug, not a crash.
  if (err instanceof DossierError) {
    console.error(`Nightwatch at the Lamp Room: cannot hand in — ${err.message}`);
    if (err.limit) console.error(`  refused by: ${err.limit}`);
    process.exit(1);
  }
  throw err;
}

/** How many images the staged screenshots/ folder holds: the cover plus the scenes. */
function countShots(): number {
  const dir = join(out, 'screenshots');
  if (!existsSync(dir)) return 0;
  return readGameTree(dir, {}).files.filter((f) => /\.(png|jpe?g)$/i.test(f.path)).length;
}

// The shell. Boots the canvas, owns the game state, reads the keyboard into
// intents, runs the fixed-step loop, switches the four screens (title, play,
// caught, escaped), and synthesises every sound the floor makes: footsteps, the
// alarm's rising pulse, the loot ping and the escape chime. The rules live in
// player/guards/detection/noise; this file only wires them together.

import { FIELD, STEP, STANCE } from './config.js';
import { alarmBand, stepDetection } from './detection.js';
import { clamp, dist } from './geometry.js';
import { createGuard, updateGuard } from './guards.js';
import { buildLevel, LEVEL_COUNT, atExit } from './level.js';
import { createNoiseField, emitRing, updateNoise } from './noise.js';
import { createPlayer, readIntent, updatePlayer } from './player.js';
import { createRenderer, draw, resizeRenderer } from './render.js';
import { isShot, runShot } from './shots.js';

// ---------------------------------------------------------------- audio

/**
 * Every sound is generated here with WebAudio oscillators and noise buffers:
 * no files, no network. It is deliberately tolerant: a browser that refuses to
 * build a context (or a headless capture) makes every call a no-op.
 */
function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;
  let failed = false;
  let alarmTimer = 0;

  const ensure = () => {
    if (failed) return null;
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume?.();
      return ctx;
    }
    try {
      const Ctor = window.AudioContext ?? window.webkitAudioContext;
      if (!Ctor) {
        failed = true;
        return null;
      }
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = 0.42;
      master.connect(ctx.destination);
      // One shared 1-second buffer of white noise, used for every footstep.
      noiseBuffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.6), ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      return ctx;
    } catch {
      failed = true;
      return null;
    }
  };

  /** A short burst of filtered noise: the body of a footfall. */
  const thump = (kind) => {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = kind === 'stomp' ? 900 : 520;
    filter.Q.value = 0.9;
    const gain = c.createGain();
    const peak = kind === 'stomp' ? 0.5 : 0.2;
    const dur = kind === 'stomp' ? 0.16 : 0.09;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(gain).connect(master);
    src.start(t);
    src.stop(t + dur + 0.02);

    // A low sine under it so a sprint step has weight, not just hiss.
    if (kind === 'stomp') {
      const osc = c.createOscillator();
      const og = c.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, t);
      osc.frequency.exponentialRampToValueAtTime(58, t + 0.16);
      og.gain.setValueAtTime(0.0001, t);
      og.gain.exponentialRampToValueAtTime(0.42, t + 0.01);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      osc.connect(og).connect(master);
      osc.start(t);
      osc.stop(t + 0.22);
    }
  };

  const tone = (freq, start, dur, peak, type = 'sine') => {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime + start;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  };

  return {
    resume() {
      ensure();
    },
    step(kind) {
      thump(kind);
    },
    /** The alarm: a beep whose rate and pitch climb with the meter. */
    alarmTick(level, dt) {
      if (level <= 0.02) {
        alarmTimer = 0;
        return;
      }
      alarmTimer -= dt;
      if (alarmTimer > 0) return;
      const interval = 0.95 - 0.72 * clamp(level, 0, 1);
      alarmTimer = interval;
      const c = ensure();
      if (!c) return;
      const t = c.currentTime;
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(420 + 320 * level, t);
      osc.frequency.exponentialRampToValueAtTime(300 + 220 * level, t + 0.09);
      const peak = 0.06 + 0.16 * level;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
      osc.connect(g).connect(master);
      osc.start(t);
      osc.stop(t + 0.13);
    },
    loot() {
      tone(880, 0, 0.12, 0.16, 'triangle');
      tone(1320, 0.07, 0.2, 0.13, 'sine');
    },
    escape() {
      // A rising major arpeggio, one bell per note.
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((f, i) => {
        tone(f, i * 0.11, 0.55, 0.2, 'sine');
        tone(f * 2, i * 0.11, 0.3, 0.05, 'triangle');
      });
    },
    caught() {
      tone(196, 0, 0.5, 0.24, 'sawtooth');
      tone(146.8, 0.14, 0.7, 0.2, 'sawtooth');
      tone(98, 0.3, 0.9, 0.16, 'sine');
    },
    blip() {
      tone(660, 0, 0.08, 0.1, 'square');
    },
  };
}

// ---------------------------------------------------------------- keys

const KEY_ACTIONS = {
  KeyW: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  ArrowDown: 'down',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  ShiftLeft: 'sprint',
  ShiftRight: 'sprint',
  ControlLeft: 'crouch',
  ControlRight: 'crouch',
};

// ---------------------------------------------------------------- game

export function createGame(canvas, options = {}) {
  const seed = options.seed ?? 1;
  const audio = createAudio();
  const renderer = createRenderer(canvas);
  window.addEventListener('resize', () => resizeRenderer(renderer, Math.min(window.devicePixelRatio || 1, 2)));
  resizeRenderer(renderer, Math.min(window.devicePixelRatio || 1, 2));

  const state = {
    mode: 'title',
    time: 0,
    alarm: 0,
    peakAlarm: 0,
    level: null,
    player: null,
    noise: createNoiseField(),
    camera: { x: FIELD.w / 2, y: FIELD.h / 2, zoom: 1 },
    cameraLock: false,
    lootCount: 0,
    lootTotal: 0,
    nightLoot: 0,
    toast: null,
    caughtReason: '',
    levelComplete: false,
    hasNext: false,
    levelIndex: 0,
    visible: false,
    exposureRate: 0,
    watchedBy: -1,
    investigators: new Set(),
    exposedAt: -99,
  };

  const keys = new Set();
  let pending = null;

  const toast = (text, color) => {
    state.toast = { text, color, life: 2.1 };
  };

  /** Load a floor fresh: walls, crates, guards, loot, and put the thief at the spawn. */
  function loadLevel(index) {
    state.levelIndex = clamp(index, 0, LEVEL_COUNT - 1);
    const level = buildLevel(state.levelIndex, seed);
    level.guards = level.guards.map((def, i) => createGuard(def, level, i));
    state.level = level;
    state.player = createPlayer(level);
    state.noise = createNoiseField();
    state.alarm = 0;
    state.peakAlarm = 0;
    state.investigators = new Set();
    state.lootCount = 0;
    state.lootTotal = level.loot.length;
    state.levelComplete = false;
    state.hasNext = state.levelIndex + 1 < LEVEL_COUNT;
    state.caughtReason = '';
    state.toast = null;
    state.cameraLock = false;
    if (state.mode === 'title') {
      state.camera = { x: FIELD.w / 2, y: FIELD.h / 2, zoom: 1 };
    } else {
      state.camera = { x: state.player.x, y: state.player.y, zoom: 1.1 };
    }
  }

  function startNight() {
    loadLevel(0);
    state.mode = 'play';
    audio.resume();
  }

  /** One fixed step of the real rules. `intentOverride` lets the shot autopilot drive. */
  function step(dt, intentOverride = null) {
    state.time += dt;
    if (state.toast) {
      state.toast.life -= dt;
      if (state.toast.life <= 0) state.toast = null;
    }

    // On the title and after a verdict the floor still breathes, so the scene
    // behind the card is alive; the thief simply stands still.
    const frozen = state.mode === 'caught' || state.mode === 'escaped';
    const intent = frozen || state.mode === 'title'
      ? { dx: 0, dy: 0, moving: false, stance: 'walk' }
      : (intentOverride ?? readIntent(keys));

    const player = state.player;
    const level = state.level;

    if (!frozen) {
      const events = [];
      updatePlayer(player, intent, level, dt, events);
      for (const e of events) {
        emitRing(state.noise, e);
        if (state.mode === 'play') audio.step(e.kind);
      }
      updateNoise(state.noise, level, dt, (heard) => {
        if (state.mode === 'play' && heard.guard.sees === false) audio.blip();
      });

      const verdict = stepDetection(state, level, player, dt);
      state.peakAlarm = Math.max(state.peakAlarm, state.alarm);
      for (const g of level.guards) updateGuard(g, level, dt);

      if (state.mode === 'play') {
        // Loot is picked up by walking over it; the value is banked, not required.
        for (const item of level.loot) {
          if (!item.taken && dist(player.x, player.y, item.x, item.y) < 26) {
            item.taken = true;
            state.lootCount++;
            state.nightLoot += item.value;
            audio.loot();
            toast(`${item.name} taken  ·  +${item.value}`, '#ffd35c');
          }
        }
        if (verdict.caught) {
          state.mode = 'caught';
          state.caughtReason = `A guard held the light on you for a full second on ${level.name}.`;
          audio.caught();
        } else if (atExit(level.exit, player.x, player.y)) {
          state.mode = 'escaped';
          state.levelComplete = true;
          audio.escape();
        }
        audio.alarmTick(state.alarm, dt);
      }
    }

    // Camera: a soft follow in play, a fixed wide shot everywhere else.
    if (!state.cameraLock) {
      const want = state.mode === 'play' ? { x: player.x, y: player.y, zoom: 1.1 } : { x: FIELD.w / 2, y: FIELD.h / 2, zoom: 1 };
      const k = state.mode === 'play' ? clamp(dt * 3.4, 0, 1) : clamp(dt * 2, 0, 1);
      state.camera.x += (want.x - state.camera.x) * k;
      state.camera.y += (want.y - state.camera.y) * k;
      state.camera.zoom += (want.zoom - state.camera.zoom) * k;
      // Keep the field filling the frame.
      const halfW = FIELD.w / (2 * state.camera.zoom);
      const halfH = FIELD.h / (2 * state.camera.zoom);
      state.camera.x = clamp(state.camera.x, halfW, FIELD.w - halfW);
      state.camera.y = clamp(state.camera.y, halfH, FIELD.h - halfH);
    }
  }

  function drawFrame() {
    draw(renderer, state);
  }

  // ------------------------------------------------------------ input

  window.addEventListener('keydown', (e) => {
    const action = KEY_ACTIONS[e.code];
    if (action) {
      keys.add(action);
      e.preventDefault();
    }
    if (e.code === 'Space') {
      e.preventDefault();
      audio.resume();
      if (state.mode === 'title') startNight();
      else if (state.mode === 'escaped' && state.hasNext) {
        loadLevel(state.levelIndex + 1);
        state.mode = 'play';
      } else if (state.mode === 'escaped' && !state.hasNext) {
        loadLevel(0);
        state.mode = 'title';
      }
    }
    if (e.code === 'KeyR' && state.mode !== 'title') {
      const i = state.levelIndex;
      loadLevel(i);
      state.mode = 'play';
    }
    if (e.code === 'Escape') {
      loadLevel(0);
      state.mode = 'title';
    }
    if (e.code === 'Enter' && state.mode === 'title') {
      audio.resume();
      startNight();
    }
  });

  window.addEventListener('keyup', (e) => {
    const action = KEY_ACTIONS[e.code];
    if (action) keys.delete(action);
  });

  window.addEventListener('blur', () => keys.clear());

  // ------------------------------------------------------------ boot

  loadLevel(options.levelIndex ?? 0);

  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  if (isShot(shot)) {
    state.mode = 'play';
    // A shot runs the real rules forward itself; the RAF loop must not race it.
    runShot(shot, { state, step, draw: drawFrame, renderer, keys, loadLevel });
    state.mode = 'play';
  } else {
    let last = performance.now();
    let acc = 0;
    const frame = (now) => {
      const dt = Math.min((now - last) / 1000, 0.25);
      last = now;
      acc += dt;
      let guardCount = 0;
      while (acc >= STEP && guardCount < 8) {
        step(STEP);
        acc -= STEP;
        guardCount++;
      }
      if (guardCount > 0 || true) drawFrame();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  return {
    state,
    step,
    draw: drawFrame,
    loadLevel,
    startNight,
    renderer,
    audio,
    /** Test/automation hook: the current stance's tuning. */
    stance: () => STANCE[state.player.stance],
    alarmBand: () => alarmBand(state.alarm),
  };
}

/** Boot from index.html. */
export function boot() {
  const canvas = document.getElementById('field');
  createGame(canvas, { seed: Number(new URLSearchParams(window.location.search).get('seed') ?? 1) || 1 });
}

if (typeof document !== 'undefined' && !window.__nightwatchBooted) {
  window.__nightwatchBooted = true;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}

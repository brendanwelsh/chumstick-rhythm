// chart.js — beatmap constants, direction math, load/parse/normalize.
//
// Screen space is y-down. Gamepad stick axes are already y-down (pushing the stick up gives a
// negative Y), so a stick vector (x, y) maps straight onto a screen direction. That means the
// SAME vector table works for both "which way is this note" (render) and "which way did the
// player flick" (input).

/** The 8 flick directions, in clockwise order starting from "right" (angle 0). */
export const DIRS = [
  'right', 'downright', 'down', 'downleft', 'left', 'upleft', 'up', 'upright',
];

/** Unit vectors in screen space (y-down). */
const S = Math.SQRT1_2; // 0.7071…
export const DIR_VECTORS = {
  right:     { x:  1, y:  0 },
  downright: { x:  S, y:  S },
  down:      { x:  0, y:  1 },
  downleft:  { x: -S, y:  S },
  left:      { x: -1, y:  0 },
  upleft:    { x: -S, y: -S },
  up:        { x:  0, y: -1 },
  upright:   { x:  S, y: -S },
};

/** Modifier buttons a note can require, mapped to a short on-screen glyph. */
export const MODS = {
  L1: 'L1', R1: 'R1', L2: 'L2', R2: 'R2',
  cross: '✕', circle: '◯', square: '▢', triangle: '△',
};

/**
 * Convert a stick vector to one of the 8 direction names.
 * index = round(atan2(y, x) / (π/4)) gives 0=right, 2=down, 4=left, 6=up (y-down).
 */
export function vectorToDir(x, y) {
  let idx = Math.round(Math.atan2(y, x) / (Math.PI / 4));
  idx = ((idx % 8) + 8) % 8;
  return DIRS[idx];
}

export function dirVector(dir) {
  return DIR_VECTORS[dir] || { x: 0, y: 0 };
}

/** Unit vector for a continuous angle (radians, screen space y-down). */
export function angleVec(a) { return { x: Math.cos(a), y: Math.sin(a) }; }

/** Human label for a direction (used in debug / fallback rendering). */
export function dirArrowAngle(dir) {
  const v = dirVector(dir);
  return Math.atan2(v.y, v.x);
}

/**
 * Normalize a raw beatmap object into the runtime shape the game plays.
 * Adds defaults, sorts notes by time, applies meta.offset, and attaches per-note state.
 */
export function normalizeChart(raw) {
  const meta = raw.meta || {};
  const offset = Number(meta.offset) || 0;
  const approachTime = Number(meta.approachTime) || 1.5;

  const notes = (raw.notes || [])
    .map((n, i) => {
      const dirName = String(n.dir || 'up').toLowerCase();
      const ring = String(n.ring || 'L').toUpperCase() === 'R' ? 'R' : 'L';
      const mod = n.mod && MODS[n.mod] ? n.mod : null;
      // A note's target is a continuous ANGLE. Use a numeric `angle` (degrees) if given,
      // else derive it from the named `dir`. dir is kept (nearest of 8) for any legacy use.
      const baseDir = DIR_VECTORS[dirName] ? dirName : 'up';
      const angle = (n.angle != null && isFinite(n.angle))
        ? (Number(n.angle) * Math.PI) / 180
        : Math.atan2(DIR_VECTORS[baseDir].y, DIR_VECTORS[baseDir].x);
      return {
        id: i,
        time: Number(n.time) + offset,
        ring,
        angle,
        dir: vectorToDir(Math.cos(angle), Math.sin(angle)),
        mod,
        hold: Math.max(0, Number(n.hold) || 0), // seconds to keep the stick held; 0 = tap flick
        // runtime state:
        judged: false,
        judgement: null,  // 'perfect' | 'good' | 'miss'
        hitError: 0,       // seconds (signed) between flick and target
        holdActive: false, // head hit, currently sustaining
        headJudgement: null,
      };
    })
    .sort((a, b) => a.time - b.time);

  // Re-id after sort so ids are stable index order.
  notes.forEach((n, i) => { n.id = i; });

  return {
    meta: {
      title: meta.title || 'Untitled',
      artist: meta.artist || 'Unknown',
      audio: meta.audio || null,
      bpm: Number(meta.bpm) || 120,
      offset,
      approachTime,
      difficulty: meta.difficulty || 'Normal',
    },
    notes,
    // The chart "ends" a bit after the final note (incl. its hold) so results wait for it.
    duration: notes.length ? Math.max(...notes.map((n) => n.time + n.hold)) + 2.5 : 5,
  };
}

/** Fetch + parse a beatmap JSON file by URL (used for the built-in charts). */
export async function loadChartFromUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load chart: ${url} (${res.status})`);
  return normalizeChart(await res.json());
}

/** Parse a beatmap JSON from a user-selected File object. */
export async function loadChartFromFile(file) {
  const text = await file.text();
  return normalizeChart(JSON.parse(text));
}

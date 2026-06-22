// scoring.js — Scorer: judgement windows, combo, score, accuracy, grade.
//
// All times in seconds. A flick is matched to the nearest unjudged note on the same ring
// within the Good window. Right direction + right modifier => timing judgement; wrong
// direction/modifier inside the window => Miss (and the note is consumed so it can't be
// re-triggered).

export const WINDOWS = { perfect: 0.045, good: 0.090 }; // ± seconds
const SCORE = { perfect: 300, good: 100, miss: 0 };
const HOLD_BONUS = 150;            // for completing a hold
// Flicks/holds are matched by ANGLE within a forgiving range (an arc), not an exact direction.
export const HIT_ARC = 0.62;       // ±~36° counts as on-target for a flick
const HOLD_ARC = 0.9;              // ±~52° to keep a hold alive (more lenient)

/** Shortest absolute angle between two headings (radians, 0..π). */
function angleGap(a, b) { let d = Math.abs(a - b) % (Math.PI * 2); return d > Math.PI ? Math.PI * 2 - d : d; }

export class Scorer {
  constructor() {
    this.reset();
  }

  reset() {
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.counts = { perfect: 0, good: 0, miss: 0 };
    this.totalJudged = 0;
    // Feedback events for the renderer to consume (popups / flashes).
    this.events = [];
  }

  /** Weighted accuracy 0..1 (Perfect = full, Good = third, Miss = 0). */
  get accuracy() {
    if (this.totalJudged === 0) return 1;
    const got = this.counts.perfect * 1 + this.counts.good * (1 / 3);
    return got / this.totalJudged;
  }

  get grade() {
    const a = this.accuracy;
    if (this.counts.miss === 0 && a >= 0.99) return 'S';
    if (a >= 0.90) return 'A';
    if (a >= 0.80) return 'B';
    if (a >= 0.70) return 'C';
    return 'D';
  }

  _comboMultiplier() {
    // 1x up to 9 combo, +0.5 each 10, capped at 4x. Classic escalating reward.
    return Math.min(4, 1 + Math.floor(this.combo / 10) * 0.5);
  }

  // Update counts/combo/score for a judged note (no feedback event emitted).
  _score(judgement, note) {
    note.judged = true;
    note.judgement = judgement;
    this.counts[judgement]++;
    this.totalJudged++;
    if (judgement === 'miss') {
      this.combo = 0;
    } else {
      this.combo++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.score += Math.round(SCORE[judgement] * this._comboMultiplier());
    }
  }

  _apply(judgement, note, songTime) {
    this._score(judgement, note);
    this.events.push({ judgement, ring: note.ring, dir: note.dir, angle: note.angle, t: songTime });
  }

  /**
   * Resolve a flick against the active notes. Returns the judgement string or null if the
   * flick hit nothing. A flick counts if it lands within the note's ANGLE ARC (not an exact
   * direction) on the same ring inside the timing window.
   */
  judgeFlick(flick, notes, songTime) {
    let best = null, bestErr = Infinity;
    for (const n of notes) {
      if (n.judged || n.holdActive || n.ring !== flick.ring) continue;
      const err = Math.abs(flick.t - n.time);
      if (err <= WINDOWS.good && angleGap(flick.angle, n.angle) <= HIT_ARC && err < bestErr) { best = n; bestErr = err; }
    }
    if (!best) return null;

    best.hitError = flick.t - best.time;
    const modOk = best.mod ? flick.mods.includes(best.mod) : true;
    if (!modOk) { this._apply('miss', best, songTime); return 'miss'; }

    const judgement = bestErr <= WINDOWS.perfect ? 'perfect' : 'good';
    if (best.hold > 0) {
      best.holdActive = true;
      best.headJudgement = judgement;
      best.holdEnd = best.time + best.hold;
      this.events.push({ judgement, ring: best.ring, dir: best.dir, angle: best.angle, t: songTime });
      return judgement;
    }
    this._apply(judgement, best, songTime);
    return judgement;
  }

  /** Advance active hold notes: complete at the end, break if the stick leaves the arc. */
  updateHolds(notes, input, songTime) {
    for (const n of notes) {
      if (!n.holdActive) continue;
      const held = input.heldDir(n.ring);
      const keeping = held && angleGap(held.angle, n.angle) <= HOLD_ARC;
      if (songTime >= n.holdEnd) {
        n.holdActive = false;
        this._score(n.headJudgement, n);
        this.score += HOLD_BONUS;
        this.events.push({ judgement: 'hold', ring: n.ring, dir: n.dir, angle: n.angle, t: songTime });
      } else if (!keeping) {
        n.holdActive = false;
        const frac = (songTime - n.time) / n.hold;
        this._apply(frac > 0.6 ? 'good' : 'miss', n, songTime);
      }
    }
  }

  /** Auto-miss any note whose Good window has fully passed (skip sustaining holds). */
  checkMisses(notes, songTime) {
    for (const n of notes) {
      if (!n.judged && !n.holdActive && songTime - n.time > WINDOWS.good) {
        this._apply('miss', n, songTime);
      }
    }
  }

  takeEvents() { const e = this.events; this.events = []; return e; }
}

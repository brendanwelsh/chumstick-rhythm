// scoring.js — Scorer: judgement windows, combo, score, accuracy, grade.
//
// All times in seconds. A flick is matched to the nearest unjudged note on the same ring
// within the Good window. Right direction + right modifier => timing judgement; wrong
// direction/modifier inside the window => Miss (and the note is consumed so it can't be
// re-triggered).

export const WINDOWS = { perfect: 0.045, good: 0.090 }; // ± seconds
const SCORE = { perfect: 300, good: 100, miss: 0 };

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

  _apply(judgement, note, songTime) {
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
    this.events.push({ judgement, ring: note.ring, dir: note.dir, t: songTime });
  }

  /**
   * Resolve a flick against the active notes. Returns the judgement string or null if the
   * flick hit nothing (a whiff in empty space — not penalised).
   */
  judgeFlick(flick, notes, songTime) {
    let best = null, bestErr = Infinity;
    for (const n of notes) {
      if (n.judged || n.ring !== flick.ring) continue;
      const err = Math.abs(flick.t - n.time);
      if (err <= WINDOWS.good && err < bestErr) { best = n; bestErr = err; }
    }
    if (!best) return null;

    best.hitError = flick.t - best.time;
    const dirOk = best.dir === flick.dir;
    const modOk = best.mod ? flick.mods.includes(best.mod) : true;

    let judgement;
    if (!dirOk || !modOk) {
      judgement = 'miss';
    } else {
      judgement = bestErr <= WINDOWS.perfect ? 'perfect' : 'good';
    }
    this._apply(judgement, best, songTime);
    return judgement;
  }

  /** Auto-miss any note whose Good window has fully passed. */
  checkMisses(notes, songTime) {
    for (const n of notes) {
      if (!n.judged && songTime - n.time > WINDOWS.good) {
        this._apply('miss', n, songTime);
      }
    }
  }

  takeEvents() { const e = this.events; this.events = []; return e; }
}

// render.js — Renderer: all canvas drawing for STEREO FLIX, themed as a boombox.
//   left ring  = left speaker  (cyan)
//   right ring = right speaker (magenta)
//   center     = cassette deck (combo / score / accuracy + spinning reels)
//   flanks     = VU meters that bounce on hits
//
// Pure-ish drawing: drawGame(state) reads the live game state each frame. Transient hit
// effects live here and are fed in via addEffect().

import { dirVector, MODS } from './chart.js';

const COL = {
  bg0: '#0b0a14', bg1: '#161122',
  L: '#19e6ff', R: '#ff3df0',
  body: '#1b1b2a', bodyHi: '#33334d', chrome: '#5a5a7a',
  deck: '#0e0e18', deckHi: '#23233a',
  perfect: '#ffe24a', good: '#5effa6', miss: '#ff476b',
  text: '#e9e9ff', dim: '#7a7a99',
};

const ringColor = (ring) => (ring === 'L' ? COL.L : COL.R);

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.effects = [];   // {kind, ring, dir, judgement, t0, dur}
    this.flickFx = [];   // {ring, dir, mag, t0} — a streak drawn for EVERY flick (hit or not)
    this.pulse = 0;      // 0..1 boombox "thump", bumped on hits, decays each frame
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = w; this.h = h;
    this._layout();
  }

  _layout() {
    const { w, h } = this;
    const r = Math.min(w * 0.21, h * 0.30);     // speaker radius
    const cy = h * 0.56;
    this.speakers = {
      L: { x: w * 0.27, y: cy, R: r, ring: r * 0.62 },
      R: { x: w * 0.73, y: cy, R: r, ring: r * 0.62 },
    };
    this.deck = { x: w * 0.5, y: cy, w: w * 0.30, h: r * 1.15 };
  }

  // --- effects ------------------------------------------------------------
  addEffect({ judgement, ring, dir, t }) {
    this.effects.push({ ring, dir, judgement, t0: t, dur: judgement === 'miss' ? 0.5 : 0.6 });
    if (judgement !== 'miss') this.pulse = 1;
  }

  /** Visual for the gesture itself — fires on every flick, whether or not it hit a note. */
  addFlick({ ring, dir, mag = 1, t }) {
    this.flickFx.push({ ring, dir, mag, t0: t, dur: 0.28 });
  }

  // --- main draw ----------------------------------------------------------
  drawGame(state) {
    const { ctx } = this;
    const { chart, songTime, scorer, input } = state;
    this._background(songTime);
    this._boomboxBody();

    for (const ring of ['L', 'R']) {
      const sp = this.speakers[ring];
      this._speaker(sp, ring, songTime);
      this._notesFor(ring, chart, songTime);
      this._stickDot(sp, ring, input);
      this._vuMeter(ring, songTime);
    }

    this._flicks(songTime);
    this._effects(songTime);
    this._deck(scorer, songTime);
    this._countIn(songTime);
    if (state.demo) this._demoBadge();

    this.pulse *= 0.90; // decay the thump
  }

  _flicks(songTime) {
    const { ctx } = this;
    this.flickFx = this.flickFx.filter((f) => songTime - f.t0 < f.dur);
    for (const f of this.flickFx) {
      const sp = this.speakers[f.ring];
      const v = dirVector(f.dir);
      const age = (songTime - f.t0) / f.dur; // 0..1
      const c = ringColor(f.ring);
      const reach = sp.ring * (1.05 + age * 0.5) * Math.min(1, f.mag);
      const x = sp.x + v.x * reach, y = sp.y + v.y * reach;
      const a = Math.atan2(v.y, v.x);
      ctx.save();
      ctx.globalAlpha = 1 - age;
      ctx.shadowColor = c; ctx.shadowBlur = 18;
      // streak from center outward in the flicked direction
      ctx.strokeStyle = c; ctx.lineCap = 'round';
      ctx.lineWidth = sp.R * 0.10 * (1 - age * 0.5);
      ctx.beginPath(); ctx.moveTo(sp.x, sp.y); ctx.lineTo(x, y); ctx.stroke();
      // arrowhead
      ctx.translate(x, y); ctx.rotate(a);
      const h = sp.R * 0.16;
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.moveTo(h, 0); ctx.lineTo(-h * 0.5, -h * 0.7); ctx.lineTo(-h * 0.5, h * 0.7);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }

  _demoBadge() {
    const { ctx, w, h } = this;
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = COL.text;
    ctx.font = `800 ${Math.max(13, h * 0.022)}px system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('▶ DEMO · auto-play — press Back / Esc to exit', w * 0.5, h * 0.035);
    ctx.restore();
  }

  _background(t) {
    const { ctx, w, h } = this;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, COL.bg0); g.addColorStop(1, COL.bg1);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

    // soft speaker glow that breathes with the pulse
    for (const ring of ['L', 'R']) {
      const sp = this.speakers[ring];
      const rad = sp.R * (1.4 + this.pulse * 0.5);
      const rg = ctx.createRadialGradient(sp.x, sp.y, sp.R * 0.4, sp.x, sp.y, rad);
      rg.addColorStop(0, this._alpha(ringColor(ring), 0.18 + this.pulse * 0.10));
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg; ctx.fillRect(0, 0, w, h);
    }
  }

  _boomboxBody() {
    const { ctx, w, h } = this;
    const x = w * 0.07, y = h * 0.22, bw = w * 0.86, bh = h * 0.62;
    // handle
    ctx.lineWidth = Math.max(6, w * 0.012);
    ctx.strokeStyle = COL.chrome;
    ctx.beginPath();
    ctx.arc(w * 0.5, y, bw * 0.16, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
    // body
    this._roundRect(x, y, bw, bh, 22);
    const g = ctx.createLinearGradient(0, y, 0, y + bh);
    g.addColorStop(0, COL.bodyHi); g.addColorStop(0.08, COL.body); g.addColorStop(1, '#101019');
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = this._alpha(COL.chrome, 0.6); ctx.stroke();
  }

  _speaker(sp, ring, t) {
    const { ctx } = this;
    const c = ringColor(ring);
    // speaker cone: concentric grooves
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, sp.R * (1 - i * 0.12), 0, Math.PI * 2);
      ctx.strokeStyle = this._alpha(COL.chrome, 0.25);
      ctx.lineWidth = 2; ctx.stroke();
    }
    // outer chrome rim
    ctx.beginPath(); ctx.arc(sp.x, sp.y, sp.R, 0, Math.PI * 2);
    ctx.lineWidth = 6; ctx.strokeStyle = this._alpha(c, 0.5); ctx.stroke();

    // the hit ring (where notes land) — bright, glows on pulse
    ctx.save();
    ctx.shadowColor = c; ctx.shadowBlur = 14 + this.pulse * 20;
    ctx.beginPath(); ctx.arc(sp.x, sp.y, sp.ring, 0, Math.PI * 2);
    ctx.lineWidth = 4; ctx.strokeStyle = c; ctx.stroke();
    ctx.restore();

    // 8 faint direction ticks on the hit ring
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      const x1 = sp.x + Math.cos(a) * sp.ring * 0.9, y1 = sp.y + Math.sin(a) * sp.ring * 0.9;
      const x2 = sp.x + Math.cos(a) * sp.ring * 1.08, y2 = sp.y + Math.sin(a) * sp.ring * 1.08;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
      ctx.strokeStyle = this._alpha(c, 0.3); ctx.lineWidth = 2; ctx.stroke();
    }

    // L / R label in the cone center
    ctx.fillStyle = this._alpha(c, 0.85);
    ctx.font = `900 ${sp.R * 0.42}px system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(ring, sp.x, sp.y);
  }

  _notesFor(ring, chart, songTime) {
    const sp = this.speakers[ring];
    const approachLen = sp.R * 1.25;
    for (const n of chart.notes) {
      if (n.judged) continue;
      const dt = n.time - songTime;
      if (dt > chart.meta.approachTime || dt < -0.16) continue;
      if (n.ring !== ring) continue;
      const p = 1 - dt / chart.meta.approachTime; // 0 far -> 1 at hit
      this._note(sp, n, p, approachLen);
    }
  }

  _note(sp, note, p, approachLen) {
    const { ctx } = this;
    const v = dirVector(note.dir);
    const a = Math.atan2(v.y, v.x);
    const dist = sp.ring + approachLen * (1 - p);
    const x = sp.x + v.x * dist, y = sp.y + v.y * dist;
    const c = ringColor(note.ring);
    const size = sp.R * 0.20;
    const appear = Math.min(1, p * 3);

    // faint target marker at the ring edge
    const tx = sp.x + v.x * sp.ring, ty = sp.y + v.y * sp.ring;
    ctx.beginPath(); ctx.arc(tx, ty, size * 0.5, 0, Math.PI * 2);
    ctx.strokeStyle = this._alpha(c, 0.3); ctx.lineWidth = 2; ctx.stroke();

    // shrinking approach ring (osu cue), reaches the chevron size at p=1
    ctx.beginPath();
    ctx.arc(x, y, size * (1 + (1 - p) * 1.6), 0, Math.PI * 2);
    ctx.strokeStyle = this._alpha(c, 0.4 * appear); ctx.lineWidth = 2; ctx.stroke();

    // chevron pointing in the flick direction
    ctx.save();
    ctx.translate(x, y); ctx.rotate(a);
    ctx.globalAlpha = appear;
    ctx.shadowColor = c; ctx.shadowBlur = 10;
    ctx.fillStyle = note.mod ? '#fff' : c;
    ctx.beginPath();
    ctx.moveTo(size, 0);
    ctx.lineTo(-size * 0.6, -size * 0.8);
    ctx.lineTo(-size * 0.2, 0);
    ctx.lineTo(-size * 0.6, size * 0.8);
    ctx.closePath(); ctx.fill();
    if (note.mod) { ctx.strokeStyle = c; ctx.lineWidth = 3; ctx.stroke(); }
    ctx.restore();

    // modifier glyph badge
    if (note.mod) {
      ctx.globalAlpha = appear;
      ctx.fillStyle = '#fff';
      ctx.font = `700 ${size * 0.7}px system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(MODS[note.mod] || note.mod, x, y - size * 1.4);
      ctx.globalAlpha = 1;
    }
  }

  _stickDot(sp, ring, input) {
    if (!input) return;
    const s = ring === 'L' ? input.left : input.right;
    if (!s) return;
    const x = sp.x + s.x * sp.ring, y = sp.y + s.y * sp.ring;
    const c = ringColor(ring);
    const { ctx } = this;
    // line from center to dot
    ctx.beginPath(); ctx.moveTo(sp.x, sp.y); ctx.lineTo(x, y);
    ctx.strokeStyle = this._alpha(c, 0.35); ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, sp.R * 0.07, 0, Math.PI * 2);
    ctx.fillStyle = c; ctx.fill();
  }

  _vuMeter(ring, t) {
    const { ctx } = this;
    const sp = this.speakers[ring];
    const outer = ring === 'L'; // L meter on far-left, R meter on far-right
    const bx = outer ? sp.x - sp.R * 1.55 : sp.x + sp.R * 1.55;
    const bars = 5, bw = sp.R * 0.12, gap = bw * 0.5;
    const totalH = sp.R * 1.6;
    const c = ringColor(ring);
    for (let i = 0; i < bars; i++) {
      const phase = i * 0.7 + (ring === 'L' ? 0 : 1.3);
      const lvl = Math.max(0.1, (0.5 + 0.5 * Math.sin(t * 7 + phase)) * (0.4 + this.pulse));
      const bh = totalH * Math.min(1, lvl);
      const y = sp.y + totalH / 2 - bh;
      const x = bx + (i - bars / 2) * (bw + gap);
      ctx.fillStyle = this._alpha(c, 0.25 + lvl * 0.5);
      this._roundRect(x, y, bw, bh, 3); ctx.fill();
    }
  }

  _effects(songTime) {
    const { ctx } = this;
    this.effects = this.effects.filter((e) => songTime - e.t0 < e.dur);
    for (const e of this.effects) {
      const sp = this.speakers[e.ring];
      const age = (songTime - e.t0) / e.dur; // 0..1
      const c = e.judgement === 'perfect' ? COL.perfect : e.judgement === 'good' ? COL.good : COL.miss;

      if (e.judgement !== 'miss') {
        // expanding ring burst on the speaker
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, sp.ring * (1 + age * 0.8), 0, Math.PI * 2);
        ctx.strokeStyle = this._alpha(c, (1 - age) * 0.9);
        ctx.lineWidth = 5 * (1 - age); ctx.stroke();
      }
      // floating judgement text above the speaker
      ctx.globalAlpha = 1 - age;
      ctx.fillStyle = c;
      ctx.font = `900 ${sp.R * 0.34}px system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(e.judgement.toUpperCase(), sp.x, sp.y - sp.R * 1.25 - age * 30);
      ctx.globalAlpha = 1;
    }
  }

  _deck(scorer, songTime) {
    const { ctx } = this;
    const d = this.deck;
    const x = d.x - d.w / 2, y = d.y - d.h / 2;
    // deck housing
    this._roundRect(x, y, d.w, d.h, 14);
    const g = ctx.createLinearGradient(0, y, 0, y + d.h);
    g.addColorStop(0, COL.deckHi); g.addColorStop(1, COL.deck);
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = this._alpha(COL.chrome, 0.5); ctx.stroke();

    // two cassette reels, spin faster with combo
    const reelY = y + d.h * 0.30, reelR = d.h * 0.16;
    const spin = songTime * (1.5 + (scorer.combo / 25));
    for (const side of [-1, 1]) {
      const rx = d.x + side * d.w * 0.22;
      ctx.beginPath(); ctx.arc(rx, reelY, reelR, 0, Math.PI * 2);
      ctx.strokeStyle = this._alpha(COL.chrome, 0.8); ctx.lineWidth = 3; ctx.stroke();
      ctx.save(); ctx.translate(rx, reelY); ctx.rotate(spin * side);
      for (let i = 0; i < 3; i++) {
        ctx.rotate(Math.PI / 3 * 2);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, reelR * 0.8);
        ctx.strokeStyle = COL.dim; ctx.lineWidth = 3; ctx.stroke();
      }
      ctx.restore();
      ctx.beginPath(); ctx.arc(rx, reelY, reelR * 0.22, 0, Math.PI * 2);
      ctx.fillStyle = COL.chrome; ctx.fill();
    }

    // combo (big), score + accuracy (small)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COL.text;
    ctx.font = `900 ${d.h * 0.30}px system-ui, sans-serif`;
    ctx.fillText(scorer.combo > 0 ? `${scorer.combo}x` : '—', d.x, y + d.h * 0.62);

    ctx.fillStyle = COL.dim;
    ctx.font = `700 ${d.h * 0.12}px ui-monospace, monospace`;
    ctx.fillText(String(scorer.score).padStart(7, '0'), d.x, y + d.h * 0.82);
    ctx.fillText(`${(scorer.accuracy * 100).toFixed(1)}%`, d.x, y + d.h * 0.95);
  }

  _countIn(songTime) {
    if (songTime >= 0) return;
    const { ctx, w, h } = this;
    const n = Math.ceil(-songTime);
    ctx.fillStyle = COL.text;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `900 ${h * 0.18}px system-ui, sans-serif`;
    ctx.globalAlpha = (songTime % 1 + 1) % 1; // fade each count
    ctx.fillText(String(n), w * 0.5, h * 0.30);
    ctx.globalAlpha = 1;
  }

  // --- helpers ------------------------------------------------------------
  _roundRect(x, y, w, h, r) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  _alpha(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return `rgba(${r},${g},${b},${a})`;
  }
}

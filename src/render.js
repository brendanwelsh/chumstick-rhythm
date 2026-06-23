// render.js — CHUMSTICK RHYTHM, an underwater Jaws stage (2D canvas).
//
// A deep-ocean gradient (bright surface → deep dark) with god-rays, bubbles, a rising open-jaws
// shark, a cruising fin and floating barrels. Two circular SHARK MOUTHS (left/right rings) sit on
// the stage; the player's aim cursor is the shark's tongue licking out from each throat. Notes are
// fish swimming in toward the mouths along a runway — flow your stick into the bite arc / trace the
// moving line / spin to fill the gauge. Hits keep the song clean; a MISS glitches the screen
// (audio glitches in audio.js). L = cyan, R = orange (kept distinct so you can tell the sides).
//
// API: new Renderer(canvas) · drawGame(state) · addEffect(e) · addFlick(f) · .effects .flickFx .pulse

import { dirVector, angleVec, wrapPi, noteTargetAngle, MODS } from './chart.js';
import { TAP_ARC } from './scoring.js';

const COL = {
  L: '#2fe0ff', R: '#ff9f43',                 // L = cyan, R = warm orange — clearly DISTINCT sides
  surf: '#2f9fcf', mid: '#0a4a72', deep: '#011528', // Jaws underwater: light surface -> deep dark
  blood: '#c42020', bloodDim: 'rgba(160,25,25,0.85)',
  shark: '#0b2747',
  body: '#0c1f38', bodyHi: '#1f426a', bodyLo: '#06101f', chrome: '#5f8ec2',
  cone: '#0c1a2e', coneHi: '#1a3252',
  text: '#eaf4ff', dim: '#9cc2e6',
  perfect: '#7dffea', good: '#9bff8a', miss: '#ff5a7a',
};
const ringColor = (r) => (r === 'L' ? COL.L : COL.R);

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.effects = [];
    this.flickFx = [];
    this.pulse = 0;
    this.glitch = 0;
    this._banner = null;   // transient centred flourish (combo milestones), {text, life}
    this._t = 0;
    this.trail = { L: [], R: [] };   // recent stick-cap positions per ring (the "drawn line")
    this.logo = new Image();
    this._logoReady = false;
    this.logo.onload = () => { this._logoReady = true; };
    this.logo.src = 'brand/chum-logo.png';
    // water-theme sprites (chumthewaters.com): rising open-jaws shark, deep prowling shark,
    // Jaws barrel, surface boat.
    this.sharkBelowImg = this._img('brand/shark-below.png', 'sharkBelow');
    this.sharkImg = this._img('brand/shark.png', 'shark');
    this.barrelImg = this._img('brand/barrel.png', 'barrel');
    this.boatImg = this._img('brand/boat.png', 'boat');
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /** Load an image, set this._<key>Ready true on load, return it. */
  _img(src, key) {
    const im = new Image();
    this['_' + key + 'Ready'] = false;
    im.onload = () => { this['_' + key + 'Ready'] = true; };
    im.src = src;
    return im;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
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
    const r = Math.min(h * 0.18, w * 0.105);      // the two circular shark-mouth rings
    const cx = w * 0.5, cy = h * 0.55;
    const gap = r * 2.6;                           // gap between the mouths (rising shark sits here)
    // `speakers` is just the ring geometry now (radio theme dropped) — kept as the key name.
    this.speakers = {
      L: { x: cx - gap * 0.5 - r, y: cy, r },
      R: { x: cx + gap * 0.5 + r, y: cy, r },
    };
  }

  addEffect({ judgement, ring, dir, angle, t }) {
    const e = { ring, dir, angle, judgement, t0: t, dur: judgement === 'miss' ? 0.4 : 0.7 };
    if (judgement !== 'miss') {
      const n = judgement === 'perfect' ? 11 : 6;     // sparkle mini-pearls bursting out on a hit
      e.spark = Array.from({ length: n }, (_, i) => ({ a: (i / n) * Math.PI * 2 + i * 0.7, sp: 0.6 + (i % 3) * 0.28 }));
    }
    this.effects.push(e);
    if (judgement === 'miss') this.glitch = 1; else this.pulse = 1;
  }

  addFlick({ ring, dir, mag = 1, t }) { this.flickFx.push({ ring, dir, mag, t0: t, dur: 0.22 }); }

  // --- main draw ----------------------------------------------------------
  drawGame(state) {
    const { chart, songTime, scorer, input } = state;
    const ctx = this.ctx;
    this._t += 1 / 60;

    ctx.save();
    if (this.glitch > 0.01) ctx.translate(Math.sin(this._t * 90) * 7 * this.glitch, Math.sin(this._t * 70) * 4 * this.glitch);

    this._sky();
    this._deepShark(this._t);    // a shark prowling the dark depths
    this._sharkBelow(this._t);   // open-jaws shark rising from the depths (centre)
    this._surface(this._t);      // white waterline + the boat up top
    this._fin(this._t);          // iconic Jaws fin cutting the surface
    this._barrels(this._t);      // floating Jaws barrels

    // base layer: the two shark-mouth rings + the player's aim pearl/trail
    for (const ring of ['L', 'R']) {
      this._mouth(ring);
      this._trail(ring, input);
      this._cursor(ring, input);
    }

    // TOP layer: the pearls (notes) + hit FX, always above everything else
    for (const ring of ['L', 'R']) {
      if (chart) this._notes(ring, chart, songTime);
      this._effects(ring, songTime);
    }

    // HUD lives at the very top edge (out of the playfield): progress bar + score/combo/accuracy
    this._topbar(scorer, chart, songTime);

    if (this._banner) this._drawBanner();
    if (chart && songTime < 0) this._countIn(songTime);
    if (state.demo) this._demoBadge();
    ctx.restore();

    if (this.glitch > 0.01) this._glitchOverlay();
    this.pulse *= 0.9;
    this.glitch *= 0.86;
  }

  // A pale sky band up top, a white WATERLINE at ~10%, then the underwater gradient fading to deep
  // dark below (the Jaws poster look) — god-rays from the surface and rising bubbles.
  _sky() {
    const { ctx, w, h } = this;
    this._waterY = h * 0.1;                         // shared: where the surface sits
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#bfe2f0');                   // sky above the water
    g.addColorStop(0.099, '#a9d6ea');
    g.addColorStop(0.1, COL.surf);                  // just below the waterline
    g.addColorStop(0.45, COL.mid); g.addColorStop(1, COL.deep);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // god rays slanting down from the surface
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 6; i++) {
      const rx = (((i * 0.21 + this._t * 0.012) % 1) * 1.3 - 0.15) * w;
      ctx.fillStyle = 'rgba(150,210,240,0.05)';
      ctx.beginPath(); ctx.moveTo(rx, this._waterY); ctx.lineTo(rx + w * 0.05, this._waterY); ctx.lineTo(rx + w * 0.2, h); ctx.lineTo(rx + w * 0.01, h); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    // rising bubbles (below the surface only)
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    for (let i = 0; i < 16; i++) {
      const bx = (i * 97.3 % w), by = h - ((this._t * 30 + i * 60) % (h - this._waterY)), br = 2 + (i % 4);
      ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
    }
  }

  // The water's surface: a white foam waterline (like chumthewaters.com) with the boat riding it.
  _surface(t) {
    const { ctx, w, h } = this;
    const y = this._waterY != null ? this._waterY : h * 0.1;
    // the boat bobbing on the surface (drawn first so foam laps over its hull)
    if (this._boatReady) {
      const img = this.boatImg;
      const ar = (img.naturalHeight && img.naturalWidth) ? img.naturalHeight / img.naturalWidth : 1.25;
      const bw = Math.min(w * 0.13, 150), bh = bw * ar;
      const bx = w * 0.62 + Math.sin(t * 0.5) * w * 0.015;
      const by = y - bh * 0.74 + Math.sin(t * 0.9) * 3;
      ctx.save(); ctx.translate(bx, by + bh / 2); ctx.rotate(Math.sin(t * 0.9) * 0.03);
      ctx.drawImage(img, -bw / 2, -bh / 2, bw, bh); ctx.restore();
    }
    // white foam waterline — a wavy band
    ctx.save();
    ctx.beginPath(); ctx.moveTo(0, y);
    for (let x = 0; x <= w; x += 16) ctx.lineTo(x, y + Math.sin(x * 0.025 + t * 1.6) * 4 + Math.sin(x * 0.07 - t * 2) * 2);
    ctx.lineTo(w, y - 30); ctx.lineTo(0, y - 30); ctx.closePath();
    const fg = ctx.createLinearGradient(0, y - 30, 0, y + 8);
    fg.addColorStop(0, 'rgba(255,255,255,0)'); fg.addColorStop(0.7, 'rgba(238,250,255,0.5)'); fg.addColorStop(1, 'rgba(255,255,255,0.92)');
    ctx.fillStyle = fg; ctx.fill();
    // crisp foam line
    ctx.beginPath();
    for (let x = 0; x <= w; x += 8) { const yy = y + Math.sin(x * 0.025 + t * 1.6) * 4 + Math.sin(x * 0.07 - t * 2) * 2; x === 0 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy); }
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.restore();
  }

  // A shark silhouette prowling the dark depths, cruising slowly (the side sprite, dimmed).
  _deepShark(t) {
    if (!this._sharkReady) return;
    const { ctx, w, h } = this;
    const img = this.sharkImg;
    const ar = (img.naturalHeight && img.naturalWidth) ? img.naturalHeight / img.naturalWidth : 0.322;
    const W = w * 0.3, H = W * ar;
    const period = w + W * 2 + 300;
    const dir = Math.floor((t * 24) / period) % 2 === 0 ? 1 : -1;  // alternate direction each lap
    const raw = (t * 24) % period;
    const x = dir > 0 ? raw - (W + 200) : w - (raw - (W + 200)) - W;
    const y = h * 0.8 + Math.sin(t * 0.5) * h * 0.02;
    ctx.save(); ctx.globalAlpha = 0.32; ctx.translate(x + W / 2, y + H / 2);
    if (dir < 0) ctx.scale(-1, 1);                              // flip when swimming left
    ctx.rotate(Math.sin(t * 0.5) * 0.04);
    ctx.drawImage(img, -W / 2, -H / 2, W, H);
    ctx.restore();
  }

  // Shark fin cruising the surface (silhouette + V-wake) — the Jaws signature.
  _fin(t) {
    const { ctx, w, h } = this;
    const W = Math.max(26, w * 0.028);
    const period = w + W * 5;
    const x = ((t * 34) % period) - W * 2.5;       // slow cruise, left -> right
    const y = h * 0.11 + Math.sin(t * 0.8) * h * 0.008;
    ctx.save();
    // trailing wake
    ctx.strokeStyle = 'rgba(220,240,255,0.10)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x - W * 2.4, y + W * 0.15); ctx.lineTo(x + W * 0.2, y + W * 0.5);
    ctx.moveTo(x - W * 2.4, y + W * 0.95); ctx.lineTo(x + W * 0.2, y + W * 0.5); ctx.stroke();
    // fin silhouette
    ctx.fillStyle = 'rgba(5,16,30,0.92)';
    ctx.beginPath();
    ctx.moveTo(x + W * 0.35, y - W);
    ctx.quadraticCurveTo(x + W * 0.08, y - W * 0.2, x - W * 0.55, y + W * 0.45);
    ctx.lineTo(x + W * 0.72, y + W * 0.45);
    ctx.quadraticCurveTo(x + W * 0.6, y - W * 0.25, x + W * 0.35, y - W);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // Open-jaws shark rising from the depths in the centre — the menace behind the playfield.
  _sharkBelow(t) {
    if (!this._sharkBelowReady) return;
    const { ctx, w, h } = this;
    const img = this.sharkBelowImg;
    const ar = (img.naturalHeight && img.naturalWidth) ? img.naturalHeight / img.naturalWidth : 1.02;
    const W = Math.min(w * 0.34, h * 0.62);
    const H = W * ar;
    const x = w / 2 - W / 2;
    const y = h - H * 0.86 + Math.sin(t * 0.22) * h * 0.035;   // mostly submerged, slowly rising
    ctx.save(); ctx.globalAlpha = 0.5; ctx.drawImage(img, x, y, W, H); ctx.restore();
  }

  // Floating Jaws barrels bobbing near the surface.
  _barrels(t) {
    if (!this._barrelReady) return;
    const { ctx, w, h } = this;
    const img = this.barrelImg;
    const ar = (img.naturalHeight && img.naturalWidth) ? img.naturalHeight / img.naturalWidth : 1.45;
    const draw = (bx, by, bw, ph) => {
      const H = bw * ar, y = by + Math.sin(t * 1.1 + ph) * h * 0.012;
      ctx.save(); ctx.globalAlpha = 0.95; ctx.translate(bx, y); ctx.rotate(Math.sin(t * 0.7 + ph) * 0.09);
      ctx.drawImage(img, -bw / 2, -H / 2, bw, H); ctx.restore();
    };
    draw(w * 0.11, h * 0.16, w * 0.045, 0);
    draw(w * 0.88, h * 0.12, w * 0.05, 2.1);
  }

  // A circular shark MAW: dark gullet, red gums, a ring of inward-pointing teeth, side-colour glow.
  // This is where the pearls swim in. (Replaces the old speaker — the radio theme is gone.)
  _mouth(ring) {
    const { ctx } = this;
    const sp = this.speakers[ring];
    const c = ringColor(ring);
    const R = sp.r;
    // gullet
    const tg = ctx.createRadialGradient(sp.x, sp.y, R * 0.08, sp.x, sp.y, R);
    tg.addColorStop(0, '#020205'); tg.addColorStop(0.5, '#1c060a'); tg.addColorStop(1, '#451620');
    ctx.beginPath(); ctx.arc(sp.x, sp.y, R, 0, Math.PI * 2); ctx.fillStyle = tg; ctx.fill();
    // gums
    ctx.lineWidth = R * 0.15; ctx.strokeStyle = '#7a2230';
    ctx.beginPath(); ctx.arc(sp.x, sp.y, R * 0.9, 0, Math.PI * 2); ctx.stroke();
    // teeth ring (triangles pointing inward)
    const teeth = 22;
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      const bx = sp.x + ca * R * 0.98, by = sp.y + sa * R * 0.98;
      const tx = sp.x + ca * R * 0.78, ty = sp.y + sa * R * 0.78;
      const nx = -sa, ny = ca, hw = R * 0.065;
      ctx.beginPath(); ctx.moveTo(bx + nx * hw, by + ny * hw); ctx.lineTo(bx - nx * hw, by - ny * hw); ctx.lineTo(tx, ty); ctx.closePath();
      ctx.fillStyle = i % 2 ? '#f3eee2' : '#e3dccb'; ctx.fill();
    }
    // side-colour rim glow (keeps L cyan / R orange distinct), brightens on a hit
    ctx.save(); ctx.shadowColor = c; ctx.shadowBlur = 12 + this.pulse * 24;
    ctx.lineWidth = 3; ctx.strokeStyle = this._alpha(c, 0.9);
    ctx.beginPath(); ctx.arc(sp.x, sp.y, R * 1.02, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }

  // A little fish (the note) swimming toward `facing` (radians; nose +x before rotation). Side-
  // coloured body with a white belly highlight, tail, dorsal fin and an eye.
  _fish(x, y, r, ring, alpha = 1, facing = Math.PI) {
    const { ctx } = this;
    const c = ring === 'L' ? COL.L : ring === 'R' ? COL.R : '#cfeaff';
    const bodyL = r * 2.5, bodyH = r * 1.5;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(facing); ctx.globalAlpha = alpha;
    ctx.shadowColor = c; ctx.shadowBlur = r * 1.2;
    const g = ctx.createLinearGradient(0, -bodyH / 2, 0, bodyH / 2);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.55, c); g.addColorStop(1, this._alpha(c, 0.65));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(0, 0, bodyL / 2, bodyH / 2, 0, 0, Math.PI * 2); ctx.fill();   // body
    ctx.beginPath(); ctx.moveTo(-bodyL * 0.42, 0); ctx.lineTo(-bodyL * 0.72, -bodyH * 0.6); ctx.lineTo(-bodyL * 0.72, bodyH * 0.6); ctx.closePath(); ctx.fill(); // tail
    ctx.beginPath(); ctx.moveTo(0, -bodyH * 0.42); ctx.lineTo(-r * 0.4, -bodyH * 0.95); ctx.lineTo(r * 0.3, -bodyH * 0.45); ctx.closePath(); ctx.fill(); // dorsal fin
    ctx.shadowBlur = 0;
    ctx.fillStyle = `rgba(255,255,255,${alpha})`; ctx.beginPath(); ctx.arc(bodyL * 0.28, -bodyH * 0.1, r * 0.22, 0, Math.PI * 2); ctx.fill(); // eye white
    ctx.fillStyle = `rgba(16,19,26,${alpha})`; ctx.beginPath(); ctx.arc(bodyL * 0.32, -bodyH * 0.1, r * 0.11, 0, Math.PI * 2); ctx.fill(); // pupil
    ctx.restore(); ctx.globalAlpha = 1;
  }

  // Notes draw per TYPE. They approach along a runway, then become "live" on the rim. Nothing is
  // a discrete press — you're scored for BEING in the arc / TRACING the line / SPINNING, so the
  // visuals show a target to ride into, and light up while your stick is satisfying them.
  _notes(ring, chart, songTime) {
    const sp = this.speakers[ring];
    const arcScale = chart.meta.arcScale || 1;   // bite-zone widens/narrows with difficulty
    for (const n of chart.notes) {
      if (n.ring !== ring || n.judged) continue;
      const dt = n.time - songTime;
      if (dt > chart.meta.approachTime || songTime > n.time + n.hold + 0.2) continue;
      const p = Math.max(0, Math.min(1, 1 - dt / chart.meta.approachTime)); // 0 far → 1 at the rim
      if (n.type === 'spin') this._noteSpin(sp, n, songTime, p);
      else if (n.type === 'slide') this._noteSlide(sp, n, songTime, p);
      else if (n.type === 'hold') this._noteHold(sp, n, songTime, p, arcScale);
      else this._noteTap(sp, n, songTime, p, dt, arcScale);
      if (n.mod) this._modGlyph(sp, n, p);
    }
  }

  // A point on the rim for a given heading, plus the runway position (outside, sliding in).
  _rimPt(sp, a, frac = 1) { const v = angleVec(a); return { x: sp.x + v.x * sp.r * frac, y: sp.y + v.y * sp.r * frac }; }
  _runwayPt(sp, a, p) { const v = angleVec(a); const d = sp.r + sp.r * 3.2 * (1 - p); return { x: sp.x + v.x * d, y: sp.y + v.y * d }; }

  // Glowing arc segment on the rim, centred on `a` spanning ±span. `lit` brightens it.
  _rimArc(sp, a, span, col, alpha, width, lit) {
    const { ctx } = this;
    ctx.save(); ctx.beginPath(); ctx.lineCap = 'round';
    if (lit) { ctx.shadowColor = '#fff'; ctx.shadowBlur = 16; }
    ctx.arc(sp.x, sp.y, sp.r, a - span, a + span);
    ctx.strokeStyle = this._alpha(lit ? '#ffffff' : col, alpha); ctx.lineWidth = width; ctx.stroke();
    ctx.restore();
  }

  _noteTap(sp, n, songTime, p, dt, arcScale = 1) {
    const c = ringColor(n.ring);
    const near = Math.abs(dt) < 0.12;
    // bite zone on the teeth — be anywhere in this arc as the pearl crosses
    this._rimArc(sp, n.angle, TAP_ARC * arcScale, c, (near ? 0.95 : 0.4) * Math.min(1, p * 2), sp.r * (near ? 0.2 : 0.11), n.lit);
    // the fish swimming in toward the mouth (facing inward)
    const rp = this._runwayPt(sp, n.angle, p);
    this._fish(rp.x, rp.y, sp.r * (near ? 0.26 : 0.2), n.ring, Math.min(1, p * 2 + 0.2), n.angle + Math.PI);
  }

  _noteHold(sp, n, songTime, p, arcScale = 1) {
    const c = ringColor(n.ring);
    const arc = TAP_ARC * arcScale;
    // base arc (where to park), thicker; a brighter overlay fills with coverage
    this._rimArc(sp, n.angle, arc, c, 0.30 * Math.min(1, p * 2), sp.r * 0.16, false);
    if (n.coverage > 0) this._rimArc(sp, n.angle, arc * n.coverage, c, 0.9, sp.r * 0.2, n.lit);
    // a fish swimming in before the head
    if (songTime < n.time) {
      const rp = this._runwayPt(sp, n.angle, p);
      this._fish(rp.x, rp.y, sp.r * 0.18, n.ring, Math.min(1, p * 2), n.angle + Math.PI);
    }
  }

  _noteSlide(sp, n, songTime, p) {
    const { ctx } = this;
    const c = ringColor(n.ring);
    const a0 = n.angle, a1 = n.angleTo, sweep = wrapPi(a1 - a0);
    // the full line to trace, faint, just inside the rim
    ctx.save(); ctx.beginPath(); ctx.lineCap = 'round';
    ctx.arc(sp.x, sp.y, sp.r * 0.92, a0, a0 + sweep, sweep < 0);
    ctx.strokeStyle = this._alpha(c, 0.28 * Math.min(1, p * 2)); ctx.lineWidth = sp.r * 0.13; ctx.stroke();
    // covered portion brightens as you trace it
    const u = Math.max(0, Math.min(1, (songTime - n.time) / n.hold));
    if (u > 0) {
      ctx.beginPath(); ctx.lineCap = 'round';
      ctx.arc(sp.x, sp.y, sp.r * 0.92, a0, a0 + sweep * u, sweep < 0);
      ctx.strokeStyle = this._alpha(n.lit ? '#ffffff' : c, 0.85); ctx.lineWidth = sp.r * 0.16; ctx.stroke();
    }
    ctx.restore();
    // moving head you chase
    const head = noteTargetAngle(n, songTime);
    const onRim = songTime >= n.time;
    const hp = onRim ? this._rimPt(sp, head, 0.92) : this._runwayPt(sp, a0, p);
    this._fish(hp.x, hp.y, sp.r * 0.21, n.ring, 1, head + Math.PI);
  }

  _noteSpin(sp, n, songTime, p) {
    const { ctx } = this;
    const c = ringColor(n.ring);
    const live = songTime >= n.time;
    const R = sp.r * 1.18;
    // gauge ring
    ctx.save();
    ctx.beginPath(); ctx.arc(sp.x, sp.y, R, 0, Math.PI * 2);
    ctx.strokeStyle = this._alpha(c, (live ? 0.4 : 0.2) * Math.min(1, p * 2)); ctx.lineWidth = sp.r * 0.12; ctx.stroke();
    if (n.coverage > 0) {
      ctx.beginPath(); ctx.lineCap = 'round';
      ctx.arc(sp.x, sp.y, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * n.coverage);
      ctx.strokeStyle = this._alpha(n.lit ? '#fff' : c, 0.95); ctx.lineWidth = sp.r * 0.16; ctx.stroke();
    }
    // rotating "SPIN" arrows
    const spin = this._t * (live ? 6 : 2);
    ctx.translate(sp.x, sp.y); ctx.rotate(spin);
    ctx.fillStyle = this._alpha(n.lit ? '#fff' : c, 0.9);
    for (let k = 0; k < 3; k++) {
      ctx.rotate((Math.PI * 2) / 3);
      ctx.beginPath(); ctx.moveTo(R * 0.86, 0); ctx.lineTo(R * 0.7, -sp.r * 0.12); ctx.lineTo(R * 0.7, sp.r * 0.12); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    if (live) { ctx.fillStyle = this._alpha('#fff', 0.8); ctx.font = `800 ${sp.r * 0.3}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('SPIN', sp.x, sp.y - sp.r * 1.55); }
  }

  _modGlyph(sp, n, p) {
    const { ctx } = this;
    const rp = this._rimPt(sp, n.angle, 1.35);
    ctx.globalAlpha = Math.min(1, p * 2);
    ctx.fillStyle = '#fff'; ctx.font = `700 ${sp.r * 0.32}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(MODS[n.mod] || n.mod, rp.x, rp.y);
    ctx.globalAlpha = 1;
  }

  // The "drawn line": a fading trail of the aim pearl's recent positions — motion you can see.
  _trail(ring, input) {
    const { ctx } = this;
    const sp = this.speakers[ring];
    const s = input ? (ring === 'L' ? input.left : input.right) : { x: 0, y: 0, mag: 0 };
    const maxOff = sp.r * 0.6;
    const buf = this.trail[ring];
    buf.push({ x: sp.x + (s.x || 0) * maxOff, y: sp.y + (s.y || 0) * maxOff, m: s.mag || 0 });
    if (buf.length > 18) buf.shift();
    const c = ringColor(ring);
    for (let i = 1; i < buf.length; i++) {
      const a = (i / buf.length);
      const m = Math.max(buf[i].m, buf[i - 1].m);
      if (m < 0.05) continue;
      ctx.beginPath(); ctx.moveTo(buf[i - 1].x, buf[i - 1].y); ctx.lineTo(buf[i].x, buf[i].y);
      ctx.strokeStyle = this._alpha(c, a * 0.5 * m); ctx.lineWidth = sp.r * 0.16 * a; ctx.lineCap = 'round'; ctx.stroke();
    }
  }

  // The player's cursor: the SHARK'S TONGUE reaching out from the throat toward the aim, licking up
  // the fish. It extends with deflection and the tip flares on a hit/eat (driven by this.pulse).
  _cursor(ring, input) {
    const { ctx } = this;
    const sp = this.speakers[ring];
    const s = input ? (ring === 'L' ? input.left : input.right) : { x: 0, y: 0, mag: 0 };
    const c = ringColor(ring);
    const mag = s.mag || 0;
    const a = mag > 0.1 ? Math.atan2(s.y, s.x) : -Math.PI / 2;     // aim; at rest it rests pointing up
    const len = sp.r * (0.32 + 0.55 * mag);                        // tongue length grows with push
    const tipX = sp.x + Math.cos(a) * len, tipY = sp.y + Math.sin(a) * len;
    const wB = sp.r * 0.2, wT = sp.r * (0.12 + 0.06 * this.pulse); // base/tip half-width; flares on a hit
    const nx = -Math.sin(a), ny = Math.cos(a);
    ctx.save();
    ctx.shadowColor = c; ctx.shadowBlur = 8 + this.pulse * 16;
    const g = ctx.createLinearGradient(sp.x, sp.y, tipX, tipY);
    g.addColorStop(0, '#9c3346'); g.addColorStop(0.6, '#e0697e'); g.addColorStop(1, '#f6a6b6');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(sp.x + nx * wB, sp.y + ny * wB);
    ctx.lineTo(tipX + nx * wT, tipY + ny * wT);
    ctx.quadraticCurveTo(tipX + Math.cos(a) * wT * 1.5, tipY + Math.sin(a) * wT * 1.5, tipX - nx * wT, tipY - ny * wT); // rounded tip
    ctx.lineTo(sp.x - nx * wB, sp.y - ny * wB);
    ctx.closePath(); ctx.fill();
    // centre groove + glossy highlight
    ctx.strokeStyle = 'rgba(110,18,38,0.5)'; ctx.lineWidth = Math.max(1, sp.r * 0.025);
    ctx.beginPath(); ctx.moveTo(sp.x, sp.y); ctx.lineTo(tipX, tipY); ctx.stroke();
    ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath(); ctx.ellipse((sp.x + tipX) / 2, (sp.y + tipY) / 2, len * 0.2, wT * 0.5, a, 0, Math.PI * 2); ctx.fill();
    // side-colour glow dot at the licking tip
    ctx.shadowColor = c; ctx.shadowBlur = 10 + this.pulse * 14;
    ctx.fillStyle = this._alpha(c, 0.9); ctx.beginPath(); ctx.arc(tipX, tipY, sp.r * 0.05, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  _effects(ring, songTime) {
    const { ctx } = this;
    const sp = this.speakers[ring];
    this.effects = this.effects.filter((e) => songTime - e.t0 < e.dur);
    for (const e of this.effects) {
      if (e.ring !== ring) continue;
      const age = (songTime - e.t0) / e.dur;
      const c = e.judgement === 'perfect' ? COL.perfect : e.judgement === 'good' ? COL.good : COL.miss;
      const v = e.angle != null ? angleVec(e.angle) : dirVector(e.dir);
      const rx = sp.x + v.x * sp.r, ry = sp.y + v.y * sp.r;
      // expanding shockwave ring (bigger/brighter on a perfect)
      const big = e.judgement === 'perfect' ? 2.3 : 1.6;
      ctx.beginPath(); ctx.arc(rx, ry, sp.r * 0.25 * (1 + age * big), 0, Math.PI * 2);
      ctx.strokeStyle = this._alpha(c, (1 - age) * 0.9); ctx.lineWidth = 5 * (1 - age); ctx.stroke();
      // little fish scattering outward (the catch)
      if (e.spark) for (const s of e.spark) {
        const d = sp.r * (0.2 + age * 1.5 * s.sp);
        this._fish(rx + Math.cos(s.a) * d, ry + Math.sin(s.a) * d, sp.r * 0.07 * (1 - age), ring, 1 - age, s.a);
      }
      // judgement text: rises, scales in, glows
      ctx.save();
      ctx.globalAlpha = 1 - age; ctx.fillStyle = c;
      ctx.shadowColor = c; ctx.shadowBlur = 18 * (1 - age);
      const fs = sp.r * (e.judgement === 'perfect' ? 0.5 : 0.42) * (1 + (1 - Math.min(1, age * 4)) * 0.35);
      ctx.font = `900 ${fs}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(e.judgement.toUpperCase(), sp.x, sp.y - sp.r * 1.55 - age * 24);
      ctx.restore(); ctx.globalAlpha = 1;
    }
  }

  // Clean HUD at the very TOP edge (out of the playfield). A song-progress "score bar" runs across
  // the top; SCORE left, ACCURACY right, big COMBO + track title centred. Replaces the old centre
  // console so the space between the speakers stays clear for gameplay.
  _topbar(scorer, chart, songTime) {
    const { ctx, w, h } = this;
    const sc = scorer || { score: 0, combo: 0, accuracy: 1 };

    // dark strip so the HUD reads over the pale sky band above the waterline
    const strip = ctx.createLinearGradient(0, 0, 0, h * 0.09);
    strip.addColorStop(0, 'rgba(2,12,26,0.6)'); strip.addColorStop(1, 'rgba(2,12,26,0)');
    ctx.fillStyle = strip; ctx.fillRect(0, 0, w, h * 0.09);

    // --- song progress bar ---
    const barH = Math.max(5, h * 0.009);
    ctx.fillStyle = 'rgba(2,10,22,0.75)'; ctx.fillRect(0, 0, w, barH);
    const prog = (chart && chart.duration > 0 && songTime > 0) ? Math.max(0, Math.min(1, songTime / chart.duration)) : 0;
    const pg = ctx.createLinearGradient(0, 0, w, 0);
    pg.addColorStop(0, COL.L); pg.addColorStop(1, COL.R);
    ctx.fillStyle = pg; ctx.fillRect(0, 0, w * prog, barH);
    if (prog > 0 && prog < 1) { ctx.fillStyle = this._alpha(COL.blood, 0.95); ctx.fillRect(w * prog - 1, 0, 3, barH); } // playhead

    const top = barH + h * 0.012;
    // --- score (left) / accuracy (right) ---
    ctx.textBaseline = 'top';
    const lab = `700 ${Math.max(9, h * 0.016)}px ui-monospace, monospace`;
    const big = `800 ${Math.max(16, h * 0.03)}px ui-monospace, monospace`;
    ctx.textAlign = 'left';
    ctx.fillStyle = COL.dim; ctx.font = lab; ctx.fillText('SCORE', w * 0.03, top);
    ctx.fillStyle = COL.text; ctx.font = big; ctx.fillText(String(sc.score).padStart(7, '0'), w * 0.03, top + h * 0.02);
    ctx.textAlign = 'right';
    ctx.fillStyle = COL.dim; ctx.font = lab; ctx.fillText('ACCURACY', w * 0.97, top);
    ctx.fillStyle = COL.text; ctx.font = big; ctx.fillText((sc.accuracy * 100).toFixed(1) + '%', w * 0.97, top + h * 0.02);

    // --- centre: track title + big combo ---
    ctx.textAlign = 'center';
    if (chart && chart.meta.title) {
      ctx.fillStyle = this._alpha(COL.text, 0.6); ctx.font = `600 ${Math.max(10, h * 0.016)}px system-ui`;
      ctx.fillText(chart.meta.title, w / 2, top, w * 0.5);
    }
    if (sc.combo > 1) {
      const cs = Math.max(26, h * 0.062) * (1 + Math.min(0.28, this.pulse * 0.28));
      ctx.save(); ctx.shadowColor = 'rgba(196,32,32,0.7)'; ctx.shadowBlur = 22;
      ctx.fillStyle = COL.blood; ctx.font = `${cs}px Jaws, Impact, sans-serif`;
      ctx.fillText(String(sc.combo), w / 2, top + h * 0.022);
      ctx.restore();
      ctx.fillStyle = COL.dim; ctx.font = `700 ${Math.max(8, h * 0.013)}px ui-monospace, monospace`;
      ctx.fillText('COMBO', w / 2, top + h * 0.022 + cs);
    }
  }

  _countIn(songTime) {
    const { ctx, w, h } = this;
    ctx.save();
    ctx.fillStyle = COL.text; ctx.globalAlpha = 0.85;
    ctx.font = `900 ${h * 0.18}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(Math.ceil(-songTime)), w / 2, h * 0.34);
    ctx.restore();
  }

  /** Trigger a transient centred banner (e.g. "50 COMBO") that scales up and fades. */
  showBanner(text) { this._banner = { text, life: 1 }; this.pulse = 1; }

  _drawBanner() {
    const { ctx, w, h } = this;
    const b = this._banner;
    const grow = 1 + (1 - b.life) * 0.45;
    ctx.save();
    ctx.globalAlpha = Math.min(1, b.life * 1.5);
    ctx.translate(w / 2, h * 0.3); ctx.scale(grow, grow);
    ctx.shadowColor = 'rgba(196,32,32,0.85)'; ctx.shadowBlur = 26;
    ctx.fillStyle = COL.blood; ctx.font = `${Math.max(30, h * 0.072)}px Jaws, Impact, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(b.text, 0, 0);
    ctx.restore();
    b.life -= 0.018;
    if (b.life <= 0) this._banner = null;
  }

  _demoBadge() {
    const { ctx, w, h } = this;
    ctx.save();
    ctx.globalAlpha = 0.7; ctx.fillStyle = COL.dim;
    ctx.font = `700 ${Math.max(11, h * 0.022)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText('▶ DEMO · auto-play — Back/Esc to exit', w / 2, h - 14);
    ctx.restore();
  }

  _glitchOverlay() {
    const { ctx, w, h } = this;
    const g = this.glitch;
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 6 * g; i++) {
      const y = Math.random() * h, sh = 4 + Math.random() * 22;
      ctx.fillStyle = Math.random() < 0.5 ? 'rgba(255,0,80,0.25)' : 'rgba(0,200,255,0.25)';
      ctx.fillRect(0, y, w, sh);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(80,160,255,${0.1 * g})`; ctx.fillRect(0, 0, w, h);
  }

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
    if (hex.startsWith('rgba')) return hex;
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
}

// render.js — CHUMSTICK RHYTHM, front-facing STEREO on a Grooveshark-blue sky (2D canvas).
//
// A small boombox sits centred on a blue sky with a shark swimming by. Two round speakers
// (left/right) each hold a realistic analog THUMBSTICK in the centre; the stick tracks your
// real stick at all times. Notes approach each speaker from OUTSIDE (a long runway so you can
// read them) toward the rim at their direction's angle — push the stick that way on time.
// Hits keep the song clean; a MISS glitches the screen (audio glitches in audio.js).
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
    this._t = 0;
    this.trail = { L: [], R: [] };   // recent stick-cap positions per ring (the "drawn line")
    this.logo = new Image();
    this._logoReady = false;
    this.logo.onload = () => { this._logoReady = true; };
    this.logo.src = 'brand/chum-logo.png';
    // water-theme sprites (chumthewaters.com): rising open-jaws shark + Jaws barrel.
    this.sharkBelowImg = this._img('brand/shark-below.png', 'sharkBelow');
    this.barrelImg = this._img('brand/barrel.png', 'barrel');
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

  addEffect({ judgement, ring, dir, t }) {
    this.effects.push({ ring, dir, judgement, t0: t, dur: judgement === 'miss' ? 0.4 : 0.55 });
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
    this._sharkBelow(this._t);   // open-jaws shark rising from the depths (centre)
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

    if (chart && songTime < 0) this._countIn(songTime);
    if (state.demo) this._demoBadge();
    ctx.restore();

    if (this.glitch > 0.01) this._glitchOverlay();
    this.pulse *= 0.9;
    this.glitch *= 0.86;
  }

  // Underwater: bright surface up top fading to deep dark below (the Jaws poster look), with
  // sunlight god-rays from the surface and rising bubbles.
  _sky() {
    const { ctx, w, h } = this;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, COL.surf); g.addColorStop(0.4, COL.mid); g.addColorStop(1, COL.deep);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // god rays slanting down from the surface
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 6; i++) {
      const rx = (((i * 0.21 + this._t * 0.012) % 1) * 1.3 - 0.15) * w;
      ctx.fillStyle = 'rgba(150,210,240,0.045)';
      ctx.beginPath(); ctx.moveTo(rx, 0); ctx.lineTo(rx + w * 0.05, 0); ctx.lineTo(rx + w * 0.2, h); ctx.lineTo(rx + w * 0.01, h); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    // rising bubbles
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    for (let i = 0; i < 16; i++) {
      const bx = (i * 97.3 % w), by = h - ((this._t * 30 + i * 60) % (h * 1.1)), br = 2 + (i % 4);
      ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
    }
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

  // A pearl: white/cream sphere with a specular highlight and a side-coloured halo.
  _pearl(x, y, r, ring, alpha = 1) {
    const { ctx } = this;
    const c = ring === 'L' ? COL.L : ring === 'R' ? COL.R : '#ffffff';
    ctx.save();
    ctx.shadowColor = c; ctx.shadowBlur = r * 1.7;
    const g = ctx.createRadialGradient(x - r * 0.34, y - r * 0.4, r * 0.1, x, y, r);
    g.addColorStop(0, `rgba(255,255,255,${alpha})`);
    g.addColorStop(0.5, this._alpha('#e8f2ff', alpha));
    g.addColorStop(0.82, this._alpha('#b9d4ea', alpha));
    g.addColorStop(1, this._alpha(c, alpha * 0.85));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = `rgba(255,255,255,${0.9 * alpha})`;
    ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.34, r * 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // Notes draw per TYPE. They approach along a runway, then become "live" on the rim. Nothing is
  // a discrete press — you're scored for BEING in the arc / TRACING the line / SPINNING, so the
  // visuals show a target to ride into, and light up while your stick is satisfying them.
  _notes(ring, chart, songTime) {
    const sp = this.speakers[ring];
    for (const n of chart.notes) {
      if (n.ring !== ring || n.judged) continue;
      const dt = n.time - songTime;
      if (dt > chart.meta.approachTime || songTime > n.time + n.hold + 0.2) continue;
      const p = Math.max(0, Math.min(1, 1 - dt / chart.meta.approachTime)); // 0 far → 1 at the rim
      if (n.type === 'spin') this._noteSpin(sp, n, songTime, p);
      else if (n.type === 'slide') this._noteSlide(sp, n, songTime, p);
      else if (n.type === 'hold') this._noteHold(sp, n, songTime, p);
      else this._noteTap(sp, n, songTime, p, dt);
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

  _noteTap(sp, n, songTime, p, dt) {
    const c = ringColor(n.ring);
    const near = Math.abs(dt) < 0.12;
    // bite zone on the teeth — be anywhere in this arc as the pearl crosses
    this._rimArc(sp, n.angle, TAP_ARC, c, (near ? 0.95 : 0.4) * Math.min(1, p * 2), sp.r * (near ? 0.2 : 0.11), n.lit);
    // the pearl swimming in toward the mouth
    const rp = this._runwayPt(sp, n.angle, p);
    this._pearl(rp.x, rp.y, sp.r * (near ? 0.26 : 0.2), n.ring, Math.min(1, p * 2 + 0.2));
  }

  _noteHold(sp, n, songTime, p) {
    const c = ringColor(n.ring);
    // base arc (where to park), thicker; a brighter overlay fills with coverage
    this._rimArc(sp, n.angle, TAP_ARC, c, 0.30 * Math.min(1, p * 2), sp.r * 0.16, false);
    if (n.coverage > 0) this._rimArc(sp, n.angle, TAP_ARC * n.coverage, c, 0.9, sp.r * 0.2, n.lit);
    // a pearl swimming in before the head
    if (songTime < n.time) {
      const rp = this._runwayPt(sp, n.angle, p);
      this._pearl(rp.x, rp.y, sp.r * 0.18, n.ring, Math.min(1, p * 2));
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
    this._pearl(hp.x, hp.y, sp.r * 0.21, n.ring, 1);
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

  // The player's aim cursor: a bright pearl that reaches out toward the teeth, on a faint tether
  // from the gullet. Replaces the old realistic thumbstick (radio theme gone).
  _cursor(ring, input) {
    const { ctx } = this;
    const sp = this.speakers[ring];
    const s = input ? (ring === 'L' ? input.left : input.right) : { x: 0, y: 0, mag: 0 };
    const c = ringColor(ring);
    const maxOff = sp.r * 0.6;
    const cx = sp.x + (s.x || 0) * maxOff, cy = sp.y + (s.y || 0) * maxOff;
    // tether from the gullet to the aim pearl
    ctx.strokeStyle = this._alpha(c, 0.22 + 0.3 * (s.mag || 0)); ctx.lineWidth = sp.r * 0.05; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(sp.x, sp.y); ctx.lineTo(cx, cy); ctx.stroke();
    // the aim pearl (a touch larger when pushed)
    this._pearl(cx, cy, sp.r * (0.16 + 0.05 * (s.mag || 0)), ring, 1);
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
      ctx.beginPath(); ctx.arc(rx, ry, sp.r * 0.25 * (1 + age * 1.5), 0, Math.PI * 2);
      ctx.strokeStyle = this._alpha(c, (1 - age) * 0.9); ctx.lineWidth = 4 * (1 - age); ctx.stroke();
      ctx.globalAlpha = 1 - age; ctx.fillStyle = c; ctx.font = `900 ${sp.r * 0.4}px system-ui`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(e.judgement.toUpperCase(), sp.x, sp.y - sp.r * 1.5 - age * 18);
      ctx.globalAlpha = 1;
    }
  }

  // Clean HUD at the very TOP edge (out of the playfield). A song-progress "score bar" runs across
  // the top; SCORE left, ACCURACY right, big COMBO + track title centred. Replaces the old centre
  // console so the space between the speakers stays clear for gameplay.
  _topbar(scorer, chart, songTime) {
    const { ctx, w, h } = this;
    const sc = scorer || { score: 0, combo: 0, accuracy: 1 };

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

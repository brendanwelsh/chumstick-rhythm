// render.js — STEREO FLIX, front-facing STEREO on a Grooveshark-blue sky (2D canvas).
//
// A small boombox sits centred on a blue sky with a shark swimming by. Two round speakers
// (left/right) each hold a realistic analog THUMBSTICK in the centre; the stick tracks your
// real stick at all times. Notes approach each speaker from OUTSIDE (a long runway so you can
// read them) toward the rim at their direction's angle — push the stick that way on time.
// Hits keep the song clean; a MISS glitches the screen (audio glitches in audio.js).
//
// API: new Renderer(canvas) · drawGame(state) · addEffect(e) · addFlick(f) · .effects .flickFx .pulse

import { dirVector, MODS } from './chart.js';

const COL = {
  L: '#36d6f5', R: '#2b9fda',                 // cyan + Grooveshark blue
  sky0: '#081a33', sky1: '#13539e', sky2: '#39a7e0',
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
    this.logo = new Image();
    this._logoReady = false;
    this.logo.onload = () => { this._logoReady = true; };
    this.logo.src = 'brand/chum-logo.png';
    this.resize();
    window.addEventListener('resize', () => this.resize());
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
    const r = Math.min(h * 0.16, w * 0.095);     // small speakers (zoomed out)
    const cx = w * 0.5, cy = h * 0.56;
    const gap = r * 2.0;                           // centre console width
    this.speakers = {
      L: { x: cx - gap * 0.5 - r, y: cy, r },
      R: { x: cx + gap * 0.5 + r, y: cy, r },
    };
    this.console = { x: cx - gap * 0.5, y: cy - r * 0.85, w: gap, h: r * 1.7 };
    this.body = { x: this.speakers.L.x - r * 1.25, y: cy - r * 1.4, w: (this.speakers.R.x - this.speakers.L.x) + r * 2.5, h: r * 2.8 };
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
    this._shark(this._t);
    this._logoMark();
    this._stereoBody();

    for (const ring of ['L', 'R']) {
      this._soundWaves(ring);
      this._speaker(ring);
      if (chart) this._notes(ring, chart, songTime);
      this._thumbstick(ring, input);
      this._effects(ring, songTime);
    }

    this._console(scorer, chart);
    ctx.restore();

    if (this.glitch > 0.01) this._glitchOverlay();
    this.pulse *= 0.9;
    this.glitch *= 0.86;
  }

  _sky() {
    const { ctx, w, h } = this;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, COL.sky0); g.addColorStop(0.55, COL.sky1); g.addColorStop(1, COL.sky2);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // drifting clouds
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    for (let i = 0; i < 4; i++) {
      const cw = w * 0.22, cx = ((this._t * 12 + i * w * 0.31) % (w + cw)) - cw, cy = h * (0.12 + i * 0.09);
      ctx.beginPath(); ctx.ellipse(cx, cy, cw, cw * 0.32, 0, 0, Math.PI * 2); ctx.fill();
    }
    // rising bubbles
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    for (let i = 0; i < 14; i++) {
      const bx = (i * 97.3 % w), by = h - ((this._t * 30 + i * 60) % (h * 1.1)), br = 2 + (i % 4);
      ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
    }
  }

  _shark(t) {
    const { ctx, w, h } = this;
    const draw = (W, speed, yBase, alpha) => {
      const H = W * 0.34;
      const period = w + W * 2 + 200;
      const x = ((t * speed) % period) - (W + 150);
      const y = yBase + Math.sin(t * 0.7 + speed) * h * 0.025;
      const tail = Math.sin(t * 4 + speed) * H * 0.28;     // tail swish
      ctx.save(); ctx.translate(x, y); ctx.globalAlpha = alpha; ctx.fillStyle = COL.shark;
      // body
      ctx.beginPath();
      ctx.moveTo(W * 0.5, 0);                                            // nose
      ctx.bezierCurveTo(W * 0.3, -H * 0.7, W * 0.02, -H * 0.85, -W * 0.24, -H * 0.5); // back
      ctx.lineTo(-W * 0.5, -H * 0.75 - tail);                            // upper tail lobe
      ctx.lineTo(-W * 0.33, -H * 0.04);                                  // tail notch
      ctx.lineTo(-W * 0.5, H * 0.5 - tail);                              // lower tail lobe
      ctx.lineTo(-W * 0.24, H * 0.45);
      ctx.bezierCurveTo(W * 0.02, H * 0.8, W * 0.3, H * 0.62, W * 0.5, 0); // belly
      ctx.closePath(); ctx.fill();
      // dorsal fin
      ctx.beginPath(); ctx.moveTo(-W * 0.02, -H * 0.6); ctx.lineTo(W * 0.06, -H * 1.55); ctx.lineTo(W * 0.16, -H * 0.5); ctx.closePath(); ctx.fill();
      // pectoral fin
      ctx.beginPath(); ctx.moveTo(W * 0.14, H * 0.32); ctx.lineTo(W * 0.0, H * 1.2); ctx.lineTo(W * 0.26, H * 0.45); ctx.closePath(); ctx.fill();
      // gills + eye
      ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = Math.max(1, W * 0.006);
      for (let i = 0; i < 3; i++) { const gx = W * 0.28 - i * W * 0.04; ctx.beginPath(); ctx.moveTo(gx, -H * 0.28); ctx.lineTo(gx, H * 0.18); ctx.stroke(); }
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(W * 0.37, -H * 0.12, H * 0.07, 0, Math.PI * 2); ctx.fill();
      ctx.restore(); ctx.globalAlpha = 1;
    };
    draw(this.w * 0.13, 18, this.h * 0.18, 0.3);      // small far shark
    draw(this.w * 0.26, 40, this.h * 0.31, 0.7);      // big near shark
  }

  _logoMark() {
    const { ctx, w, h } = this;
    if (this._logoReady) {
      const s = Math.min(w * 0.075, 76);
      ctx.drawImage(this.logo, w / 2 - s / 2, h * 0.03, s, s);
      ctx.fillStyle = COL.text; ctx.font = `800 ${s * 0.26}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText('STEREO FLIX', w / 2, h * 0.03 + s + 2);
    }
  }

  _stereoBody() {
    const { ctx } = this;
    const b = this.body;
    ctx.lineWidth = Math.max(4, b.w * 0.008); ctx.strokeStyle = COL.chrome;
    ctx.beginPath(); ctx.arc(b.x + b.w / 2, b.y, b.w * 0.12, Math.PI * 1.2, Math.PI * 1.8); ctx.stroke();
    this._roundRect(b.x, b.y, b.w, b.h, 18);
    const g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
    g.addColorStop(0, COL.bodyHi); g.addColorStop(0.12, COL.body); g.addColorStop(1, COL.bodyLo);
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(95,142,194,0.5)'; ctx.stroke();
  }

  _soundWaves(ring) {
    const { ctx } = this;
    const sp = this.speakers[ring];
    const out = ring === 'L' ? -1 : 1;
    const c = ringColor(ring);
    for (let i = 0; i < 3; i++) {
      const phase = (this._t * 1.6 + i * 0.4) % 1.2;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, sp.r * (1.1 + phase * 0.7), out < 0 ? Math.PI * 0.72 : -Math.PI * 0.28, out < 0 ? Math.PI * 1.28 : Math.PI * 0.28);
      ctx.strokeStyle = this._alpha(c, (1 - phase) * 0.3 * (0.4 + this.pulse)); ctx.lineWidth = 3; ctx.stroke();
    }
  }

  _speaker(ring) {
    const { ctx } = this;
    const sp = this.speakers[ring];
    const c = ringColor(ring);
    ctx.beginPath(); ctx.arc(sp.x, sp.y, sp.r, 0, Math.PI * 2);
    const sg = ctx.createRadialGradient(sp.x, sp.y - sp.r * 0.25, sp.r * 0.2, sp.x, sp.y, sp.r);
    sg.addColorStop(0, COL.coneHi); sg.addColorStop(0.7, COL.cone); sg.addColorStop(1, '#05101e');
    ctx.fillStyle = sg; ctx.fill();
    ctx.save(); ctx.shadowColor = c; ctx.shadowBlur = 14 + this.pulse * 20;
    ctx.lineWidth = 4; ctx.strokeStyle = c; ctx.stroke(); ctx.restore();
    for (let i = 1; i <= 3; i++) { ctx.beginPath(); ctx.arc(sp.x, sp.y, sp.r * (1 - i * 0.2), 0, Math.PI * 2); ctx.strokeStyle = 'rgba(120,160,210,0.12)'; ctx.lineWidth = 1.5; ctx.stroke(); }
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      ctx.beginPath(); ctx.moveTo(sp.x + Math.cos(a) * sp.r * 0.92, sp.y + Math.sin(a) * sp.r * 0.92); ctx.lineTo(sp.x + Math.cos(a) * sp.r * 0.8, sp.y + Math.sin(a) * sp.r * 0.8);
      ctx.strokeStyle = this._alpha(c, 0.3); ctx.lineWidth = 2; ctx.stroke();
    }
  }

  // Notes slide IN from a long runway outside the speaker toward the rim at the push angle.
  _notes(ring, chart, songTime) {
    const { ctx } = this;
    const sp = this.speakers[ring];
    const runway = sp.r * 3.4;
    for (const n of chart.notes) {
      if (n.ring !== ring || n.judged) continue;
      const dt = n.time - songTime;
      if (dt > chart.meta.approachTime || dt < -0.16) continue;
      const v = dirVector(n.dir);
      const a = Math.atan2(v.y, v.x);
      const p = Math.max(0, Math.min(1, 1 - dt / chart.meta.approachTime));
      const dist = sp.r + runway * (1 - p);
      const x = sp.x + v.x * dist, y = sp.y + v.y * dist;
      const c = ringColor(ring);
      const near = Math.abs(dt) < 0.1;

      // target on the rim (where to push), bright/white in the hit window
      const rx = sp.x + v.x * sp.r, ry = sp.y + v.y * sp.r;
      ctx.beginPath(); ctx.arc(rx, ry, sp.r * (near ? 0.2 : 0.13), 0, Math.PI * 2);
      ctx.strokeStyle = this._alpha(near ? '#ffffff' : c, near ? 1 : 0.5); ctx.lineWidth = near ? 4 : 2; ctx.stroke();

      // travelling marker: a chevron pointing toward the speaker (the push direction)
      ctx.save(); ctx.translate(x, y); ctx.rotate(a + Math.PI);
      ctx.globalAlpha = Math.min(1, p * 2 + 0.2);
      ctx.shadowColor = c; ctx.shadowBlur = 12; ctx.fillStyle = near ? '#ffffff' : c;
      const s = sp.r * 0.32;
      ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(-s * 0.55, -s * 0.7); ctx.lineTo(-s * 0.2, 0); ctx.lineTo(-s * 0.55, s * 0.7); ctx.closePath(); ctx.fill();
      ctx.restore(); ctx.globalAlpha = 1;

      if (n.mod) { ctx.fillStyle = '#fff'; ctx.font = `700 ${sp.r * 0.3}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(MODS[n.mod] || n.mod, x, y - sp.r * 0.5); }
    }
  }

  _thumbstick(ring, input) {
    const { ctx } = this;
    const sp = this.speakers[ring];
    const s = input ? (ring === 'L' ? input.left : input.right) : { x: 0, y: 0, mag: 0 };
    const c = ringColor(ring);
    const baseR = sp.r * 0.42;
    const maxOff = sp.r * 0.34;                 // bigger, obvious movement
    const ox = (s.x || 0) * maxOff, oy = (s.y || 0) * maxOff;

    ctx.beginPath(); ctx.arc(sp.x, sp.y, baseR * 1.2, 0, Math.PI * 2); ctx.fillStyle = '#060c16'; ctx.fill();
    if ((s.mag || 0) > 0.04) {
      const gx = sp.x + ox, gy = sp.y + oy;
      const pg = ctx.createRadialGradient(gx, gy, 0, gx, gy, baseR * 1.5);
      pg.addColorStop(0, this._alpha(c, 0.55 * Math.min(1, s.mag))); pg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(gx, gy, baseR * 1.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = '#11161f'; ctx.lineWidth = baseR * 0.95; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(sp.x, sp.y); ctx.lineTo(sp.x + ox, sp.y + oy); ctx.stroke();

    const cx = sp.x + ox, cy = sp.y + oy, capR = baseR;
    const cg = ctx.createRadialGradient(cx - capR * 0.3, cy - capR * 0.4, capR * 0.1, cx, cy, capR);
    cg.addColorStop(0, '#54545e'); cg.addColorStop(0.5, '#272730'); cg.addColorStop(1, '#0e0e14');
    ctx.beginPath(); ctx.arc(cx, cy, capR, 0, Math.PI * 2); ctx.fillStyle = cg; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, capR * 0.92, 0, Math.PI * 2); ctx.strokeStyle = '#0a0a10'; ctx.lineWidth = capR * 0.16; ctx.stroke();
    const dg = ctx.createRadialGradient(cx, cy, capR * 0.1, cx, cy, capR * 0.72);
    dg.addColorStop(0, '#0d0d12'); dg.addColorStop(0.8, '#2c2c34'); dg.addColorStop(1, '#1a1a20');
    ctx.beginPath(); ctx.arc(cx, cy, capR * 0.72, 0, Math.PI * 2); ctx.fillStyle = dg; ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx - capR * 0.28, cy - capR * 0.34, capR * 0.22, capR * 0.13, -0.6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fill();
  }

  _effects(ring, songTime) {
    const { ctx } = this;
    const sp = this.speakers[ring];
    this.effects = this.effects.filter((e) => songTime - e.t0 < e.dur);
    for (const e of this.effects) {
      if (e.ring !== ring) continue;
      const age = (songTime - e.t0) / e.dur;
      const c = e.judgement === 'perfect' ? COL.perfect : e.judgement === 'good' ? COL.good : COL.miss;
      const v = dirVector(e.dir);
      const rx = sp.x + v.x * sp.r, ry = sp.y + v.y * sp.r;
      ctx.beginPath(); ctx.arc(rx, ry, sp.r * 0.25 * (1 + age * 1.5), 0, Math.PI * 2);
      ctx.strokeStyle = this._alpha(c, (1 - age) * 0.9); ctx.lineWidth = 4 * (1 - age); ctx.stroke();
      ctx.globalAlpha = 1 - age; ctx.fillStyle = c; ctx.font = `900 ${sp.r * 0.4}px system-ui`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(e.judgement.toUpperCase(), sp.x, sp.y - sp.r * 1.5 - age * 18);
      ctx.globalAlpha = 1;
    }
  }

  _console(scorer, chart) {
    const { ctx } = this;
    const d = this.console;
    const sc = scorer || { score: 0, combo: 0, accuracy: 1 };
    this._roundRect(d.x, d.y, d.w, d.h, 10);
    const g = ctx.createLinearGradient(0, d.y, 0, d.y + d.h);
    g.addColorStop(0, '#0a1422'); g.addColorStop(1, '#04080f');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(95,142,194,0.45)'; ctx.lineWidth = 2; ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = COL.dim; ctx.font = `600 ${d.h * 0.1}px system-ui`; ctx.textBaseline = 'top';
    ctx.fillText((chart && chart.meta.title) || 'insert a track', d.x + d.w / 2, d.y + d.h * 0.08, d.w * 0.92);

    ctx.fillStyle = COL.text; ctx.font = `900 ${d.h * 0.34}px system-ui`; ctx.textBaseline = 'middle';
    ctx.fillText(sc.combo > 0 ? `${sc.combo}x` : '♪', d.x + d.w / 2, d.y + d.h * 0.46);

    const bars = 9, bw = d.w * 0.055, gap = (d.w * 0.8 - bars * bw) / (bars - 1), x0 = d.x + d.w * 0.1;
    for (let i = 0; i < bars; i++) {
      const lvl = Math.max(0.08, (0.5 + 0.5 * Math.sin(this._t * 8 + i)) * (0.4 + this.pulse));
      const bh = d.h * 0.16 * lvl, x = x0 + i * (bw + gap), yb = d.y + d.h * 0.7;
      ctx.fillStyle = this._alpha(i < bars / 2 ? COL.L : COL.R, 0.4 + lvl * 0.5);
      ctx.fillRect(x, yb - bh, bw, bh);
    }
    ctx.fillStyle = COL.dim; ctx.font = `700 ${d.h * 0.1}px ui-monospace, monospace`; ctx.textBaseline = 'bottom';
    ctx.fillText(`${String(sc.score).padStart(7, '0')}  ${(sc.accuracy * 100).toFixed(1)}%`, d.x + d.w / 2, d.y + d.h * 0.97);
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

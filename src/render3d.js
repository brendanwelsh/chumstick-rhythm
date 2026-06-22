// render3d.js — STEREO FLIX, Miami-neon / synthwave (Three.js / WebGL).
//
// The stage: an Outrun sunset (gradient sky + retro sun + palm silhouettes) behind a glowing
// neon grid. Two analog STICKS face the player, each ringed by 8 TRIGGER PADS (the 8 flick
// directions). A note lights the pad you must push into; the on-screen stick tilts with your
// real stick, and pushing into the lit pad on time TRIGGERS it. Hits keep the song clean;
// misses glitch (handled in audio.js). No abstract orbs.
//
// API (unchanged for main.js): new Renderer(canvas) · drawGame(state) · addEffect(e) ·
//   addFlick(f) · .effects .flickFx .pulse

import * as THREE from 'three';
import { dirVector, DIRS } from './chart.js';

const COL = {
  L: 0x05d9e8, R: 0xff2d95, accent: 0xb967ff,
  miss: 0xff3b3b, perfect: 0xfff27a, good: 0x6effc7,
  grid: 0xff2d95, gridCenter: 0x05d9e8,
};
const UNIT_X = 3.1;     // left/right stick offset
const PAD_R = 1.45;     // radius of the ring of 8 trigger pads
const MAX_TILT = 0.95;  // stick lean at full push (reaches the pads)

const ringColor = (r) => (r === 'L' ? COL.L : COL.R);
// screen dir (x, y) maps to ground plane (x, z): up (y=-1) -> away (-z)
const groundVec = (dir) => { const v = dirVector(dir); return { x: v.x, z: v.y }; };
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.effects = [];
    this.flickFx = [];
    this.pulse = 0;
    this._t = 0;
    this._noteMeshes = new Map();
    this._snap = { L: { x: 0, z: 0, a: 0 }, R: { x: 0, z: 0, a: 0 } };

    this.three = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.three.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.three.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x2a0d3f, 14, 40);

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);
    this.camera.position.set(0, 5.2, 9.6);
    this.camera.lookAt(0, 1.0, -3);

    this._approachGeo = new THREE.TorusGeometry(0.42, 0.05, 10, 28);
    this._padGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.09, 24);

    this._lights();
    this._backdrop();
    this._grid();
    this._units();

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.three.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // --- scene ---------------------------------------------------------------
  _lights() {
    this.scene.add(new THREE.HemisphereLight(0xff6ec7, 0x2a0d3f, 1.0));
    this.scene.add(new THREE.AmbientLight(0x6a4a8a, 0.7));
    const key = new THREE.DirectionalLight(0xffd0e0, 0.7); key.position.set(0, 6, 8); this.scene.add(key);
    const pL = new THREE.PointLight(COL.L, 12, 16, 2); pL.position.set(-UNIT_X, 2.5, 3); this.scene.add(pL);
    const pR = new THREE.PointLight(COL.R, 12, 16, 2); pR.position.set(UNIT_X, 2.5, 3); this.scene.add(pR);
  }

  _backdrop() {
    const cv = document.createElement('canvas');
    cv.width = 1024; cv.height = 576;
    const x = cv.getContext('2d');

    // sunset sky
    const sky = x.createLinearGradient(0, 0, 0, cv.height);
    sky.addColorStop(0.00, '#190b2e');
    sky.addColorStop(0.42, '#5b1a6b');
    sky.addColorStop(0.62, '#c11e6f');
    sky.addColorStop(0.78, '#ff5d6c');
    sky.addColorStop(0.90, '#ff9a3d');
    sky.addColorStop(1.00, '#ffcf6b');
    x.fillStyle = sky; x.fillRect(0, 0, cv.width, cv.height);

    // stars
    x.fillStyle = 'rgba(255,255,255,0.8)';
    for (let i = 0; i < 90; i++) {
      const sx = Math.random() * cv.width, sy = Math.random() * cv.height * 0.4;
      x.globalAlpha = Math.random() * 0.8; x.fillRect(sx, sy, 2, 2);
    }
    x.globalAlpha = 1;

    // retro sun with horizontal scanline gaps
    const cx = cv.width / 2, cy = cv.height * 0.52, R = 165;
    const sun = x.createLinearGradient(0, cy - R, 0, cy + R);
    sun.addColorStop(0, '#fff27a'); sun.addColorStop(0.5, '#ff8a3d'); sun.addColorStop(1, '#ff2d95');
    x.save();
    x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.clip();
    x.fillStyle = sun; x.fillRect(cx - R, cy - R, R * 2, R * 2);
    x.fillStyle = '#190b2e';
    for (let i = 0; i < 9; i++) { const gy = cy + i * 13; x.fillRect(cx - R, gy, R * 2, 4 + i); } // widening gaps
    x.restore();

    // horizon glow
    const hg = x.createLinearGradient(0, cy + R * 0.4, 0, cy + R * 1.1);
    hg.addColorStop(0, 'rgba(255,120,180,0)'); hg.addColorStop(1, 'rgba(255,200,120,0.5)');
    x.fillStyle = hg; x.fillRect(0, cy, cv.width, R);

    // palm silhouettes
    const palm = (px, py, s, flip) => {
      x.save(); x.translate(px, py); x.scale(flip ? -s : s, s); x.fillStyle = '#0a0512'; x.strokeStyle = '#0a0512';
      x.lineWidth = 7; x.lineCap = 'round';
      x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(-6, -55, 6, -120); x.lineWidth = 10; x.stroke(); // trunk
      for (let i = 0; i < 7; i++) {
        const a = (-Math.PI / 2) + (i - 3) * 0.5;
        x.beginPath(); x.moveTo(6, -120);
        x.quadraticCurveTo(6 + Math.cos(a) * 55, -120 + Math.sin(a) * 55, 6 + Math.cos(a) * 95, -120 + Math.sin(a) * 30);
        x.lineWidth = 7; x.stroke();
      }
      x.restore();
    };
    // sit the palms above the horizon line so the floor doesn't hide them
    palm(150, 388, 2.0, false);
    palm(345, 392, 1.3, false);
    palm(cv.width - 140, 388, 2.2, true);
    palm(cv.width - 330, 392, 1.4, true);

    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 67),
      new THREE.MeshBasicMaterial({ map: tex, fog: false, depthWrite: false })
    );
    plane.position.set(0, 18, -34);
    this.scene.add(plane);
  }

  _grid() {
    const grid = new THREE.GridHelper(160, 80, COL.gridCenter, COL.grid);
    grid.position.set(0, 0.01, -50);
    grid.material.transparent = true; grid.material.opacity = 0.8;
    this.scene.add(grid);
    // dark reflective floor under the grid
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({ color: 0x140a22, metalness: 0.7, roughness: 0.35 })
    );
    floor.rotation.x = -Math.PI / 2; floor.position.y = 0;
    this.scene.add(floor);
  }

  _units() {
    this.units = {};
    for (const side of ['L', 'R']) {
      const c = ringColor(side);
      const g = new THREE.Group(); g.position.set(side === 'L' ? -UNIT_X : UNIT_X, 0, 2.4);

      // glowing base disc (this is "the circle" — now clearly the ring of trigger pads)
      const disc = new THREE.Mesh(
        new THREE.CylinderGeometry(PAD_R + 0.45, PAD_R + 0.55, 0.12, 48),
        new THREE.MeshStandardMaterial({ color: 0x1a0f2e, emissive: c, emissiveIntensity: 0.18, metalness: 0.5, roughness: 0.4 })
      );
      disc.position.y = 0.06; g.add(disc);

      // 8 trigger pads around the rim
      const pads = {};
      for (const dir of DIRS) {
        const v = groundVec(dir);
        const mat = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.15, metalness: 0.3, roughness: 0.5, transparent: true, opacity: 0.9 });
        const pad = new THREE.Mesh(this._padGeo, mat);
        pad.position.set(v.x * PAD_R, 0.14, v.z * PAD_R);
        g.add(pad);
        pads[dir] = { mesh: pad, mat, base: 0.15 };
      }

      // base knob + tilting stick
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.58, 0.4, 24),
        new THREE.MeshStandardMaterial({ color: 0x241433, metalness: 0.6, roughness: 0.4 }));
      base.position.y = 0.22; g.add(base);
      const pivot = new THREE.Group(); pivot.position.y = 0.42; g.add(pivot);
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.23, 1.25, 18),
        new THREE.MeshStandardMaterial({ color: 0x140a22, metalness: 0.5, roughness: 0.5 }));
      shaft.position.y = 0.62; pivot.add(shaft);
      const capMat = new THREE.MeshStandardMaterial({ color: 0x241433, emissive: c, emissiveIntensity: 0.5, metalness: 0.4, roughness: 0.3 });
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.4, 0.26, 28), capMat);
      cap.position.y = 1.3; pivot.add(cap);
      const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.06, 10, 28), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.8 }));
      cuff.rotation.x = Math.PI / 2; cuff.position.y = 1.18; pivot.add(cuff);

      this.scene.add(g);
      this.units[side] = { group: g, pivot, capMat, pads };
    }
  }

  // --- effects -------------------------------------------------------------
  addEffect({ judgement, ring, dir, t }) {
    this.effects.push({ ring, dir, judgement, t0: t, dur: judgement === 'miss' ? 0.45 : 0.55 });
    if (judgement !== 'miss') {
      this.pulse = 1;
      const v = groundVec(dir); const s = this._snap[ring]; s.x = v.x; s.z = v.z; s.a = 1;
    }
  }

  addFlick({ ring, dir, mag = 1, t }) {
    this.flickFx.push({ ring, dir, t0: t, dur: 0.2 });
    const v = groundVec(dir); const s = this._snap[ring]; s.x = v.x; s.z = v.z; s.a = Math.max(s.a, 0.85);
  }

  // --- per-frame -----------------------------------------------------------
  drawGame(state) {
    const { chart, songTime, input } = state;
    this._t += 1 / 60;
    // gentle camera sway
    this.camera.position.x = Math.sin(this._t * 0.2) * 0.5;
    this.camera.position.y = 5.2 + Math.sin(this._t * 0.35) * 0.12;
    this.camera.lookAt(0, 1.0, -3);

    this._resetPads();
    this._updateNotes(chart, songTime);
    this._updateSticks(input);
    this._updatePadFx(songTime);

    this.pulse *= 0.9;
    this.three.render(this.scene, this.camera);
  }

  _resetPads() {
    for (const side of ['L', 'R']) {
      for (const dir of DIRS) {
        const p = this.units[side].pads[dir];
        p.mat.emissiveIntensity = p.base;
        p.mat.color.setHex(ringColor(side));
        p.mat.emissive.setHex(ringColor(side));
        p.mesh.scale.setScalar(1);
      }
    }
  }

  _updateNotes(chart, songTime) {
    const live = new Set();
    for (const n of chart.notes) {
      const hold = n.hold || 0;
      const dt = n.time - songTime;
      if (dt > chart.meta.approachTime || songTime - (n.time + hold) > 0.3) continue;
      if (n.judged && songTime - n.time > 0.25) continue;
      live.add(n.id);

      let e = this._noteMeshes.get(n.id);
      if (!e) e = this._makeNote(n);
      const p = Math.min(1.2, 1 - dt / chart.meta.approachTime);
      const ep = easeOut(Math.max(0, Math.min(1, p)));

      // approach ring descends + shrinks onto the pad
      e.group.position.y = 0.16 + 2.4 * (1 - ep);
      e.ring.scale.setScalar(1 + 2.2 * (1 - ep));
      e.mat.opacity = n.judged ? Math.max(0, 0.7 - (songTime - n.time) * 4) : Math.min(1, p * 2.5);

      // light the target pad: brighter as the note nears, white in the hit window = PUSH NOW
      const pad = this.units[n.ring].pads[n.dir];
      const near = Math.abs(dt) < 0.1 && !n.judged;
      const closeness = Math.max(0, 1 - Math.abs(dt) / 0.6);
      const col = near ? 0xffffff : ringColor(n.ring);
      pad.mat.emissiveIntensity = Math.max(pad.mat.emissiveIntensity, 0.25 + closeness * 1.4 + (near ? 1.6 : 0));
      pad.mat.color.setHex(col); pad.mat.emissive.setHex(col);
      pad.mesh.scale.setScalar(near ? 1.4 : 1 + closeness * 0.25);
      e.mat.color.setHex(col); e.mat.emissive.setHex(col);
      if (e.tail) e.tail.visible = !n.judged || n.holdActive;
    }
    for (const [id, e] of this._noteMeshes) {
      if (!live.has(id)) { this.scene.remove(e.group); e.mat.dispose(); this._noteMeshes.delete(id); }
    }
  }

  _makeNote(n) {
    const c = ringColor(n.ring);
    const v = groundVec(n.dir);
    const u = this.units[n.ring];
    const group = new THREE.Group();
    group.position.set(u.group.position.x + v.x * PAD_R, 0.16, u.group.position.z + v.z * PAD_R);

    const mat = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.9, transparent: true, opacity: 0 });
    const ring = new THREE.Mesh(this._approachGeo, mat);
    ring.rotation.x = -Math.PI / 2; // lie flat over the pad
    group.add(ring);

    let tail = null;
    if ((n.hold || 0) > 0) {
      const h = Math.min(3, n.hold * 2.2);
      tail = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, h, 8),
        new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.5, transparent: true, opacity: 0.5 }));
      tail.position.y = h / 2; group.add(tail);
    }
    this.scene.add(group);
    const e = { group, ring, mat, tail };
    this._noteMeshes.set(n.id, e);
    return e;
  }

  _updateSticks(input) {
    for (const side of ['L', 'R']) {
      const u = this.units[side];
      const s = input ? (side === 'L' ? input.left : input.right) : { x: 0, y: 0, mag: 0 };
      const snap = this._snap[side];
      // live push (screen y-up: input.y up = -1 -> lean away) blended with a decaying hit-snap
      const ix = (s.x || 0) * 0.85 + snap.x * snap.a;
      const iz = (s.y || 0) * 0.85 + snap.z * snap.a; // s.y already y-down; pad z uses same sign
      u.pivot.rotation.z = -THREE.MathUtils.clamp(ix, -1.2, 1.2) * MAX_TILT;
      u.pivot.rotation.x = THREE.MathUtils.clamp(iz, -1.2, 1.2) * MAX_TILT;
      u.capMat.emissiveIntensity = 0.4 + (s.mag || 0) * 1.2 + snap.a * 0.8;
      snap.a *= 0.85;
    }
  }

  _updatePadFx(songTime) {
    this.effects = this.effects.filter((e) => songTime - e.t0 < e.dur);
    this.flickFx = this.flickFx.filter((f) => songTime - f.t0 < f.dur);
    for (const e of this.effects) {
      const pad = this.units[e.ring].pads[e.dir];
      const age = (songTime - e.t0) / e.dur;
      const flash = 1 - age;
      const col = e.judgement === 'perfect' ? COL.perfect : e.judgement === 'good' ? COL.good : COL.miss;
      pad.mat.color.setHex(col); pad.mat.emissive.setHex(col);
      pad.mat.emissiveIntensity = Math.max(pad.mat.emissiveIntensity, 0.4 + flash * 2.2);
      pad.mesh.scale.setScalar(1 + flash * (e.judgement === 'miss' ? 0.15 : 0.5));
    }
  }
}

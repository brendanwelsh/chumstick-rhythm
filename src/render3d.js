// render3d.js — STEREO FLIX renderer in Three.js (WebGL).
//
// A calm, flowy 3D stage: a real boombox model sits in back; two glowing speaker-rings float
// in front (left = teal, right = rose). Notes flow in from depth toward the ring edge along
// their flick direction. A 3D mock thumbstick under each ring tilts with your stick and snaps
// to the note direction when you hit. Hold notes carry a trailing tail.
//
// Public API mirrors the old canvas renderer so main.js is unchanged in shape:
//   new Renderer(canvas) · drawGame(state) · addEffect(e) · addFlick(f) · .effects .flickFx .pulse

import * as THREE from 'three';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { dirVector } from './chart.js';

const COL = { L: 0x37c9d6, R: 0xe06a9c, bg: 0x080a12, fog: 0x0a0e1a };
const RING = { x: 3.0, y: 0.4, r: 1.15, tube: 0.085 };
const APPROACH_DEPTH = 16;   // how far back (−z) a note spawns
const OUT = 1.4;             // how far outside the ring a note starts, radially

// screen-space (y-down) dir vector -> 3D (y-up)
function dir3(dir) { const v = dirVector(dir); return new THREE.Vector3(v.x, -v.y, 0); }
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.effects = [];
    this.flickFx = [];
    this.pulse = 0;
    this._t = 0;
    this._noteMeshes = new Map(); // note.id -> {group, mat, tail}
    this._stickSnap = { L: { v: new THREE.Vector3(), a: 0 }, R: { v: new THREE.Vector3(), a: 0 } };

    this.three = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.three.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.three.outputColorSpace = THREE.SRGBColorSpace;
    this.three.toneMapping = THREE.ACESFilmicToneMapping;
    this.three.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(COL.bg);
    this.scene.fog = new THREE.Fog(COL.fog, 18, 46);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    this.camera.position.set(0, 1.4, 9);
    this.camera.lookAt(0, 0.4, 0);

    this._sharedNoteGeo = new THREE.ConeGeometry(0.22, 0.5, 4);
    this._sharedTailGeo = new THREE.CylinderGeometry(0.05, 0.05, 1, 6);
    this._sharedGateGeo = new THREE.TorusGeometry(0.30, 0.06, 12, 28);

    this._lights();
    this._rings();
    this._sticks();
    this._cursors();
    this._atmosphere();
    this._boombox();

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

  // --- scene setup --------------------------------------------------------
  _lights() {
    this.scene.add(new THREE.HemisphereLight(0x9fb4ff, 0x12101a, 0.85));
    this.scene.add(new THREE.AmbientLight(0x404a6a, 0.6));
    const key = new THREE.DirectionalLight(0xffffff, 0.7);
    key.position.set(2, 5, 6);
    this.scene.add(key);
    const pL = new THREE.PointLight(COL.L, 14, 18, 2); pL.position.set(-RING.x, RING.y, 2.5);
    const pR = new THREE.PointLight(COL.R, 14, 18, 2); pR.position.set(RING.x, RING.y, 2.5);
    this.scene.add(pL, pR);
    // dedicated light so the boombox model reads against the dark stage
    const bb = new THREE.PointLight(0xfff0d8, 26, 26, 2); bb.position.set(0, 2.4, -1.5);
    this.scene.add(bb);
  }

  _rings() {
    this.rings = {};
    for (const side of ['L', 'R']) {
      const g = new THREE.Group();
      g.position.set(side === 'L' ? -RING.x : RING.x, RING.y, 0);
      const mat = new THREE.MeshStandardMaterial({
        color: COL[side], emissive: COL[side], emissiveIntensity: 0.5, metalness: 0.4, roughness: 0.3,
      });
      const torus = new THREE.Mesh(new THREE.TorusGeometry(RING.r, RING.tube, 18, 64), mat);
      g.add(torus);
      // 8 faint direction pips
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        const pip = new THREE.Mesh(
          new THREE.SphereGeometry(0.05, 8, 8),
          new THREE.MeshStandardMaterial({ color: COL[side], emissive: COL[side], emissiveIntensity: 0.35, roughness: 0.5 })
        );
        pip.position.set(Math.cos(a) * RING.r, Math.sin(a) * RING.r, 0);
        g.add(pip);
      }
      this.rings[side] = { group: g, torus, mat };
      this.scene.add(g);
    }
  }

  _sticks() {
    this.sticks = {};
    for (const side of ['L', 'R']) {
      const root = new THREE.Group();
      root.position.set(side === 'L' ? -RING.x : RING.x, RING.y - RING.r - 0.95, 0.3);
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.5, 0.18, 24),
        new THREE.MeshStandardMaterial({ color: 0x1a1d2a, metalness: 0.6, roughness: 0.4 })
      );
      root.add(base);
      // pivot that tilts; the stick + cap are children so they lean as one
      const pivot = new THREE.Group(); pivot.position.y = 0.05; root.add(pivot);
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.16, 0.5, 16),
        new THREE.MeshStandardMaterial({ color: 0x2a2f40, metalness: 0.5, roughness: 0.5 })
      );
      shaft.position.y = 0.25; pivot.add(shaft);
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.26, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.6),
        new THREE.MeshStandardMaterial({ color: COL[side], emissive: COL[side], emissiveIntensity: 0.25, metalness: 0.3, roughness: 0.4 })
      );
      cap.position.y = 0.5; cap.scale.y = 0.6; pivot.add(cap);
      this.sticks[side] = { root, pivot, cap };
      this.scene.add(root);
    }
  }

  // A big, bright cursor INSIDE each ring that tracks the live stick in real time — the main
  // "are my sticks moving?" feedback. A line from center shows the push direction/strength.
  _cursors() {
    this.cursors = {};
    for (const side of ['L', 'R']) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0xffffff, emissive: COL[side], emissiveIntensity: 1.0, metalness: 0.2, roughness: 0.25,
      });
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 16), mat);
      dot.position.set(0, 0, 0.15);
      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0.1), new THREE.Vector3(0, 0, 0.1),
      ]);
      const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: COL[side], transparent: true, opacity: 0.7 }));
      this.rings[side].group.add(line, dot);
      this.cursors[side] = { dot, line, mat };
    }
  }

  _updateCursors(input) {
    for (const side of ['L', 'R']) {
      const s = input ? (side === 'L' ? input.left : input.right) : { x: 0, y: 0, mag: 0 };
      const px = (s.x || 0) * RING.r, py = -(s.y || 0) * RING.r; // screen y-down -> 3D y-up
      const c = this.cursors[side];
      c.dot.position.set(px, py, 0.15);
      const mag = s.mag || 0;
      c.dot.scale.setScalar(0.8 + mag * 0.6);
      c.mat.emissiveIntensity = 0.7 + mag * 1.8;
      const p = c.line.geometry.attributes.position;
      p.setXYZ(1, px, py, 0.1); p.needsUpdate = true;
      c.line.material.opacity = 0.25 + mag * 0.6;
    }
  }

  _atmosphere() {
    // drifting dust for a sense of flow
    const N = 220, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 36;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 20;
      pos[i * 3 + 2] = -Math.random() * 26 + 4;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this._dust = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x6f7aa6, size: 0.05, transparent: true, opacity: 0.5 }));
    this.scene.add(this._dust);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 80),
      new THREE.MeshStandardMaterial({ color: 0x0c0f1a, metalness: 0.7, roughness: 0.45 })
    );
    floor.rotation.x = -Math.PI / 2; floor.position.y = -2.6;
    this.scene.add(floor);
  }

  _boombox() {
    // A small backdrop set well BEHIND and BELOW the rings so it can never occlude gameplay.
    this.boombox = new THREE.Group();
    this.boombox.position.set(0, -1.8, -10);
    this.scene.add(this.boombox);
    try {
      new GLTFLoader().load('models/boombox.glb', (gltf) => {
        const obj = gltf.scene;
        const box = new THREE.Box3().setFromObject(obj);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = (isFinite(maxDim) && maxDim > 0) ? 4.5 / maxDim : 1; // model is ~2cm
        obj.scale.setScalar(scale);
        obj.position.sub(center.multiplyScalar(scale));
        this.boombox.add(obj);
      }, undefined, () => this._primitiveBoombox());
    } catch { this._primitiveBoombox(); }
  }

  _primitiveBoombox() {
    const g = this.boombox;
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x20232f, metalness: 0.6, roughness: 0.4 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(7, 3, 1.4), bodyMat);
    g.add(body);
    for (const sx of [-1, 1]) {
      const cone = new THREE.Mesh(
        new THREE.CylinderGeometry(1.05, 1.05, 0.3, 32),
        new THREE.MeshStandardMaterial({ color: 0x14161f, metalness: 0.5, roughness: 0.5 })
      );
      cone.rotation.x = Math.PI / 2; cone.position.set(sx * 2.1, 0, 0.75); g.add(cone);
    }
    const handle = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.08, 12, 24, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0x5a5a7a, metalness: 0.8, roughness: 0.3 }));
    handle.position.set(0, 1.5, 0); g.add(handle);
  }

  // --- effects ------------------------------------------------------------
  addEffect({ judgement, ring, dir, t }) {
    this.effects.push({ ring, dir, judgement, t0: t, dur: judgement === 'miss' ? 0.4 : 0.55 });
    if (judgement !== 'miss') {
      this.pulse = 1;
      const s = this._stickSnap[ring]; s.v.copy(dir3(dir)); s.a = 1; // snap the thumbstick
    }
  }

  addFlick({ ring, dir, mag = 1, t }) {
    this.flickFx.push({ ring, dir, mag, t0: t, dur: 0.25 });
    const s = this._stickSnap[ring]; s.v.copy(dir3(dir)); s.a = Math.max(s.a, 0.85);
  }

  // --- per-frame ----------------------------------------------------------
  drawGame(state) {
    const { chart, songTime, input } = state;
    this._t += 1 / 60;

    // flowy idle motion
    this.camera.position.x = Math.sin(this._t * 0.25) * 0.5;
    this.camera.position.y = 1.4 + Math.sin(this._t * 0.4) * 0.12;
    this.camera.lookAt(0, 0.4, 0);
    if (this.boombox) { this.boombox.rotation.y = Math.sin(this._t * 0.3) * 0.12; this.boombox.position.y = -0.2 + Math.sin(this._t * 0.6) * 0.06; }
    if (this._dust) this._dust.rotation.y = this._t * 0.02;

    this._updateNotes(chart, songTime);
    this._updateCursors(input);
    this._updateSticks(input);
    this._updateRingFx(songTime);

    this.pulse *= 0.9;
    this.three.render(this.scene, this.camera);
  }

  _updateNotes(chart, songTime) {
    const live = new Set();
    for (const n of chart.notes) {
      const hold = n.hold || 0;
      const dt = n.time - songTime;
      if (dt > chart.meta.approachTime || songTime - (n.time + hold) > 0.3) continue;
      if (n.judged && songTime - n.time > 0.25) continue;
      live.add(n.id);

      let entry = this._noteMeshes.get(n.id);
      if (!entry) entry = this._makeNote(n);
      const p = Math.min(1.2, 1 - dt / chart.meta.approachTime);
      const ep = easeOut(Math.max(0, Math.min(1, p)));
      const center = this.rings[n.ring].group.position;
      const v = dir3(n.dir);
      const radial = RING.r + OUT * (1 - ep);
      const z = -APPROACH_DEPTH * (1 - ep);
      entry.group.position.set(center.x + v.x * radial, center.y + v.y * radial, z);
      // fade in, and dim once judged/hit
      const appear = Math.min(1, p * 2.5);
      entry.mat.opacity = n.judged ? Math.max(0, 0.6 - (songTime - n.time) * 3) : appear;
      entry.mat.emissiveIntensity = n.judged ? 0.2 : 0.7;
      if (entry.tail) entry.tail.visible = !n.judged || n.holdActive;

      // Target gate: fixed on the ring at the push direction. Brightens as the note nears,
      // and snaps to white + grows in the hit window = "PUSH HERE NOW".
      if (entry.gate) {
        const near = Math.abs(dt) < 0.1;
        const closeness = Math.max(0, 1 - Math.abs(dt) / 0.6);
        const col = (near && !n.judged) ? 0xffffff : COL[n.ring];
        entry.gateMat.color.setHex(col);
        entry.gateMat.emissive.setHex(col);
        entry.gateMat.emissiveIntensity = 0.4 + closeness * 1.3 + (near ? 1.8 : 0);
        entry.gateMat.opacity = n.judged ? Math.max(0, 0.6 - (songTime - n.time) * 4) : 0.45 + closeness * 0.5;
        entry.gate.scale.setScalar((near && !n.judged) ? 1.5 : 1 + closeness * 0.25);
      }
    }
    // dispose meshes that are no longer live
    for (const [id, e] of this._noteMeshes) {
      if (!live.has(id)) {
        this.scene.remove(e.group); e.mat.dispose();
        if (e.gate) { this.rings[e.ring].group.remove(e.gate); e.gateMat.dispose(); }
        this._noteMeshes.delete(id);
      }
    }
  }

  _makeNote(n) {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: n.mod ? 0xffffff : COL[n.ring], emissive: COL[n.ring], emissiveIntensity: 0.7,
      metalness: 0.3, roughness: 0.35, transparent: true, opacity: 0,
    });
    const cone = new THREE.Mesh(this._sharedNoteGeo, mat);
    // point the cone (+Y) along the flick direction
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir3(n.dir).normalize());
    group.add(cone);

    let tail = null;
    const hold = n.hold || 0;
    if (hold > 0) {
      const len = Math.min(8, hold * (APPROACH_DEPTH / 1.5)); // visual length ∝ hold time
      tail = new THREE.Mesh(this._sharedTailGeo, new THREE.MeshStandardMaterial({
        color: COL[n.ring], emissive: COL[n.ring], emissiveIntensity: 0.4, transparent: true, opacity: 0.5,
      }));
      tail.scale.y = len;
      tail.position.z = -len / 2;           // trail backward in z
      tail.rotation.x = Math.PI / 2;
      group.add(tail);
    }
    this.scene.add(group);

    // Fixed target gate on the ring at the push direction (where the stick cursor must go).
    const gv = dir3(n.dir);
    const gateMat = new THREE.MeshStandardMaterial({
      color: COL[n.ring], emissive: COL[n.ring], emissiveIntensity: 0.4,
      metalness: 0.2, roughness: 0.4, transparent: true, opacity: 0.5,
    });
    const gate = new THREE.Mesh(this._sharedGateGeo, gateMat);
    gate.position.set(gv.x * RING.r, gv.y * RING.r, 0.05);
    this.rings[n.ring].group.add(gate);

    const entry = { group, mat, tail, gate, gateMat, ring: n.ring };
    this._noteMeshes.set(n.id, entry);
    return entry;
  }

  _updateSticks(input) {
    for (const side of ['L', 'R']) {
      const s = this.sticks[side];
      const live = input ? (side === 'L' ? input.left : input.right) : { x: 0, y: 0 };
      const snap = this._stickSnap[side];
      // blend live tilt with a decaying snap toward the last hit direction
      const tx = (live.x || 0) * 0.6 + snap.v.x * snap.a * 0.7;
      const ty = (-live.y || 0) * 0.6 + snap.v.y * snap.a * 0.7;
      const maxTilt = 0.7;
      s.pivot.rotation.z = -THREE.MathUtils.clamp(tx, -1, 1) * maxTilt;
      s.pivot.rotation.x = THREE.MathUtils.clamp(ty, -1, 1) * maxTilt;
      const lit = 0.25 + snap.a * 0.9;
      s.cap.material.emissiveIntensity = lit;
      snap.a *= 0.86;
    }
  }

  _updateRingFx(songTime) {
    this.effects = this.effects.filter((e) => songTime - e.t0 < e.dur);
    this.flickFx = this.flickFx.filter((f) => songTime - f.t0 < f.dur);
    for (const side of ['L', 'R']) {
      let flash = 0;
      for (const e of this.effects) if (e.ring === side) flash = Math.max(flash, 1 - (songTime - e.t0) / e.dur);
      const r = this.rings[side];
      r.mat.emissiveIntensity = 0.5 + flash * 1.6 + this.pulse * 0.3;
      const sc = 1 + flash * 0.12;
      r.torus.scale.setScalar(sc);
    }
  }
}

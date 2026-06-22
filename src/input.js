// input.js — GamepadInput: Gamepad API polling + hysteresis flick detection.
//
// This game is CONTROLLER-ONLY on purpose: it needs real analog sticks you can flick and flow.
// The keyboard only confirms/cancels menus — it can't play. Use the on-screen tester (title
// screen) to verify your pad: it shows every axis/button live.
//
// Standard mapping (Chrome): axes 0,1 = left stick · 2,3 = right stick (y-down).
//   buttons 0 ✕ · 1 ◯ · 2 ▢ · 3 △ · 4 L1 · 5 R1 · 6 L2 · 7 R2 · 8 share · 9 options
//           10 L3 · 11 R3 · 12 ↑ · 13 ↓ · 14 ← · 15 → · 16 PS

import { vectorToDir } from './chart.js';

const MOD_BUTTONS = { 4: 'L1', 5: 'R1', 6: 'L2', 7: 'R2', 0: 'cross', 1: 'circle', 2: 'square', 3: 'triangle' };
export const BUTTON_LABELS = ['✕', '◯', '▢', '△', 'L1', 'R1', 'L2', 'R2', 'Share', 'Options', 'L3', 'R3', '↑', '↓', '←', '→', 'PS'];

export class GamepadInput {
  constructor() {
    this.flickThreshold = 0.5;
    this.releaseThreshold = 0.3;
    this.holdThreshold = 0.45;
    this.deadzone = 0.12;
    this.padId = null;
    this._pad = null;            // last gamepad snapshot (for the tester)

    window.addEventListener('gamepadconnected', (e) => { this.padId = e.gamepad.id; });
    window.addEventListener('gamepaddisconnected', () => { this.padId = null; });

    this._fired = { L: false, R: false };
    this.left = { x: 0, y: 0, mag: 0 };
    this.right = { x: 0, y: 0, mag: 0 };
    this.flicks = [];
    this.menu = [];
    this._prevButtons = {};
    this._just = {};
    this._installKeyboard();
  }

  // --- gamepad access ------------------------------------------------------
  _getPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) if (p && p.axes && p.axes.length >= 2) return p;
    return null;
  }

  get connected() { return this._getPad() != null; }
  get axesCount() { return this._pad ? this._pad.axes.length : 0; }
  get mapping() { return this._pad ? (this._pad.mapping || 'non-standard') : ''; }

  /** Left/right stick axes, adapting to the DualSense's non-standard 6-axis layout. */
  _stickAxes(pad) {
    const a = pad.axes;
    let lx = a[0] || 0, ly = a[1] || 0, rx = a[2] || 0, ry = a[3] || 0;
    // Many DualSense/DS4 setups expose a non-standard layout where 2 & 5 are the right stick
    // and 3 & 4 are the triggers. Detect by axis count + mapping.
    if (pad.mapping !== 'standard' && a.length >= 6) { rx = a[2] || 0; ry = a[5] || 0; }
    return { lx, ly, rx, ry };
  }

  triggers() {
    const p = this._pad; if (!p) return { L2: 0, R2: 0 };
    const v = (i) => (p.buttons[i] ? p.buttons[i].value || (p.buttons[i].pressed ? 1 : 0) : 0);
    return { L2: v(6), R2: v(7) };
  }
  bothTriggers() { const t = this.triggers(); return t.L2 > 0.5 && t.R2 > 0.5; }

  buttonStates() {
    const p = this._pad; if (!p) return [];
    return p.buttons.map((b, i) => ({ label: BUTTON_LABELS[i] || ('b' + i), pressed: b.pressed || b.value > 0.3, value: b.value }));
  }
  allAxes() { return this._pad ? [...this._pad.axes] : []; }

  /** Direction the stick is currently held in (for hold notes), or null if below threshold. */
  heldDir(ring) {
    const s = ring === 'L' ? this.left : this.right;
    if (!s || s.mag < this.holdThreshold) return null;
    return { dir: vectorToDir(s.x, s.y), x: s.x, y: s.y, mag: s.mag };
  }

  // --- per-frame -----------------------------------------------------------
  update(songTime) {
    const pad = this._getPad();
    this._pad = pad;
    this._just = {};

    if (pad) {
      const { lx, ly, rx, ry } = this._stickAxes(pad);
      this._updateStick('L', lx, ly, songTime);
      this._updateStick('R', rx, ry, songTime);

      const pressed = (i) => pad.buttons[i] && (pad.buttons[i].pressed || pad.buttons[i].value > 0.4);
      const edges = {};
      for (const i of [0, 1, 9, 12, 13, 14, 15]) {
        const now = !!pressed(i);
        edges[i] = now && !this._prevButtons[i];
        this._prevButtons[i] = now;
      }
      if (edges[9]) { this.menu.push('confirm'); this._just.options = true; }
      if (edges[0]) { this.menu.push('confirm'); this._just.cross = true; }
      if (edges[1]) { this.menu.push('back'); this._just.circle = true; }
      if (edges[12]) this.menu.push('up');
      if (edges[13]) this.menu.push('down');
      if (edges[14]) this.menu.push('left');
      if (edges[15]) this.menu.push('right');
    } else {
      this.left = { x: 0, y: 0, mag: 0 };
      this.right = { x: 0, y: 0, mag: 0 };
    }
  }

  _updateStick(ring, x, y, songTime) {
    const rawMag = Math.hypot(x, y);
    const live = this._deadzone(x, y);
    if (ring === 'L') this.left = live; else this.right = live;
    if (!this._fired[ring] && rawMag >= this.flickThreshold) {
      this._fired[ring] = true;
      this.flicks.push({ ring, dir: vectorToDir(x, y), mods: this.heldMods(), mag: rawMag, t: songTime });
    } else if (this._fired[ring] && rawMag <= this.releaseThreshold) {
      this._fired[ring] = false;
    }
  }

  _deadzone(x, y) {
    const m = Math.hypot(x, y);
    if (m < this.deadzone) return { x: 0, y: 0, mag: 0 };
    const s = (m - this.deadzone) / (1 - this.deadzone);
    return { x: (x / m) * s, y: (y / m) * s, mag: s };
  }

  heldMods() {
    const out = new Set();
    const pad = this._pad;
    if (pad) for (const [i, name] of Object.entries(MOD_BUTTONS)) {
      const b = pad.buttons[i];
      if (b && (b.pressed || b.value > 0.35)) out.add(name);
    }
    return [...out];
  }

  justPressed(name) { return !!this._just[name]; }
  takeFlicks() { const f = this.flicks; this.flicks = []; return f; }
  takeMenu() { const m = this.menu; this.menu = []; return m; }

  // --- Keyboard: MENUS ONLY (no gameplay — this game needs real sticks) ----
  _installKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.code === 'Enter') { this.menu.push('confirm'); this._just.confirm = true; }
      else if (e.code === 'Escape') { this.menu.push('back'); this.menu.push('pause'); this._just.escape = true; }
      else if (e.code === 'ArrowUp') this.menu.push('up');
      else if (e.code === 'ArrowDown') this.menu.push('down');
    });
  }
}

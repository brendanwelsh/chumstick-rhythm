// input.js — GamepadInput: Gamepad API polling, hysteresis flick detection, modifiers,
// menu navigation, and a keyboard fallback for dev without a controller.
//
// Standard gamepad mapping (Chrome, DualSense):
//   axes:   0,1 = left stick   |   2,3 = right stick   (y-down: up = negative)
//   buttons: 0 cross  1 circle  2 square  3 triangle
//            4 L1     5 R1      6 L2      7 R2
//            8 share  9 options
//            12 up   13 down   14 left   15 right (d-pad)

import { vectorToDir } from './chart.js';

const MOD_BUTTONS = { 4: 'L1', 5: 'R1', 6: 'L2', 7: 'R2', 0: 'cross', 1: 'circle', 2: 'square', 3: 'triangle' };

export class GamepadInput {
  constructor() {
    this.flickThreshold = 0.55;   // magnitude to register a flick
    this.releaseThreshold = 0.35; // must fall below this to re-arm (hysteresis)
    this.holdThreshold = 0.5;     // magnitude to count the stick as "held" (for hold notes)

    // Per-stick flick state machine: true = fired and waiting to re-arm.
    this._fired = { L: false, R: false };

    // Live stick vectors for rendering: {x, y, mag}.
    this.left = { x: 0, y: 0, mag: 0 };
    this.right = { x: 0, y: 0, mag: 0 };

    // Output queues drained by main.
    this.flicks = [];  // {ring, dir, mods:[], mag, t}
    this.menu = [];     // 'confirm' | 'back' | 'pause' | 'up' | 'down' | 'left' | 'right'

    // Button edge detection.
    this._prevButtons = {};
    this._just = {};

    // Keyboard fallback state.
    this._keysHeld = new Set();
    this._kbMods = new Set();
    this._dirKeys = new Set();
    this._kbDir = { L: { x: 0, y: 0, mag: 0 }, R: { x: 0, y: 0, mag: 0 } };
    this._installKeyboard();
  }

  /** Direction the stick is currently held in (for hold notes), or null if below threshold. */
  heldDir(ring) {
    const s = ring === 'L' ? this.left : this.right;
    if (!s || s.mag < this.holdThreshold) return null;
    return { dir: vectorToDir(s.x, s.y), x: s.x, y: s.y, mag: s.mag };
  }

  get connected() {
    return this._getPad() != null;
  }

  _getPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) if (p && p.axes && p.axes.length >= 4) return p;
    return null;
  }

  /** Call once per animation frame. `songTime` stamps flick events for judgement. */
  update(songTime) {
    const pad = this._getPad();
    this._just = {};

    // --- Sticks ---
    if (pad) {
      this._updateStick('L', pad.axes[0] || 0, pad.axes[1] || 0, songTime);
      this._updateStick('R', pad.axes[2] || 0, pad.axes[3] || 0, songTime);
    } else {
      // No gamepad: drive the sticks from held keyboard direction keys (enables holds + dot).
      this.left = this._kbDir.L;
      this.right = this._kbDir.R;
    }

    // --- Buttons (edges + menu intents) ---
    if (pad) {
      const pressed = (i) => pad.buttons[i] && (pad.buttons[i].pressed || pad.buttons[i].value > 0.4);
      // Compute every edge exactly once into a map, then react to it.
      const edges = {};
      for (const i of [0, 1, 9, 12, 13, 14, 15]) {
        const now = !!pressed(i);
        edges[i] = now && !this._prevButtons[i];
        this._prevButtons[i] = now;
      }
      if (edges[9]) { this.menu.push('confirm'); this._just.options = true; } // Options/Start
      if (edges[0]) { this.menu.push('confirm'); this._just.cross = true; }   // Cross
      if (edges[1]) { this.menu.push('back'); this._just.circle = true; }     // Circle
      if (edges[12]) this.menu.push('up');
      if (edges[13]) this.menu.push('down');
      if (edges[14]) this.menu.push('left');
      if (edges[15]) this.menu.push('right');
    }
  }

  _updateStick(ring, x, y, songTime) {
    const mag = Math.hypot(x, y);
    const live = { x, y, mag };
    if (ring === 'L') this.left = live; else this.right = live;

    if (!this._fired[ring] && mag >= this.flickThreshold) {
      this._fired[ring] = true;
      this.flicks.push({ ring, dir: vectorToDir(x, y), mods: this.heldMods(), mag, t: songTime });
    } else if (this._fired[ring] && mag <= this.releaseThreshold) {
      this._fired[ring] = false;
    }
  }

  /** Modifier buttons currently held (gamepad + keyboard), as an array of mod names. */
  heldMods() {
    const out = new Set(this._kbMods);
    const pad = this._getPad();
    if (pad) {
      for (const [i, name] of Object.entries(MOD_BUTTONS)) {
        const b = pad.buttons[i];
        if (b && (b.pressed || b.value > 0.35)) out.add(name);
      }
    }
    return [...out];
  }

  /** True if the named menu/control button was pressed this frame (gamepad). */
  justPressed(name) { return !!this._just[name]; }

  takeFlicks() { const f = this.flicks; this.flicks = []; return f; }
  takeMenu() { const m = this.menu; this.menu = []; return m; }

  // --- Keyboard fallback ---------------------------------------------------
  // Map each direction key to [ring, x, y] (screen-space, y-down). Held keys are summed so
  // W+D reads as a diagonal, and a held key keeps the stick deflected for hold notes.
  static _DIR_KEYS = {
    KeyW: ['L', 0, -1], KeyS: ['L', 0, 1], KeyA: ['L', -1, 0], KeyD: ['L', 1, 0],
    ArrowUp: ['R', 0, -1], ArrowDown: ['R', 0, 1], ArrowLeft: ['R', -1, 0], ArrowRight: ['R', 1, 0],
  };

  _recomputeKbDir() {
    const acc = { L: { x: 0, y: 0 }, R: { x: 0, y: 0 } };
    for (const code of this._dirKeys) {
      const m = GamepadInput._DIR_KEYS[code];
      if (m) { acc[m[0]].x += m[1]; acc[m[0]].y += m[2]; }
    }
    for (const r of ['L', 'R']) {
      const mag = Math.hypot(acc[r].x, acc[r].y);
      this._kbDir[r] = mag > 0 ? { x: acc[r].x / mag, y: acc[r].y / mag, mag: 1 } : { x: 0, y: 0, mag: 0 };
    }
  }

  _installKeyboard() {
    const dirFor = (code) => {
      const m = GamepadInput._DIR_KEYS[code];
      return m ? [m[0], vectorToDir(m[1], m[2])] : null;
    };
    const modFor = (code) => ({
      KeyQ: 'L1', KeyE: 'R1', ShiftLeft: 'L2', ShiftRight: 'L2', Space: 'R2',
      Digit1: 'cross', Digit2: 'circle', Digit3: 'square', Digit4: 'triangle',
    }[code]);

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const code = e.code;

      // Menu intents. (Arrows double as right-ring flicks during play; menus ignore the
      // flick and gameplay ignores the nav intent, so emitting both is harmless.)
      if (code === 'Enter') { this.menu.push('confirm'); this._just.confirm = true; }
      if (code === 'Escape') { this.menu.push('back'); this.menu.push('pause'); this._just.escape = true; }
      if (code === 'ArrowUp') this.menu.push('up');
      if (code === 'ArrowDown') this.menu.push('down');
      if (code === 'ArrowLeft') this.menu.push('left');
      if (code === 'ArrowRight') this.menu.push('right');

      const mod = modFor(code);
      if (mod) { this._kbMods.add(mod); this._keysHeld.add(code); }

      const d = dirFor(code);
      if (d) {
        e.preventDefault();
        this._dirKeys.add(code); this._recomputeKbDir();   // hold the deflection while pressed
        // songTime is stamped by the caller's clock; we use the global engine via window hook.
        const t = (window.__songTime != null) ? window.__songTime : 0;
        this.flicks.push({ ring: d[0], dir: d[1], mods: this.heldMods(), mag: 1, t });
      }
    });

    window.addEventListener('keyup', (e) => {
      const mod = modFor(e.code);
      if (mod) { this._kbMods.delete(mod); this._keysHeld.delete(e.code); }
      if (GamepadInput._DIR_KEYS[e.code]) { this._dirKeys.delete(e.code); this._recomputeKbDir(); }
    });
  }
}

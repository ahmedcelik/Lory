// 60fps Per-Key RGB Lighting Engine

export const RGB_MODES = [
  { id: 'wave', name: 'Rainbow Wave', desc: 'Flowing full-spectrum wave' },
  { id: 'static', name: 'Static Color', desc: 'Solid uniform backlight' },
  { id: 'breathing', name: 'Breathing', desc: 'Smooth pulsing glow' },
  { id: 'ripple', name: 'Reactive Ripple', desc: 'Shockwave from pressed key' },
  { id: 'reactive', name: 'Reactive Trail', desc: 'Pressed keys burst & fade' },
  { id: 'fire', name: 'Ember Glow', desc: 'Warm flickering coals' },
  { id: 'matrix', name: 'Matrix Rain', desc: 'Cascading light columns' },
  { id: 'custom', name: 'Per-Key Paint', desc: 'Click/drag keys to paint' },
  { id: 'off', name: 'Lighting Off', desc: 'Disable all LEDs' },
];

export const RGB_PRESETS = [
  { name: 'Cobalt Frost', primary: '#38bdf8', secondary: '#6366f1', mode: 'breathing' },
  { name: 'Cyberpunk', primary: '#ff2a85', secondary: '#00f0ff', mode: 'wave' },
  { name: 'Arctic Ripple', primary: '#38bdf8', secondary: '#e0f2fe', mode: 'ripple' },
  { name: 'Emerald Matrix', primary: '#10b981', secondary: '#6ee7b7', mode: 'matrix' },
  { name: 'Crimson Pulse', primary: '#f43f5e', secondary: '#fb7185', mode: 'reactive' },
  { name: 'Ultraviolet', primary: '#a855f7', secondary: '#38bdf8', mode: 'wave' },
];

export function hexToRgb(hex) {
  const clean = (hex || '#ffffff').replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return [255, 255, 255];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

export function rgbToHex(r, g, b) {
  return (
    '#' +
    [r, g, b]
      .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
      .join('')
  );
}

export function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpRgb(c1, c2, t) {
  const clamped = Math.max(0, Math.min(1, t));
  return [
    Math.round(lerp(c1[0], c2[0], clamped)),
    Math.round(lerp(c1[1], c2[1], clamped)),
    Math.round(lerp(c1[2], c2[2], clamped)),
  ];
}

export class RgbEngine {
  constructor() {
    this.state = {
      mode: 'wave',
      brightness: 90, // 0..100
      speed: 1.0, // 0.2..3.0
      direction: 'diagonal', // 'ltr' | 'rtl' | 'diagonal' | 'radial'
      primaryColor: '#38bdf8',
      secondaryColor: '#818cf8',
      underglow: true,
      legendGlow: true,
      customMap: {}, // { [code]: '#rrggbb' }
    };

    this.keys = []; // { code, el, cx, cy, nx, ny, colBucket }
    this.ripples = []; // { cx, cy, startTime, color }
    this.reactiveHits = new Map(); // code -> timestamp
    this.matrixDrops = [];
    this.rafId = null;
    this.startTime = performance.now();
    this.keyboardEl = null;
    this.lastFrameTime = 0;
  }

  attach(keyboardEl, layout, keyElementsMap) {
    this.keyboardEl = keyboardEl;
    this.keys = layout.keys.map((k) => {
      const cx = k.x + k.w / 2;
      const cy = k.y + k.h / 2;
      return {
        code: k.code,
        el: keyElementsMap.get(k.code),
        cx,
        cy,
        nx: cx / Math.max(1, layout.widthU),
        ny: cy / Math.max(1, layout.heightU),
        colBucket: Math.floor(cx),
      };
    });

    // Seed matrix columns
    const cols = Math.ceil(layout.widthU) + 2;
    this.matrixDrops = Array.from({ length: cols }, (_, i) => ({
      offset: ((i * 1.37) % 1) * 8,
      speed: 0.7 + ((i * 29) % 10) * 0.08,
    }));
  }

  updateState(patch) {
    Object.assign(this.state, patch);
  }

  setCustomKey(code, hex) {
    if (!hex) {
      delete this.state.customMap[code];
    } else {
      this.state.customMap[code] = hex;
    }
  }

  fillCustom(hex) {
    for (const k of this.keys) {
      this.state.customMap[k.code] = hex;
    }
  }

  clearCustom() {
    this.state.customMap = {};
  }

  triggerKey(code) {
    const now = performance.now();
    this.reactiveHits.set(code, now);
    const keyObj = this.keys.find((k) => k.code === code);
    if (keyObj) {
      const color =
        this.state.mode === 'ripple'
          ? hexToRgb(this.state.primaryColor)
          : hslToRgb((now * 0.12) % 360, 95, 60);
      this.ripples.push({
        cx: keyObj.cx,
        cy: keyObj.cy,
        startTime: now,
        color,
      });
      if (this.ripples.length > 12) this.ripples.shift();
    }
  }

  start() {
    if (this.rafId) return;
    const loop = (now) => {
      this.renderFrame(now);
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  renderFrame(now) {
    const s = this.state;
    const bright = s.mode === 'off' ? 0 : s.brightness / 100;
    const t = ((now - this.startTime) / 1000) * s.speed;
    const primary = hexToRgb(s.primaryColor);
    const secondary = hexToRgb(s.secondaryColor);

    // Prune expired ripples
    const rippleDuration = 1400 / Math.max(0.3, s.speed);
    this.ripples = this.ripples.filter((r) => now - r.startTime < rippleDuration);

    let sumR = 0, sumG = 0, sumB = 0;

    for (let i = 0; i < this.keys.length; i++) {
      const k = this.keys[i];
      if (!k.el) continue;

      let rgb = [0, 0, 0];
      let intensity = bright;

      switch (s.mode) {
        case 'off': {
          rgb = [0, 0, 0];
          intensity = 0;
          break;
        }
        case 'static': {
          rgb = primary;
          break;
        }
        case 'wave': {
          let phase = 0;
          if (s.direction === 'ltr') phase = k.nx * 360 - t * 140;
          else if (s.direction === 'rtl') phase = -k.nx * 360 - t * 140;
          else if (s.direction === 'radial') {
            const dx = k.nx - 0.5;
            const dy = k.ny - 0.5;
            phase = Math.hypot(dx, dy) * 520 - t * 180;
          } else {
            phase = (k.nx * 0.75 + k.ny * 0.45) * 360 - t * 140;
          }
          rgb = hslToRgb(phase, 92, 58);
          break;
        }
        case 'breathing': {
          const wave = (Math.sin(t * 2.2) + 1) / 2;
          const eased = wave * wave * (3 - 2 * wave);
          rgb = lerpRgb(primary, secondary, (Math.sin(t * 0.7 + k.nx * 1.2) + 1) / 2);
          intensity = bright * (0.12 + 0.88 * eased);
          break;
        }
        case 'ripple': {
          // Subtle base + bright expanding rings from key presses
          let rAcc = primary[0] * 0.14;
          let gAcc = primary[1] * 0.14;
          let bAcc = primary[2] * 0.14;
          let maxBoost = 0.15;

          for (const rip of this.ripples) {
            const age = (now - rip.startTime) / 1000;
            const radius = age * 14 * s.speed;
            const dist = Math.hypot(k.cx - rip.cx, k.cy - rip.cy);
            const band = Math.exp(-Math.pow((dist - radius) / 1.4, 2));
            const fade = Math.max(0, 1 - (now - rip.startTime) / rippleDuration);
            const contrib = band * fade;
            if (contrib > 0.01) {
              const col = lerpRgb(primary, secondary, Math.min(1, dist / 14));
              rAcc += col[0] * contrib * 1.4;
              gAcc += col[1] * contrib * 1.4;
              bAcc += col[2] * contrib * 1.4;
              maxBoost = Math.max(maxBoost, contrib);
            }
          }
          rgb = [Math.min(255, rAcc), Math.min(255, gAcc), Math.min(255, bAcc)];
          intensity = bright * Math.min(1, maxBoost + 0.15);
          break;
        }
        case 'reactive': {
          const hit = this.reactiveHits.get(k.code);
          const fadeMs = 1100 / Math.max(0.3, s.speed);
          let level = 0;
          if (hit) {
            const dt = now - hit;
            if (dt < fadeMs) {
              level = Math.pow(1 - dt / fadeMs, 1.6);
            } else {
              this.reactiveHits.delete(k.code);
            }
          }
          rgb = lerpRgb(secondary, primary, level);
          intensity = bright * (0.12 + 0.88 * level);
          break;
        }
        case 'fire': {
          const n1 = Math.sin(k.cx * 1.7 + t * 4.5) * Math.cos(k.cy * 2.3 - t * 3.1);
          const n2 = Math.sin(k.cx * 3.1 - t * 6.2 + k.cy * 1.9);
          const heat = Math.max(0, Math.min(1, 0.55 + 0.35 * n1 + 0.2 * n2 + (1 - k.ny) * 0.25));
          const deep = [220, 38, 38];
          const mid = primary;
          const hot = [254, 240, 138];
          rgb = heat < 0.55 ? lerpRgb(deep, mid, heat / 0.55) : lerpRgb(mid, hot, (heat - 0.55) / 0.45);
          intensity = bright * (0.45 + 0.55 * heat);
          break;
        }
        case 'matrix': {
          const drop = this.matrixDrops[k.colBucket % this.matrixDrops.length];
          const headY = ((t * 4.2 * drop.speed + drop.offset) % 10) - 2;
          const dist = headY - k.cy;
          let trail = 0;
          if (dist >= 0 && dist < 4.5) {
            trail = Math.pow(1 - dist / 4.5, 1.8);
          }
          rgb = dist >= 0 && dist < 0.8 ? lerpRgb(primary, [235, 255, 245], 0.7) : primary;
          intensity = bright * (0.08 + 0.92 * trail);
          break;
        }
        case 'custom': {
          const hex = s.customMap[k.code];
          if (hex) {
            rgb = hexToRgb(hex);
            intensity = bright;
          } else {
            rgb = [30, 41, 59];
            intensity = 0;
          }
          break;
        }
      }

      sumR += rgb[0] * intensity;
      sumG += rgb[1] * intensity;
      sumB += rgb[2] * intensity;

      const r = Math.round(rgb[0]);
      const g = Math.round(rgb[1]);
      const b = Math.round(rgb[2]);
      k.el.style.setProperty('--led-rgb', `${r}, ${g}, ${b}`);
      k.el.style.setProperty('--led-alpha', intensity.toFixed(3));
    }

    // Update ambient chassis underglow based on average keyboard LED color
    if (this.keyboardEl) {
      const count = Math.max(1, this.keys.length);
      const avgR = Math.round(sumR / count);
      const avgG = Math.round(sumG / count);
      const avgB = Math.round(sumB / count);
      this.keyboardEl.style.setProperty('--underglow-rgb', `${avgR}, ${avgG}, ${avgB}`);
      this.keyboardEl.style.setProperty(
        '--underglow-alpha',
        s.underglow && bright > 0 ? (0.42 * bright).toFixed(3) : '0'
      );
      this.keyboardEl.classList.toggle('legend-rgb-on', s.legendGlow && bright > 0);
    }
  }

  getSnapshot() {
    return JSON.parse(JSON.stringify(this.state));
  }

  loadSnapshot(snap) {
    if (!snap || typeof snap !== 'object') return;
    const { brushColor, ...rest } = snap;
    this.state = {
      ...this.state,
      ...rest,
      primaryColor: rest.primaryColor || brushColor || this.state.primaryColor,
      customMap: { ...(snap.customMap || {}) },
    };
  }
}

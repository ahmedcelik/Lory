import { LAYOUTS, LAYOUT_ORDER } from './layouts.js';
import { KEYMAPS, KEYMAP_ORDER } from './keymaps.js';
import { RgbEngine, RGB_MODES, RGB_PRESETS } from './rgbEngine.js';
import { WebHidDriver } from './webhid.js';
import { SwitchSound } from './sound.js';
import { createLoryApi } from './api.js';

const STORAGE_KEY = 'lory_driver_profile_v1';
const VALID_THEMES = ['edo', 'festival', 'horizon', 'midnight', 'velvet'];

const PALETTE_RGB_DEFAULTS = {
  edo: { primary: '#e2b14c', secondary: '#c9382a' },
  festival: { primary: '#E52B2B', secondary: '#F5C242' },
  horizon: { primary: '#ff7a45', secondary: '#c85a9e' },
  midnight: { primary: '#4f6bff', secondary: '#94a3b8' },
  velvet: { primary: '#A855F7', secondary: '#E11D48' },
};

// Character maps for clicking HTML keys
const SHIFT_MAP = {
  Backquote: '~',
  Digit1: '!',
  Digit2: '@',
  Digit3: '#',
  Digit4: '$',
  Digit5: '%',
  Digit6: '^',
  Digit7: '&',
  Digit8: '*',
  Digit9: '(',
  Digit0: ')',
  Minus: '_',
  Equal: '+',
  BracketLeft: '{',
  BracketRight: '}',
  Backslash: '|',
  Semicolon: ':',
  Quote: '"',
  Comma: '<',
  Period: '>',
  Slash: '?',
};

const BASE_CHAR_MAP = {
  Backquote: '`',
  Digit1: '1',
  Digit2: '2',
  Digit3: '3',
  Digit4: '4',
  Digit5: '5',
  Digit6: '6',
  Digit7: '7',
  Digit8: '8',
  Digit9: '9',
  Digit0: '0',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Space: ' ',
  Tab: '  ',
  Numpad0: '0',
  Numpad1: '1',
  Numpad2: '2',
  Numpad3: '3',
  Numpad4: '4',
  Numpad5: '5',
  Numpad6: '6',
  Numpad7: '7',
  Numpad8: '8',
  Numpad9: '9',
  NumpadDecimal: '.',
  NumpadAdd: '+',
  NumpadSubtract: '-',
  NumpadMultiply: '*',
  NumpadDivide: '/',
};

// DOM references
const stageEl = document.getElementById('stage');
const keyboardEl = document.getElementById('keyboard');
const plateEl = document.getElementById('keyboard-plate');
const layoutSwitcherEl = document.getElementById('layout-switcher');
const viewSwitcherEl = document.getElementById('view-switcher');
const themeSelectEl = document.getElementById('theme-select');
const soundToggleEl = document.getElementById('sound-toggle');
const soundLabelEl = document.getElementById('sound-label');
const lastKeyReadoutEl = document.getElementById('last-key-readout');
const paintHintEl = document.getElementById('paint-hint');
const orbitReadoutEl = document.getElementById('orbit-readout');
const zoomSliderEl = document.getElementById('zoom-slider');
const zoomValueEl = document.getElementById('zoom-value');

// Typing output bar
const typingTextEl = document.getElementById('typing-text');
const typingScreenEl = document.getElementById('typing-screen');
const modShiftEl = document.getElementById('mod-shift');
const modCapsEl = document.getElementById('mod-caps');
const btnTypingClear = document.getElementById('btn-typing-clear');

// RGB controls
const rgbModeGridEl = document.getElementById('rgb-mode-grid');
const activeModeBadgeEl = document.getElementById('active-mode-badge');
const paintToolsEl = document.getElementById('paint-tools');
const brushColorEl = document.getElementById('brush-color');
const btnPaintFill = document.getElementById('btn-paint-fill');
const btnPaintClear = document.getElementById('btn-paint-clear');
const brightnessEl = document.getElementById('rgb-brightness');
const valBrightnessEl = document.getElementById('val-brightness');
const speedEl = document.getElementById('rgb-speed');
const valSpeedEl = document.getElementById('val-speed');
const directionEl = document.getElementById('rgb-direction');
const primaryColorEl = document.getElementById('rgb-primary');
const secondaryColorEl = document.getElementById('rgb-secondary');
const underglowEl = document.getElementById('rgb-underglow');
const legendGlowEl = document.getElementById('rgb-legend-glow');
const presetsEl = document.getElementById('rgb-presets');
const btnExportProfile = document.getElementById('btn-export-profile');
const btnImportProfile = document.getElementById('btn-import-profile');
const importProfileInput = document.getElementById('import-profile-input');

// WebHID controls
const hidQuickBadge = document.getElementById('hid-quick-badge');
const hidQuickText = document.getElementById('hid-quick-text');
const hidSupportBadge = document.getElementById('hid-support-badge');
const hidDeviceName = document.getElementById('hid-device-name');
const hidVid = document.getElementById('hid-vid');
const hidPid = document.getElementById('hid-pid');
const hidCols = document.getElementById('hid-cols');
const btnHidConnect = document.getElementById('btn-hid-connect');
const btnHidSim = document.getElementById('btn-hid-sim');
const btnHidDisconnect = document.getElementById('btn-hid-disconnect');
const hidProtocolEl = document.getElementById('hid-protocol');
const hidReportIdEl = document.getElementById('hid-report-id');
const hidPacketSizeEl = document.getElementById('hid-packet-size');
const hidAutoSyncEl = document.getElementById('hid-autosync');
const btnHidSync = document.getElementById('btn-hid-sync');
const hidCustomHexEl = document.getElementById('hid-custom-hex');
const btnHidSendHex = document.getElementById('btn-hid-send-hex');
const btnHidClearLog = document.getElementById('btn-hid-clear-log');
const hidConsoleEl = document.getElementById('hid-console');

// Optional Language / Keymap panel controls
const keymapGridEl = document.getElementById('keymap-grid');
const activeKeymapBadgeEl = document.getElementById('active-keymap-badge');

// Core services
const rgb = new RgbEngine();
const hid = new WebHidDriver();
const sound = new SwitchSound();

// App state
const appState = {
  layoutId: 'full',
  keymapId: 'en-us',
  view: 'iso', // 'iso' | 'flat'
  theme: 'edo',
  zoom: 100,
  rotX: 48,
  rotZ: -18,
  typedText: '',
  shiftActive: false,
  capsLock: false,
};

let keyElements = new Map(); // code -> HTMLElement
let activeKeys = new Set();
let isPointerDown = false;
let isOrbiting = false;
let orbitStart = { x: 0, y: 0, rotX: 48, rotZ: -18 };

function applyOrbitAngles() {
  document.documentElement.style.setProperty('--kb-rot-x', `${appState.rotX.toFixed(1)}deg`);
  document.documentElement.style.setProperty('--kb-rot-z', `${appState.rotZ.toFixed(1)}deg`);
  if (orbitReadoutEl) {
    orbitReadoutEl.textContent = `${Math.round(appState.rotX)}° / ${Math.round(appState.rotZ)}°`;
  }
}

// ==========================================================================
// Click-to-Type Logic
// ==========================================================================

function updateTypingBar() {
  typingTextEl.textContent = appState.typedText;
  typingScreenEl.scrollLeft = typingScreenEl.scrollWidth;
  modShiftEl.hidden = !appState.shiftActive;
  modCapsEl.hidden = !appState.capsLock;

  // Reflect CapsLock / Shift sticky state on virtual keycaps & CNC status LEDs
  const capsEl = keyElements.get('CapsLock');
  if (capsEl) capsEl.classList.toggle('active', appState.capsLock || activeKeys.has('CapsLock'));
  const ledCaps = document.getElementById('led-caps');
  if (ledCaps) ledCaps.classList.toggle('on', appState.capsLock);
  const ledNum = document.getElementById('led-num');
  if (ledNum) ledNum.classList.toggle('on', true);
}

function handleVirtualType(code) {
  if (code === 'ShiftLeft' || code === 'ShiftRight') {
    appState.shiftActive = !appState.shiftActive;
    updateTypingBar();
    return;
  }
  if (code === 'CapsLock') {
    appState.capsLock = !appState.capsLock;
    updateTypingBar();
    return;
  }
  if (code === 'Backspace') {
    appState.typedText = appState.typedText.slice(0, -1);
    updateTypingBar();
    return;
  }
  if (code === 'Escape') {
    appState.typedText = '';
    appState.shiftActive = false;
    updateTypingBar();
    return;
  }
  if (code === 'Enter' || code === 'NumpadEnter') {
    appState.typedText += ' ↵ ';
    updateTypingBar();
    return;
  }

  const activeKeymap = KEYMAPS[appState.keymapId] || KEYMAPS['en-us'];
  const mapped = activeKeymap.keys?.[code];
  const upper = appState.shiftActive !== appState.capsLock;

  let ch = null;
  if (mapped && (mapped.char !== undefined || mapped.shift !== undefined)) {
    const isLetter = mapped.char && mapped.shift && mapped.char.toLowerCase() !== mapped.shift.toLowerCase()
      ? false
      : Boolean(mapped.char && mapped.shift && mapped.char !== mapped.shift);
    // Use upper (Shift XOR Caps) for letter keys, Shift-only for digit/symbol keys
    const useShift = code.startsWith('Key') || isLetter ? upper : appState.shiftActive;
    ch = useShift ? (mapped.shift ?? mapped.char) : (mapped.char ?? mapped.shift);
  } else if (code.startsWith('Key') && code.length === 4) {
    const letter = code[3];
    ch = upper ? letter.toUpperCase() : letter.toLowerCase();
  } else if (appState.shiftActive && SHIFT_MAP[code]) {
    ch = SHIFT_MAP[code];
  } else if (BASE_CHAR_MAP[code] !== undefined) {
    ch = BASE_CHAR_MAP[code];
  }

  if (ch !== null) {
    appState.typedText += ch;
    if (appState.shiftActive) {
      appState.shiftActive = false; // one-shot shift when clicked
    }
    updateTypingBar();
  }
}

// ==========================================================================
// Keyboard Rendering & Responsive Isometric Scaling
// ==========================================================================

function computeAutoScale() {
  const layout = LAYOUTS[appState.layoutId];
  const u = layout.defaultUnitPx;
  const pad = Math.max(12, Math.round(u * 0.42));
  const rawW = layout.widthU * u + pad * 2;
  const rawH = layout.heightU * u + pad * 2;

  const rect = stageEl.getBoundingClientRect();
  const availW = Math.max(320, rect.width - 70);
  const availH = Math.max(240, rect.height - 150);

  // Account for rotated bounding box in 3D isometric view
  const projectedW = appState.view === 'iso' ? rawW * 0.88 + rawH * 0.68 : rawW;
  const projectedH = appState.view === 'iso' ? (rawW * 0.62 + rawH * 0.78) * 0.65 + 70 : rawH;

  const fit = Math.min(availW / projectedW, availH / projectedH, 1.15);
  const finalScale = Math.max(0.35, fit * (appState.zoom / 100));
  document.documentElement.style.setProperty('--kb-scale', finalScale.toFixed(3));
}

function renderKeyboard() {
  const layout = LAYOUTS[appState.layoutId];
  const u = layout.defaultUnitPx;
  const gap = Math.max(4, Math.round(u * 0.13));
  const pad = Math.max(14, Math.round(u * 0.42));
  const keyH = Math.max(10, Math.round(u * 0.26));
  const keyPress = Math.max(3, Math.round(u * 0.08));
  const caseH = Math.max(18, Math.round(u * 0.46));

  document.documentElement.style.setProperty('--u', `${u}px`);
  document.documentElement.style.setProperty('--gap', `${gap}px`);
  document.documentElement.style.setProperty('--pad', `${pad}px`);
  document.documentElement.style.setProperty('--key-h', `${keyH}px`);
  document.documentElement.style.setProperty('--key-press', `${keyPress}px`);
  document.documentElement.style.setProperty('--case-h', `${caseH}px`);

  plateEl.style.width = `${layout.widthU * u - gap}px`;
  plateEl.style.height = `${layout.heightU * u - gap}px`;
  plateEl.innerHTML = '';
  keyElements = new Map();

  const frag = document.createDocumentFragment();
  const activeKeymap = KEYMAPS[appState.keymapId] || KEYMAPS['en-us'];

  for (const key of layout.keys) {
    const override = activeKeymap.keys?.[key.code];
    const displayLabel = override?.label ?? key.label;
    const displaySub = override ? (override.sub ?? null) : key.sub;

    const el = document.createElement('div');
    el.className = 'key';
    el.dataset.code = key.code;
    if (key.accent) el.classList.add(`accent-${key.accent}`);
    if (displayLabel.length > 1) el.classList.add('label-long');

    el.style.left = `${key.x * u}px`;
    el.style.top = `${key.y * u}px`;
    el.style.width = `${key.w * u - gap}px`;
    el.style.height = `${key.h * u - gap}px`;

    const led = document.createElement('div');
    led.className = 'key-led';

    // True 3D keycap body (moves along real Z-axis)
    const body = document.createElement('div');
    body.className = 'key-body';

    // 4 real 3D keycap side walls
    for (const side of ['s', 'n', 'w', 'e']) {
      const wall = document.createElement('div');
      wall.className = `kw kw-${side}`;
      body.appendChild(wall);
    }

    // Sculpted top face with top-left double-shot legends
    const face = document.createElement('div');
    face.className = 'key-face';

    if (displaySub) {
      const subEl = document.createElement('span');
      subEl.className = 'key-sub';
      subEl.textContent = displaySub;
      face.appendChild(subEl);
    }

    const charEl = document.createElement('span');
    charEl.className = 'key-char';
    charEl.textContent = displayLabel;
    face.appendChild(charEl);

    if (key.homing) {
      const homing = document.createElement('span');
      homing.className = 'key-homing';
      face.appendChild(homing);
    }

    body.appendChild(face);
    el.appendChild(led);
    el.appendChild(body);

    // Mouse / Pointer interaction: click-to-type OR per-key RGB painting (left click only)
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return; // Let middle-click pass through for Shift+MMB orbit
      e.preventDefault();
      isPointerDown = true;
      if (rgb.state.mode === 'custom') {
        rgb.setCustomKey(key.code, rgb.state.primaryColor);
        saveProfile();
        hid.scheduleAutoSync(rgb.state);
      }
      pressKey(key.code, key.w >= 2 || key.h >= 2, true);
    });

    el.addEventListener('pointerenter', () => {
      if (!isPointerDown) return;
      if (rgb.state.mode === 'custom') {
        rgb.setCustomKey(key.code, rgb.state.primaryColor);
        saveProfile();
        hid.scheduleAutoSync(rgb.state);
      }
    });

    el.addEventListener('pointerup', () => releaseKey(key.code));
    el.addEventListener('pointerleave', () => releaseKey(key.code));

    frag.appendChild(el);
    keyElements.set(key.code, el);
  }

  plateEl.appendChild(frag);
  rgb.attach(keyboardEl, layout, keyElements);
  computeAutoScale();
  updateTypingBar();
}

function pressKey(code, isLarge = false, fromClick = false) {
  const el = keyElements.get(code);
  if (el) {
    el.classList.add('active');
  }
  activeKeys.add(code);
  rgb.triggerKey(code);
  sound.playDown(isLarge);
  lastKeyReadoutEl.textContent = code;

  if (fromClick) {
    handleVirtualType(code);
  }
}

function releaseKey(code) {
  activeKeys.delete(code);
  const el = keyElements.get(code);
  if (el) {
    if (code === 'CapsLock' && appState.capsLock) return;
    el.classList.remove('active');
  }
}

// ==========================================================================
// Shift + Middle Mouse Button 3D Orbit Rotation
// ==========================================================================

stageEl.addEventListener('mousedown', (e) => {
  if (e.button === 1 && e.shiftKey) {
    e.preventDefault();
    isOrbiting = true;
    if (appState.view === 'flat') {
      appState.view = 'iso';
      appState.rotX = 0;
      appState.rotZ = 0;
      stageEl.classList.remove('view-flat');
      for (const b of viewSwitcherEl.querySelectorAll('.seg-btn')) {
        b.classList.toggle('active', b.dataset.view === 'iso');
      }
      applyOrbitAngles();
      computeAutoScale();
    }
    orbitStart = {
      x: e.clientX,
      y: e.clientY,
      rotX: appState.rotX,
      rotZ: appState.rotZ,
    };
    stageEl.classList.add('orbiting');
  }
});

// Prevent browser middle-click autoscroll icon on stage when holding Shift
stageEl.addEventListener('auxclick', (e) => {
  if (e.button === 1 && e.shiftKey) e.preventDefault();
});

window.addEventListener('mousemove', (e) => {
  if (!isOrbiting) return;
  const dx = e.clientX - orbitStart.x;
  const dy = e.clientY - orbitStart.y;
  appState.rotX = Math.max(0, Math.min(75, orbitStart.rotX - dy * 0.42));
  appState.rotZ = ((orbitStart.rotZ - dx * 0.42 + 180) % 360 + 360) % 360 - 180;
  applyOrbitAngles();
});

window.addEventListener('mouseup', (e) => {
  if (isOrbiting && e.button === 1) {
    isOrbiting = false;
    stageEl.classList.remove('orbiting');
  }
});

// ==========================================================================
// Physical Keyboard Support
// ==========================================================================

window.addEventListener('pointerup', () => {
  isPointerDown = false;
});

window.addEventListener('keydown', (e) => {
  // Ignore when typing inside driver form inputs
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
    return;
  }

  if (e.code === 'Space' || e.code === 'Tab' || e.code.startsWith('Arrow')) {
    e.preventDefault();
  }

  if (!e.repeat) {
    const layout = LAYOUTS[appState.layoutId];
    const meta = layout.keys.find((k) => k.code === e.code);
    const isLarge = meta ? meta.w >= 2 || meta.h >= 2 : false;
    pressKey(e.code, isLarge, false);
  }

  // Mirror physical typing into the output bar as well
  if (e.key === 'Backspace') {
    appState.typedText = appState.typedText.slice(0, -1);
    updateTypingBar();
  } else if (e.key === 'Enter') {
    appState.typedText += ' ↵ ';
    updateTypingBar();
  } else if (e.key === 'Escape') {
    appState.typedText = '';
    updateTypingBar();
  } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
    appState.typedText += e.key;
    updateTypingBar();
  }
});

window.addEventListener('keyup', (e) => {
  releaseKey(e.code);
});

window.addEventListener('blur', () => {
  for (const code of Array.from(activeKeys)) releaseKey(code);
});

window.addEventListener('resize', computeAutoScale);

// ==========================================================================
// UI Initialization & Event Wiring
// ==========================================================================

function renderKeymapGrid() {
  if (!keymapGridEl) return;
  keymapGridEl.innerHTML = '';
  const active = KEYMAPS[appState.keymapId] || KEYMAPS['en-us'];
  if (activeKeymapBadgeEl) activeKeymapBadgeEl.textContent = active.short;

  for (const id of KEYMAP_ORDER) {
    const km = KEYMAPS[id];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `keymap-card${id === appState.keymapId ? ' active' : ''}`;
    btn.innerHTML = `<span class="keymap-tag mono">${km.tag}</span><span class="keymap-name">${km.name}</span><span class="keymap-short mono">${km.short}</span>`;
    btn.addEventListener('click', () => {
      appState.keymapId = id;
      renderKeymapGrid();
      renderKeyboard();
      saveProfile();
    });
    keymapGridEl.appendChild(btn);
  }
}

function renderLayoutSwitcher() {
  layoutSwitcherEl.innerHTML = '';
  for (const id of LAYOUT_ORDER) {
    const l = LAYOUTS[id];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `seg-btn${id === appState.layoutId ? ' active' : ''}`;
    btn.textContent = l.shortName;
    btn.title = l.name;
    btn.addEventListener('click', () => {
      appState.layoutId = id;
      renderLayoutSwitcher();
      renderKeyboard();
      saveProfile();
    });
    layoutSwitcherEl.appendChild(btn);
  }
}

function renderRgbModes() {
  rgbModeGridEl.innerHTML = '';
  for (const m of RGB_MODES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `mode-card${rgb.state.mode === m.id ? ' active' : ''}`;
    btn.textContent = m.name;
    btn.title = m.desc;
    btn.addEventListener('click', () => {
      rgb.updateState({ mode: m.id });
      syncRgbUiFromState();
      saveProfile();
      hid.scheduleAutoSync(rgb.state);
    });
    rgbModeGridEl.appendChild(btn);
  }
}

function renderPresets() {
  presetsEl.innerHTML = '';
  for (const p of RGB_PRESETS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'preset-btn';
    btn.innerHTML = `<span class="preset-swatch" style="background: linear-gradient(135deg, ${p.primary}, ${p.secondary})"></span><span>${p.name}</span>`;
    btn.addEventListener('click', () => {
      rgb.updateState({
        mode: p.mode,
        primaryColor: p.primary,
        secondaryColor: p.secondary,
      });
      syncRgbUiFromState();
      saveProfile();
      hid.scheduleAutoSync(rgb.state);
    });
    presetsEl.appendChild(btn);
  }
}

function syncRgbUiFromState() {
  const s = rgb.state;
  const modeMeta = RGB_MODES.find((m) => m.id === s.mode);
  activeModeBadgeEl.textContent = modeMeta ? modeMeta.name : s.mode;
  renderRgbModes();

  const isCustom = s.mode === 'custom';
  paintToolsEl.hidden = !isCustom;
  paintHintEl.hidden = !isCustom;

  brightnessEl.value = s.brightness;
  valBrightnessEl.textContent = `${s.brightness}%`;

  speedEl.value = s.speed;
  valSpeedEl.textContent = `${Number(s.speed).toFixed(1)}x`;

  primaryColorEl.value = s.primaryColor;
  secondaryColorEl.value = s.secondaryColor;
  brushColorEl.value = s.primaryColor;
  underglowEl.checked = s.underglow;
  legendGlowEl.checked = s.legendGlow;

  for (const btn of directionEl.querySelectorAll('.seg-btn')) {
    btn.classList.toggle('active', btn.dataset.dir === s.direction);
  }
}

// View switcher (3D Iso / Flat) — also resets custom orbit angle
viewSwitcherEl.addEventListener('click', (e) => {
  const btn = e.target.closest('.seg-btn');
  if (!btn) return;
  appState.view = btn.dataset.view;
  if (appState.view === 'iso') {
    appState.rotX = 48;
    appState.rotZ = -18;
    applyOrbitAngles();
  } else {
    if (orbitReadoutEl) orbitReadoutEl.textContent = '0° / 0°';
  }
  stageEl.classList.toggle('view-flat', appState.view === 'flat');
  for (const b of viewSwitcherEl.querySelectorAll('.seg-btn')) {
    b.classList.toggle('active', b === btn);
  }
  computeAutoScale();
  saveProfile();
});

// Theme selector (also harmonizes default RGB colors for the selected edition)
themeSelectEl.addEventListener('change', () => {
  appState.theme = themeSelectEl.value;
  document.documentElement.setAttribute('data-theme', appState.theme);
  const rgbDef = PALETTE_RGB_DEFAULTS[appState.theme];
  if (rgbDef) {
    rgb.updateState({
      primaryColor: rgbDef.primary,
      secondaryColor: rgbDef.secondary,
    });
    syncRgbUiFromState();
    hid.scheduleAutoSync(rgb.state);
  }
  saveProfile();
});

// Sound toggle
soundToggleEl.addEventListener('click', () => {
  sound.enabled = !sound.enabled;
  soundToggleEl.classList.toggle('active', sound.enabled);
  soundLabelEl.textContent = sound.enabled ? 'Sound: On' : 'Sound: Off';
});

// Zoom slider
zoomSliderEl.addEventListener('input', () => {
  appState.zoom = Number(zoomSliderEl.value);
  zoomValueEl.textContent = `${appState.zoom}%`;
  computeAutoScale();
});

// Clear typed output
btnTypingClear.addEventListener('click', () => {
  appState.typedText = '';
  updateTypingBar();
});

// Panel tabs
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach((b) => {
    const active = b.dataset.tab === tabId;
    b.classList.toggle('active', active);
    b.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('.tab-content').forEach((c) => {
    c.classList.toggle('active', c.id === `tab-${tabId}`);
  });
}

hidQuickBadge.addEventListener('click', () => switchTab('webhid'));

// RGB parameter inputs
brightnessEl.addEventListener('input', () => {
  const v = Number(brightnessEl.value);
  valBrightnessEl.textContent = `${v}%`;
  rgb.updateState({ brightness: v });
  saveProfile();
  hid.scheduleAutoSync(rgb.state);
});

speedEl.addEventListener('input', () => {
  const v = Number(speedEl.value);
  valSpeedEl.textContent = `${v.toFixed(1)}x`;
  rgb.updateState({ speed: v });
  saveProfile();
  hid.scheduleAutoSync(rgb.state);
});

directionEl.addEventListener('click', (e) => {
  const btn = e.target.closest('.seg-btn');
  if (!btn) return;
  rgb.updateState({ direction: btn.dataset.dir });
  syncRgbUiFromState();
  saveProfile();
  hid.scheduleAutoSync(rgb.state);
});

primaryColorEl.addEventListener('input', () => {
  rgb.updateState({ primaryColor: primaryColorEl.value });
  brushColorEl.value = primaryColorEl.value;
  saveProfile();
  hid.scheduleAutoSync(rgb.state);
});

secondaryColorEl.addEventListener('input', () => {
  rgb.updateState({ secondaryColor: secondaryColorEl.value });
  saveProfile();
  hid.scheduleAutoSync(rgb.state);
});

brushColorEl.addEventListener('input', () => {
  rgb.updateState({ primaryColor: brushColorEl.value });
  primaryColorEl.value = brushColorEl.value;
  saveProfile();
  if (rgb.state.mode !== 'custom') hid.scheduleAutoSync(rgb.state);
});

btnPaintFill.addEventListener('click', () => {
  rgb.fillCustom(rgb.state.primaryColor);
  saveProfile();
  hid.scheduleAutoSync(rgb.state);
});

btnPaintClear.addEventListener('click', () => {
  rgb.clearCustom();
  saveProfile();
  hid.scheduleAutoSync(rgb.state);
});

underglowEl.addEventListener('change', () => {
  rgb.updateState({ underglow: underglowEl.checked });
  saveProfile();
  hid.scheduleAutoSync(rgb.state);
});

legendGlowEl.addEventListener('change', () => {
  rgb.updateState({ legendGlow: legendGlowEl.checked });
  saveProfile();
  hid.scheduleAutoSync(rgb.state);
});

// ==========================================================================
// WebHID Panel Wiring
// ==========================================================================

function renderHidUi(status) {
  hidSupportBadge.textContent = status.supported ? 'WebHID Ready' : 'No WebHID API';
  hidDeviceName.textContent = status.name;
  hidVid.textContent = status.vendorId;
  hidPid.textContent = status.productId;
  hidCols.textContent = String(status.collections);

  btnHidDisconnect.disabled = !status.connected;

  hidQuickBadge.classList.remove('connected', 'simulated', 'disconnected');
  if (status.connected && !status.simulated) {
    hidQuickBadge.classList.add('connected');
    hidQuickText.textContent = status.name;
  } else if (status.simulated) {
    hidQuickBadge.classList.add('simulated');
    hidQuickText.textContent = 'Simulator';
  } else {
    hidQuickBadge.classList.add('disconnected');
    hidQuickText.textContent = 'Disconnected';
  }

  // Render packet log
  if (!hid.logs.length) {
    hidConsoleEl.innerHTML =
      '<div class="log-empty">Connect a WebHID device or Virtual Simulator to inspect packets.</div>';
    return;
  }

  hidConsoleEl.innerHTML = hid.logs
    .map(
      (entry) => `
      <div class="log-line">
        <span class="log-dir ${entry.dir}">${entry.dir}</span>
        <span>${entry.ts} · ${entry.message}</span>
        ${entry.hex ? `<span class="log-hex">${entry.hex}</span>` : ''}
      </div>
    `
    )
    .join('');
}

hid.subscribe(renderHidUi);
hid.onEvent((type) => {
  if (type === 'driver:change' || type === 'driver:register') {
    refreshDriverSelect();
  }
});

btnHidConnect.addEventListener('click', async () => {
  const ok = await hid.connectHardware();
  if (ok) hid.sendRgbSync(rgb.state);
});

btnHidSim.addEventListener('click', () => {
  hid.connectSimulator();
  hid.sendRgbSync(rgb.state);
});

btnHidDisconnect.addEventListener('click', () => hid.disconnect());

function syncPacketSizeSelect(size) {
  const val = String(size);
  if (!Array.from(hidPacketSizeEl.options).some((o) => o.value === val)) {
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = `${val}B`;
    hidPacketSizeEl.appendChild(opt);
  }
  hidPacketSizeEl.value = val;
}

hidProtocolEl.addEventListener('change', () => {
  hid.useDriver(hidProtocolEl.value);
  hidReportIdEl.value = hid.reportId.toString(16).padStart(2, '0').toUpperCase();
  syncPacketSizeSelect(hid.packetSize);
});

function refreshDriverSelect() {
  const drivers = hid.listDrivers();
  hidProtocolEl.innerHTML = drivers
    .map((d) => `<option value="${d.id}">${d.name}</option>`)
    .join('');
  hidProtocolEl.value = hid.protocol;
  hidReportIdEl.value = hid.reportId.toString(16).padStart(2, '0').toUpperCase();
  syncPacketSizeSelect(hid.packetSize);
}

hidReportIdEl.addEventListener('change', () => {
  const parsed = parseInt(hidReportIdEl.value, 16);
  hid.reportId = Number.isNaN(parsed) ? 0 : parsed & 0xff;
  hidReportIdEl.value = hid.reportId.toString(16).padStart(2, '0').toUpperCase();
});

hidPacketSizeEl.addEventListener('change', () => {
  hid.packetSize = Number(hidPacketSizeEl.value) || 32;
});

hidAutoSyncEl.addEventListener('change', () => {
  hid.autoSync = hidAutoSyncEl.checked;
});

btnHidSync.addEventListener('click', () => {
  hid.sendRgbSync(rgb.state);
});

btnHidSendHex.addEventListener('click', () => {
  const tokens = hidCustomHexEl.value
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);
  const bytes = new Uint8Array(hid.packetSize);
  for (let i = 0; i < Math.min(tokens.length, bytes.length); i++) {
    const val = parseInt(tokens[i], 16);
    bytes[i] = Number.isNaN(val) ? 0 : val & 0xff;
  }
  hid.sendRawPacket(bytes, 'Custom Hex Report');
});

btnHidClearLog.addEventListener('click', () => hid.clearLogs());

// ==========================================================================
// Profile Persistence (localStorage + JSON Export/Import)
// ==========================================================================

function saveProfile() {
  try {
    const payload = {
      layoutId: appState.layoutId,
      keymapId: appState.keymapId,
      view: appState.view,
      theme: appState.theme,
      rgb: rgb.getSnapshot(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (_) {}
}

function loadProfile() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data.layoutId && LAYOUTS[data.layoutId]) appState.layoutId = data.layoutId;
    if (data.keymapId && KEYMAPS[data.keymapId]) appState.keymapId = data.keymapId;
    if (data.view === 'iso' || data.view === 'flat') appState.view = data.view;
    if (VALID_THEMES.includes(data.theme)) appState.theme = data.theme;
    if (data.rgb) rgb.loadSnapshot(data.rgb);
  } catch (_) {}
}

btnExportProfile.addEventListener('click', () => {
  const payload = {
    app: 'Lory Web Keyboard Driver',
    layoutId: appState.layoutId,
    theme: appState.theme,
    rgb: rgb.getSnapshot(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `lory-profile-${appState.layoutId}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

btnImportProfile.addEventListener('click', () => importProfileInput.click());

importProfileInput.addEventListener('change', async () => {
  const file = importProfileInput.files?.[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (data.layoutId && LAYOUTS[data.layoutId]) appState.layoutId = data.layoutId;
    if (VALID_THEMES.includes(data.theme)) {
      appState.theme = data.theme;
      document.documentElement.setAttribute('data-theme', appState.theme);
      themeSelectEl.value = appState.theme;
    }
    if (data.rgb) rgb.loadSnapshot(data.rgb);
    renderLayoutSwitcher();
    renderKeyboard();
    syncRgbUiFromState();
    saveProfile();
  } catch (err) {
    alert(`Invalid profile JSON: ${err.message}`);
  }
  importProfileInput.value = '';
});

// ==========================================================================
// Boot
// ==========================================================================

loadProfile();
document.documentElement.setAttribute('data-theme', appState.theme);
themeSelectEl.value = appState.theme;
stageEl.classList.toggle('view-flat', appState.view === 'flat');
for (const b of viewSwitcherEl.querySelectorAll('.seg-btn')) {
  b.classList.toggle('active', b.dataset.view === appState.view);
}

renderLayoutSwitcher();
renderKeymapGrid();
renderPresets();
renderKeyboard();
applyOrbitAngles();
syncRgbUiFromState();
refreshDriverSelect();
renderHidUi(hid.getStatus());
rgb.start();

// Expose Fault-Tolerant Public API (window.Lory)
createLoryApi({
  rgb,
  hid,
  getState: () => appState,
  getValidThemes: () => [...VALID_THEMES],
  registerThemeId: (id, rgbDefault) => {
    if (!VALID_THEMES.includes(id)) VALID_THEMES.push(id);
    if (rgbDefault) PALETTE_RGB_DEFAULTS[id] = rgbDefault;
    if (themeSelectEl && !Array.from(themeSelectEl.options).some((o) => o.value === id)) {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = id;
      themeSelectEl.appendChild(opt);
    }
  },
  setLayout: (id) => {
    appState.layoutId = id;
    renderLayoutSwitcher();
    renderKeyboard();
    saveProfile();
  },
  setKeymap: (id) => {
    appState.keymapId = id;
    renderKeymapGrid();
    renderKeyboard();
    saveProfile();
  },
  setTheme: (id) => {
    appState.theme = id;
    document.documentElement.setAttribute('data-theme', id);
    if (themeSelectEl) themeSelectEl.value = id;
    const rgbDef = PALETTE_RGB_DEFAULTS[id];
    if (rgbDef) {
      rgb.updateState({ primaryColor: rgbDef.primary, secondaryColor: rgbDef.secondary });
      syncRgbUiFromState();
      hid.scheduleAutoSync(rgb.state);
    }
    saveProfile();
  },
  setView: (mode) => {
    appState.view = mode;
    if (mode === 'iso') {
      appState.rotX = 48;
      appState.rotZ = -18;
      applyOrbitAngles();
    } else if (orbitReadoutEl) {
      orbitReadoutEl.textContent = '0° / 0°';
    }
    stageEl.classList.toggle('view-flat', mode === 'flat');
    for (const b of viewSwitcherEl.querySelectorAll('.seg-btn')) {
      b.classList.toggle('active', b.dataset.view === mode);
    }
    computeAutoScale();
    saveProfile();
  },
  setOrbit: (rotX, rotZ) => {
    if (rotX !== undefined) appState.rotX = rotX;
    if (rotZ !== undefined) appState.rotZ = rotZ;
    if (appState.view === 'flat') {
      appState.view = 'iso';
      stageEl.classList.remove('view-flat');
      for (const b of viewSwitcherEl.querySelectorAll('.seg-btn')) {
        b.classList.toggle('active', b.dataset.view === 'iso');
      }
      computeAutoScale();
    }
    applyOrbitAngles();
  },
  setZoom: (z) => {
    appState.zoom = z;
    zoomSliderEl.value = String(z);
    zoomValueEl.textContent = `${z}%`;
    computeAutoScale();
  },
  pressKey,
  releaseKey,
  syncRgbUi: syncRgbUiFromState,
  saveProfile,
  refreshLayoutSwitcher: renderLayoutSwitcher,
  refreshKeymapGrid: renderKeymapGrid,
  refreshDriverSelect,
});

// ==========================================================================
// External Driver Loader (Bring Your Own Driver — .js file or URL)
// ==========================================================================

const EXTERNAL_DRIVERS_KEY = 'lory:externalDrivers';
const driverFileInputEl = document.getElementById('hid-driver-file');
const btnDriverFileEl = document.getElementById('btn-driver-file');
const btnDriverUrlEl = document.getElementById('btn-driver-url');
const btnDriverClearEl = document.getElementById('btn-driver-clear');

function readSavedDrivers() {
  try {
    const raw = localStorage.getItem(EXTERNAL_DRIVERS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function writeSavedDrivers(list) {
  try {
    if (list.length === 0) localStorage.removeItem(EXTERNAL_DRIVERS_KEY);
    else localStorage.setItem(EXTERNAL_DRIVERS_KEY, JSON.stringify(list));
  } catch (_) {}
  if (btnDriverClearEl) btnDriverClearEl.hidden = list.length === 0;
}

function executeDriverSource(code, label) {
  const fn = new Function(code);
  fn();
  refreshDriverSelect();
  renderLayoutSwitcher();
  hid.log('SYS', `Loaded external driver: ${label}`);
}

async function loadExternalDriverFromUrl(url, persist = true) {
  const cleanUrl = String(url || '').trim();
  if (!cleanUrl) return;
  try {
    const res = await fetch(cleanUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const code = await res.text();
    const label = cleanUrl.split('/').pop() || cleanUrl;
    executeDriverSource(code, label);
    if (persist) {
      const saved = readSavedDrivers().filter((d) => d.url !== cleanUrl && d.label !== label);
      saved.push({ type: 'url', url: cleanUrl, label });
      writeSavedDrivers(saved);
    }
  } catch (err) {
    hid.log('ERR', `Failed to load driver URL (${err.message})`);
  }
}

if (btnDriverFileEl && driverFileInputEl) {
  btnDriverFileEl.addEventListener('click', () => driverFileInputEl.click());
  driverFileInputEl.addEventListener('change', async () => {
    const file = driverFileInputEl.files?.[0];
    if (!file) return;
    try {
      const code = await file.text();
      executeDriverSource(code, file.name);
      const saved = readSavedDrivers().filter((d) => d.label !== file.name);
      saved.push({ type: 'code', label: file.name, code });
      writeSavedDrivers(saved);
    } catch (err) {
      hid.log('ERR', `Failed to load driver "${file.name}": ${err.message}`);
    }
    driverFileInputEl.value = '';
  });
}

if (btnDriverUrlEl) {
  btnDriverUrlEl.addEventListener('click', async () => {
    const url = window.prompt('Paste raw .js driver URL (e.g. GitHub raw URL):');
    if (url && url.trim()) {
      await loadExternalDriverFromUrl(url.trim(), true);
    }
  });
}

if (btnDriverClearEl) {
  btnDriverClearEl.addEventListener('click', () => {
    writeSavedDrivers([]);
    hid.log('SYS', 'Cleared saved external drivers. Reloading clean state...');
    window.location.reload();
  });
}

// Auto-restore user's saved external drivers on boot
(async function restoreExternalDrivers() {
  const saved = readSavedDrivers();
  if (btnDriverClearEl) btnDriverClearEl.hidden = saved.length === 0;
  for (const item of saved) {
    try {
      if (item.type === 'code' && item.code) {
        executeDriverSource(item.code, item.label || 'saved-driver.js');
      } else if (item.type === 'url' && item.url) {
        await loadExternalDriverFromUrl(item.url, false);
      }
    } catch (err) {
      hid.log('ERR', `Saved driver "${item.label}" failed to restore: ${err.message}`);
    }
  }
})();

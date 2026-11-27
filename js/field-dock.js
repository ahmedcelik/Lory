/* ==========================================================================
   Lory · Field Canvas Interactive Choreography
   Morphing Magnetic Dock, Braun Faders, Scrubbable Values, Ceramic Fan & Compass
   ========================================================================== */

const shell = document.getElementById('field-shell');
const dockDrawer = document.getElementById('dock-drawer');
const dockCollapseBtn = document.getElementById('btn-dock-collapse');
const paintToolsEl = document.getElementById('paint-tools');
const btnPaintModes = document.getElementById('btn-paint-modes');
const hidQuickBadge = document.getElementById('hid-quick-badge');
const stageEl = document.getElementById('stage');

// ==========================================================================
// 1. Morphing Magnetic Dock State Machine
// ==========================================================================

let dockState = 'rest'; // 'rest' | 'rgb' | 'paint' | 'webhid'

function setDockState(next) {
  dockState = next;
  shell.setAttribute('data-dock', next);
  const drawerOpen = next === 'rgb' || next === 'webhid' || next === 'keymap';
  dockDrawer.setAttribute('aria-hidden', String(!drawerOpen));
}

// Intercept dock tab clicks to toggle open/close smoothly
document.querySelectorAll('.dock-tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab; // 'rgb' | 'webhid'
    if (dockState === tab) {
      // Collapse back to paint bar if in custom paint mode, else rest
      setDockState(!paintToolsEl.hidden ? 'paint' : 'rest');
    } else {
      setDockState(tab);
    }
  });
});

// Top-right device status pill always opens Driver patchbay
hidQuickBadge.addEventListener('click', () => {
  setDockState('webhid');
});

// Collapse handle
dockCollapseBtn.addEventListener('click', () => {
  setDockState(!paintToolsEl.hidden ? 'paint' : 'rest');
});

// "Modes ▴" button inside collapsed paint bar opens full RGB console
btnPaintModes.addEventListener('click', () => {
  const rgbTabBtn = document.querySelector('.dock-tab[data-tab="rgb"]');
  if (rgbTabBtn && !document.getElementById('tab-rgb').classList.contains('active')) {
    rgbTabBtn.click();
  }
  setDockState('rgb');
});

// Auto-collapse into focused Paint Bar when user selects Per-Key Paint (custom mode)
let lastPaintHidden = paintToolsEl.hidden;
const paintObserver = new MutationObserver(() => {
  const isHidden = paintToolsEl.hidden;
  if (isHidden === lastPaintHidden) return;
  lastPaintHidden = isHidden;

  if (!isHidden) {
    // Entered custom paint mode -> smoothly collapse console to Paint Bar so keyboard is unobstructed
    setDockState('paint');
  } else if (dockState === 'paint') {
    setDockState('rest');
  }
});
paintObserver.observe(paintToolsEl, { attributes: true, attributeFilter: ['hidden'] });

// Click on bare drafting mat collapses expanded drawer
stageEl.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  if (e.target.closest('.keyboard') || e.target.closest('.corner-telemetry')) return;
  if (dockState === 'rgb' || dockState === 'webhid' || dockState === 'keymap') {
    setDockState(!paintToolsEl.hidden ? 'paint' : 'rest');
  }
});

// ==========================================================================
// 2. Expanding 5-Edition Ceramic Swatch Fan (Bidirectional with #theme-select)
// ==========================================================================

const themeSelect = document.getElementById('theme-select');
const editionFan = document.getElementById('edition-fan');
const editionTrigger = document.getElementById('edition-trigger');
const editionActiveDot = document.getElementById('edition-active-dot');
const editionActiveName = document.getElementById('edition-active-name');
const swatchBtns = Array.from(document.querySelectorAll('.swatch-btn'));

function syncEditionFan() {
  const val = themeSelect.value || 'edo';
  editionActiveDot.className = `ceramic-dot swatch-${val}`;
  for (const btn of swatchBtns) {
    const match = btn.dataset.themeVal === val;
    btn.classList.toggle('active', match);
    if (match) editionActiveName.textContent = btn.dataset.short;
  }
}

editionTrigger.addEventListener('click', (e) => {
  e.stopPropagation();
  const isOpen = editionFan.classList.toggle('open');
  editionTrigger.setAttribute('aria-expanded', String(isOpen));
});

swatchBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    const val = btn.dataset.themeVal;
    if (themeSelect.value !== val) {
      themeSelect.value = val;
      themeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }
    syncEditionFan();
    editionFan.classList.remove('open');
    editionTrigger.setAttribute('aria-expanded', 'false');
  });
});

document.addEventListener('click', (e) => {
  if (!editionFan.contains(e.target)) {
    editionFan.classList.remove('open');
    editionTrigger.setAttribute('aria-expanded', 'false');
  }
});

// Observe data-theme changes on <html> (e.g. from profile import or boot)
new MutationObserver(syncEditionFan).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['data-theme'],
});

// ==========================================================================
// 3. Braun Linear Faders & Scrubbable Numeric Values
// ==========================================================================

const faderConfigs = [
  {
    input: document.getElementById('rgb-brightness'),
    fill: document.getElementById('fill-brightness'),
    needle: document.getElementById('needle-brightness'),
    label: document.getElementById('val-brightness'),
  },
  {
    input: document.getElementById('rgb-speed'),
    fill: document.getElementById('fill-speed'),
    needle: document.getElementById('needle-speed'),
    label: document.getElementById('val-speed'),
  },
];

function syncFader(cfg) {
  const min = Number(cfg.input.min);
  const max = Number(cfg.input.max);
  const val = Number(cfg.input.value);
  const pct = Math.max(0, Math.min(100, ((val - min) / (max - min)) * 100));
  cfg.fill.style.width = `${pct}%`;
  cfg.needle.style.left = `${pct}%`;
}

faderConfigs.forEach((cfg) => {
  const wrap = cfg.input.closest('.braun-fader');
  cfg.input.addEventListener('input', () => syncFader(cfg));
  cfg.input.addEventListener('pointerdown', () => wrap.classList.add('dragging'));
  window.addEventListener('pointerup', () => wrap.classList.remove('dragging'));

  // Sync when app.js updates label programmatically (e.g. preset/import)
  new MutationObserver(() => syncFader(cfg)).observe(cfg.label, {
    childList: true,
    characterData: true,
    subtree: true,
  });
});

// Drag-to-scrub on any .scrubbable readout (Brightness, Speed, Zoom)
document.querySelectorAll('.scrubbable').forEach((el) => {
  const targetInput = document.getElementById(el.dataset.scrubFor);
  if (!targetInput) return;

  let startX = 0;
  let startVal = 0;
  let scrubbing = false;

  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    scrubbing = true;
    startX = e.clientX;
    startVal = Number(targetInput.value);
    el.classList.add('scrubbing');
    el.setPointerCapture(e.pointerId);
  });

  el.addEventListener('pointermove', (e) => {
    if (!scrubbing) return;
    const min = Number(targetInput.min);
    const max = Number(targetInput.max);
    const step = Number(targetInput.step) || 1;
    const sensitivity = e.shiftKey ? 0.25 : 1;
    const dx = (e.clientX - startX) * sensitivity;
    const range = max - min;
    const raw = startVal + (dx / 140) * range;
    const snapped = Math.round(raw / step) * step;
    const clamped = Math.max(min, Math.min(max, Number(snapped.toFixed(2))));

    if (Number(targetInput.value) !== clamped) {
      targetInput.value = clamped;
      targetInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });

  const endScrub = () => {
    if (!scrubbing) return;
    scrubbing = false;
    el.classList.remove('scrubbing');
  };
  el.addEventListener('pointerup', endScrub);
  el.addEventListener('pointercancel', endScrub);
});

// Zoom vernier buttons & double-click reset
const zoomSlider = document.getElementById('zoom-slider');
const zoomValue = document.getElementById('zoom-value');

function stepZoom(delta) {
  const min = Number(zoomSlider.min);
  const max = Number(zoomSlider.max);
  const next = Math.max(min, Math.min(max, Number(zoomSlider.value) + delta));
  zoomSlider.value = next;
  zoomSlider.dispatchEvent(new Event('input', { bubbles: true }));
}

document.getElementById('btn-zoom-out').addEventListener('click', () => stepZoom(-10));
document.getElementById('btn-zoom-in').addEventListener('click', () => stepZoom(10));
zoomValue.addEventListener('dblclick', () => {
  zoomSlider.value = 100;
  zoomSlider.dispatchEvent(new Event('input', { bubbles: true }));
});

// Double-click orbit readout resets to default 3D Iso angle
document.getElementById('orbit-hint').addEventListener('dblclick', () => {
  const isoBtn = document.querySelector('#view-switcher .seg-btn[data-view="iso"]');
  if (isoBtn) isoBtn.click();
});

// ==========================================================================
// 4. Radial Direction Compass Dial
// ==========================================================================

const compassDial = document.getElementById('compass-dial');
const compassNeedle = document.getElementById('compass-needle');
const directionContainer = document.getElementById('rgb-direction');
const DIR_ANGLES = { ltr: 90, rtl: -90, diagonal: 45, radial: 0 };
const DIR_ORDER = ['ltr', 'diagonal', 'rtl', 'radial'];

function syncCompass() {
  const activeBtn = directionContainer.querySelector('.seg-btn.active');
  const dir = activeBtn ? activeBtn.dataset.dir : 'diagonal';
  compassDial.classList.toggle('is-radial', dir === 'radial');
  if (dir !== 'radial') {
    compassNeedle.style.transform = `rotate(${DIR_ANGLES[dir] ?? 45}deg)`;
  }
}

compassDial.addEventListener('click', () => {
  const activeBtn = directionContainer.querySelector('.seg-btn.active');
  const cur = activeBtn ? activeBtn.dataset.dir : 'diagonal';
  const nextDir = DIR_ORDER[(DIR_ORDER.indexOf(cur) + 1) % DIR_ORDER.length];
  const target = directionContainer.querySelector(`.seg-btn[data-dir="${nextDir}"]`);
  if (target) target.click();
});

new MutationObserver(syncCompass).observe(directionContainer, {
  attributes: true,
  subtree: true,
  attributeFilter: ['class'],
});

// ==========================================================================
// 5. Ceramic Color Wells & Brush Swatch Sync
// ==========================================================================

const primaryInput = document.getElementById('rgb-primary');
const secondaryInput = document.getElementById('rgb-secondary');
const brushInput = document.getElementById('brush-color');
const swatchPrimary = document.getElementById('swatch-primary');
const swatchSecondary = document.getElementById('swatch-secondary');
const swatchBrush = document.getElementById('swatch-brush');
const brushHexVal = document.getElementById('brush-hex-val');

function syncSwatches() {
  swatchPrimary.style.background = primaryInput.value;
  swatchSecondary.style.background = secondaryInput.value;
  swatchBrush.style.background = primaryInput.value;
  brushHexVal.textContent = primaryInput.value.toUpperCase();
}

primaryInput.addEventListener('input', () => {
  brushInput.value = primaryInput.value;
  syncSwatches();
});
brushInput.addEventListener('input', () => {
  primaryInput.value = brushInput.value;
  syncSwatches();
});
secondaryInput.addEventListener('input', syncSwatches);

// Also sync swatches whenever theme/preset/mode/import updates #active-mode-badge or #rgb-presets
document.getElementById('rgb-presets').addEventListener('click', () => {
  requestAnimationFrame(syncSwatches);
});
themeSelect.addEventListener('change', () => {
  requestAnimationFrame(syncSwatches);
});
new MutationObserver(() => requestAnimationFrame(syncSwatches)).observe(
  document.getElementById('active-mode-badge'),
  { childList: true, characterData: true, subtree: true }
);

// ==========================================================================
// 6. Adaptive Silence, Acoustic Pulse & Expandable HID Packet Log
// ==========================================================================

const typingTape = document.getElementById('typing-bar');
const typingText = document.getElementById('typing-text');
const lastKeyReadout = document.getElementById('last-key-readout');
const soundToggle = document.getElementById('sound-toggle');

let idleTimer = null;
let silenceTimer = null;
let pulseTimer = null;

function onKeystrokeActivity() {
  typingTape.classList.remove('idle');
  shell.classList.add('typing-active');
  soundToggle.classList.add('key-pulse');

  clearTimeout(pulseTimer);
  pulseTimer = setTimeout(() => soundToggle.classList.remove('key-pulse'), 140);

  clearTimeout(silenceTimer);
  silenceTimer = setTimeout(() => shell.classList.remove('typing-active'), 1600);

  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => typingTape.classList.add('idle'), 4000);
}

new MutationObserver(onKeystrokeActivity).observe(lastKeyReadout, {
  childList: true,
  characterData: true,
  subtree: true,
});

// Expandable HID Packet Log
const btnExpandLog = document.getElementById('btn-hid-expand-log');
const hidConsole = document.getElementById('hid-console');
btnExpandLog.addEventListener('click', () => {
  const expanded = hidConsole.classList.toggle('expanded');
  btnExpandLog.textContent = expanded ? '⤡ Compact Log' : '⤢ Expand Log';
});

// ==========================================================================
// Initial Sync (runs right after ../js/app.js boot)
// ==========================================================================
requestAnimationFrame(() => {
  syncEditionFan();
  faderConfigs.forEach(syncFader);
  syncCompass();
  syncSwatches();
  if (!paintToolsEl.hidden) {
    setDockState('paint');
  }
  if (!typingText.textContent) {
    typingTape.classList.add('idle');
  }
});

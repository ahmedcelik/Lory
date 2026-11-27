// Lory Public Fault-Tolerant Driver & App API (window.Lory)
// Built for porting open-source keyboard repos (QMK/VIA, OpenRGB, Razer, Akko, Ajazz, etc.)
// and LLM-assisted reverse-engineering with strict fault isolation and graceful degradation.

import { LAYOUTS, LAYOUT_ORDER } from './layouts.js';
import { KEYMAPS, KEYMAP_ORDER } from './keymaps.js';
import { RGB_MODES, rgbToHex } from './rgbEngine.js';

const MODE_ALIASES = {
  rainbow: 'wave',
  spectrum: 'wave',
  cycle: 'wave',
  solid: 'static',
  fixed: 'static',
  breathe: 'breathing',
  pulse: 'breathing',
  shockwave: 'ripple',
  splash: 'ripple',
  trail: 'reactive',
  heatmap: 'reactive',
  ember: 'fire',
  flame: 'fire',
  rain: 'matrix',
  digital: 'matrix',
  paint: 'custom',
  perkey: 'custom',
  'per-key': 'custom',
  direct: 'custom',
  none: 'off',
  disabled: 'off',
};

const DIR_ALIASES = {
  left: 'ltr',
  right: 'rtl',
  'left-to-right': 'ltr',
  'right-to-left': 'rtl',
  diag: 'diagonal',
  circle: 'radial',
  center: 'radial',
};

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export function normalizeColor(input) {
  if (typeof input === 'string') {
    const clean = input.trim().replace(/^#/, '');
    if (/^[0-9a-fA-F]{3}$/.test(clean)) {
      return '#' + clean.split('').map((c) => c + c).join('').toLowerCase();
    }
    if (/^[0-9a-fA-F]{6}$/.test(clean)) {
      return '#' + clean.toLowerCase();
    }
    return null;
  }
  if (Array.isArray(input) && input.length >= 3) {
    const [r, g, b] = input.map(Number);
    if ([r, g, b].every(Number.isFinite)) return rgbToHex(r, g, b);
  }
  if (input && typeof input === 'object' && 'r' in input && 'g' in input && 'b' in input) {
    const r = Number(input.r);
    const g = Number(input.g);
    const b = Number(input.b);
    if ([r, g, b].every(Number.isFinite)) return rgbToHex(r, g, b);
  }
  return null;
}

function makeResult(ok, applied = null, warnings = [], errors = []) {
  return { ok, applied, warnings, errors };
}

export function createLoryApi(bridge) {
  const bus = new Map(); // event -> Set<fn>
  const dynamicThemeStyleEl = (() => {
    const el = document.createElement('style');
    el.id = 'lory-api-themes';
    document.head.appendChild(el);
    return el;
  })();

  function emit(event, payload) {
    const set = bus.get(event);
    if (!set) return;
    for (const fn of Array.from(set)) {
      try {
        fn(payload);
      } catch (err) {
        console.warn(`[Lory API] Listener error on "${event}":`, err);
      }
    }
  }

  function resolveKeyCode(codeOrLabel) {
    if (!codeOrLabel) return null;
    const layout = LAYOUTS[bridge.getState().layoutId];
    if (!layout) return null;
    const query = String(codeOrLabel).trim();
    const exact = layout.keys.find((k) => k.code === query);
    if (exact) return exact.code;
    const ciCode = layout.keys.find((k) => k.code.toLowerCase() === query.toLowerCase());
    if (ciCode) return ciCode.code;
    const byLabel = layout.keys.find((k) => k.label.toLowerCase() === query.toLowerCase());
    if (byLabel) return byLabel.code;
    if (query.length === 1 && /[a-z]/i.test(query)) {
      const inferred = `Key${query.toUpperCase()}`;
      if (layout.keys.some((k) => k.code === inferred)) return inferred;
    }
    return null;
  }

  // Forward WebHID internal events onto public event bus
  bridge.hid.onEvent((type, detail) => emit(type, detail));

  const api = {
    version: '1.0.0',

    // ======================================================================
    // Event Bus (fault-isolated subscribers)
    // ======================================================================
    on(event, handler) {
      if (typeof handler !== 'function') return () => {};
      if (!bus.has(event)) bus.set(event, new Set());
      bus.get(event).add(handler);
      return () => api.off(event, handler);
    },

    off(event, handler) {
      bus.get(event)?.delete(handler);
    },

    once(event, handler) {
      if (typeof handler !== 'function') return () => {};
      const wrapper = (payload) => {
        api.off(event, wrapper);
        handler(payload);
      };
      return api.on(event, wrapper);
    },

    // ======================================================================
    // RGB Lighting Control (fault-tolerant clamping, aliasing & color parsing)
    // ======================================================================
    rgb: {
      get() {
        return bridge.rgb.getSnapshot();
      },

      set(partial = {}) {
        const warnings = [];
        const errors = [];
        if (!partial || typeof partial !== 'object') {
          return makeResult(false, null, warnings, ['rgb.set() expects a config object']);
        }

        const patch = {};
        const validModes = new Set(RGB_MODES.map((m) => m.id));

        // Mode (with fuzzy aliasing)
        if (partial.mode !== undefined) {
          const raw = String(partial.mode).trim().toLowerCase();
          const resolved = validModes.has(raw) ? raw : MODE_ALIASES[raw];
          if (resolved) {
            patch.mode = resolved;
          } else {
            warnings.push(`Unknown RGB mode "${partial.mode}"; kept "${bridge.rgb.state.mode}"`);
          }
        }

        // Brightness (supports 0..100 or brightness255 0..255)
        if (partial.brightness255 !== undefined && partial.brightness === undefined) {
          const n = Number(partial.brightness255);
          if (Number.isFinite(n)) {
            patch.brightness = clamp(Math.round((n / 255) * 100), 0, 100);
          } else {
            warnings.push(`Invalid brightness255 "${partial.brightness255}" ignored`);
          }
        } else if (partial.brightness !== undefined) {
          const n = Number(partial.brightness);
          if (Number.isFinite(n)) {
            if (n < 0 || n > 100) warnings.push(`Clamped brightness ${n} into [0, 100]`);
            patch.brightness = clamp(Math.round(n), 0, 100);
          } else {
            warnings.push(`Invalid brightness "${partial.brightness}" ignored`);
          }
        }

        // Speed (0.2..3.0)
        if (partial.speed !== undefined) {
          const n = Number(partial.speed);
          if (Number.isFinite(n)) {
            if (n < 0.2 || n > 3.0) warnings.push(`Clamped speed ${n} into [0.2, 3.0]`);
            patch.speed = Number(clamp(n, 0.2, 3.0).toFixed(2));
          } else {
            warnings.push(`Invalid speed "${partial.speed}" ignored`);
          }
        }

        // Direction (with aliasing)
        if (partial.direction !== undefined) {
          const raw = String(partial.direction).trim().toLowerCase();
          const validDirs = new Set(['ltr', 'rtl', 'diagonal', 'radial']);
          const resolved = validDirs.has(raw) ? raw : DIR_ALIASES[raw];
          if (resolved) {
            patch.direction = resolved;
          } else {
            warnings.push(`Unknown direction "${partial.direction}" ignored`);
          }
        }

        // Colors (accepts hex, [r,g,b], {r,g,b}, or shorthand "color" / "brushColor" / "brush")
        const priInput = partial.primaryColor ?? partial.primary ?? partial.color ?? partial.brushColor ?? partial.brush;
        if (priInput !== undefined) {
          const hex = normalizeColor(priInput);
          if (hex) patch.primaryColor = hex;
          else warnings.push(`Invalid primaryColor "${priInput}" ignored`);
        }

        const secInput = partial.secondaryColor ?? partial.secondary;
        if (secInput !== undefined) {
          const hex = normalizeColor(secInput);
          if (hex) patch.secondaryColor = hex;
          else warnings.push(`Invalid secondaryColor "${secInput}" ignored`);
        }

        if (partial.underglow !== undefined) patch.underglow = Boolean(partial.underglow);
        if (partial.legendGlow !== undefined) patch.legendGlow = Boolean(partial.legendGlow);

        if (partial.customMap && typeof partial.customMap === 'object') {
          const nextMap = { ...bridge.rgb.state.customMap };
          for (const [k, v] of Object.entries(partial.customMap)) {
            const code = resolveKeyCode(k) || k;
            const hex = normalizeColor(v);
            if (hex) nextMap[code] = hex;
            else warnings.push(`Skipped invalid customMap color for "${k}"`);
          }
          patch.customMap = nextMap;
        }

        bridge.rgb.updateState(patch);
        bridge.syncRgbUi();
        bridge.saveProfile();
        bridge.hid.scheduleAutoSync(bridge.rgb.state);
        emit('rgb:change', bridge.rgb.getSnapshot());

        return makeResult(true, patch, warnings, errors);
      },

      setKey(codeOrLabel, color) {
        const code = resolveKeyCode(codeOrLabel);
        if (!code) {
          return makeResult(false, null, [`Key "${codeOrLabel}" not found in active layout`]);
        }
        if (color === null || color === '' || color === 'off') {
          bridge.rgb.setCustomKey(code, null);
        } else {
          const hex = normalizeColor(color);
          if (!hex) return makeResult(false, null, [], [`Invalid color "${color}"`]);
          bridge.rgb.setCustomKey(code, hex);
        }
        bridge.saveProfile();
        bridge.hid.scheduleAutoSync(bridge.rgb.state);
        emit('rgb:change', bridge.rgb.getSnapshot());
        return makeResult(true, { code, color: bridge.rgb.state.customMap[code] || null });
      },

      setKeys(map = {}, { switchToCustom = true } = {}) {
        const warnings = [];
        const applied = {};
        if (!map || typeof map !== 'object') {
          return makeResult(false, null, [], ['setKeys() expects an object of { key: color }']);
        }
        for (const [k, v] of Object.entries(map)) {
          const code = resolveKeyCode(k);
          if (!code) {
            warnings.push(`Skipped unknown key "${k}"`);
            continue;
          }
          const hex = normalizeColor(v);
          if (!hex) {
            warnings.push(`Skipped invalid color "${v}" for "${k}"`);
            continue;
          }
          bridge.rgb.setCustomKey(code, hex);
          applied[code] = hex;
        }
        if (switchToCustom) {
          bridge.rgb.updateState({ mode: 'custom' });
          bridge.syncRgbUi();
        }
        bridge.saveProfile();
        bridge.hid.scheduleAutoSync(bridge.rgb.state);
        emit('rgb:change', bridge.rgb.getSnapshot());
        return makeResult(true, applied, warnings);
      },

      clearKeys() {
        bridge.rgb.clearCustom();
        bridge.saveProfile();
        emit('rgb:change', bridge.rgb.getSnapshot());
        return makeResult(true, {});
      },
    },

    // ======================================================================
    // Physical Layout Control + Custom Hardware Matrix Registration
    // ======================================================================
    layout: {
      list() {
        return LAYOUT_ORDER.map((id) => ({
          id,
          name: LAYOUTS[id].name,
          shortName: LAYOUTS[id].shortName,
          keyCount: LAYOUTS[id].keys.length,
          widthU: LAYOUTS[id].widthU,
          heightU: LAYOUTS[id].heightU,
        }));
      },

      get() {
        const id = bridge.getState().layoutId;
        return LAYOUTS[id];
      },

      set(layoutId) {
        const id = String(layoutId || '').trim();
        if (!LAYOUTS[id]) {
          return makeResult(false, null, [`Unknown layout "${id}". Available: ${LAYOUT_ORDER.join(', ')}`]);
        }
        bridge.setLayout(id);
        emit('layout:change', { id, layout: LAYOUTS[id] });
        return makeResult(true, { id });
      },

      register(spec) {
        const warnings = [];
        if (!spec || typeof spec !== 'object' || !spec.id || !Array.isArray(spec.keys) || !spec.keys.length) {
          return makeResult(false, null, [], ['layout.register() requires { id, keys: [...] }']);
        }
        const id = String(spec.id).trim();
        const sanitizedKeys = [];
        let maxX = 0;
        let maxY = 0;

        for (let i = 0; i < spec.keys.length; i++) {
          const raw = spec.keys[i];
          if (!raw || typeof raw !== 'object') {
            warnings.push(`Skipped invalid key at index ${i}`);
            continue;
          }
          const x = Number.isFinite(Number(raw.x)) ? Number(raw.x) : i;
          const y = Number.isFinite(Number(raw.y)) ? Number(raw.y) : 0;
          const w = Number.isFinite(Number(raw.w)) && Number(raw.w) > 0 ? Number(raw.w) : 1;
          const h = Number.isFinite(Number(raw.h)) && Number(raw.h) > 0 ? Number(raw.h) : 1;
          const code = String(raw.code || `CustomKey${i}`);
          const label = raw.label !== undefined ? String(raw.label) : code;
          maxX = Math.max(maxX, x + w);
          maxY = Math.max(maxY, y + h);
          sanitizedKeys.push({
            code,
            label,
            x,
            y,
            w,
            h,
            accent: raw.accent ?? null,
            sub: raw.sub ?? null,
            homing: Boolean(raw.homing),
            matrix: Array.isArray(raw.matrix) ? raw.matrix : null,
            ledIndex: Number.isFinite(Number(raw.ledIndex)) ? Number(raw.ledIndex) : i,
          });
        }

        if (!sanitizedKeys.length) {
          return makeResult(false, null, warnings, ['No valid keys found in layout spec']);
        }

        LAYOUTS[id] = {
          id,
          name: String(spec.name || id),
          shortName: String(spec.shortName || id),
          keys: sanitizedKeys,
          widthU: maxX,
          heightU: maxY,
          defaultUnitPx: Number.isFinite(Number(spec.defaultUnitPx))
            ? Number(spec.defaultUnitPx)
            : maxX > 18 ? 42 : maxX > 14 ? 50 : 60,
        };
        if (!LAYOUT_ORDER.includes(id)) LAYOUT_ORDER.push(id);
        bridge.refreshLayoutSwitcher();
        return makeResult(true, { id, keyCount: sanitizedKeys.length }, warnings);
      },
    },

    // ======================================================================
    // Language / Keymap Control + Custom Keymap Registration
    // ======================================================================
    keymap: {
      list() {
        return KEYMAP_ORDER.map((id) => ({
          id,
          name: KEYMAPS[id].name,
          short: KEYMAPS[id].short,
          tag: KEYMAPS[id].tag,
        }));
      },

      get() {
        return KEYMAPS[bridge.getState().keymapId];
      },

      set(keymapId) {
        const id = String(keymapId || '').trim();
        if (!KEYMAPS[id]) {
          return makeResult(false, null, [`Unknown keymap "${id}". Available: ${KEYMAP_ORDER.join(', ')}`]);
        }
        bridge.setKeymap(id);
        emit('keymap:change', { id, keymap: KEYMAPS[id] });
        return makeResult(true, { id });
      },

      register(spec) {
        if (!spec || typeof spec !== 'object' || !spec.id || typeof spec.keys !== 'object') {
          return makeResult(false, null, [], ['keymap.register() requires { id, keys: { Code: { label, char, shift } } }']);
        }
        const id = String(spec.id).trim();
        KEYMAPS[id] = {
          id,
          name: String(spec.name || id),
          short: String(spec.short || id.toUpperCase()),
          tag: String(spec.tag || id.slice(0, 2).toUpperCase()),
          locale: String(spec.locale || 'en-US'),
          keys: spec.keys || {},
        };
        if (!KEYMAP_ORDER.includes(id)) KEYMAP_ORDER.push(id);
        bridge.refreshKeymapGrid();
        return makeResult(true, { id });
      },
    },

    // ======================================================================
    // Edition Theme Control + Dynamic Custom Colorway Registration
    // ======================================================================
    theme: {
      list() {
        return bridge.getValidThemes();
      },

      get() {
        return bridge.getState().theme;
      },

      set(themeId) {
        const id = String(themeId || '').trim();
        if (!bridge.getValidThemes().includes(id)) {
          return makeResult(false, null, [`Unknown theme "${id}". Available: ${bridge.getValidThemes().join(', ')}`]);
        }
        bridge.setTheme(id);
        emit('theme:change', { id });
        return makeResult(true, { id });
      },

      register(id, tokens = {}, rgbDefault = null) {
        const cleanId = String(id || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
        if (!cleanId || !tokens || typeof tokens !== 'object') {
          return makeResult(false, null, [], ['theme.register(id, tokens) requires a valid id and CSS token object']);
        }
        const decls = Object.entries(tokens)
          .filter(([k]) => k.startsWith('--'))
          .map(([k, v]) => `  ${k}: ${v};`)
          .join('\n');
        dynamicThemeStyleEl.textContent += `\n[data-theme="${cleanId}"] {\n${decls}\n}\n`;
        bridge.registerThemeId(cleanId, rgbDefault);
        return makeResult(true, { id: cleanId });
      },
    },

    // ======================================================================
    // Camera / View & Key Actuation
    // ======================================================================
    view: {
      get() {
        const s = bridge.getState();
        return { mode: s.view, rotX: s.rotX, rotZ: s.rotZ, zoom: s.zoom };
      },

      set(opts = {}) {
        const warnings = [];
        const applied = {};
        if (opts.mode === 'iso' || opts.mode === 'flat') {
          bridge.setView(opts.mode);
          applied.mode = opts.mode;
        } else if (opts.mode !== undefined) {
          warnings.push(`Unknown view mode "${opts.mode}"; expected "iso" or "flat"`);
        }
        if (opts.rotX !== undefined || opts.rotZ !== undefined) {
          const rx = opts.rotX !== undefined ? clamp(Number(opts.rotX), 0, 75) : undefined;
          const rz = opts.rotZ !== undefined ? Number(opts.rotZ) : undefined;
          bridge.setOrbit(rx, rz);
          if (rx !== undefined) applied.rotX = rx;
          if (rz !== undefined) applied.rotZ = rz;
        }
        if (opts.zoom !== undefined) {
          const z = clamp(Math.round(Number(opts.zoom)), 55, 145);
          if (Number.isFinite(z)) {
            bridge.setZoom(z);
            applied.zoom = z;
          }
        }
        return makeResult(true, applied, warnings);
      },
    },

    keys: {
      press(codeOrLabel, { typeChar = true } = {}) {
        const code = resolveKeyCode(codeOrLabel);
        if (!code) return makeResult(false, null, [`Key "${codeOrLabel}" not found in active layout`]);
        bridge.pressKey(code, false, typeChar);
        emit('key:down', { code });
        return makeResult(true, { code });
      },
      release(codeOrLabel) {
        const code = resolveKeyCode(codeOrLabel);
        if (!code) return makeResult(false, null, [`Key "${codeOrLabel}" not found in active layout`]);
        bridge.releaseKey(code);
        emit('key:up', { code });
        return makeResult(true, { code });
      },
      tap(codeOrLabel, { durationMs = 90, typeChar = true } = {}) {
        const res = api.keys.press(codeOrLabel, { typeChar });
        if (res.ok) setTimeout(() => api.keys.release(res.applied.code), clamp(Number(durationMs) || 90, 15, 2000));
        return res;
      },
    },

    // ======================================================================
    // WebHID Transport & Pluggable Driver Registry
    // ======================================================================
    drivers: {
      register(spec) {
        const res = bridge.hid.registerDriver(spec);
        if (res.ok) bridge.refreshDriverSelect();
        return res;
      },
      use(driverId) {
        const res = bridge.hid.useDriver(driverId);
        if (res.ok) bridge.refreshDriverSelect();
        return res;
      },
      list() {
        return bridge.hid.listDrivers();
      },
      getActive() {
        const d = bridge.hid.getActiveDriver();
        return d ? { id: d.id, name: d.name, capabilities: d.capabilities } : null;
      },
      sendCustom(command, payload) {
        return bridge.hid.sendCustomCommand(command, payload);
      },
    },

    hid: {
      status() {
        return bridge.hid.getStatus();
      },
      async connect(options = {}) {
        const ok = await bridge.hid.connectHardware(options);
        if (ok) await bridge.hid.sendRgbSync(bridge.rgb.state);
        return makeResult(ok, bridge.hid.getStatus());
      },
      attachSimulator() {
        bridge.hid.connectSimulator();
        bridge.hid.sendRgbSync(bridge.rgb.state);
        return makeResult(true, bridge.hid.getStatus());
      },
      async disconnect() {
        await bridge.hid.disconnect();
        return makeResult(true, bridge.hid.getStatus());
      },
      async send(bytesOrHex, opts = {}) {
        const ok = await bridge.hid.sendRawPacket(bytesOrHex, opts.label || 'API Raw Report', opts);
        return makeResult(ok, { sent: ok });
      },
      async syncRgb() {
        const ok = await bridge.hid.sendRgbSync(bridge.rgb.state);
        return makeResult(ok, { synced: ok });
      },
      async syncPerKey() {
        return bridge.hid.sendPerKeySync(bridge.rgb.state.customMap);
      },
      getLogs() {
        return [...bridge.hid.logs];
      },
    },

    // ======================================================================
    // Fault-Tolerant Universal Config Importer (for porting external configs)
    // ======================================================================
    importConfig(config = {}) {
      const warnings = [];
      const errors = [];
      const applied = {};

      if (!config || typeof config !== 'object') {
        return makeResult(false, applied, warnings, ['importConfig() expects a JSON object']);
      }

      if (config.customLayout) {
        const r = api.layout.register(config.customLayout);
        warnings.push(...r.warnings);
        errors.push(...r.errors);
        if (r.ok) {
          api.layout.set(r.applied.id);
          applied.layout = r.applied.id;
        }
      } else if (config.layout || config.layoutId) {
        const r = api.layout.set(config.layout || config.layoutId);
        warnings.push(...r.warnings);
        if (r.ok) applied.layout = r.applied.id;
      }

      if (config.customKeymap) {
        const r = api.keymap.register(config.customKeymap);
        warnings.push(...r.warnings);
        errors.push(...r.errors);
        if (r.ok) {
          api.keymap.set(r.applied.id);
          applied.keymap = r.applied.id;
        }
      } else if (config.keymap || config.keymapId) {
        const r = api.keymap.set(config.keymap || config.keymapId);
        warnings.push(...r.warnings);
        if (r.ok) applied.keymap = r.applied.id;
      }

      if (config.customTheme && config.customTheme.id && config.customTheme.tokens) {
        const r = api.theme.register(config.customTheme.id, config.customTheme.tokens, config.customTheme.rgbDefault);
        if (r.ok) {
          api.theme.set(r.applied.id);
          applied.theme = r.applied.id;
        }
      } else if (config.theme) {
        const r = api.theme.set(config.theme);
        warnings.push(...r.warnings);
        if (r.ok) applied.theme = r.applied.id;
      }

      if (config.driver && typeof config.driver === 'object') {
        const r = api.drivers.register(config.driver);
        warnings.push(...r.warnings);
        errors.push(...r.errors);
        if (r.ok) {
          api.drivers.use(r.id);
          applied.driver = r.id;
        }
      } else if (typeof config.driver === 'string') {
        const r = api.drivers.use(config.driver);
        warnings.push(...r.warnings);
        if (r.ok) applied.driver = r.id;
      }

      if (config.rgb && typeof config.rgb === 'object') {
        const r = api.rgb.set(config.rgb);
        warnings.push(...r.warnings);
        errors.push(...r.errors);
        if (r.ok) applied.rgb = r.applied;
      }

      if (config.view && typeof config.view === 'object') {
        const r = api.view.set(config.view);
        warnings.push(...r.warnings);
        if (r.ok) applied.view = r.applied;
      }

      return makeResult(errors.length === 0, applied, warnings, errors);
    },

    // ======================================================================
    // Machine-Readable Introspection (designed for LLMs porting keyboard repos)
    // ======================================================================
    describe() {
      return {
        api: 'Lory',
        version: api.version,
        state: {
          layout: bridge.getState().layoutId,
          keymap: bridge.getState().keymapId,
          theme: bridge.getState().theme,
          view: api.view.get(),
          rgb: api.rgb.get(),
          hid: api.hid.status(),
        },
        available: {
          layouts: api.layout.list(),
          keymaps: api.keymap.list(),
          themes: api.theme.list(),
          rgbModes: RGB_MODES.map((m) => m.id),
          drivers: api.drivers.list(),
        },
        events: [
          'ready',
          'key:down',
          'key:up',
          'rgb:change',
          'layout:change',
          'keymap:change',
          'theme:change',
          'driver:register',
          'driver:change',
          'hid:connect',
          'hid:disconnect',
          'hid:tx',
          'hid:rx',
          'hid:decoded',
          'hid:error',
        ],
      };
    },
  };

  // Expose globally and fire ready event
  window.Lory = api;
  window.dispatchEvent(new CustomEvent('lory:ready', { detail: api }));
  return api;
}

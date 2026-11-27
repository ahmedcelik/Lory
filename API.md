# Lory Fault-Tolerant Web Driver API (`window.Lory`)

Lory exposes a global, fault-tolerant API at `window.Lory` (and fires a `lory:ready` `CustomEvent` on `window` once booted).  
It is designed so you—or an LLM—can **port open-source keyboard repositories** (QMK/VIA, Vial, OpenRGB, OpenRazer, Keychron, Akko, Ajazz, Wooting, etc.) or **reverse-engineered USB HID captures** into Lory without crashing on missing or mismatched keyboard capabilities.

---

## Core Fault-Tolerance Guarantees
- **Never throws on partial or mismatched configs:** Every mutator returns `{ ok, applied, warnings, errors }`.
- **Automatic clamping & coercion:** Out-of-range brightness/speed/zoom values clamp safely with warnings; colors accept `'#ff00aa'`, `'ff00aa'`, `'#f0a'`, `[255, 0, 170]`, or `{ r, g, b }`; RGB modes and directions support fuzzy aliases (`'rainbow' → 'wave'`, `'solid' → 'static'`, `'perkey' → 'custom'`, etc.).
- **Capability-optional drivers:** A registered keyboard driver only needs to implement the hooks its hardware actually supports. Missing `encodeRgb`, `encodePerKey`, `decodeInput`, `init`, or `sendCustom` hooks degrade gracefully with warnings or fall back to safe defaults.
- **Fault-isolated event listeners & hooks:** Exceptions inside user listeners or driver hooks are caught, logged to the HID console, and never break the UI.

---

## 1. Machine-Readable Introspection (LLM Entry Point)

```js
// Inspect live state, available layouts/keymaps/themes/modes, registered drivers, and events:
const info = Lory.describe();
```

---

## 2. Registering a Ported Keyboard Driver (`Lory.drivers`)

Port any open-source HID protocol by registering a driver adapter. Only `id` is required—everything else is optional:

```js
Lory.drivers.register({
  id: 'my-75-kb',
  name: 'Custom 75% Vendor HID',
  // Optional WebHID device picker filters:
  filters: [{ vendorId: 0x3434, usagePage: 0xff60 }],
  reportId: 0x00,
  packetSize: 64,
  transport: 'output', // 'output' (sendReport) or 'feature' (sendFeatureReport)

  // Declare what this keyboard actually supports (used for graceful degradation):
  capabilities: {
    rgbModes: ['static', 'wave', 'breathing', 'custom', 'off'],
    perKeyRgb: true,
    underglow: false,
    brightness: [0, 100],
    speed: [0.2, 3.0],
  },

  // Optional auto-detection when a physical HID device connects:
  match: (device) => device.vendorId === 0x3434 && device.productId === 0x0123,

  // Optional handshake run right after device.open():
  async init(ctx) {
    await ctx.sendRaw('AA 01 00', { label: 'Wake Handshake' });
  },

  // Encode RGB state into 1 packet (Uint8Array | number[]) or multi-packet array (Uint8Array[]):
  encodeRgb(state, ctx) {
    const [r, g, b] = ctx.hexToRgb(state.primaryColor);
    const pkt = new Uint8Array(ctx.packetSize);
    pkt[0] = 0x55;
    pkt[1] = Math.round((state.brightness / 100) * 255);
    pkt[2] = r; pkt[3] = g; pkt[4] = b;
    return pkt;
  },

  // Optional per-key matrix encoder (returns single or multiple packets):
  encodePerKey(customMap, ctx) {
    const pkt = new Uint8Array(ctx.packetSize);
    pkt[0] = 0x56;
    // Map customMap['KeyA'] -> LED index bytes...
    return pkt;
  },

  // Optional incoming HID report parser:
  decodeInput(reportId, dataView) {
    return { cmd: dataView.getUint8(0), status: dataView.getUint8(1) };
  },

  // Optional vendor-specific commands (polling rate, debounce, actuation, macros):
  async sendCustom(command, payload, ctx) {
    if (command === 'pollingRate') {
      return ctx.sendRaw([0x55, 0x20, payload.hz === 1000 ? 1 : 0], { label: 'Set Polling Rate' });
    }
  },
});

Lory.drivers.use('my-75-kb');
```

---

## 3. Universal Fault-Tolerant Config Importer (`Lory.importConfig`)

Feed any partial or vendor-ported JSON object—invalid or unsupported fields produce warnings instead of errors:

```js
const report = Lory.importConfig({
  layout: 'compact65',
  keymap: 'tr-q',
  theme: 'midnight',
  rgb: {
    mode: 'rainbow',        // fuzzy-aliased -> 'wave'
    brightness255: 220,     // auto-scaled 0..255 -> 0..100
    color: [0, 229, 255],   // normalized -> '#00e5ff'
    speed: 1.4,
  },
  view: { mode: 'iso', rotX: 45, rotZ: -20, zoom: 105 },
});
// -> { ok: true, applied: {...}, warnings: [...], errors: [] }
```

---

## 4. Registering Custom Physical Layouts, Keymaps & Themes

```js
// Custom physical layout (supports optional hardware matrix [row, col] and ledIndex):
Lory.layout.register({
  id: 'macropad-2x2',
  name: '2×2 Macropad',
  shortName: '2×2 Pad',
  keys: [
    { code: 'F13', label: 'M1', x: 0, y: 0, matrix: [0, 0], ledIndex: 0 },
    { code: 'F14', label: 'M2', x: 1, y: 0, matrix: [0, 1], ledIndex: 1 },
    { code: 'F15', label: 'M3', x: 0, y: 1, matrix: [1, 0], ledIndex: 2 },
    { code: 'F16', label: 'M4', x: 1, y: 1, accent: 'orange', matrix: [1, 1], ledIndex: 3 },
  ],
});
Lory.layout.set('macropad-2x2');

// Custom language / regional keymap:
Lory.keymap.register({
  id: 'dvorak-mini',
  name: 'Dvorak',
  short: 'DVORAK',
  tag: 'DV',
  keys: {
    KeyQ: { label: "'", sub: '"', char: "'", shift: '"' },
    KeyW: { label: ',', sub: '<', char: ',', shift: '<' },
  },
});

// Custom colorway tokens:
Lory.theme.register('ocean', {
  '--stage-bg': '#07131a',
  '--case-top': '#0d2230',
  '--key-face-a': '#16384d',
  '--key-face-b': '#102b3d',
  '--key-char': '#7dd3fc',
}, { primary: '#38bdf8', secondary: '#0ea5e9' });
```

---

## 5. Quick API Reference

| Namespace | Methods |
|---|---|
| **`Lory.rgb`** | `get()`, `set(partial)`, `setKey(codeOrLabel, color)`, `setKeys(map, opts)`, `clearKeys()` |
| **`Lory.layout`** | `list()`, `get()`, `set(id)`, `register(spec)` |
| **`Lory.keymap`** | `list()`, `get()`, `set(id)`, `register(spec)` |
| **`Lory.theme`** | `list()`, `get()`, `set(id)`, `register(id, cssTokens, rgbDefault?)` |
| **`Lory.view`** | `get()`, `set({ mode?, rotX?, rotZ?, zoom? })` |
| **`Lory.keys`** | `press(codeOrLabel)`, `release(codeOrLabel)`, `tap(codeOrLabel, opts)` |
| **`Lory.drivers`** | `register(spec)`, `use(id)`, `list()`, `getActive()`, `sendCustom(cmd, payload)` |
| **`Lory.hid`** | `status()`, `connect(opts)`, `attachSimulator()`, `disconnect()`, `send(bytesOrHex, opts)`, `syncRgb()`, `syncPerKey()`, `getLogs()` |
| **Top-level** | `importConfig(json)`, `describe()`, `on(event, fn)`, `off(event, fn)`, `once(event, fn)` |

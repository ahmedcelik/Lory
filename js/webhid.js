// WebHID Keyboard Driver Bridge + Pluggable Fault-Tolerant Driver Registry + Virtual Simulator

import { hexToRgb } from './rgbEngine.js';

export const MODE_CODE_MAP = {
  off: 0x00,
  static: 0x01,
  wave: 0x02,
  breathing: 0x03,
  ripple: 0x04,
  reactive: 0x05,
  fire: 0x06,
  matrix: 0x07,
  custom: 0x08,
};

export const DIR_CODE_MAP = {
  ltr: 0x00,
  rtl: 0x01,
  diagonal: 0x02,
  radial: 0x03,
};

export function formatHex(bytes) {
  return Array.from(bytes)
    .map((b) => (b & 0xff).toString(16).padStart(2, '0').toUpperCase())
    .join(' ');
}

export function parseBytesInput(input, targetSize = null) {
  const warnings = [];
  let raw = [];

  if (input instanceof Uint8Array) {
    raw = Array.from(input);
  } else if (ArrayBuffer.isView(input)) {
    raw = Array.from(new Uint8Array(input.buffer, input.byteOffset, input.byteLength));
  } else if (Array.isArray(input)) {
    raw = input.map((v) => Number(v) & 0xff);
  } else if (typeof input === 'string') {
    const tokens = input
      .trim()
      .replace(/0x/gi, '')
      .split(/[\s,:-]+/)
      .filter(Boolean);
    for (const tok of tokens) {
      const parsed = parseInt(tok, 16);
      if (Number.isNaN(parsed)) {
        warnings.push(`Ignored invalid hex token "${tok}"`);
      } else {
        raw.push(parsed & 0xff);
      }
    }
  } else {
    warnings.push('Unsupported payload type; defaulted to empty packet');
  }

  const size = targetSize && targetSize > 0 ? targetSize : Math.max(1, raw.length);
  if (targetSize && raw.length > targetSize) {
    warnings.push(`Payload truncated from ${raw.length} to ${targetSize} bytes`);
  }
  const out = new Uint8Array(size);
  for (let i = 0; i < Math.min(raw.length, size); i++) {
    out[i] = raw[i] & 0xff;
  }
  return { bytes: out, warnings };
}

// Built-in reference driver adapters (registered via the same public registerDriver API)
function createBuiltinDrivers() {
  return [
    {
      id: 'raw-rgb',
      name: 'Raw HID RGB (0xAA 0x10)',
      reportId: 0x00,
      packetSize: 32,
      transport: 'output',
      capabilities: {
        rgbModes: Object.keys(MODE_CODE_MAP),
        perKeyRgb: false,
        underglow: true,
        legendGlow: true,
        brightness: [0, 100],
        speed: [0.2, 3.0],
      },
      encodeRgb(rgbState, ctx) {
        const packet = new Uint8Array(ctx.packetSize);
        const [r1, g1, b1] = hexToRgb(rgbState.primaryColor);
        const [r2, g2, b2] = hexToRgb(rgbState.secondaryColor);
        packet[0] = 0xaa;
        packet[1] = 0x10;
        packet[2] = MODE_CODE_MAP[rgbState.mode] ?? 0x01;
        packet[3] = Math.round((rgbState.brightness / 100) * 255);
        packet[4] = Math.round(Math.min(255, rgbState.speed * 85));
        packet[5] = DIR_CODE_MAP[rgbState.direction] ?? 0x00;
        packet[6] = r1;
        packet[7] = g1;
        packet[8] = b1;
        packet[9] = r2;
        packet[10] = g2;
        packet[11] = b2;
        packet[12] = rgbState.underglow ? 0x01 : 0x00;
        packet[13] = rgbState.legendGlow ? 0x01 : 0x00;
        return packet;
      },
    },
    {
      id: 'via-lighting',
      name: 'QMK / VIA Lighting (0x07)',
      reportId: 0x00,
      packetSize: 32,
      transport: 'output',
      capabilities: {
        rgbModes: Object.keys(MODE_CODE_MAP),
        perKeyRgb: false,
        underglow: true,
        brightness: [0, 100],
        speed: [0.2, 3.0],
      },
      encodeRgb(rgbState, ctx) {
        const packet = new Uint8Array(ctx.packetSize);
        const [r1, g1, b1] = hexToRgb(rgbState.primaryColor);
        const [r2, g2, b2] = hexToRgb(rgbState.secondaryColor);
        packet[0] = 0x07; // id_lighting_set_value
        packet[1] = 0x01; // RGB Matrix channel
        packet[2] = MODE_CODE_MAP[rgbState.mode] ?? 0x01;
        packet[3] = Math.round((rgbState.brightness / 100) * 255);
        packet[4] = Math.round(Math.min(255, rgbState.speed * 85));
        packet[5] = r1;
        packet[6] = g1;
        packet[7] = b1;
        packet[8] = r2;
        packet[9] = g2;
        packet[10] = b2;
        packet[11] = DIR_CODE_MAP[rgbState.direction] ?? 0x00;
        packet[12] = rgbState.underglow ? 0x01 : 0x00;
        return packet;
      },
    },
  ];
}

export class WebHidDriver {
  constructor() {
    this.device = null;
    this.simulated = false;
    this.autoSync = true;
    this.reportId = 0x00;
    this.packetSize = 32;
    this.transport = 'output'; // 'output' | 'feature'
    this.protocol = 'raw-rgb'; // active driver id
    this.logs = [];
    this.listeners = new Set();
    this.eventHooks = new Set();
    this.drivers = new Map();
    this._syncTimer = null;
    this._syncInFlight = false;
    this._pendingRgbState = null;
    this._ackWaiters = [];

    for (const builtin of createBuiltinDrivers()) {
      this.registerDriver(builtin);
    }

    if (this.isSupported()) {
      navigator.hid.addEventListener('disconnect', (e) => {
        if (this.device && e.device === this.device) {
          this.log('SYS', `Hardware disconnected: ${e.device.productName || 'HID Device'}`);
          this.device = null;
          this.emitEvent('hid:disconnect', { simulated: false });
          this.emit();
        }
      });
    }
  }

  isSupported() {
    return typeof navigator !== 'undefined' && 'hid' in navigator;
  }

  isConnected() {
    return Boolean(this.device?.opened) || this.simulated;
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onEvent(fn) {
    this.eventHooks.add(fn);
    return () => this.eventHooks.delete(fn);
  }

  emitEvent(type, detail) {
    for (const fn of this.eventHooks) {
      try {
        fn(type, detail);
      } catch (_) {}
    }
  }

  emit() {
    const info = this.getStatus();
    for (const fn of this.listeners) {
      try {
        fn(info);
      } catch (_) {}
    }
  }

  // ========================================================================
  // Fault-Tolerant Driver Adapter Registry
  // ========================================================================

  registerDriver(spec) {
    const warnings = [];
    if (!spec || typeof spec !== 'object') {
      return { ok: false, warnings, errors: ['Driver spec must be an object'] };
    }
    const id = String(spec.id || '').trim();
    if (!id) {
      return { ok: false, warnings, errors: ['Driver spec requires a non-empty string "id"'] };
    }

    const normalized = {
      id,
      name: String(spec.name || id),
      filters: Array.isArray(spec.filters) ? spec.filters : [],
      reportId: Number.isFinite(Number(spec.reportId)) ? Number(spec.reportId) & 0xff : 0x00,
      packetSize: Number.isFinite(Number(spec.packetSize)) && Number(spec.packetSize) > 0
        ? Math.min(1024, Math.round(Number(spec.packetSize)))
        : 32,
      transport: spec.transport === 'feature' ? 'feature' : 'output',
      waitAck: Boolean(spec.waitAck),
      ackTimeoutMs: Number.isFinite(Number(spec.ackTimeoutMs)) ? Math.max(0, Number(spec.ackTimeoutMs)) : 0,
      packetDelayMs: Number.isFinite(Number(spec.packetDelayMs)) ? Math.max(0, Number(spec.packetDelayMs)) : 0,
      capabilities: {
        rgbModes: Array.isArray(spec.capabilities?.rgbModes) ? spec.capabilities.rgbModes : Object.keys(MODE_CODE_MAP),
        perKeyRgb: Boolean(spec.capabilities?.perKeyRgb),
        underglow: spec.capabilities?.underglow ?? true,
        legendGlow: spec.capabilities?.legendGlow ?? true,
        brightness: Array.isArray(spec.capabilities?.brightness) ? spec.capabilities.brightness : [0, 100],
        speed: Array.isArray(spec.capabilities?.speed) ? spec.capabilities.speed : [0.2, 3.0],
        layouts: Array.isArray(spec.capabilities?.layouts) ? spec.capabilities.layouts : null,
        extra: spec.capabilities?.extra || {},
      },
      match: typeof spec.match === 'function' ? spec.match : null,
      init: typeof spec.init === 'function' ? spec.init : null,
      encodeRgb: typeof spec.encodeRgb === 'function' ? spec.encodeRgb : null,
      encodePerKey: typeof spec.encodePerKey === 'function' ? spec.encodePerKey : null,
      decodeInput: typeof spec.decodeInput === 'function' ? spec.decodeInput : null,
      sendCustom: typeof spec.sendCustom === 'function' ? spec.sendCustom : null,
    };

    if (!normalized.encodeRgb) {
      warnings.push(`Driver "${id}" has no encodeRgb() hook; RGB sync will fall back to raw-rgb framing.`);
    }

    this.drivers.set(id, normalized);
    this.emitEvent('driver:register', { id, name: normalized.name, capabilities: normalized.capabilities });
    return { ok: true, id, warnings, errors: [] };
  }

  getActiveDriver() {
    return this.drivers.get(this.protocol) || this.drivers.get('raw-rgb');
  }

  useDriver(id) {
    if (!this.drivers.has(id)) {
      return {
        ok: false,
        warnings: [],
        errors: [`Unknown driver "${id}". Registered: ${Array.from(this.drivers.keys()).join(', ')}`],
      };
    }
    const drv = this.drivers.get(id);
    this.protocol = drv.id;
    this.reportId = drv.reportId;
    this.packetSize = drv.packetSize;
    this.transport = drv.transport;
    this.log('SYS', `Switched protocol driver -> ${drv.name} (RID 0x${this.reportId.toString(16).padStart(2, '0')}, ${this.packetSize}B, ${this.transport})`);
    this.emitEvent('driver:change', { id: drv.id, name: drv.name, capabilities: drv.capabilities });
    this.emit();
    return { ok: true, id: drv.id, warnings: [], errors: [] };
  }

  listDrivers() {
    return Array.from(this.drivers.values()).map((d) => ({
      id: d.id,
      name: d.name,
      reportId: d.reportId,
      packetSize: d.packetSize,
      transport: d.transport,
      capabilities: d.capabilities,
      hasEncodeRgb: Boolean(d.encodeRgb),
      hasEncodePerKey: Boolean(d.encodePerKey),
      hasDecodeInput: Boolean(d.decodeInput),
      hasSendCustom: Boolean(d.sendCustom),
    }));
  }

  getContext() {
    return {
      reportId: this.reportId,
      packetSize: this.packetSize,
      transport: this.transport,
      simulated: this.simulated,
      device: this.device,
      hexToRgb,
      formatHex,
      sendRaw: (bytes, opts) => this.sendRawPacket(bytes, opts?.label || 'Driver Report', opts),
    };
  }

  // ========================================================================
  // Status & Logging
  // ========================================================================

  getStatus() {
    const activeDriver = this.getActiveDriver();
    if (this.device && this.device.opened) {
      return {
        supported: this.isSupported(),
        connected: true,
        simulated: false,
        driverId: activeDriver?.id || this.protocol,
        name: this.device.productName || 'WebHID Keyboard',
        vendorId: '0x' + this.device.vendorId.toString(16).padStart(4, '0').toUpperCase(),
        productId: '0x' + this.device.productId.toString(16).padStart(4, '0').toUpperCase(),
        collections: this.device.collections?.length || 0,
      };
    }
    if (this.simulated) {
      return {
        supported: this.isSupported(),
        connected: true,
        simulated: true,
        driverId: activeDriver?.id || this.protocol,
        name: 'Virtual Tactile-104 (Simulator)',
        vendorId: '0xFEED',
        productId: '0x6060',
        collections: 2,
      };
    }
    return {
      supported: this.isSupported(),
      connected: false,
      simulated: false,
      driverId: activeDriver?.id || this.protocol,
      name: 'No Device Connected',
      vendorId: '--',
      productId: '--',
      collections: 0,
    };
  }

  log(dir, message, bytes = null) {
    const now = new Date();
    const ts = now.toTimeString().slice(0, 8);
    const entry = {
      ts,
      dir, // 'TX' | 'RX' | 'SYS' | 'ERR'
      message,
      hex: bytes ? formatHex(bytes.slice(0, 16)) + (bytes.length > 16 ? ' …' : '') : null,
    };
    this.logs.unshift(entry);
    if (this.logs.length > 60) this.logs.pop();
    if (dir === 'TX') this.emitEvent('hid:tx', { message, bytes });
    if (dir === 'RX') this.emitEvent('hid:rx', { message, bytes });
    if (dir === 'ERR') this.emitEvent('hid:error', { message });
    this.emit();
  }

  clearLogs() {
    this.logs = [];
    this.emit();
  }

  // ========================================================================
  // Connection Lifecycle
  // ========================================================================

  async connectHardware(options = {}) {
    if (!this.isSupported()) {
      this.log('ERR', 'WebHID API not available in this browser (use Chrome/Edge over localhost/HTTPS).');
      return false;
    }
    try {
      const activeDriver = options.driverId ? this.drivers.get(options.driverId) : this.getActiveDriver();
      let filters = [];
      if (Array.isArray(options.filters)) {
        filters = options.filters;
      } else if (options.driverId) {
        filters = activeDriver?.filters || [];
      } else if (activeDriver?.filters?.length) {
        // Include filters from all registered drivers so wired/wireless variants can auto-match
        const seen = new Set();
        for (const drv of this.drivers.values()) {
          for (const f of drv.filters || []) {
            const key = JSON.stringify(f);
            if (!seen.has(key)) {
              seen.add(key);
              filters.push(f);
            }
          }
        }
      }

      const devices = await navigator.hid.requestDevice({ filters });
      if (!devices.length) {
        this.log('SYS', 'Device picker cancelled.');
        return false;
      }
      const dev = devices[0];
      if (!dev.opened) {
        await dev.open();
      }
      this.simulated = false;
      this.device = dev;

      // Auto-select matching registered driver if one explicitly matches this device
      if (!options.driverId) {
        for (const drv of this.drivers.values()) {
          if (drv.match) {
            try {
              if (drv.match(dev)) {
                this.useDriver(drv.id);
                break;
              }
            } catch (_) {}
          }
        }
      } else if (this.drivers.has(options.driverId)) {
        this.useDriver(options.driverId);
      }

      dev.addEventListener('inputreport', (event) => {
        const bytes = new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength);
        this._resolveAckWaiters(event.reportId, bytes);
        let decoded = null;
        const drv = this.getActiveDriver();
        if (drv?.decodeInput) {
          try {
            decoded = drv.decodeInput(event.reportId, event.data, this.getContext());
          } catch (err) {
            this.log('ERR', `Driver decodeInput error: ${err.message}`);
          }
        }
        const suffix = decoded && typeof decoded === 'object' ? ` · ${JSON.stringify(decoded)}` : '';
        this.log('RX', `Input Report 0x${event.reportId.toString(16).padStart(2, '0')}${suffix}`, bytes);
        if (decoded) this.emitEvent('hid:decoded', { reportId: event.reportId, decoded, bytes });
      });

      this.log(
        'SYS',
        `Connected ${dev.productName || 'HID Device'} (VID 0x${dev.vendorId
          .toString(16)
          .padStart(4, '0')} / PID 0x${dev.productId.toString(16).padStart(4, '0')})`
      );

      // Run optional driver init handshake safely
      const drv = this.getActiveDriver();
      if (drv?.init) {
        try {
          await drv.init(this.getContext());
        } catch (err) {
          this.log('ERR', `Driver init() warning: ${err.message}`);
        }
      }

      this.emitEvent('hid:connect', this.getStatus());
      this.emit();
      return true;
    } catch (err) {
      this.log('ERR', `WebHID connect failed: ${err.message}`);
      return false;
    }
  }

  connectSimulator() {
    if (this.device?.opened) {
      this.device.close().catch(() => {});
      this.device = null;
    }
    this.simulated = true;
    this.log('SYS', 'Attached Virtual Tactile-104 HID Simulator (VID 0xFEED / PID 0x6060)');
    this.emitEvent('hid:connect', this.getStatus());
    this.emit();
    return true;
  }

  async disconnect() {
    if (this.device) {
      try {
        if (this.device.opened) await this.device.close();
      } catch (_) {}
      this.log('SYS', `Disconnected ${this.device.productName || 'HID Device'}`);
      this.device = null;
    }
    if (this.simulated) {
      this.simulated = false;
      this.log('SYS', 'Detached Virtual HID Simulator');
    }
    this.emitEvent('hid:disconnect', { simulated: false });
    this.emit();
  }

  // ========================================================================
  // Packet Building & Fault-Tolerant Sending
  // ========================================================================

  _resolveAckWaiters(reportId, bytes) {
    if (!this._ackWaiters.length) return;
    const remaining = [];
    let resolved = false;
    for (const waiter of this._ackWaiters) {
      if (!resolved && waiter.match(reportId, bytes)) {
        resolved = true;
        clearTimeout(waiter.timer);
        waiter.resolve(true);
      } else {
        remaining.push(waiter);
      }
    }
    this._ackWaiters = remaining;
  }

  _createAckWaiter(reportId, expectedCmd, timeoutMs) {
    return new Promise((resolve) => {
      const waiter = {
        match: (rid, bytes) => {
          if (rid !== reportId) return false;
          if (expectedCmd !== null && bytes.length > 0 && bytes[0] !== expectedCmd) return false;
          return true;
        },
        resolve,
        timer: setTimeout(() => {
          this._ackWaiters = this._ackWaiters.filter((w) => w !== waiter);
          resolve(false);
        }, timeoutMs),
      };
      this._ackWaiters.push(waiter);
    });
  }

  buildRgbPackets(rgbState) {
    const drv = this.getActiveDriver();
    const fallback = this.drivers.get('raw-rgb');
    const ctx = this.getContext();
    let result = null;

    if (rgbState?.mode === 'custom' && drv?.encodePerKey) {
      try {
        result = drv.encodePerKey(rgbState.customMap || {}, ctx);
      } catch (err) {
        this.log('ERR', `Driver "${drv.id}" encodePerKey failed (${err.message}); falling back to encodeRgb.`);
      }
    }

    if (!result && drv?.encodeRgb) {
      try {
        result = drv.encodeRgb(rgbState, ctx);
      } catch (err) {
        this.log('ERR', `Driver "${drv.id}" encodeRgb failed (${err.message}); falling back to raw-rgb.`);
      }
    }

    if (!result && fallback?.encodeRgb) {
      result = fallback.encodeRgb(rgbState, ctx);
    }

    if (!result) return [];
    const list = Array.isArray(result) && (result[0] instanceof Uint8Array || Array.isArray(result[0]))
      ? result
      : [result];

    return list.map((item) => parseBytesInput(item, this.packetSize).bytes);
  }

  async sendRgbSync(rgbState) {
    if (!this.isConnected()) return false;
    // Serialize multi-packet transfers so rapid slider/mode changes never interleave on the wire
    if (this._syncInFlight) {
      this._pendingRgbState = {
        ...rgbState,
        customMap: rgbState?.customMap ? { ...rgbState.customMap } : {},
      };
      return true;
    }

    this._syncInFlight = true;
    let allOk = true;
    let current = rgbState;

    try {
      while (current && this.isConnected()) {
        const packets = this.buildRgbPackets(current);
        for (let i = 0; i < packets.length; i++) {
          if (!this.isConnected()) break;
          const label =
            packets.length > 1
              ? `RGB Sync [${i + 1}/${packets.length}] (${current.mode}, ${current.brightness}%)`
              : `RGB Sync (${current.mode}, ${current.brightness}%)`;
          const ok = await this.sendRawPacket(packets[i], label);
          if (!ok) allOk = false;
        }
        current = this._pendingRgbState;
        this._pendingRgbState = null;
      }
    } finally {
      this._syncInFlight = false;
      this._pendingRgbState = null;
    }
    return allOk;
  }

  async sendPerKeySync(customMap) {
    if (!this.isConnected()) {
      return { ok: false, warnings: ['No device connected'], errors: [] };
    }
    const drv = this.getActiveDriver();
    if (!drv?.encodePerKey) {
      return { ok: false, warnings: [`Driver "${drv?.id}" does not implement encodePerKey()`], errors: [] };
    }
    try {
      const result = drv.encodePerKey(customMap, this.getContext());
      const list = Array.isArray(result) && (result[0] instanceof Uint8Array || Array.isArray(result[0]))
        ? result
        : [result];
      for (let i = 0; i < list.length; i++) {
        const { bytes } = parseBytesInput(list[i], this.packetSize);
        await this.sendRawPacket(bytes, `Per-Key Frame [${i + 1}/${list.length}]`);
      }
      return { ok: true, warnings: [], errors: [] };
    } catch (err) {
      this.log('ERR', `encodePerKey failed: ${err.message}`);
      return { ok: false, warnings: [], errors: [err.message] };
    }
  }

  async sendCustomCommand(command, payload) {
    const drv = this.getActiveDriver();
    if (!drv?.sendCustom) {
      return { ok: false, warnings: [`Driver "${drv?.id}" does not implement sendCustom()`], errors: [] };
    }
    try {
      const res = await drv.sendCustom(command, payload, this.getContext());
      return { ok: true, result: res, warnings: [], errors: [] };
    } catch (err) {
      this.log('ERR', `sendCustom("${command}") failed: ${err.message}`);
      return { ok: false, warnings: [], errors: [err.message] };
    }
  }

  scheduleAutoSync(rgbState) {
    if (!this.autoSync || !this.isConnected()) return;
    clearTimeout(this._syncTimer);
    this._syncTimer = setTimeout(() => {
      this.sendRgbSync(rgbState);
    }, 120);
  }

  async sendRawPacket(input, label = 'Raw Report', opts = {}) {
    if (!this.isConnected()) {
      this.log('ERR', 'Cannot send report: no device connected.');
      return false;
    }

    const reportId = Number.isFinite(Number(opts.reportId)) ? Number(opts.reportId) & 0xff : this.reportId;
    const transport = opts.transport === 'feature' || opts.transport === 'output' ? opts.transport : this.transport;
    const targetSize = opts.exactLength ? null : this.packetSize;
    const { bytes, warnings } = parseBytesInput(input, targetSize);
    for (const w of warnings) this.log('SYS', `Packet notice: ${w}`);

    if (this.simulated) {
      const tag = transport === 'feature' ? 'FEAT' : 'OUT';
      this.log('TX', `[SIM:${tag}] ${label} (RID 0x${reportId.toString(16).padStart(2, '0')})`, bytes);
      const ack = new Uint8Array([0xaa, 0x00, bytes[1] || 0x00, 0x01]);
      setTimeout(() => {
        if (this.simulated) this.log('RX', '[SIM] ACK OK', ack);
      }, 35);
      return true;
    }

    try {
      const drv = this.getActiveDriver();
      const shouldWaitAck = opts.waitAck !== undefined ? Boolean(opts.waitAck) : Boolean(drv?.waitAck);
      const ackTimeoutMs = Number.isFinite(Number(opts.ackTimeoutMs))
        ? Number(opts.ackTimeoutMs)
        : (drv?.ackTimeoutMs || 150);
      const packetDelayMs = Number.isFinite(Number(opts.packetDelayMs))
        ? Number(opts.packetDelayMs)
        : (drv?.packetDelayMs || 0);

      let ackPromise = null;
      if (shouldWaitAck && transport === 'output' && ackTimeoutMs > 0) {
        const expectedCmd = bytes.length > 0 ? bytes[0] : null;
        ackPromise = this._createAckWaiter(reportId, expectedCmd, ackTimeoutMs);
      }

      if (transport === 'feature') {
        await this.device.sendFeatureReport(reportId, bytes);
      } else {
        await this.device.sendReport(reportId, bytes);
      }
      this.log('TX', `${label} (${transport.toUpperCase()} RID 0x${reportId.toString(16).padStart(2, '0')})`, bytes);

      if (ackPromise) {
        await ackPromise;
      }
      if (packetDelayMs > 0) {
        await new Promise((r) => setTimeout(r, packetDelayMs));
      }
      return true;
    } catch (err) {
      this.log('ERR', `send${transport === 'feature' ? 'Feature' : ''}Report failed: ${err.message}`);
      return false;
    }
  }
}

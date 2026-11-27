<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/logo-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="./assets/logo-light.svg">
    <img alt="Lory Logo" src="./assets/logo-light.svg" width="96">
  </picture>
</p>

<h1 align="center">Lory</h1>

<p align="center">
  A clean, effortless, cross-platform WebHID keyboard driver host and RGB studio — built as a vendor-agnostic alternative to bloated Windows-only OEM utilities.
</p>

<p align="center">
  <strong>Live App:</strong> <a href="https://ahmedcelik.github.io/Lory/">https://ahmedcelik.github.io/Lory/</a>
</p>

---

## Why Lory?

Most mechanical keyboard vendors ship heavy, Windows-only OEM utilities with dated interfaces and fragile background services. **Lory** was created to provide a lightweight, cross-platform, zero-install interface that runs directly in any Chromium-based browser via **WebHID**.

By design, **Lory ships with zero vendor-specific drivers, layouts, or proprietary protocols bundled inside the core app.** Instead, it follows a **Bring Your Own Driver** architecture: Lory provides the generic 3D/2D keyboard stage, RGB studio, and Driver API, while hardware-specific drivers live independently as external `.js` plugins.

### Highlights
- **Zero-install WebHID host** — works on Windows, macOS, and Linux in Chromium-based browsers (**Brave**, **Helium**, **Thorium**, etc.) from any local or static server.
- **Vendor-agnostic core** — ships only with standard layouts (`100%`, `80% TKL`, `65%`, `60%`, `Numpad`), generic RGB modes, and a built-in Virtual Simulator.
- **Dynamic External Driver Loader** — load any third-party `.js` keyboard driver from a local file or raw URL directly inside the **Driver** dock (persisted in `localStorage`).
- **Modular Plugin API** — external drivers can register their own HID framing, physical layouts, hardware lighting modes, and custom UI controls without touching core app code.

---

## Loading & Building External Drivers

Lory exposes a fault-tolerant public API documented in [`API.md`](./API.md):

1. Open the **Driver** dock in Lory.
2. Click **Load .js** to pick a local driver file, or **Load URL** to load a raw `.js` driver URL.
3. The driver registers its own layouts, hardware modes, and WebHID protocol handlers automatically and persists across refreshes until you click **Clear Saved**.

To build a driver for your own keyboard, see [`API.md`](./API.md) for `window.Lory.drivers.register(...)` and `window.Lory.layout.register(...)`.

---

## Quick Start

Use the hosted version directly at **[https://ahmedcelik.github.io/Lory/](https://ahmedcelik.github.io/Lory/)**, or serve the repository locally over `localhost` (required by WebHID):

```bash
# Using Python
python3 -m http.server 8080

# Or using Node
npx serve .
```

Then open `http://127.0.0.1:8080` in a Chromium-based browser (**Brave**, **Helium**, **Thorium**, etc.).

> **Browser Compatibility:** Gecko-based browsers (e.g. Firefox, LibreWolf, Zen) cannot be used for hardware control because they do not support WebUSB / WebHID.

---

## WebHID Limitations & Future Native App Potential

Running inside a browser makes Lory effortless to try across platforms, but **WebHID imposes hard browser-level limits**:

- **Background tab throttling:** Chromium throttles timers in background tabs, which restricts high-rate real-time RGB streaming (such as audio visualizers) when switching to other tabs.
- **No native system audio loopback:** Capturing music/system audio requires browser screen/tab sharing prompts (`getDisplayMedia`) rather than silent OS audio loopback.
- **No system tray, auto-start, or background daemon:** Profiles, macros, and dynamic lighting stop once the browser tab is closed.
- **Per-origin permission prompts & HID interface restrictions:** Certain OS-reserved HID usages and low-level USB operations are blocked by the browser sandbox.

If Lory evolves into a dedicated **native desktop application** (for example using **Tauri** as an optional future path), it could unlock native HID access, OS-level audio visualizers, background tray persistence, automatic per-app lighting profiles, and much faster, jitter-free real-time streaming.

---

## Roadmap

- [ ] Keymap & macro editor support in the Driver API
- [ ] Driver manifest / catalog loading for external driver repositories
- [ ] *(Optional / Exploratory)* Evaluate a lightweight desktop build (e.g. **Tauri**) to overcome WebHID browser limitations

---

## License

MIT

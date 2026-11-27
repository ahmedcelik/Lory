// Physical keyboard layout definitions in standard keycap units (1u = 1 key unit)
// Each key has: code (KeyboardEvent.code), label, optional sub, x, y, w (default 1), h (default 1), accent ('orange' | 'mod' | null)

const k = (code, label, x, y, opts = {}) => ({
  code,
  label,
  x,
  y,
  w: opts.w ?? 1,
  h: opts.h ?? 1,
  accent: opts.accent ?? null,
  sub: opts.sub ?? null,
  homing: opts.homing ?? false,
});

// Helper to lay out a horizontal row starting at (startX, y)
function buildRow(y, startX, items) {
  let cursor = startX;
  const out = [];
  for (const item of items) {
    if (typeof item === 'number') {
      cursor += item; // gap in u
      continue;
    }
    const [code, label, opts = {}] = item;
    const w = opts.w ?? 1;
    out.push(k(code, label, cursor, y, opts));
    cursor += w;
  }
  return out;
}

function buildMainBlock(offsetY = 0) {
  const keys = [];
  // Number row
  keys.push(
    ...buildRow(offsetY + 0, 0, [
      ['Backquote', '`', { sub: '~' }],
      ['Digit1', '1', { sub: '!' }],
      ['Digit2', '2', { sub: '@' }],
      ['Digit3', '3', { sub: '#' }],
      ['Digit4', '4', { sub: '$' }],
      ['Digit5', '5', { sub: '%' }],
      ['Digit6', '6', { sub: '^' }],
      ['Digit7', '7', { sub: '&' }],
      ['Digit8', '8', { sub: '*' }],
      ['Digit9', '9', { sub: '(' }],
      ['Digit0', '0', { sub: ')' }],
      ['Minus', '-', { sub: '_' }],
      ['Equal', '=', { sub: '+' }],
      ['Backspace', 'Backspace', { w: 2, accent: 'mod' }],
    ])
  );
  // QWERTY row
  keys.push(
    ...buildRow(offsetY + 1, 0, [
      ['Tab', 'Tab', { w: 1.5, accent: 'mod' }],
      ['KeyQ', 'Q'],
      ['KeyW', 'W'],
      ['KeyE', 'E'],
      ['KeyR', 'R'],
      ['KeyT', 'T'],
      ['KeyY', 'Y'],
      ['KeyU', 'U'],
      ['KeyI', 'I'],
      ['KeyO', 'O'],
      ['KeyP', 'P'],
      ['BracketLeft', '[', { sub: '{' }],
      ['BracketRight', ']', { sub: '}' }],
      ['Backslash', '\\', { w: 1.5, accent: 'mod', sub: '|' }],
    ])
  );
  // Home row
  keys.push(
    ...buildRow(offsetY + 2, 0, [
      ['CapsLock', 'Caps', { w: 1.75, accent: 'mod' }],
      ['KeyA', 'A'],
      ['KeyS', 'S'],
      ['KeyD', 'D'],
      ['KeyF', 'F', { homing: true }],
      ['KeyG', 'G'],
      ['KeyH', 'H'],
      ['KeyJ', 'J', { homing: true }],
      ['KeyK', 'K'],
      ['KeyL', 'L'],
      ['Semicolon', ';', { sub: ':' }],
      ['Quote', "'", { sub: '"' }],
      ['Enter', 'Enter', { w: 2.25, accent: 'orange' }],
    ])
  );
  // Shift row
  keys.push(
    ...buildRow(offsetY + 3, 0, [
      ['ShiftLeft', 'Shift', { w: 2.25, accent: 'mod' }],
      ['KeyZ', 'Z'],
      ['KeyX', 'X'],
      ['KeyC', 'C'],
      ['KeyV', 'V'],
      ['KeyB', 'B'],
      ['KeyN', 'N'],
      ['KeyM', 'M'],
      ['Comma', ',', { sub: '<' }],
      ['Period', '.', { sub: '>' }],
      ['Slash', '/', { sub: '?' }],
      ['ShiftRight', 'Shift', { w: 2.75, accent: 'mod' }],
    ])
  );
  // Bottom row
  keys.push(
    ...buildRow(offsetY + 4, 0, [
      ['ControlLeft', 'Ctrl', { w: 1.25, accent: 'mod' }],
      ['MetaLeft', 'Win', { w: 1.25, accent: 'mod' }],
      ['AltLeft', 'Alt', { w: 1.25, accent: 'mod' }],
      ['Space', '', { w: 6.25 }],
      ['AltRight', 'Alt', { w: 1.25, accent: 'mod' }],
      ['MetaRight', 'Fn', { w: 1.25, accent: 'mod' }],
      ['ContextMenu', 'Menu', { w: 1.25, accent: 'mod' }],
      ['ControlRight', 'Ctrl', { w: 1.25, accent: 'mod' }],
    ])
  );
  return keys;
}

function buildFunctionRow() {
  return buildRow(0, 0, [
    ['Escape', 'Esc', { accent: 'orange' }],
    1,
    ['F1', 'F1'],
    ['F2', 'F2'],
    ['F3', 'F3'],
    ['F4', 'F4'],
    0.5,
    ['F5', 'F5'],
    ['F6', 'F6'],
    ['F7', 'F7'],
    ['F8', 'F8'],
    0.5,
    ['F9', 'F9'],
    ['F10', 'F10'],
    ['F11', 'F11'],
    ['F12', 'F12'],
  ]);
}

function buildNavCluster(startX = 15.25, offsetY = 1.25) {
  const keys = [];
  // Top row aligned with F-row
  keys.push(
    ...buildRow(0, startX, [
      ['PrintScreen', 'Prt', { accent: 'mod' }],
      ['ScrollLock', 'Scr', { accent: 'mod' }],
      ['Pause', 'Pau', { accent: 'mod' }],
    ])
  );
  // 6-key nav block
  keys.push(
    ...buildRow(offsetY + 0, startX, [
      ['Insert', 'Ins', { accent: 'mod' }],
      ['Home', 'Hm', { accent: 'mod' }],
      ['PageUp', 'PgU', { accent: 'mod' }],
    ])
  );
  keys.push(
    ...buildRow(offsetY + 1, startX, [
      ['Delete', 'Del', { accent: 'mod' }],
      ['End', 'End', { accent: 'mod' }],
      ['PageDown', 'PgD', { accent: 'mod' }],
    ])
  );
  // Arrow cluster
  keys.push(k('ArrowUp', '▲', startX + 1, offsetY + 3, { accent: 'orange' }));
  keys.push(
    ...buildRow(offsetY + 4, startX, [
      ['ArrowLeft', '◀', { accent: 'orange' }],
      ['ArrowDown', '▼', { accent: 'orange' }],
      ['ArrowRight', '▶', { accent: 'orange' }],
    ])
  );
  return keys;
}

function buildNumpadCluster(startX = 18.5, offsetY = 1.25) {
  const keys = [];
  keys.push(
    ...buildRow(offsetY + 0, startX, [
      ['NumLock', 'Num', { accent: 'mod' }],
      ['NumpadDivide', '/', { accent: 'mod' }],
      ['NumpadMultiply', '*', { accent: 'mod' }],
      ['NumpadSubtract', '-', { accent: 'orange' }],
    ])
  );
  keys.push(
    ...buildRow(offsetY + 1, startX, [
      ['Numpad7', '7'],
      ['Numpad8', '8'],
      ['Numpad9', '9'],
    ])
  );
  keys.push(k('NumpadAdd', '+', startX + 3, offsetY + 1, { h: 2, accent: 'orange' }));
  keys.push(
    ...buildRow(offsetY + 2, startX, [
      ['Numpad4', '4'],
      ['Numpad5', '5', { homing: true }],
      ['Numpad6', '6'],
    ])
  );
  keys.push(
    ...buildRow(offsetY + 3, startX, [
      ['Numpad1', '1'],
      ['Numpad2', '2'],
      ['Numpad3', '3'],
    ])
  );
  keys.push(k('NumpadEnter', '↵', startX + 3, offsetY + 3, { h: 2, accent: 'orange' }));
  keys.push(
    ...buildRow(offsetY + 4, startX, [
      ['Numpad0', '0', { w: 2 }],
      ['NumpadDecimal', '.'],
    ])
  );
  return keys;
}

function build65Layout() {
  const keys = [];
  keys.push(
    ...buildRow(0, 0, [
      ['Escape', 'Esc', { accent: 'orange' }],
      ['Digit1', '1'],
      ['Digit2', '2'],
      ['Digit3', '3'],
      ['Digit4', '4'],
      ['Digit5', '5'],
      ['Digit6', '6'],
      ['Digit7', '7'],
      ['Digit8', '8'],
      ['Digit9', '9'],
      ['Digit0', '0'],
      ['Minus', '-'],
      ['Equal', '='],
      ['Backspace', '⌫', { w: 2, accent: 'mod' }],
      ['Home', 'Hm', { accent: 'mod' }],
    ])
  );
  keys.push(
    ...buildRow(1, 0, [
      ['Tab', 'Tab', { w: 1.5, accent: 'mod' }],
      ['KeyQ', 'Q'],
      ['KeyW', 'W'],
      ['KeyE', 'E'],
      ['KeyR', 'R'],
      ['KeyT', 'T'],
      ['KeyY', 'Y'],
      ['KeyU', 'U'],
      ['KeyI', 'I'],
      ['KeyO', 'O'],
      ['KeyP', 'P'],
      ['BracketLeft', '['],
      ['BracketRight', ']'],
      ['Backslash', '\\', { w: 1.5, accent: 'mod' }],
      ['PageUp', 'PgU', { accent: 'mod' }],
    ])
  );
  keys.push(
    ...buildRow(2, 0, [
      ['CapsLock', 'Caps', { w: 1.75, accent: 'mod' }],
      ['KeyA', 'A'],
      ['KeyS', 'S'],
      ['KeyD', 'D'],
      ['KeyF', 'F'],
      ['KeyG', 'G'],
      ['KeyH', 'H'],
      ['KeyJ', 'J'],
      ['KeyK', 'K'],
      ['KeyL', 'L'],
      ['Semicolon', ';'],
      ['Quote', "'"],
      ['Enter', 'Enter', { w: 2.25, accent: 'orange' }],
      ['PageDown', 'PgD', { accent: 'mod' }],
    ])
  );
  keys.push(
    ...buildRow(3, 0, [
      ['ShiftLeft', 'Shift', { w: 2.25, accent: 'mod' }],
      ['KeyZ', 'Z'],
      ['KeyX', 'X'],
      ['KeyC', 'C'],
      ['KeyV', 'V'],
      ['KeyB', 'B'],
      ['KeyN', 'N'],
      ['KeyM', 'M'],
      ['Comma', ','],
      ['Period', '.'],
      ['Slash', '/'],
      ['ShiftRight', 'Shift', { w: 1.75, accent: 'mod' }],
      ['ArrowUp', '▲', { accent: 'orange' }],
      ['End', 'End', { accent: 'mod' }],
    ])
  );
  keys.push(
    ...buildRow(4, 0, [
      ['ControlLeft', 'Ctrl', { w: 1.25, accent: 'mod' }],
      ['MetaLeft', 'Win', { w: 1.25, accent: 'mod' }],
      ['AltLeft', 'Alt', { w: 1.25, accent: 'mod' }],
      ['Space', '', { w: 6.25 }],
      ['AltRight', 'Alt', { w: 1, accent: 'mod' }],
      ['MetaRight', 'Fn', { w: 1, accent: 'mod' }],
      ['ControlRight', 'Ctrl', { w: 1, accent: 'mod' }],
      ['ArrowLeft', '◀', { accent: 'orange' }],
      ['ArrowDown', '▼', { accent: 'orange' }],
      ['ArrowRight', '▶', { accent: 'orange' }],
    ])
  );
  return keys;
}

function build60Layout() {
  const keys = buildMainBlock(0);
  // Replace Backquote with Esc in 60%
  keys[0] = k('Escape', 'Esc', 0, 0, { accent: 'orange' });
  return keys;
}

function buildCodepenNumpad() {
  // Exact tribute to https://codepen.io/ykadosh/pen/bGKgxbe
  return [
    ...buildRow(0, 0, [
      ['Numpad7', '7'],
      ['Numpad8', '8'],
      ['Numpad9', '9'],
    ]),
    ...buildRow(1, 0, [
      ['Numpad4', '4'],
      ['Numpad5', '5'],
      ['Numpad6', '6'],
    ]),
    ...buildRow(2, 0, [
      ['Numpad1', '1'],
      ['Numpad2', '2'],
      ['Numpad3', '3'],
    ]),
    ...buildRow(3, 0, [
      ['Numpad0', '0', { w: 2 }],
      ['NumpadDecimal', '.'],
    ]),
    k('NumpadAdd', '+', 3, 0, { h: 2, accent: 'orange' }),
    k('NumpadSubtract', '-', 3, 2, { h: 2, accent: 'orange' }),
  ];
}

function computeBounds(keys) {
  let maxX = 0;
  let maxY = 0;
  for (const key of keys) {
    maxX = Math.max(maxX, key.x + key.w);
    maxY = Math.max(maxY, key.y + key.h);
  }
  return { widthU: maxX, heightU: maxY };
}

function makeLayout(id, name, shortName, keys, defaultUnitPx) {
  const { widthU, heightU } = computeBounds(keys);
  return {
    id,
    name,
    shortName,
    keys,
    widthU,
    heightU,
    defaultUnitPx,
  };
}

export const LAYOUTS = {
  full: makeLayout(
    'full',
    'Full Size (100% · 104 Keys)',
    '100% Full',
    [...buildFunctionRow(), ...buildMainBlock(1.25), ...buildNavCluster(15.25, 1.25), ...buildNumpadCluster(18.5, 1.25)],
    42
  ),
  tkl: makeLayout(
    'tkl',
    'Tenkeyless (80% · 87 Keys)',
    '80% TKL',
    [...buildFunctionRow(), ...buildMainBlock(1.25), ...buildNavCluster(15.25, 1.25)],
    48
  ),
  compact65: makeLayout(
    'compact65',
    'Compact 65% (68 Keys)',
    '65%',
    build65Layout(),
    54
  ),
  minimal60: makeLayout(
    'minimal60',
    'Minimal 60% (61 Keys)',
    '60%',
    build60Layout(),
    56
  ),
  numpad: makeLayout(
    'numpad',
    'CodePen Numpad (13 Keys)',
    'Numpad',
    buildCodepenNumpad(),
    88
  ),
};

export const LAYOUT_ORDER = ['full', 'tkl', 'compact65', 'minimal60', 'numpad'];

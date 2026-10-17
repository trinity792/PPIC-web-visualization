/**
 * gridKeymap.js — which key does what in the data grid, in the reader's
 * chosen shortcut scheme (spreadsheet grid plan, workstream 2).
 *
 * Two schemes, Google Sheets (the default) and Excel, differ only where the
 * two spreadsheets do: Enter on a cell (edit in Sheets, move down in Excel),
 * redo with Cmd+Shift+Z (Sheets), the insert and delete keys for rows and
 * columns, and Ctrl+Enter to fill the selection (Excel). Keys are written
 * with `Mod`, which is Cmd on a Mac and Ctrl elsewhere; Excel's structure
 * keys and Ctrl+Space are Ctrl on every platform, as in Excel itself.
 *
 * `actionFor` returns an action name, or null to leave the key to the browser
 * (or, while editing, to the text field: the caret, text deletion, and the
 * field's own undo).
 *
 * Adapted from Fortune-sheet (MIT, https://github.com/ruilisi/fortune-sheet):
 * the set of Cmd and Ctrl keys a spreadsheet handles, and their Shift
 * variants, from `handleWithCtrlOrMetaKey` and `handleGlobalKeyDown`.
 *
 * This module is CLIENT-SAFE: it must never import `node:fs` or any
 * server-only module.
 *
 * Exports:
 *   SCHEMES, SCHEME_IDS, DEFAULT_SCHEME
 *   ACTION_LABELS                       — a plain-language name for each action
 *   actionFor(event, { scheme, mac, editing }) — the action for a keydown, or null
 *   shortcutHelp(scheme, mac)           — [{ action, label, keys, when }] for the help table
 *
 * Data sources:
 *   - none (pure functions)
 */

export const SCHEME_IDS = Object.freeze(["sheets", "excel"]);
export const DEFAULT_SCHEME = "sheets";

const entry = (action, keys, when = "navigating") => ({ action, keys, when });

const ARROWS = ["Up", "Down", "Left", "Right"];

/** Every key both schemes share. */
const COMMON = [
  ...ARROWS.flatMap((direction) => [
    entry(`move${direction}`, [`Arrow${direction}`]),
    entry(`extend${direction}`, [`Shift+Arrow${direction}`]),
    entry(`jump${direction}`, [`Mod+Arrow${direction}`]),
    entry(`extendJump${direction}`, [`Mod+Shift+Arrow${direction}`]),
  ]),
  entry("moveRight", ["Tab"]),
  entry("moveLeft", ["Shift+Tab"]),
  entry("moveUp", ["Shift+Enter"]),
  entry("home", ["Home"]),
  entry("end", ["End"]),
  entry("first", ["Mod+Home"]),
  entry("last", ["Mod+End"]),
  entry("pageUp", ["PageUp"]),
  entry("pageDown", ["PageDown"]),
  entry("selectRow", ["Shift+Space"]),
  entry("selectColumn", ["Ctrl+Space"]),
  entry("selectAll", ["Mod+A"]),
  entry("clear", ["Delete", "Backspace"]),
  entry("copy", ["Mod+C"]),
  entry("cut", ["Mod+X"]),
  entry("paste", ["Mod+V"]),
  entry("pasteValues", ["Mod+Shift+V"]),
  entry("undo", ["Mod+Z"]),
  entry("fillDown", ["Mod+D"]),
  entry("fillRight", ["Mod+R"]),
  entry("openMenu", ["Shift+F10", "ContextMenu"]),
  entry("cancel", ["Escape"]),
  entry("commitDown", ["Enter"], "editing"),
  entry("commitUp", ["Shift+Enter"], "editing"),
  entry("commitRight", ["Tab"], "editing"),
  entry("commitLeft", ["Shift+Tab"], "editing"),
  entry("cancelEdit", ["Escape"], "editing"),
];

export const SCHEMES = Object.freeze({
  sheets: Object.freeze([
    ...COMMON,
    entry("startEdit", ["Enter", "F2"]),
    entry("redo", ["Mod+Shift+Z", "Mod+Y"]),
    entry("insertRowsOrColumns", ["Mod+Alt+Equal"]),
    entry("deleteRowsOrColumns", ["Mod+Alt+Minus"]),
    entry("fillSelectionWithEntry", ["Mod+Enter"], "editing"),
  ]),
  excel: Object.freeze([
    ...COMMON,
    entry("moveDown", ["Enter"]),
    entry("startEdit", ["F2"]),
    entry("redo", ["Mod+Y"]),
    entry("insertRowsOrColumns", ["Ctrl+Shift+Equal"]),
    entry("deleteRowsOrColumns", ["Ctrl+Minus"]),
    entry("fillSelectionWithEntry", ["Ctrl+Enter"], "editing"),
  ]),
});

export const ACTION_LABELS = Object.freeze({
  moveUp: "Move up", moveDown: "Move down", moveLeft: "Move left", moveRight: "Move right",
  extendUp: "Extend the selection up", extendDown: "Extend the selection down",
  extendLeft: "Extend the selection left", extendRight: "Extend the selection right",
  jumpUp: "Jump up to the edge of the data", jumpDown: "Jump down to the edge of the data",
  jumpLeft: "Jump left to the edge of the data", jumpRight: "Jump right to the edge of the data",
  extendJumpUp: "Extend up to the edge of the data", extendJumpDown: "Extend down to the edge of the data",
  extendJumpLeft: "Extend left to the edge of the data", extendJumpRight: "Extend right to the edge of the data",
  home: "Start of the row", end: "End of the row", first: "First cell", last: "Last cell",
  pageUp: "Up a screen", pageDown: "Down a screen",
  selectRow: "Select the row", selectColumn: "Select the column", selectAll: "Select all",
  startEdit: "Edit the active cell", clear: "Clear the selection",
  copy: "Copy", cut: "Cut", paste: "Paste", pasteValues: "Paste values only",
  undo: "Undo", redo: "Redo", fillDown: "Fill down", fillRight: "Fill right",
  insertRowsOrColumns: "Insert rows or columns", deleteRowsOrColumns: "Delete rows or columns",
  openMenu: "Open the menu", cancel: "Cancel a cut or a drag",
  commitDown: "Save and move down", commitUp: "Save and move up",
  commitRight: "Save and move right", commitLeft: "Save and move left",
  cancelEdit: "Cancel the edit", fillSelectionWithEntry: "Write the entry into every selected cell",
});

// Keys matched by `event.code`, because the character they type changes with
// Shift and Option (Option+= types "≠" on a Mac).
const CODE_KEYS = Object.freeze({ Equal: "=", Minus: "-" });
const NAMED_KEYS = Object.freeze({ Space: " " });

/** A written key ("Mod+Shift+ArrowUp") as the modifiers it needs and its key. */
function parseKeys(keys, mac) {
  const parts = keys.split("+");
  const key = parts.pop();
  const mods = { meta: false, ctrl: false, alt: false, shift: false };
  for (const part of parts) {
    if (part === "Mod") mods[mac ? "meta" : "ctrl"] = true;
    else mods[part.toLowerCase()] = true;
  }
  return { key, mods };
}

function keyMatches(event, key) {
  if (CODE_KEYS[key]) return event.code === key;
  const expected = NAMED_KEYS[key] ?? key;
  return expected.length === 1
    ? String(event.key).toLowerCase() === expected.toLowerCase()
    : event.key === expected;
}

function matches(event, keys, mac) {
  const { key, mods } = parseKeys(keys, mac);
  return (
    Boolean(event.metaKey) === mods.meta &&
    Boolean(event.ctrlKey) === mods.ctrl &&
    Boolean(event.altKey) === mods.alt &&
    Boolean(event.shiftKey) === mods.shift &&
    keyMatches(event, key)
  );
}

/** A key that types one character, with no Cmd or Ctrl (AltGr, Ctrl+Alt on Windows, still types). */
function isPrintable(event, mac) {
  if ([...String(event.key)].length !== 1) return false;
  if (event.metaKey) return false;
  if (event.ctrlKey && (mac || !event.altKey)) return false;
  return true;
}

/**
 * The action a keydown asks for in a scheme, or null to leave the key alone.
 * While navigating, a printable key with no Cmd or Ctrl is `typeToEdit`.
 */
export function actionFor(event, { scheme = DEFAULT_SCHEME, mac = false, editing = false } = {}) {
  const when = editing ? "editing" : "navigating";
  const entries = SCHEMES[scheme] || SCHEMES[DEFAULT_SCHEME];
  for (const candidate of entries) {
    if (candidate.when !== when) continue;
    if (candidate.keys.some((keys) => matches(event, keys, mac))) return candidate.action;
  }
  if (!editing && isPrintable(event, mac)) return "typeToEdit";
  return null;
}

const MAC_SYMBOLS = Object.freeze({ Ctrl: "⌃", Alt: "⌥", Shift: "⇧", Mod: "⌘" });
const MAC_ORDER = ["Ctrl", "Alt", "Shift", "Mod"];
const KEY_NAMES = Object.freeze({
  ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→",
  Equal: "=", Minus: "−", Escape: "Esc", ContextMenu: "Menu key",
  PageUp: "Page Up", PageDown: "Page Down",
});

/** One written key in the platform's own style: "⌘⇧V" on a Mac, "Ctrl+Shift+V" elsewhere. */
function displayKeys(keys, mac) {
  const parts = keys.split("+");
  const key = parts.pop();
  const name = KEY_NAMES[key] ?? (key.length === 1 ? key.toUpperCase() : key);
  if (mac) {
    const mods = MAC_ORDER.filter((mod) => parts.includes(mod)).map((mod) => MAC_SYMBOLS[mod]);
    return `${mods.join("")}${name}`;
  }
  const mods = parts.map((mod) => (mod === "Mod" ? "Ctrl" : mod));
  return [...new Set(mods), name].join("+");
}

/** The help table's rows for a scheme, each action once with its keys written for the platform. */
export function shortcutHelp(scheme = DEFAULT_SCHEME, mac = false) {
  const rows = new Map();
  for (const { action, keys, when } of SCHEMES[scheme] || SCHEMES[DEFAULT_SCHEME]) {
    const rowKey = `${when}:${action}`;
    const written = keys.map((key) => displayKeys(key, mac));
    const row = rows.get(rowKey);
    if (row) row.list.push(...written);
    else rows.set(rowKey, { action, label: ACTION_LABELS[action] || action, when, list: written });
  }
  return [...rows.values()].map(({ list, ...row }) => ({ ...row, keys: list.join(" or ") }));
}

/** Workstream 2: independent expected bindings, not expectations derived from SCHEMES. */
import { describe, expect, it } from "vitest";
import { actionFor, shortcutHelp } from "@/lib/tabular/gridKeymap";

const event = (key, mods = {}) => ({ key, code: key, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mods });

describe.each(["sheets", "excel"])("%s shortcuts", (scheme) => {
  it.each([true, false])(`maps every specified action in the ${scheme === "sheets" ? "Sheets" : "Excel"} scheme on a Mac and on Windows: mac=%s`, (mac) => {
    const mod = mac ? { metaKey: true } : { ctrlKey: true };
    const bindings = [
      ["Tab", {}, "moveRight"], ["Tab", { shiftKey: true }, "moveLeft"],
      ["Home", {}, "home"], ["End", {}, "end"], ["Home", mod, "first"], ["End", mod, "last"],
      ["PageUp", {}, "pageUp"], ["PageDown", {}, "pageDown"],
      [" ", { shiftKey: true }, "selectRow"], [" ", { ctrlKey: true }, "selectColumn"],
      ["a", mod, "selectAll"], ["F2", {}, "startEdit"],
      ["Delete", {}, "clear"], ["Backspace", {}, "clear"],
      ["c", mod, "copy"], ["x", mod, "cut"], ["v", mod, "paste"],
      ["V", { ...mod, shiftKey: true }, "pasteValues"], ["z", mod, "undo"], ["y", mod, "redo"],
      ["d", mod, "fillDown"], ["r", mod, "fillRight"],
      ["F10", { shiftKey: true }, "openMenu"], ["ContextMenu", {}, "openMenu"],
    ];
    for (const direction of ["Up", "Down", "Left", "Right"]) {
      bindings.push(
        [`Arrow${direction}`, {}, `move${direction}`],
        [`Arrow${direction}`, { shiftKey: true }, `extend${direction}`],
        [`Arrow${direction}`, mod, `jump${direction}`],
        [`Arrow${direction}`, { ...mod, shiftKey: true }, `extendJump${direction}`],
      );
    }
    if (scheme === "sheets") {
      bindings.push(["Z", { ...mod, shiftKey: true }, "redo"]);
      bindings.push(["=", { ...mod, altKey: true, code: "Equal" }, "insertRowsOrColumns"]);
      bindings.push(["-", { ...mod, altKey: true, code: "Minus" }, "deleteRowsOrColumns"]);
    } else {
      // Excel's structure keys are explicitly Ctrl, including on Mac.
      bindings.push(["+", { ctrlKey: true, shiftKey: true, code: "Equal" }, "insertRowsOrColumns"]);
      bindings.push(["-", { ctrlKey: true, code: "Minus" }, "deleteRowsOrColumns"]);
    }
    for (const [key, mods, action] of bindings) {
      expect(actionFor(event(key, mods), { scheme, mac, editing: false }), `${key} ${JSON.stringify(mods)}`).toBe(action);
    }
    const commits = [
      ["Enter", {}, "commitDown"], ["Enter", { shiftKey: true }, "commitUp"],
      ["Tab", {}, "commitRight"], ["Tab", { shiftKey: true }, "commitLeft"],
      ["Escape", {}, "cancelEdit"],
      ["Enter", scheme === "excel" ? { ctrlKey: true } : mod, "fillSelectionWithEntry"],
    ];
    for (const [key, mods, action] of commits) {
      expect(actionFor(event(key, mods), { scheme, mac, editing: true })).toBe(action);
    }
    // Editing leaves the caret and normal text deletion to the input.
    for (const key of ["ArrowLeft", "ArrowRight", "Backspace", "Delete"]) {
      expect(actionFor(event(key), { scheme, mac, editing: true })).toBeNull();
    }
  });
});

it("reads Enter as edit in Sheets and as move in Excel", () => {
  expect(actionFor(event("Enter"), { scheme: "sheets", mac: true, editing: false })).toBe("startEdit");
  expect(actionFor(event("Enter"), { scheme: "excel", mac: true, editing: false })).toBe("moveDown");
});

it("treats a printable key as type-to-edit only while navigating", () => {
  for (const key of ["a", "4", "=", "é", " "]) {
    expect(actionFor(event(key), { scheme: "sheets", mac: true, editing: false })).toBe("typeToEdit");
    expect(actionFor(event(key), { scheme: "sheets", mac: true, editing: true })).toBeNull();
  }
  expect(actionFor(event("A", { shiftKey: true }), { scheme: "sheets", mac: true })).toBe("typeToEdit");
  for (const key of ["Shift", "Dead", "Process"]) {
    expect(actionFor(event(key), { scheme: "sheets", mac: true })).toBeNull();
  }
});

it("leaves browser shortcuts alone", () => {
  for (const scheme of ["sheets", "excel"]) {
    for (const mac of [true, false]) {
      for (const key of ["p", "f", "t", "l", "w"]) {
        expect(actionFor(event(key, mac ? { metaKey: true } : { ctrlKey: true }), { scheme, mac })).toBeNull();
      }
    }
  }
});

it("writes help with the platform's symbols", () => {
  // Help rows expose action and keys, matching the declared SCHEMES entry shape.
  const mac = shortcutHelp("sheets", true);
  const windows = shortcutHelp("sheets", false);
  expect(mac.find((row) => row.action === "copy").keys).toContain("⌘");
  expect(windows.find((row) => row.action === "copy").keys).toContain("Ctrl");
  expect(mac.find((row) => row.action === "insertRowsOrColumns").keys).toContain("⌥");
  expect(windows.find((row) => row.action === "insertRowsOrColumns").keys).toContain("Alt");
  expect(mac.find((row) => row.action === "extendRight").keys).toContain("⇧");
  expect(windows.find((row) => row.action === "extendRight").keys).toContain("Shift");
  expect(shortcutHelp("excel", true).find((row) => row.action === "startEdit").keys).not.toContain("Enter");
});

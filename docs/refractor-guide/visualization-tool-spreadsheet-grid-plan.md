---
Topic: Visualization Tool
Content Type: implementation plan
pinned: false
description: "A tests-first plan for replacing the Visualization Tool's react-data-grid editor with a purpose-built spreadsheet grid that looks like the approved mockup and behaves like Google Sheets or Excel: range, row, and column selection, drag to move, the fill handle, Sheets and Excel keyboard schemes, and a full clipboard. Written for programmers continuing the visualization work."
Date Published: October 16, 2026
Last Updated: 10/16/2026 - 03:01 PM
Status: Updating
---

# Visualization Tool: Spreadsheet Grid Plan

> [!info] Who this is for and how to read it
> This plan is for whoever rebuilds the Visualization Tool's table editor, whether a person or a model. Stages 1 through 5 are implemented; see the progress notes below. It implements [[table-editor-specification]], which is the behavior contract: where this plan and the specification disagree, the specification wins and this plan is corrected. Stage 1 writes every test first. The workstreams then follow in the order given in [The Order of Work](#the-order-of-work). Each workstream says what is wrong today, the steps, the documents it makes out of date, and the tests to write. Words that may be unfamiliar are defined in the [Glossary](#glossary).

> [!note] Stage 2 baseline, October 16, 2026
> Stage 1's tests are written, and Stage 2 (workstreams 1 to 5) is built: `lib/tabular/gridSelection.js`, `gridKeymap.js`, `gridClipboard.js`, and `fillSeries.js`, `components/chart-builder/data-grid/useShortcutScheme.js`, the `permuteRows` and `permuteColumns` edits in `shiftFormulas`, and the new edits in `tableEdits.js`. Every test for those workstreams passes. At that checkpoint, the remaining failures were `SpreadsheetGrid.test.js` and `GridChrome.test.js` (the grid itself, Stages 3 and 4), the two undo and redo wiring tests (Workstream 10), and the five renderer Plan O checks in `visualizationV3Cutover.test.js` that failed before this plan. Where the build settled something the steps left open:
>
> - **Two coordinate systems.** Selections and ranges use grid positions (row 0 is the header, row r ≥ 1 is data row r − 1). Structure edits that take bare indexes (`moveRows`, `deleteRows`, `insertColumns`, and so on) and the `formulas` keys use data indexes, as before.
> - **Grid size.** Selection operations take `size` as `{ rows, columns }`, where `rows` counts the header row. The grid decides in Workstream 6 whether it also counts the trailing blank row.
> - **The help table.** `shortcutHelp` returns one row per action, `{ action, label, keys, when }`, with every key for the action joined by "or". Both schemes also map Esc to `cancel`, which clears a cut's dashed border or a drag, and Shift+Enter to `moveUp`.
> - **Clipboard round trip.** A copy made with `formulas: true` keeps each formula in a `data-formula` attribute on its HTML cell, and `parseClipboard` prefers that attribute, so a copy and paste inside the editor keeps formulas even though the HTML is read first.
> - **Paste options.** `pasteCells(table, sel, cells, { source, values, computed, cut })`: `source` is the copied block's top-left cell, and its formulas move by the distance pasted; `computed` holds the copied values for a values-only paste. One value over a range fills only data cells, never the header.
> - **Cut and paste** now updates references to moved cells, including absolute references. References outside the moved block stay as written.
> - **Sort selected range** now reorders only the selected rectangle. Stage 1 assertions were updated to the owner's Sheets decision. Numbers and dates sort before text, and blank and missing cells ("n/a", "(D)") always sort last.
> - **Fill.** A single date copies, as a single number does, and counts with Option. Text ending in a number counts up from a single cell. `fillDown` now runs through `fillRange`, and `pasteBlock` through `pasteCells`, so the current grid already uses the new code.
> - **Fortune-sheet credit.** The doc comments of `gridSelection.js`, `gridKeymap.js`, `gridClipboard.js`, and `fillSeries.js` credit Fortune-sheet (MIT) and name the functions adapted. The permutation rewrite in `formulas.js` and the edits in `tableEdits.js` are our own.

> [!success] Owner decisions resolved
> Both follow Sheets: formulas referencing cut cells follow their new addresses, and Sort selected range reorders only the selected columns. Unselected cells and partial-row marks stay in place; formulas within the sorted block adjust their relative references.

> [!success] Implementation status - October 16, 2026
> The purpose-built `SpreadsheetGrid` now replaces `react-data-grid` through the existing `DataGrid` entry point. Selection, pointer movement, fill, editing and formula point mode, the toolbar, context menus, shortcut help, sticky headers, and row virtualization are connected to the Stage 2 modules. Import, Edit Data, and the Data Source dialog forward the complete edited table and the store's undo/redo callbacks. The old dependency and `RowGutter` are removed. New ambiguity decisions follow Google Sheets behavior, while the specified Excel shortcut scheme remains available.
>
> Browser tests in `tests/visual/spreadsheet-grid.spec.js` cover native clipboard formula/value round trips, pointer moves, undo, and sticky virtualized scrolling. A private copy token in HTML preserves provenance when a browser drops custom clipboard formats. The supplied sample table was also inspected in the browser. Direct round trips with the external Excel and Google Sheets applications remain a manual compatibility check.

The import overhaul (October 16, 2026) gave the tool a data grid on `react-data-grid@7.0.0-beta.61`. It edits cells, holds per-cell formulas, sets column kinds and row marks, re-reads the raw import, and sits one toggle from the chart in the Edit step. It does not yet behave like a spreadsheet, and researchers expect one:

- it selects one cell at a time;
- whole rows and columns cannot be selected, several at once, or dragged to move;
- most Cmd and Ctrl shortcuts do nothing;
- a frozen column is drawn twice.

The library's single-cell selection model is the reason, and it is a pinned beta.

The owner chose to build our own grid, taking the good parts of Fortune-sheet, an MIT-licensed spreadsheet. Fortune-sheet's renderer and state cannot be lifted: it draws on a canvas from one large mutable context object inherited from Luckysheet. Its **behavior and algorithms** can be ported into clean code against our table model, and [What we take from Fortune-sheet](#what-we-take-from-fortune-sheet) lists exactly what and from where.

> [!note] What this plan does not change
> The table model stays as built: `columns`, `rows` (values), `formulas`, `rowMarks`, and `meta` in `question.dataset.inline`. So do the formula engine (`lib/tabular/formulas.js`, header as row 1), the editing helpers (`lib/tabular/tableEdits.js`, extended here), the Check panel, Import settings, and Edit Data. Every caller keeps using `components/chart-builder/InputTableEditor.js` with the same props.

---

## The Order of Work

| Stage | What happens | Workstreams |
|---|---|---|
| 1. Write the tests | Every test in this plan, before any feature code. The suite fails until the work lands. | See [Stage 1](#stage-1---write-every-test-first) |
| 2. Pure logic | Selection, keymap, clipboard, fill series, and structure edits, as client-safe modules with no React. They can run side by side. | 1, 2, 3, 4, 5 |
| 3. The grid | The new component: layout and states, pointer interactions, editing. | 6, 7, 8 |
| 4. Toolbar and menus | The mockup's toolbar, the More menu, context menus, and the shortcuts menu. | 9 |
| 5. Swap and clean up | The new grid replaces the old, the old tests move, and the dependency goes. | 10 |

| # | Workstream | Depends on |
|---|---|---|
| 1 | Selection model | - |
| 2 | Keyboard map and shortcut schemes | - |
| 3 | Clipboard | - |
| 4 | Fill | - |
| 5 | Structure edits keep formulas and marks in step | - |
| 6 | Grid shell: layout, states, sticky headers, virtualization, accessibility | 1 |
| 7 | Pointer: drag-select, drag to move, fill handle, resize | 1, 4, 5, 6 |
| 8 | Editing: cell editor, point mode, header rename, keyboard actions | 1, 2, 3, 6 |
| 9 | Toolbar, formula bar, status bar, and menus | 5, 6, 8 |
| 10 | Swap, port tests, remove react-data-grid | 6 to 9 |

---

## Decisions Already Made

Decided by the owner on October 16, 2026.

| Question | Decision |
|---|---|
| Grid engine | **Build our own**, porting Fortune-sheet's behavior and algorithms (MIT, credited), not its renderer. No new dependency; `react-data-grid` is removed in Workstream 10 and stays pinned until then. |
| Look | The approved mockup: toolbar, formula bar, letter row, header row with type pills ("text", not "Abc"), numbered gutter, orange active and selected tints, and a status bar. |
| The ƒx button | Inserts a formula column to the right of the selection and opens its first cell with `=` typed. |
| Shortcut schemes | Google Sheets (default) and Excel, chosen by the reader and remembered per viewer. |
| Row numbers | The header is row 1, and the first data row is row 2. The header row stays visible while scrolling. |

### Behavior decisions

Decided by the owner later on October 16, 2026, after the first draft of this plan.

| Question | Decision |
|---|---|
| When cut clears its source | On paste in this editor, as Sheets does; a cut never pasted changes nothing. |
| Typing in the trailing blank row | Adds a data row, and a new blank row appears below. |
| Touch support | **Desktop only.** Touch gets tap to select and the menu button; editing assumes a mouse and keyboard. No double-tap editing, long-press, drag-select, or drag-move on touch. |
| Undo granularity | One step per paste, fill, move, sort, or Cmd+Enter, however many cells it touches. |
| Sort scope | **Both.** The toolbar's Sort sorts all data rows (header fixed, marked rows moving with their data, blanks last). The right-click menu adds Sort selected range, which sorts only the selected rectangle and leaves other cells in place. |
| Multi-range copy | As Sheets: one block when the ranges share rows or columns, else the active range only. |
| Fill handle on one number | Copies it; Option-drag counts up by one, as in Excel. Two or more numbers always continue their step. |

---

## Stage 1 - Write Every Test First

Every test named below was written before its feature code. A test that imports a module not yet written goes in its own file, because a dynamic `import()` of a missing module fails the whole test file under Vite, not just that test. Component tests drive pointer interactions with `pointerdown`, `pointerenter`, and `pointerup` on the cell, letter, and row-number elements, never coordinates, so they run without a layout engine.

The existing grid tests (`tests/js/components/chart-builder/data-grid/DataGrid.test.js`, `InputTableEditor.test.js`, `ImportStep.test.js`, `EditPreview.test.js`) keep their intents. Workstream 10 moves them onto the new DOM.

---

## What we take from Fortune-sheet

Fortune-sheet 1.0.4 (`@fortune-sheet/core`, MIT) was read from its published bundle. Each item below is reimplemented against our table model; nothing is copied wholesale. Each adapted module's doc comment credits Fortune-sheet and names the function.

| Our module | Behavior or algorithm | Fortune-sheet source |
|---|---|---|
| `gridSelection.js` | A selection as a list of ranges with a focus cell; extending from an anchor; whole rows and columns | `luckysheet_select_save` ranges, `selectTitlesMap`, `selectTitlesRange`, `normalizeSelection` |
| `gridSelection.js` | Cmd+arrow to the data edge; Cmd+Shift+arrow to extend there | `handleArrowKey`, `moveHighlightCell`, `moveHighlightRange` |
| `gridSelection.js` | Status bar statistics | `calcSelectionInfo` |
| `gridKeymap.js` | Which Cmd or Ctrl keys a spreadsheet handles, and the Shift variants | `handleWithCtrlOrMetaKey`, `handleGlobalKeyDown` |
| `gridClipboard.js` | Copying a range as an HTML table so spreadsheets keep cell boundaries | `rangeValueToHtml`, `copy` |
| `fillSeries.js` | Series detection for the fill handle | the drop-cell module (`createDropCellRange`, `updateDropCell`) |
| `tableEdits.js` | Cmd+D and Cmd+R copy the first row or column, moving formula references | the `KeyD` and `KeyR` branches of `handleWithCtrlOrMetaKey` |
| `useGridPointer.js` | Dragging selected rows or columns to a drop position | `onCellsMoveStart`, `onCellsMove`, `onCellsMoveEnd` |

---

## Workstream 1 - Selection model

### What is wrong today

`DataGrid.js` holds one active cell (`active: { row, col }`), because react-data-grid selects one cell. There are no ranges, no row or column selection, no Shift or Cmd extension, no data-edge jump, and no statistics.

### Steps

1. New client-safe file `lib/tabular/gridSelection.js`. Grid positions use one row space: row 0 is the header and row r ≥ 1 is data row r − 1, so the header is selectable and the table model is untouched.
2. **State.** `{ ranges: [{ r1, c1, r2, c2 }], active: { row, col }, anchor: { row, col }, mode: "cells" | "rows" | "columns" | "all" }`. Ranges are kept normalized (`r1 ≤ r2`, `c1 ≤ c2`).
3. **Operations.** Each is pure, taking the selection plus the grid size and returning a new selection:
   - `selectCell(row, col)` and `extendTo(row, col)`;
   - `addRange(row, col)`, the Cmd+click start of a new range;
   - `selectRows(r1, r2, { add, extend })` and `selectColumns(c1, c2, { add, extend })`;
   - `selectAll()`, and `rowsOfSelection()` and `columnsOfSelection()` for Shift+Space and Ctrl+Space.
4. **Movement.** `moveActive(sel, direction, { jump, extend, size, isFilled })`. One step moves the active cell, or, with `extend`, the far corner from the anchor. `jump` follows the data-edge rule in [[table-editor-specification]]: a filled run to its last filled cell, else the next filled cell, else the edge. Home, End, Cmd+Home, Cmd+End, Page Up, and Page Down are `moveTo` helpers.
5. **Commit moves.** `nextInSelection(sel, direction)` moves the active cell within a multi-cell selection after Enter or Tab, wrapping as Sheets does.
6. **Queries.** `contains(sel, row, col)`, `selectedRows(sel, size)`, `selectedColumns(sel, size)`, `bounds(sel)`, `cellsOf(sel, size)`.
7. **Addressing.** `addressOf(sel)` writes `B3`, `B2:D5`, `Row 4`, `3 rows`, `Column C`, or `2 columns`. Header cells use row 1, through `cellAddress` in `formulas.js` (the data row plus 2).
8. **Statistics.** `selectionStats(table, sel)` returns Count (filled cells), the count of numbers, Sum, Average, Min, and Max over data cells only. It reads values with each column's convention (`columnParseOptions`, `parseNumber`).

### What this makes out of date

Nothing yet; the grid adopts it in Workstream 6.

### Tests

New file `tests/js/lib/tabular/gridSelection.test.js`:

| Test | What it checks |
|---|---|
| `selects a cell, extends from the anchor, and keeps the anchor` | `selectCell`, `extendTo`. |
| `adds a range with Cmd and keeps the earlier ones` | `addRange`. |
| `selects whole rows and columns, extending and adding` | `selectRows`, `selectColumns`. |
| `selects everything` | `selectAll`. |
| `moves one cell and stops at the edges` | `moveActive`. |
| `jumps to the end of a filled run, the next filled cell, or the edge` | The data-edge rule, all three cases, in four directions. |
| `extends to the data edge with Shift` | `jump` with `extend`. |
| `moves within a multi-cell selection after Enter and Tab, wrapping` | `nextInSelection`. |
| `writes cell, range, row, and column addresses` | `addressOf`. |
| `counts, sums, and averages data cells only` | `selectionStats`, header excluded, decimal-comma column. |

---

## Workstream 2 - Keyboard map and shortcut schemes

### What is wrong today

Only Delete and editing keys work, handled ad hoc in `DataGrid.js` (`onCellKeyDown`). There is no scheme, no Cmd and Ctrl handling by platform, and no help.

### Steps

1. New client-safe file `lib/tabular/gridKeymap.js` with `SCHEMES = { sheets, excel }`. Each scheme is a list of `{ action, keys, when }` entries, where `keys` uses `Mod` for Cmd on a Mac and Ctrl elsewhere, and `when` is `"navigating"` or `"editing"`. The actions and keys are those in [[table-editor-specification]]'s keyboard reference, for example:
   - movement: `moveUp`, `extendRight`, `jumpDown`, `extendJumpLeft`, `home`, `end`, `first`, `last`, `pageDown`;
   - selection: `selectRow`, `selectColumn`, `selectAll`;
   - editing: `startEdit`, `commitDown`, `commitRight`, `cancelEdit`, `fillSelectionWithEntry`, `clear`;
   - clipboard: `copy`, `cut`, `paste`, `pasteValues`;
   - history: `undo`, `redo`;
   - fill: `fillDown`, `fillRight`;
   - structure: `insertRowsOrColumns`, `deleteRowsOrColumns`, `openMenu`.
2. `actionFor(event, { scheme, mac, editing })` matches `event.key` (and `event.code` where layouts differ, such as `=` and `-`) with `metaKey` on a Mac or `ctrlKey` elsewhere. It returns an action or null; null leaves the key to the browser.
3. Typing a printable character with no modifier while navigating returns `typeToEdit`. The scheme decides Enter: `startEdit` in Sheets, `moveDown` in Excel.
4. `shortcutHelp(scheme, mac)` returns rows for the help table, written with the platform's symbols (⌘ ⌥ ⇧ on a Mac, Ctrl Alt Shift elsewhere).
5. New hook `components/chart-builder/data-grid/useShortcutScheme.js` returns `[scheme, setScheme]`. It reads and writes `localStorage` key `visualizationTool.gridShortcutScheme` inside try/catch, and falls back to `"sheets"`.
6. `isMac()` in the same module reads `navigator.userAgentData?.platform`, then `navigator.platform`, and is overridable in tests.

### What this makes out of date

Nothing yet.

### Tests

New file `tests/js/lib/tabular/gridKeymap.test.js`:

| Test | What it checks |
|---|---|
| `maps every specified action in the Sheets scheme on a Mac and on Windows` | Table-driven from the specification's keyboard reference. |
| `maps every specified action in the Excel scheme on a Mac and on Windows` | Same, for the Excel differences. |
| `reads Enter as edit in Sheets and as move in Excel` | The scheme difference. |
| `treats a printable key as type-to-edit only while navigating` | `typeToEdit`. |
| `leaves browser shortcuts alone` | Cmd+P, Cmd+F, Cmd+T return null. |
| `writes help with the platform's symbols` | `shortcutHelp`. |

New file `tests/js/components/chart-builder/data-grid/useShortcutScheme.test.js`:

| Test | What it checks |
|---|---|
| `defaults to Sheets and remembers a change` | `localStorage`. |
| `falls back to Sheets when storage throws` | Private windows. |

---

## Workstream 3 - Clipboard

### What is wrong today

`DataGrid.js` copies one cell's text and pastes a tab-separated block from the active cell (`pasteBlock`). Nothing copies a range, writes HTML, reads HTML, cuts, or fills a range from one value.

### Steps

1. New client-safe file `lib/tabular/gridClipboard.js`.
2. `rangeToClipboard(table, range, { formulas })` returns `{ text, html }`:
   - `text` is tab-separated, quoting cells that hold tabs, newlines, or quotes, with inner quotes doubled;
   - `html` is a `<table>` with escaped cells;
   - with `formulas`, formula cells copy their formula as text (for pasting back here) and an attribute carrying it, and their value in the HTML.
3. `selectionToClipboard(table, sel)` applies the multi-range rule in [[table-editor-specification]] and copies the active range when the ranges cannot form one block, as the specification requires.
4. `parseClipboard({ text, html })` returns a 2-D array of cells. It prefers an HTML table, reading `colspan` and `rowspan` as blanks and `<br>` as newlines. Otherwise it reads quoted tab-separated text.
5. In `tableEdits.js`, `pasteCells(table, sel, cells, { values })` handles every case:
   - **A block** lands at the active cell and grows the table (today's `pasteBlock`).
   - **One value** fills every cell of the selection.
   - **A block onto a range** that is an exact multiple of its size repeats.
   - **Formulas** keep relative references from a copy made here (`fillFormula`), and stay as written from elsewhere.
   - **Values only** (`{ values }`) pastes computed values.
6. **Cut.** `markCut(sel)` is grid state, not a table change. The paste after a cut is one edit that pastes and then clears the cut source, adjusting for overlap.

### What this makes out of date

Nothing yet.

### Tests

New file `tests/js/lib/tabular/gridClipboard.test.js`:

| Test | What it checks |
|---|---|
| `copies a range as tab-separated text and an HTML table` | Both formats. |
| `quotes cells with tabs, newlines, and quotes` | Excel-compatible text. |
| `copies formulas for pasting back here and values for elsewhere` | `formulas` option. |
| `copies several ranges as one block only when they line up` | Multi-range rule. |
| `reads an Excel HTML table, including merged and multi-line cells` | `parseClipboard`. |
| `falls back to tab-separated text with quoted cells` | `parseClipboard`. |

Extend `tests/js/lib/tabular/tableEdits.test.js`:

| Test | What it checks |
|---|---|
| `fills a selected range from one pasted value` | One value. |
| `repeats a block over a range that is a multiple of its size` | Tiling. |
| `moves a pasted formula's references when it was copied here` | Relative paste. |
| `pastes values only` | `{ values }`. |
| `pastes a cut and clears its source in one edit` | Cut. |

---

## Workstream 4 - Fill

### What is wrong today

react-data-grid's drag-fill copies one cell down one column (`onFill` in `DataGrid.js`). `fillDown` in `tableEdits.js` copies one cell. Nothing detects series, fills right or up or left, or answers Cmd+D or Cmd+R.

### Steps

1. New client-safe file `lib/tabular/fillSeries.js`. `extendSeries(cells, count, { direction, columnOptions, option })` returns the next `count` cell texts for the source cells:
   - two or more numbers with a constant step continue the step;
   - one number copies, or counts up by one with `option`;
   - dates with a constant step continue in their unit (days, months, quarters, years, school years), using `parseDateToken` positions, and are written in the source's format;
   - text ending in a number counts up;
   - formulas move references (`fillFormula`);
   - anything else repeats the pattern.
2. In `tableEdits.js`:
   - `fillRange(table, source, target)` fills from a source range into a target range in any direction, one series per row or column.
   - `fillDownSelection(table, sel)` and `fillRightSelection(table, sel)` implement Cmd+D and Cmd+R, including the single-cell case (copy from above or from the left).
   - `fillToEnd(table, sel)` implements the double-click on the fill handle: fill down to the last filled row of the column to the left, else to the right.

### What this makes out of date

`fillDown` in `tableEdits.js` becomes a thin call to `fillRange`.

### Tests

New file `tests/js/lib/tabular/fillSeries.test.js`:

| Test | What it checks |
|---|---|
| `continues a number step` | 1, 2 → 3, 4; 10, 7 → 4, 1. |
| `copies one number, or counts up with Option` | `option`. |
| `continues months, quarters, years, days, and school years in their own format` | Dates. |
| `counts up text that ends in a number` | "Wave 1". |
| `moves formula references and keeps anchors` | Formulas. |
| `repeats any other pattern` | Text. |

Extend `tests/js/lib/tabular/tableEdits.test.js`:

| Test | What it checks |
|---|---|
| `fills a range down, up, right, and left` | `fillRange`. |
| `fills down and right from the selection's first row or column` | Cmd+D, Cmd+R. |
| `fills a single cell from the cell above or to the left` | Single-cell Cmd+D, Cmd+R. |
| `fills to the end of the neighboring column's data` | `fillToEnd`. |

---

## Workstream 5 - Structure edits keep formulas and marks in step

### What is wrong today

`tableEdits.js` inserts and deletes one row or column at a time, and has no move or sort. `shiftFormulas` in `formulas.js` handles insert and delete only.

### Steps

1. In `formulas.js`, `shiftFormulas(table, { type: "permuteRows" | "permuteColumns", order })`. Here `order[newIndex] = oldIndex`; it moves each formula to its new cell and rewrites every reference through the inverse mapping. Ranges whose ends move apart are rewritten to cover their new ends, as spreadsheets do.
2. In `tableEdits.js`, each of the following is one edit:
   - **Move:** `moveRows(table, rows, to)` and `moveColumns(table, cols, to)`, where the moved rows or columns keep their order and land before `to`.
   - **Sort:** `sortRows(table, col, direction)` sorts all data rows. `sortRange(table, sel, col, direction)` sorts only the selected rectangle, leaving cells outside it in place. Both sort numbers numerically, text naturally, dates by position, and blanks and missing values last.
   - **Insert and delete several:** `insertRows(table, at, count)`, `insertColumns(table, at, count)`, `deleteRows(table, rows)`, `deleteColumns(table, cols)`.
   - **Clear:** `clearRange(table, sel)` removes values and formulas.

   Each one moves `formulas`, `rowMarks`, column kinds, and `ignored` flags with their cells, and recalculates.
3. Hidden columns are view state in the grid. The grid maps them through the same permutation (Workstream 6).
4. `insertFormulaColumn(table, afterCol)` adds "Formula N" to the right and returns the new column's index, for the ƒx button.

### What this makes out of date

Nothing outside the module.

### Tests

Extend `tests/js/lib/tabular/formulas.test.js`:

| Test | What it checks |
|---|---|
| `permutes rows, moving formulas and their references` | `permuteRows`. |
| `permutes columns, moving formulas and their references` | `permuteColumns`. |
| `rewrites a range whose ends move apart to cover its new ends` | Ranges. |

Extend `tests/js/lib/tabular/tableEdits.test.js`:

| Test | What it checks |
|---|---|
| `moves rows with their formulas, marks, and order` | `moveRows`. |
| `moves columns with their formulas, kinds, and ignored flags` | `moveColumns`. |
| `sorts numbers, text, and dates, blanks last, header fixed, marks moving` | `sortRows`. |
| `sorts only the selected rectangle, leaving other columns and row marks in place` | `sortRange`. |
| `inserts and deletes several rows and columns at once` | Plural edits. |
| `clears values and formulas in a selection` | `clearRange`. |
| `inserts a formula column to the right of a column` | `insertFormulaColumn`. |

---

## Workstream 6 - Grid shell: layout, states, sticky headers, virtualization, accessibility

### What is wrong today

The grid is react-data-grid, with a frozen-column bug (the gutter is frozen only above 200 rows). Its layout differs from the mockup, and it has no range, row, or column states.

### Steps

1. New component `components/chart-builder/data-grid/SpreadsheetGrid.js` with the props of today's `DataGrid` (`table`, `onChange`, `onRevert`, `focus`, `usage`) plus `onUndo` and `onRedo`. It holds the selection (Workstream 1), hidden columns, column widths, cut marks, and drag state.
2. **Layout.** One scroll container with `role="grid"`, built from CSS grid rows:
   - the letter row and header row are `position: sticky` at the top;
   - the corner and gutter are sticky at the left, so every scroll keeps them in place without a second copy of any column;
   - column widths default to fit the header and the first 50 values, within 96 to 320 px, and the reader can resize them (Workstream 7).
3. **Virtualization.** Above 200 rows, only the rows in view plus 10 above and below are drawn, at a fixed 32 px row height. Spacers keep the scroll height. `aria-rowcount` and `aria-rowindex` give the full size.
4. **States.** The visual states in [[table-editor-specification]]:
   - the active cell's orange border (`ppic-orange-300`);
   - the selected fill (`ppic-orange-50`);
   - tinted letters and row numbers for the active and selected columns and rows;
   - formula corner marks, error and malformed grading (`gradeTable`), marked rows, and ignored columns;
   - the dashed cut border and the drop line.

   Colours come from tokens in `app/globals.css` only.
5. **Header row.** The column name, a type pill (`ColumnHeader.js`, restyled from today's chip) with the kind set by the reader marked, and the usage badge in Edit Data.
6. **Gutter.** Row numbers (`RowHeader.js`), with the mark reason for marked rows.
7. **Trailing row.** One blank row after the data; committing a value there adds a row (Workstream 8).
8. **Focus.** The `focus` prop (Show me, Fix in data) selects and scrolls to a cell, showing a hidden column first, as today.
9. **Accessibility.**
   - Roles: `role="grid"`, `role="row"`, `role="columnheader"`, `role="rowheader"`, `role="gridcell"`, with `aria-selected` on selected cells.
   - Focus: stays on the grid, with `aria-activedescendant` naming the active cell's id.
   - Announcements: a visually hidden `aria-live="polite"` region announces selection changes with their address and Sum, and edits and moves.

### What this makes out of date

- [[visualization-specification]], section Visualization Tool (the Import step's table).
- `DataGrid.js`, replaced in Workstream 10.

### Tests

New file `tests/js/components/chart-builder/data-grid/SpreadsheetGrid.test.js` (layout and states):

| Test | What it checks |
|---|---|
| `draws letters, a numbered gutter with the header as row 1, and type pills` | Anatomy; "text" not "Abc". |
| `keeps the letter row, header row, and gutter sticky` | `data-sticky` attributes and classes. |
| `tints the active and selected rows and columns and outlines the active cell` | States. |
| `marks formula cells, errors, marked rows, and ignored columns` | States. |
| `draws only the rows in view above 200 rows and reports the full size` | Virtualization (mocked scroll metrics). |
| `selects and scrolls to a requested cell, showing a hidden column` | `focus`. |
| `exposes grid roles, the active descendant, and a live announcement` | Accessibility. |

---

## Workstream 7 - Pointer: drag-select, drag to move, fill handle, resize

### What is wrong today

There is no range drag, no row or column header selection, no drag to move, no resize, and only react-data-grid's single-column fill.

### Steps

1. New hook `components/chart-builder/data-grid/useGridPointer.js`. It works from pointer events on cell, letter, row-number, and handle elements: `pointerdown`, then `pointerenter` on the elements passed over, then `pointerup` on the window. It never reads coordinates for hit-testing, so behavior is testable without layout.
2. **Selecting cells.**
   - Press on a cell to select it; Shift+press extends; Cmd+press adds a range.
   - Drag across cells to extend the current range.
   - Double-click to edit.
3. **Selecting rows and columns.** Press on a letter or row number to select it, with the same Shift and Cmd rules. Dragging across letters or numbers selects them.
4. **Moving rows and columns.** Pressing on an already-selected letter or row number and dragging moves them:
   - a drop line shows between headers;
   - release calls `moveColumns` or `moveRows` (Workstream 5) as one edit;
   - Esc cancels;
   - moving to the same place does nothing.
5. **Fill handle.** The square at the bottom-right of the last range. Dragging it previews the target range; release calls `fillRange`; Option-drag passes `option`; double-click calls `fillToEnd`.
6. **Auto-scroll.** While dragging past the visible edge, the container scrolls by a step each animation frame. This is the one place pixel geometry is read, from `getBoundingClientRect`.
7. **Resize.** Dragging a column's right edge sets its width (minimum 48 px); double-clicking the edge fits the column.
8. **Touch.** Desktop only (see [Behavior decisions](#behavior-decisions)). A tap selects a cell, row, or column, and the toolbar's menu button stands in for right-click. No other gesture is handled on touch.

### What this makes out of date

Nothing further.

### Tests

Extend `SpreadsheetGrid.test.js`:

| Test | What it checks |
|---|---|
| `drags across cells to select a range` | Pointer selection. |
| `extends with Shift and adds ranges with Cmd` | Modifiers. |
| `selects columns and rows from their headers, several with Shift and Cmd` | Header selection. |
| `drags selected columns to a new place, with a drop line, as one edit` | `moveColumns`. |
| `drags selected rows to a new place, as one edit` | `moveRows`. |
| `cancels a move with Esc` | Esc. |
| `drags the fill handle to extend a series` | `fillRange`. |
| `double-clicks the fill handle to fill to the end of the data` | `fillToEnd`. |
| `resizes and fits a column` | Widths. |
| `selects with a tap and opens no drag on touch` | Desktop-only touch. |

---

## Workstream 8 - Editing: cell editor, point mode, header rename, keyboard actions

### What is wrong today

react-data-grid's editor opens on double-click or Enter. It has no type-to-edit replacement in a predictable way, no Cmd+Enter, and no point mode, and the header is renamed through an input inside each header.

### Steps

1. New hook `components/chart-builder/data-grid/useGridKeyboard.js`. On `keydown` on the grid it calls `actionFor` (Workstream 2) with the reader's scheme and runs the action:
   - selection moves (Workstream 1);
   - edit start and commit;
   - `clear` (`clearRange`);
   - fills (Workstream 4);
   - inserts and deletes for whole-row or whole-column selections (Workstream 5);
   - `undo` and `redo` (the props);
   - `openMenu`.

   Copy, cut, and paste run on the browser's `copy`, `cut`, and `paste` events on the grid, so system clipboard permissions are never needed (Workstream 3).
2. New component `components/chart-builder/data-grid/CellEditor.js`, an input drawn over the active cell.
   - **Opening:** it opens with the cell's text, from `cellText`, for Enter (Sheets), F2, or double-click. For `typeToEdit` it opens with the typed character.
   - **Committing:** Enter, Shift+Enter, Tab, and Shift+Tab commit and move (`nextInSelection` within a multi-cell selection). Esc cancels.
   - **Cmd+Enter** writes the entry to every selected cell as one edit (`fillSelection`).
   - **Header cells:** editing a header cell renames the column (`renameColumn`), refusing an empty name.
   - **Trailing row:** a commit in the trailing blank row adds a row (`insertRows`).
3. **Point mode.** While the editor holds a formula and the text cursor sits after `=`, an operator, `(`, or `,`:
   - arrow keys and clicks insert or replace a reference (`cellAddress`);
   - Shift+arrow and drags make it a range;
   - typing anything else leaves point mode.

   The referenced range is outlined in the grid.
4. **Formula bar.** `FormulaBar.js` (Workstream 9) edits the same active cell and shares commit and cancel with the editor.

### What this makes out of date

`renderEditCell` and `CellEditor` in today's `DataGrid.js`, removed in Workstream 10.

### Tests

Extend `SpreadsheetGrid.test.js`:

| Test | What it checks |
|---|---|
| `moves, extends, and jumps with the arrow keys` | Navigation through the keymap. |
| `selects a row with Shift+Space and a column with Ctrl+Space` | Selection keys. |
| `selects everything with Cmd+A` | Select all. |
| `types to replace a cell and commits with Enter, moving down` | Type-to-edit. |
| `starts editing on Enter in Sheets and moves down on Enter in Excel` | Scheme difference. |
| `cancels with Esc and edits in place with F2` | Editing keys. |
| `writes the entry into every selected cell with Cmd+Enter, as one edit` | `fillSelection`. |
| `inserts a reference by arrowing or clicking while typing a formula` | Point mode. |
| `renames a column by editing its header cell` | Header rename. |
| `adds a row when the trailing blank row is filled` | Trailing row. |
| `clears the selection with Delete` | `clear`. |
| `copies a range and pastes it as one edit, through clipboard events` | Clipboard wiring. |
| `cuts and pastes, clearing the source` | Cut. |
| `fills down and right with Cmd+D and Cmd+R` | Fill keys. |
| `calls undo and redo with the scheme's keys` | `onUndo`, `onRedo`. |
| `inserts and deletes rows or columns with the scheme's keys` | Structure keys. |

---

## Workstream 9 - Toolbar, formula bar, status bar, and menus

### What is wrong today

The toolbar is Transpose, Add row, Add column, Show hidden, Import settings, and Revert. The formula bar is a plain input. There is no status bar, no Sort, no Delete row, no ƒx, no validity status, no context menu, and no shortcuts menu.

### Steps

1. **Toolbar.** New `components/chart-builder/data-grid/GridToolbar.js`, laid out as in the mockup.
   - Left, with a divider before Sort: + Row, + Column, Delete row, Sort, ƒx Derived column.
     - Sort is a menu: A to Z and Z to A by the active column.
     - ƒx calls `insertFormulaColumn`, selects the new column's first data cell, and opens the editor with `=`.
   - Right:
     - the validity status: a count of malformed cells from `gradeTable`, a green dot (`ppic-complement-green-600`) when there are none, and clicking it selects those cells;
     - a ⋯ More menu: Import settings (today's `ImportSettings.js`), Transpose, Show hidden columns, Revert to original, Keyboard shortcuts.
2. **Formula bar.** Restyle `FormulaBar.js` to the mockup: the address cell (`addressOf`), an ƒx mark, and the content.
3. **Status bar.** New `StatusBar.js`. Left: "N rows · M columns · Double-click a cell to edit". Right: Sum, Average, and Count from `selectionStats` for a selection of more than one cell, formatted with each column's unit.
4. **Context menus.** New `GridContextMenu.js`, the cell, row, and column menus in [[table-editor-specification]], opened by right-click, Shift+F10, or the context-menu key. Items act on the selection; a right-click outside it first selects what is under the pointer. The cell and row menus include Sort selected range (`sortRange`) when more than one row is selected.
5. **Shortcuts menu.** New `ShortcutsMenu.js`, a dialog with the scheme choice (Google Sheets or Excel) and the help table from `shortcutHelp`.
6. The row and column items of today's `RowGutter.js` and `ColumnHeader.js` menus move into `GridContextMenu.js`, so each action has one home.

### What this makes out of date

- [[visualization-specification]], section Visualization Tool.
- [[projectSpec]], the description of the data grid components.

### Tests

New file `tests/js/components/chart-builder/data-grid/GridChrome.test.js`:

| Test | What it checks |
|---|---|
| `adds a row and a column next to the selection` | + Row, + Column. |
| `deletes the selected rows` | Delete row. |
| `sorts by the active column both ways` | Sort. |
| `inserts a formula column and opens its first cell with =` | ƒx. |
| `shows All columns valid, or selects the cells that need attention` | Validity status. |
| `writes the selection's address in the formula bar` | `addressOf`. |
| `shows Sum, Average, and Count for a numeric selection and Count otherwise` | Status bar. |
| `opens the cell, row, and column menus and acts on the selection` | Context menus. |
| `switches the shortcut scheme and lists its keys` | Shortcuts menu. |
| `keeps Import settings, Transpose, Show hidden, and Revert in More` | More menu. |

---

## Workstream 10 - Swap, port tests, remove react-data-grid

### Steps

1. **Swap.** `components/chart-builder/data-grid/DataGrid.js` re-exports `SpreadsheetGrid`, so `InputTableEditor.js`, `ImportStep.js`, `EditPreview.js`, and `DataSourcePanel.js` keep working unchanged.
2. **Undo and redo.** Pass `onUndo` and `onRedo` through `InputTableEditor`. `ImportStep` and `EditPreview` dispatch the store's `UNDO` and `REDO` actions (`components/chart-builder/chartConfigStore.js`).
3. **Port the tests.** Move `DataGrid.test.js`, `InputTableEditor.test.js`, and the grid parts of `ImportStep.test.js` and `EditPreview.test.js` to the new DOM, with the same intents:
   - the formula bar keeps formulas;
   - a pasted block grows the table;
   - Delete clears a cell;
   - the kind pill sets a kind, and a forced kind survives a transpose;
   - the row menu marks rows and uses a row as the header;
   - Show me and Fix in data select their cells;
   - Import settings read again;
   - Edit Data edits keep the chart.
4. **Remove the old grid.** Delete react-data-grid's renderers from `DataGrid.js`, then run `npm uninstall react-data-grid`, removing its stylesheet import. Removing a dependency changes `package.json`; it is part of this approved plan.
5. **Credit.** Credit Fortune-sheet (MIT) in each adapted module's doc comment, naming the function adapted, as listed in [What we take from Fortune-sheet](#what-we-take-from-fortune-sheet).
6. **Status.** Move [[table-editor-specification]] and this plan from `Draft` to `Updating`.

### What this makes out of date

- [[visualization-specification]] and [[projectSpec]], as above.
- The import overhaul notes in project memory.

### Tests

The full suite passes, with the five known renderer Plan O failures in `visualizationV3Cutover.test.js` excepted. The byod-shapes corpus, the misread-recovery tests (`byodRecovery.test.js`), the Import step, and Edit Data stay green. Lint, `npm run check:palette`, and `npm run check:settings` pass.

**Manual pass** (`npm run dev`, `/visualization-tool`):

1. Paste `mockups/custom-viz-test/test-data-2.txt` and compare the editor with the mockup.
2. Select ranges, rows, and columns with the mouse and the keyboard.
3. Drag a column and a row.
4. Copy a range into Excel and Google Sheets and back.
5. Fill a series and Cmd+D a formula.
6. Sort; insert a formula column with ƒx.
7. Switch to the Excel scheme and reload to confirm it is remembered.
8. Repeat the edits in the Edit step's Edit Data view and confirm the chart follows.

---

## Glossary

| Term | Meaning |
|---|---|
| **Active cell** | The one cell typing and the formula bar act on. |
| **Anchor** | Where the current range started; extending keeps it fixed. |
| **Range** | A rectangle of cells, written `B2:D5`. |
| **Data edge** | Where a run of filled cells meets a blank, which Cmd+arrow jumps to. |
| **Fill handle** | The small square at the selection's corner, dragged to fill. |
| **Point mode** | While typing a formula, arrowing or clicking inserts cell references. |
| **Scheme** | The keyboard shortcut set in use: Google Sheets or Excel. |
| **Permutation** | A reordering of rows or columns (a move or a sort), given as new position → old position. |
| **Virtualization** | Drawing only the rows in view, so large tables stay fast. |
| **Sticky** | Staying in place while the rest of the grid scrolls (the letter row, header row, and gutter). |

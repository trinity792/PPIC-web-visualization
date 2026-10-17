---
Topic: Visualization Tool
Content Type: project specification
pinned: false
description: "The behavior contract for the Visualization Tool's table editor: what every part of the grid shows, how selection, editing, keyboard shortcuts, the clipboard, fill, and structure edits work in the Google Sheets and Excel schemes, and how the grid tells charts what each column and row means. Written for programmers and reviewers building or testing the editor."
Date Published: October 16, 2026
Last Updated: 10/16/2026 - 03:01 PM
Status: Updating
---

# Table Editor Specification

> [!info] Who this is for and how to read it
> This is the lasting description of how the Visualization Tool's table editor behaves, whatever code draws it. Build the editor to it, write tests against it, and update it before changing a behavior. The implementation plan for the current rebuild is [[visualization-tool-spreadsheet-grid-plan]]. Words that may be unfamiliar are defined in the [Glossary](#glossary). Keys are written for a Mac (Cmd, Option); on Windows and Linux, Ctrl stands in for Cmd and Alt for Option.

The table editor is where a reader corrects what the Visualization Tool read from a pasted or uploaded table. No import can guess every table right, so the editor is the escape hatch: whatever the import got wrong, the reader fixes here, once, and every chart follows. Researchers already know spreadsheets, so the editor behaves like Google Sheets by default, and like Excel for readers who choose that.

---

## Principles

1. **Never stuck.** Every automatic decision (the header row, column kinds, units, moved title and source lines, total rows, the chart choice) is visible in the editor and can be overridden in one action. "Revert to original" is always available.
2. **State the meaning once.** A column's kind and a row's mark are set in the editor, and every chart, ranking, and mapping obeys them.
3. **One undo history.** Every edit is one step of the tool's undo history, shared with the chart settings. A multi-cell paste, fill, move, or sort is one step.
4. **Familiar first.** Where Google Sheets and Excel agree, the editor does the same. Where they differ, the reader's chosen scheme decides.
5. **Data stays local.** Nothing in the editor is sent to a server.

---

## Where the editor appears

| Place | How the reader gets there | Notes |
|---|---|---|
| Import step, right panel | After pasting or uploading | The Check panel on the left lists findings, each with its fix and **Show me**. |
| Edit step, **Edit Data** | The **View Chart / Edit Data** toggle over the preview, or any **Fix in data** link | The same editor, bound to the same table. View Chart shows the result of each edit. |
| Edit your data dialog | The data source panel's edit button | The same editor. |

An edit keeps the current chart unless the chart can no longer draw the table; then the tool switches to the best chart for the table, as on import.

---

## Anatomy

The editor is, from top to bottom: the toolbar, the formula bar, the grid, and the status bar.

### Toolbar

| Control | Action |
|---|---|
| **+ Row** | Insert a row below the selection (at the end with no selection). |
| **+ Column** | Insert a column to the right of the selection (at the end with no selection). |
| **Delete row** | Delete the selected rows (the rows of the selection when cells are selected). |
| **Sort** | Sort the data rows by the active column, A to Z or Z to A. |
| **ƒx Derived column** | Insert a column to the right of the selection, named "Formula N", and open its first data cell for editing with `=` already typed. |
| Validity status | "All columns valid" with a green dot, or "N cells need attention". Clicking the second selects those cells. |
| **More** (⋯) | Import settings, Transpose, Show hidden columns (when any are hidden), Revert to original, Keyboard shortcuts. |

### Formula bar

From left to right: the selection's address (see [Addressing](#addressing)), an ƒx mark, and the active cell's content. A formula cell shows its formula; any other cell its value. The content is editable: Enter commits it to the active cell, Esc restores it, and leaving the box commits it.

### Grid

| Part | Shows | Interaction |
|---|---|---|
| Corner | Nothing | Click to select everything. |
| Letter row | A, B, C, … above each column | Click selects the column; drag moves it; right-click opens the column menu. |
| Header row (row 1) | Each column's name, a type pill on the right, and in Edit Data a badge naming what the current chart uses the column for | Double-click the name to rename it; click the pill to set the kind (see [Column kinds](#column-kinds)). |
| Gutter | Row numbers: 1 for the header, then 2, 3, … for data rows | Click selects the row; drag moves it; right-click opens the row menu. |
| Cells | Values, graded by color as in the Check panel | See [Selection](#selection) and [Editing](#editing). |
| Trailing row | One blank row after the last data row | Typing into it adds a data row. |

The letter row, the header row, and the gutter stay in place while the grid scrolls.

#### Visual states

| State | Shown as |
|---|---|
| Active cell | An orange border (`ppic-orange-300`). |
| Selected cells, rows, or columns | A light orange fill (`ppic-orange-50`). The letters and row numbers of selected columns and rows are tinted the same. |
| Active column and row | Their letter and row number are tinted, as in the mockup. |
| Formula cell | Its value, with a small mark in a corner; the formula shows in the formula bar and on hover. |
| Formula error | The error value (`#REF!`, `#VALUE!`, `#DIV/0!`, `#CYCLE!`, `#NAME?`, `#ERROR!`), graded malformed, with an explanation on hover. |
| Malformed cell | Red, as in the Check panel: a value its column's kind cannot read. |
| Missing or suppressed value | Gray (`n/a`, blank) or gray italic (`(D)`, `*`). |
| Marked row | Dimmed, with its reason ("Left out", "Total", "Note") in the gutter. |
| Ignored column | Dimmed, with an `ignored` pill. |
| Move in progress | A drop line between rows or columns where the moved ones will land. |

### Status bar

Left: "N rows · M columns · Double-click a cell to edit" (N counts data rows). Right, for a selection of more than one cell: **Sum**, **Average**, and **Count** when any selected value is a number, else **Count** alone. Count counts filled cells.

---

## Addressing

- Columns are lettered A to Z, then AA, AB, and so on.
- **Row 1 is the header.** The first data row is row 2, as in the spreadsheet the data came from, so a formula copied from Excel (`=B2/C2`) means the same cell here.
- The formula bar writes the selection as Sheets does:

| Selection | Written |
|---|---|
| One cell | `B3` |
| A range | `B2:D5` |
| Whole rows | `3 rows` (or `Row 4` for one) |
| Whole columns | `2 columns` (or `Column C` for one) |
| Several ranges | The active range's address |

---

## Selection

A selection is a list of rectangular ranges and an **active cell** inside the last one. The **anchor** is the cell where the current range started; extending moves the far corner and keeps the anchor.

| Action | Result |
|---|---|
| Click a cell | That cell alone; it is active and the anchor. |
| Drag across cells | A range from the press to the release. |
| Shift+click a cell | The range from the anchor to that cell. |
| Cmd+click a cell, or Cmd+drag | Adds a range; earlier ranges stay. |
| Click a column letter or row number | That whole column or row. The active cell is its first data cell. |
| Shift+click a letter or number | Every column or row from the anchor's to this one. |
| Cmd+click a letter or number | Adds that column or row. |
| Drag across letters or numbers | The columns or rows dragged over. |
| Click the corner, or Cmd+A | Everything. In Sheets, a second Cmd+A after selecting the data region also selects everything. |
| Shift+Space | The rows of the selection. |
| Ctrl+Space | The columns of the selection. |

The header row is selectable: a selected header cell can be renamed by typing, and its column's kind by its pill. Statistics never count header cells.

---

## Editing

### Starting and ending an edit

| Action | Google Sheets scheme | Excel scheme |
|---|---|---|
| Typing a character on the active cell | Replaces the content and starts editing | Same |
| Enter | Starts editing, keeping the content | Moves down without editing |
| F2 | Starts editing, keeping the content | Same |
| Double-click | Starts editing, keeping the content | Same |
| While editing: Enter | Commits and moves down | Same |
| While editing: Shift+Enter | Commits and moves up | Same |
| While editing: Tab / Shift+Tab | Commits and moves right / left | Same |
| While editing: Esc | Cancels the edit | Same |
| While editing: Cmd+Enter | Writes the entry into every selected cell, shifting relative formula references | Same (Ctrl+Enter) |
| While editing: arrows | Move the text cursor; in a formula, see point mode | Same |

Moves after a commit stay inside a multi-cell selection, wrapping as in Sheets and Excel.

### Formulas and point mode

Text starting with `=` is a formula (see [Formulas](#formulas)). While a formula is being typed, at a place where a reference can go (after `=`, an operator, `(`, or `,`), clicking a cell, dragging a range, or pressing an arrow key inserts that reference. Further arrows or clicks change it, as in Sheets and Excel. Typing anything else leaves point mode.

### Header cells

Editing a header cell renames the column. A rename also renames `[Name]` references in every formula. An empty name is not allowed; the old name stays.

---

## Keyboard reference

The reader chooses a scheme under **More** → **Keyboard shortcuts**, which also lists every key in a table generated from the same keymap the editor uses. The choice is remembered per viewer (see [Shortcut schemes](#shortcut-schemes-and-persistence)).

### Moving and selecting

| Action | Google Sheets scheme | Excel scheme |
|---|---|---|
| Move one cell | Arrows | Arrows |
| Move right / left | Tab / Shift+Tab | Tab / Shift+Tab |
| Jump to the edge of the data | Cmd+arrow | Cmd+arrow |
| Start / end of row | Home / End (Fn+← / Fn+→ on a Mac laptop) | Home / End |
| First / last cell | Cmd+Home / Cmd+End | Cmd+Home / Cmd+End |
| Extend the selection | Shift+arrow | Shift+arrow |
| Extend to the edge of the data | Cmd+Shift+arrow | Cmd+Shift+arrow |
| Select row / column | Shift+Space / Ctrl+Space | Shift+Space / Ctrl+Space |
| Select all | Cmd+A | Cmd+A |
| Scroll a screen | Page Up / Page Down | Page Up / Page Down |

**The data edge.** Cmd+arrow follows the Sheets and Excel rule:

- **Inside data:** from a filled cell whose neighbor in that direction is filled, it moves to the last filled cell before a blank.
- **At an edge:** from a filled cell whose neighbor is blank, it moves to the next filled cell.
- **Nothing ahead:** with no filled cell ahead, it moves to the table's edge.

### Editing and clipboard

| Action | Google Sheets scheme | Excel scheme |
|---|---|---|
| Edit the active cell | Enter or F2 | F2 |
| Clear the selection | Delete or Backspace | Delete or Backspace |
| Copy / Cut / Paste | Cmd+C / Cmd+X / Cmd+V | Cmd+C / Cmd+X / Cmd+V |
| Paste values only | Cmd+Shift+V | Cmd+Shift+V (as Paste Special, Values) |
| Undo | Cmd+Z | Cmd+Z |
| Redo | Cmd+Shift+Z or Cmd+Y | Cmd+Y |
| Fill down / right | Cmd+D / Cmd+R | Cmd+D / Cmd+R |
| Fill the selection with the entry | Cmd+Enter (while editing) | Ctrl+Enter (while editing) |

### Rows and columns

| Action | Google Sheets scheme | Excel scheme |
|---|---|---|
| Insert rows or columns (for a whole-row or whole-column selection) | Cmd+Option+= | Ctrl+Shift+= |
| Delete the selected rows or columns | Cmd+Option+− | Ctrl+− |
| Open the menu for the selection | Shift+F10, or the context-menu key | Shift+F10, or the context-menu key |

Browser shortcuts the editor does not use (Cmd+P, Cmd+F, Cmd+T, and so on) are left to the browser.

---

## Mouse

| Gesture | Result |
|---|---|
| Click, drag, Shift+click, Cmd+click | See [Selection](#selection). |
| Double-click a cell | Edit it. |
| Double-click a header name | Rename the column. |
| Drag a selected column letter or row number | Move the selected columns or rows; a drop line shows where. Esc cancels the drag. |
| Drag the fill handle (the small square at the selection's corner) | Fill down, up, right, or left; see [Fill](#fill). |
| Double-click the fill handle | Fill down to the end of the neighboring column's data, as in Sheets and Excel. |
| Drag a column's right edge | Resize the column. Double-click the edge to fit its contents. |
| Right-click | Open the cell, row, or column menu for what is under the pointer. A right-click inside the selection keeps the selection. |
| Wheel or trackpad | Scroll; the letter row, header row, and gutter stay in place. |
| Touch: tap | Select a cell, row, or column. Touch is otherwise unsupported: editing assumes a mouse and keyboard (owner, October 16, 2026). |

### Menus

- **Cell menu.** Cut, Copy, Paste, Paste values only, Insert row above or below, Insert column left or right, Delete rows, Delete columns, Clear, Sort A to Z, Sort Z to A, and Sort selected range (when more than one row is selected).
- **Row menu.** All of the above, plus Use as header row, Leave out of chart (or Include in chart), and Mark as total.
- **Column menu.** All of the above, plus Rename, Kind, Hide, and Fit width.

---

## Clipboard

### Copying out

A copy writes two formats:

- **Text.** Tab-separated, one line per row, so it pastes into any spreadsheet, Stata, or R. A cell holding a tab, a newline, or a quote is quoted, with inner quotes doubled.
- **HTML.** A `<table>` of the same cells, so a paste into Excel or Sheets keeps the cell boundaries.

A formula cell copies its formula when pasted back into this editor, and its value everywhere else. Several ranges copy as one block only when they share rows or columns, as in Sheets; otherwise only the active range is copied.

### Pasting in

| Clipboard | Selection | Result |
|---|---|---|
| A block (several cells) | Any | The block lands with its top-left corner at the active cell. The table grows rows and columns as needed; new columns are typed from what lands in them. |
| One value | A single cell | That cell. |
| One value | A range | Every cell of the range (as Sheets and Excel do). |
| A block | A range that is an exact multiple of the block's size | The block repeats to fill the range. |

An HTML table on the clipboard is preferred over the text, so merged or multi-line cells from Excel land correctly. A pasted formula keeps its references relative to where it lands (copied from this editor) or as written (from elsewhere).

### Cutting

The editor handles keyboard copy, cut, and paste through native clipboard events. If the browser blocks a clipboard action chosen from a menu, the editor focuses the grid and gives the corresponding keyboard shortcut; it does not request clipboard permissions. Paste values only keeps that choice for the ensuing native paste.

Cut copies, marks the source with a dashed border, and clears the source when the reader pastes in this editor. References to cut cells follow their new addresses, including absolute references; unrelated references stay as written. A cut that is never pasted changes nothing. Esc removes the dashed border.

---

## Fill

- **Fill down and fill right.** Cmd+D copies the top row of each selected range down through the range; Cmd+R copies the leftmost column right. With a single cell selected, Cmd+D copies the cell above, and Cmd+R the cell to the left.
- **Fill handle.** Dragging extends the selection's content:

| Source | Extension |
|---|---|
| Two or more numbers with a constant step | The series continues by that step (1, 2 gives 3, 4, …). |
| One number | Copied (Option-drag counts up by one, as in Excel). |
| Dates with a constant step (days, months, quarters, years, school years) | The series continues in the same unit. |
| Text ending in a number ("Wave 1") | The number counts up. |
| A formula | Each copy's relative references move with it; `$` anchors stay. |
| Anything else | The pattern repeats. |

Filling never changes a column's kind; values a kind cannot read grade as malformed.

---

## Structure edits

Every structure edit keeps formulas, row marks, column kinds, and hidden columns in step with the cells they belong to.

| Edit | Effect on formulas | Effect on marks and kinds |
|---|---|---|
| Insert rows or columns | References past the insertion move to follow their cells. | Marks and kinds move with their rows and columns. |
| Delete rows or columns | References to deleted cells become `#REF!`; formulas in deleted cells go. | Marks and kinds of deleted rows and columns go. |
| Move rows or columns | References follow the moved cells. | They move with their rows and columns. |
| Sort | References follow their cells' rows. | Marks move with their rows. |
| Transpose | Formulas become their values (a reference cannot follow a swap of rows and columns). | Row marks are cleared; kinds are inferred again, except the reader's own. |
| Use as header row | The rows above leave the data (undoable from the Check panel); references are shifted as for a deletion. | Columns are typed again from the rows that remain, except the reader's own kinds. |

**Sort** comes in two forms (owner, October 16, 2026):

- the toolbar's **Sort** sorts all data rows by the active column;
- the right-click menu's **Sort selected range** sorts only the selected rectangle, leaving all other cells and partial-row marks in place. Formulas inside the rectangle adjust relative references as they move; formulas outside keep their addresses.

Both sort data rows only, and the header stays row 1:

- numbers sort numerically and text naturally ("Item 2" before "Item 10");
- dates sort by their place in time;
- blanks and missing values sort last in either direction.

Marked rows sort with the data. Sorting by a formula column sorts by its values.

**Delete row** with whole columns selected deletes nothing and says so. **Delete row** with the header row selected deletes nothing; the header is changed by renaming, or by Use as header row.

---

## Column kinds

A column's kind is its answer to "what is this column", and it overrides inference everywhere. The pill in the header shows it; clicking the pill sets it.

| Kind | Pill | Meaning for charts |
|---|---|---|
| Label | `text` | Names things (places, groups, categories). |
| Group | `group` | Sections or groups rows. |
| Time | `date` | Places rows in time (years, months, quarters, days, school years). |
| Number | `number` | A value, shown as a plain number. |
| Percent | `percent` | A value shown as a percentage. |
| Dollars | `dollars` | A value shown as currency. |
| Ignore | `ignored` | Kept in the editor; no chart, ranking, or mapping sees it. |

A kind the reader sets is kept through every re-profile, transpose, and Import settings re-read (by column name). A pill with a small dot shows a kind the reader set, rather than one the import inferred.

---

## Row marks

| Mark | Set from | Effect |
|---|---|---|
| Left out | Row menu → Leave out of chart | The row stays in the editor but no chart draws it. |
| Total | Row menu → Mark as total, or the Check panel's "Leave out total rows" | As Left out; it also keeps parts-of-a-whole detection from counting the total. |
| Note | Set by the import for a note row kept in the data | As Left out. |

Row menu → Include in chart clears a mark.

---

## Formulas

The formula language is defined by `lib/tabular/formulas.js`, and this section is its reader-facing summary.

| Part | Written |
|---|---|
| Cell | `B2`, `$B$2`, `B$2`, `$B2` |
| Range | `B2:D2`, `C:C` |
| Same-row column | `[Share]` or `Share` (a bare name) |
| Values | Numbers, `"text"`, `TRUE`, `FALSE` |
| Operators | `+ - * / ^` (arithmetic), `&` (join text), `= <> < <= > >=` (and `== !=`) |
| Functions | `SUM`, `AVERAGE`, `COUNT`, `MEDIAN`, `MIN`, `MAX`, `SHARE(value, range)` (percent of a total), `ROUND`, `ABS`, `IF`, `CONCAT`, `TRIM`, `UPPER`, `LOWER` |

| Error | Means |
|---|---|
| `#REF!` | A reference to a cell that does not exist, or no longer does. |
| `#VALUE!` | Arithmetic on text, or a range where one value is needed. |
| `#DIV/0!` | Division by zero. |
| `#CYCLE!` | A cell that depends on itself. |
| `#NAME?` | A name that is no column. |
| `#ERROR!` | A formula that does not parse. |

Formulas recalculate on every edit, before anything reads the table. No formula ever runs JavaScript.

---

## Findings and Show me

The Import step's Check panel lists what the import moved out of the data and what it noticed:

- moved title, source, and note lines;
- joined headers;
- blank labels to fill down;
- total rows;
- footnote marks;
- ambiguous dates;
- fractions to show as percent.

Each finding has its fix (Undo move, Fill down, Leave out total rows, Show as percent) where one exists. **Show me** selects the finding's cells in the editor and scrolls to them, showing a hidden column first.

---

## Import settings

**More** → **Import settings** reads the table again from what the import kept: the raw text of a paste or delimited file, or the raw cells of a spreadsheet upload, up to about 1 MB.

| Setting | Choices |
|---|---|
| Header row | Automatic, or line 1 to 20 of the raw data. Lines above become the title. |
| Header spans | 1, 2, or 3 lines, joined into one name per column ("Employment - Jobs"). |
| Separator | Automatic, Tab, Comma, Semicolon. Raw text only. |
| Numbers | Automatic, 1,234.5, or 1.234,5. |
| Dates | Automatic, month first, or day first. |
| Move titles, sources, and notes out | On or off. |

Reading again replaces the cells, keeps the reader's column kinds by name, and keeps the dataset's name.

---

## Edit Data and Fix in data

In the Edit step, **View Chart / Edit Data** switches the preview between the chart and the editor. **Fix in data** links open Edit Data with the relevant column selected. They appear on:

- the "rows share a place" warning;
- the mixed-units and many-series notices;
- the "Select … to build this chart" message;
- the chart-choice note.

---

## Shortcut schemes and persistence

- **Schemes:** Google Sheets (default) and Excel.
- **Where the choice lives:** in the viewer's browser (`localStorage`), so it follows the reader across visits on that device but not to other devices or other readers.
- **When storage is unavailable:** in a private window, or with site data blocked, the editor uses the Sheets scheme and does not fail.

---

## Accessibility

- **Roles.** The editor is an ARIA grid (`role="grid"`) with column headers, row headers, and grid cells. `aria-rowcount` and `aria-colcount` give the full size when rows are virtualized.
- **Keyboard focus.** Focus stays on the grid, which points at the active cell with `aria-activedescendant`. Every action has a keyboard path, and the menus are reachable with Shift+F10.
- **Announcements.** A polite live region announces selection changes ("B2 to D5 selected, Sum 1,204"), edits, and moves.
- **Colors and contrast.** Colors are never the only signal: marks and kinds also have text, and formula errors also have their error value. Text meets 4.5:1 contrast on every state.

---

## Performance and limits

- **Virtualization.** Rows are virtualized above 200 rows: only visible rows, plus a margin, are drawn.
- **Smoothness.** Scrolling and selection stay smooth up to at least 50,000 rows by 50 columns.
- **Raw data size.** The raw import kept for Import settings is capped at about 1 MB; larger tables cannot be re-read and say so.
- **Responsiveness.** A paste, fill, sort, or move of up to 50,000 cells completes as one undo step without freezing the page for more than a moment.

---

## Out of scope

Merged cells, several sheets, cell styling (bold, colors, borders), conditional formatting, charts in cells, comments, data validation lists, frozen panes beyond the header row and gutter, and collaborative editing.

---

## Glossary

| Term | Meaning |
|---|---|
| **Active cell** | The one cell that typing and the formula bar act on, inside the current range. |
| **Anchor** | Where the current range started; extending a selection keeps it fixed. |
| **Range** | A rectangle of cells, written `B2:D5`. |
| **Data edge** | Where a run of filled cells meets a blank, which Cmd+arrow jumps to. |
| **Fill handle** | The small square at the selection's corner, dragged to fill. |
| **Point mode** | While typing a formula, clicking or arrowing to cells inserts their references. |
| **Column kind** | What a column is for charts: label, group, time, number, percent, dollars, or ignored. |
| **Row mark** | A reason a row stays in the editor but off the chart: left out, total, or note. |
| **Finding** | Something the import noticed or moved, listed in the Check panel. |
| **Scheme** | The set of keyboard shortcuts in use: Google Sheets or Excel. |

/**
 * remarkIndentNesting.js — nest list items by their source indentation (remark).
 *
 * The docs are authored in Obsidian, which nests a sub-bullet whenever it is
 * indented *at all* under its parent. CommonMark is stricter: a child list item
 * must be indented to at least the width of the parent marker (2 cols under a
 * `- `, 3 under a `1. `), otherwise the "child" is emitted flat — either as a
 * sibling in the same list or as a separate sibling list right after it. Both
 * cases render flush-left instead of indented.
 *
 * This plugin rebuilds nesting from the one signal that survives that
 * flattening: each listItem's source column (`position.start.column`). Every
 * maximal run of adjacent `list` siblings is flattened into a single ordered
 * sequence of items, then re-nested with a column stack — an item becomes a
 * child of the nearest preceding item at a smaller column. Correctly-indented
 * lists round-trip unchanged; under-indented ones gain the nesting the author
 * intended. List type (ordered/unordered), `start`, task-list `checked`, and
 * loose/tight spacing are preserved.
 *
 * Data sources:
 *   - mdast tree (via unified/remark) — requires position info (default on)
 *
 * Usage:
 *   remarkPlugins: [remarkGfm, remarkIndentNesting, …]  // after remarkGfm
 */

/** Depth-first flatten of a list into `{ item, column, ordered, start }`. */
function flattenList(listNode, out) {
  for (const item of listNode.children) {
    if (item.type !== "listItem") continue;
    // Detach any sublists CommonMark already created; they are re-derived from
    // the flat sequence so nesting has a single source of truth.
    const sublists = [];
    item.children = item.children.filter((child) => {
      if (child.type === "list") {
        sublists.push(child);
        return false;
      }
      return true;
    });
    out.push({
      item,
      column: item.position?.start?.column ?? 1,
      ordered: Boolean(listNode.ordered),
      start: listNode.start ?? null,
    });
    for (const sublist of sublists) flattenList(sublist, out);
  }
}

/** Rebuild top-level list nodes from a flat, column-annotated item sequence. */
function rebuild(entries) {
  const roots = [];
  const stack = []; // { column, item }

  for (const entry of entries) {
    while (stack.length && stack[stack.length - 1].column >= entry.column) {
      stack.pop();
    }
    // Siblings live in the parent item's children; roots live at the top.
    const siblings = stack.length ? stack[stack.length - 1].item.children : roots;

    // Reuse a trailing list only when it matches this item's marker type,
    // so adjacent ordered/unordered runs stay distinct (CommonMark semantics).
    let list = siblings[siblings.length - 1];
    if (!list || list.type !== "list" || Boolean(list.ordered) !== entry.ordered) {
      list = {
        type: "list",
        ordered: entry.ordered,
        start: entry.ordered ? entry.start : null,
        spread: false,
        children: [],
      };
      siblings.push(list);
    }
    list.children.push(entry.item);
    if (entry.item.spread) list.spread = true;

    stack.push({ column: entry.column, item: entry.item });
  }
  return roots;
}

/** Recursively re-nest every run of adjacent list siblings under `node`. */
function processChildren(node) {
  if (!node || !Array.isArray(node.children)) return;

  const next = [];
  let i = 0;
  while (i < node.children.length) {
    const child = node.children[i];
    if (child.type !== "list") {
      processChildren(child);
      next.push(child);
      i += 1;
      continue;
    }
    // Gather the maximal run of consecutive list siblings.
    const run = [];
    while (i < node.children.length && node.children[i].type === "list") {
      run.push(node.children[i]);
      i += 1;
    }
    const entries = [];
    for (const list of run) flattenList(list, entries);
    const rebuilt = rebuild(entries);
    for (const list of rebuilt) processChildren(list);
    next.push(...rebuilt);
  }
  node.children = next;
}

export default function remarkIndentNesting() {
  return (tree) => processChildren(tree);
}

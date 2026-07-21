import { describe, it, expect } from "vitest";

import {
  autoMapInlineBindings,
  inlineColumnKind,
  inlineFields,
  inlineRenderBlock,
} from "@/lib/visualization/inlineMapping";

/**
 * Build the inline-table shape ({ columns, rows }) the render-block inspects.
 * `types` is the per-column declared type; `rows` is the raw cell grid.
 */
function table(names, types, rows) {
  return {
    columns: names.map((name, index) => ({ name, type: types[index] })),
    rows,
  };
}

describe("inlineRenderBlock", () => {
  it("returns null when the chart's required roles are all fillable", () => {
    const data = table(
      ["year", "Coal"],
      ["date", "number"],
      [
        ["1990", "10"],
        ["1991", "12"],
      ],
    );
    expect(inlineRenderBlock("line", data, { x: "year", y: "Coal" })).toBeNull();
  });

  it("names a mistyped year column and tells the user to retype it as Date", () => {
    // A bare-year column ties between number and date, so it arrives as text —
    // the exact case that blocks a line chart's temporal x-axis.
    const data = table(
      ["year", "Coal", "Gas"],
      ["text", "number", "number"],
      [
        ["1870", "529.4", ""],
        ["1871", "562.8", ""],
        ["1882", "912.8", "0.16"],
      ],
    );

    const block = inlineRenderBlock("line", data);
    expect(block?.incompatible).toBe(true);
    // Message states the shortfall and lists the actual columns + kinds.
    expect(block.message).toContain("needs a date column");
    expect(block.message).toContain("“year” (category)");
    expect(block.message).toContain("“Coal” (number)");
    // Suggestion points at the retype fix rather than "pick another chart type".
    expect(block.suggestion).toContain("“year”");
    expect(block.suggestion).toContain("Date");
    expect(block.suggestion).not.toContain("Pick a different chart type");
  });

  it("falls back to a generic suggestion when no column looks like a date", () => {
    const data = table(
      ["region", "Coal"],
      ["text", "number"],
      [
        ["North", "10"],
        ["South", "12"],
      ],
    );
    const block = inlineRenderBlock("line", data);
    expect(block?.incompatible).toBe(true);
    expect(block.suggestion).toContain("Pick a different chart type");
  });

  it("just prompts for mapping when a column of the right kind exists but isn't bound", () => {
    const data = table(
      ["year", "Coal"],
      ["date", "number"],
      [
        ["1990", "10"],
        ["1991", "12"],
      ],
    );
    const block = inlineRenderBlock("line", data, {});
    expect(block?.incompatible).toBe(false);
    expect(block.message).toContain("Map your columns");
  });
});

describe("Group column mapping", () => {
  const data = table(
    ["Label", "Section", "Women", "Men"],
    ["text", "group", "number", "number"],
    [
      ["Graduate degree", "Education", "75", "102"],
      ["Dentists", "Occupation", "140", "170"],
    ],
  );

  it("keeps group as a dimension and exposes its semantic hint", () => {
    expect(inlineColumnKind("group")).toBe("dimension");
    expect(inlineFields(data).Section).toMatchObject({
      kind: "dimension",
      isGroup: true,
    });
  });

  it("binds a typed Group column to sectioning ahead of synonyms or prior roles", () => {
    expect(
      autoMapInlineBindings("dumbbell", data, { color: "Section" }),
    ).toMatchObject({
      category: "Label",
      group: "Section",
      start: "Women",
      end: "Men",
    });
    const barData = table(
      ["Label", "Section", "Value"],
      ["text", "group", "number"],
      [["Graduate degree", "Education", "75"]],
    );
    const barBindings = autoMapInlineBindings("bar", barData, { color: "Section" });
    expect(barBindings.group).toBe("Section");
    expect(barBindings.color).toBeUndefined();
  });

  it("keeps the section-name synonym fallback for ordinary text columns", () => {
    const textGroup = table(
      ["Label", "Section", "Women", "Men"],
      ["text", "text", "number", "number"],
      data.rows,
    );
    expect(autoMapInlineBindings("dumbbell", textGroup).group).toBe("Section");
  });

  it.each(["Group", "Category"])(
    "reserves an ordinary text column named %s for sectioning when category remains fillable",
    (groupHeader) => {
      const namedGroup = table(
        [groupHeader, "Label", "Women", "Men"],
        ["text", "text", "number", "number"],
        [["Education", "Graduate degree", "75", "102"]],
      );
      expect(autoMapInlineBindings("dumbbell", namedGroup)).toMatchObject({
        category: "Label",
        group: groupHeader,
        start: "Women",
        end: "Men",
      });
    },
  );

  it("does not reserve Category when it is the only column that can fill a required role", () => {
    const onlyCategory = table(
      ["Category", "Women", "Men"],
      ["text", "number", "number"],
      [["Graduate degree", "75", "102"]],
    );
    expect(autoMapInlineBindings("dumbbell", onlyCategory)).toMatchObject({
      category: "Category",
      start: "Women",
      end: "Men",
    });
    expect(autoMapInlineBindings("dumbbell", onlyCategory).group).toBeUndefined();
  });
});

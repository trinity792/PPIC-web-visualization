// Shared Plotly defaults — the single source of truth for chart config, the
// base layout tokens (type, surfaces, grid), and the legend positioning rules.
// Imported by the data-driven pipeline (toPlotly.js) and by hand-built figures
// (e.g. the UI-kit GraphsShowcase) so both render as one visual family.
import { COLORS } from "@/lib/constants";

export const DEFAULT_PLOTLY_CONFIG = Object.freeze({
  displayModeBar: true,
  responsive: true,
});

// Base layout tokens. PLOTLY_FONT carries the production text color; callers that
// want a different weight/size (the showcase uses a lighter, smaller label) can
// reach for PLOTLY_FONT_FAMILY instead and supply their own size/color.
//
// IMPORTANT: Plotly mutates `layout.font` in place (cleanLayout). PLOTLY_FONT is
// frozen, so it must be spread into a fresh object — `font: { ...PLOTLY_FONT }` —
// never assigned by reference, or Plotly throws "Cannot assign to read only
// property 'color'" and the chart silently fails to render.
export const PLOTLY_FONT_FAMILY = "Inter, sans-serif";
export const PLOTLY_FONT = Object.freeze({
  family: PLOTLY_FONT_FAMILY,
  color: COLORS.gray6,
});
export const PLOTLY_SURFACE = Object.freeze({
  plot_bgcolor: COLORS.white,
  paper_bgcolor: COLORS.white,
});
export const PLOTLY_GRID_COLOR = COLORS.gray2;

// Legend placement by position. The bottom legend anchors its top below the plot
// (y: -0.3, yanchor: "top") so it clears the x-axis title/ticks instead of
// overlapping them; callers using a bottom legend must reserve extra bottom
// margin to match (~104 vs ~60).
export function legendFor(position = "right") {
  if (position === "hidden") return { showlegend: false };
  if (position === "bottom") {
    return {
      showlegend: true,
      legend: { orientation: "h", x: 0, y: -0.3, xanchor: "left", yanchor: "top" },
    };
  }
  return {
    showlegend: true,
    legend: { orientation: "v", x: 1.02, y: 1 },
  };
}

// Soft-wrap a long title onto two lines at the space nearest its midpoint.
export function wrapTitle(title) {
  if (!title || title.length <= 30) return title;
  const midpoint = Math.floor(title.length / 2);
  const spaces = [...title.matchAll(/ /g)].map((match) => match.index);
  if (!spaces.length) return title;
  const splitAt = spaces.reduce(
    (closest, index) =>
      Math.abs(index - midpoint) < Math.abs(closest - midpoint)
        ? index
        : closest,
    spaces[0],
  );
  return `${title.slice(0, splitAt)}<br>${title.slice(splitAt + 1)}`;
}

---
Topic: Frontend
Content Type: implementation plan
pinned: false
description: "Visualization and dashboard plan for the proposed Zillow housing-market module: the chart catalog with the variables and query shapes each graph needs, the derived metrics to compute, and the dashboard layout, filters, and default views."
Date Published: July 17, 2026
Last Updated: 07/17/2026 - 12:00 PM
---

# Zillow Market Module: Visualization and Dashboard Plan

The chart catalog and dashboard design for the proposed Zillow housing-market module. It maps each intended graph to the exact variables it needs, the Zillow measures that feed it, and the server query shape it draws from, then assembles those graphs into a dashboard with filters and default views. The chart types and query shapes reuse the existing visualization architecture rather than inventing new components.

> [!info] How this plan is organized
> The visualization plan comes first: a catalog of chart types, each with its required encodings and source measures, followed by the derived metrics several charts depend on. The dashboard plan follows: layout, global filters, cross-filtering, and preset views. This plan is intentionally implementation-aware but not implementation itself; the file/function scaffolding lives in the module implementation guide outline. Data definitions and caveats live in the Zillow data fact-sheet.

> [!note] Reuse the existing chart architecture
> The V3 editor renders through `lib/visualization/toPlotly.js` from a declarative chart spec, and chart types live in `lib/visualization/chartRegistry.js` as base types plus appearance variants (see the graph-editor overhaul). This plan adds no new chart primitives; it selects existing base types and variants and specifies the encodings the Zillow measures fill. The one genuinely new UI need is monthly time granularity, discussed under Temporal Axis.

---

## Design Principles

The module is monthly, multi-place, and multi-metric, and its geographies are uneven in coverage. Four principles follow from that.

The first is that **time is the primary axis**. Most Zillow series are long monthly histories, so trend charts (line and area) are the backbone and every other chart is a way of slicing a point or a window out of those histories.

The second is that **coverage gates the chart menu**. Because listings, sales, days-on-market, and market heat exist only at metro and U.S. geography while ZHVI and ZORI reach county and ZIP (see the fact-sheet), the available chart types and geographies must be filtered by what the selected measure actually supports, in the same spirit as the existing schema's per-measure `chartRoles`.

The third is that **indices are compared, not aggregated**. ZHVI and ZORI are non-additive, so comparison is by overlay, indexing, and ranking, never by summing places into a total.

The fourth is that **the newest point may be provisional**. Nowcast series must render their latest month distinctly.

---

## Temporal Axis

The existing California modules are annual and key on `Year`. Zillow is monthly and keys on a month-end `Date`. The plan assumes the monthly-granularity temporal control described in the graph-editor overhaul (a `TemporalRangeSection` generalizing the year slider with a granularity prop) rather than the year-only slider. Every time-series chart below binds its x-axis to a month-resolution temporal field; ranking and two-period charts select one or two months from that axis.

---

## Chart Catalog

Each entry lists the chart's purpose, the encoding roles it fills, the Zillow measures that feed it, and the server query shape it reads. The query-shape names (`line`, `category`, `twoPeriod`, `pairs`, `matrix`, `geo`, `table`) match the view vocabulary the existing API layer already speaks.

### Trend over time (line)

| Aspect | Detail |
|---|---|
| Purpose | Show a measure's history for one or more places. |
| Base type / variant | Line; area variant for a single filled series. |
| Encodings | x = Date (temporal), y = measure, color = Location (series). |
| Source measures | ZHVI, ZORI, Median List Price, For-Sale Inventory, Median Sale Price, Days to Pending, Market Heat Index. |
| Query shape | `line`. |
| Notes | The default chart. Nowcast series mark the latest month provisional. |

### Indexed trend (rebased line)

| Aspect | Detail |
|---|---|
| Purpose | Compare growth across places regardless of level (all series start at 100). |
| Base type / variant | Line with an `indexed` transform. |
| Encodings | x = Date, y = indexed measure, color = Location, plus a base-period control. |
| Source measures | ZHVI and ZORI especially (level differences swamp raw overlays). |
| Query shape | `line` + client transform (`lib/visualization/transformRegistry.js`). |
| Notes | Base period must validate against each series' ragged start (a pre-2015 base is invalid for ZORI). |

### Year-over-year / month-over-month change (line)

| Aspect | Detail |
|---|---|
| Purpose | Show growth rate rather than level. |
| Base type / variant | Line with a `percentChange` transform over a 12-month (YoY) or 1-month (MoM) lag. |
| Encodings | x = Date, y = percent change, color = Location. |
| Source measures | ZHVI, ZORI, Median Sale Price, Median List Price. |
| Query shape | `line` + transform. |
| Notes | Follow the ZHVI user guide for correct growth computation. |

### Ranking (bar / column)

| Aspect | Detail |
|---|---|
| Purpose | Rank places on a measure at a chosen month (top N most expensive counties, fastest-selling metros). |
| Base type / variant | Bar (horizontal) or column; Top-N control. |
| Encodings | x = measure, y = Location (category), optional color by measure. |
| Source measures | ZHVI, ZORI, Median List/Sale Price, Days to Pending, Market Heat Index. |
| Query shape | `category`. |
| Notes | Requires a single-period selector; reuses the existing category/Top-N path. |

### Segment comparison (grouped / stacked bar)

| Aspect | Detail |
|---|---|
| Purpose | Compare housing segments or tiers within places (all-homes vs SFR vs condo; top vs mid vs bottom tier). |
| Base type / variant | Bar with `stackMode` grouped or stacked. |
| Encodings | x = Location, y = measure, color = segment/tier. |
| Source measures | ZHVI tiers and segments; ZORI all-homes vs SFR vs multifamily. |
| Query shape | `category` per segment, composed client-side, or `matrix`. |
| Notes | Tiers are not additive; use grouped, not stacked, for tiers. |

### Spread / range (range or dot plot)

| Aspect | Detail |
|---|---|
| Purpose | Show a within-place range: top-tier vs bottom-tier ZHVI, or median list vs median sale price. |
| Base type / variant | Range/dot-plot family (from the graph-editor overhaul's Range/dot-plot additions). |
| Encodings | y = Location, x = two measures (low and high endpoints), optional color. |
| Source measures | ZHVI top/bottom tier; Median List Price vs Median Sale Price. |
| Query shape | `pairs` (two measures per place at one period). |

### Relationship (scatter / bubble)

| Aspect | Detail |
|---|---|
| Purpose | Relate two measures across places (value vs rent; days-to-pending vs share with a price cut). |
| Base type / variant | Scatter; bubble when a size role is used. |
| Encodings | x = measure A, y = measure B, size = measure C (optional), color = Location or region. |
| Source measures | ZHVI vs ZORI; Days to Pending vs Share With a Price Cut; Sale-to-List vs Sales Count. |
| Query shape | `pairs`. |
| Notes | Only geographies where both measures exist are eligible (mostly metro-level for cross-family pairs). |

### Geographic distribution (choropleth map)

| Aspect | Detail |
|---|---|
| Purpose | Map a measure across California at a chosen month. |
| Base type / variant | Choropleth (`symbolMap`/map chart type). |
| Encodings | geography = Location (county or ZIP), color = measure (sequential ramp). |
| Source measures | ZHVI and ZORI (the only families with county/ZIP coverage). |
| Query shape | `geo`. |
| Notes | County-level is the reliable default; ZIP-level is sparse in rural counties and must surface an empty-join notice rather than dropping. Metro-only measures cannot feed a CA county map. |

### Change map (two-period choropleth or slope)

| Aspect | Detail |
|---|---|
| Purpose | Show change between two months by place (growth map, or a slope chart of before/after). |
| Base type / variant | Choropleth on a `twoPeriod` change, or a slope-chart line variant. |
| Encodings | geography or Location = place, value = change (diverging ramp centered at zero). |
| Source measures | ZHVI, ZORI. |
| Query shape | `twoPeriod`. |

### Place-by-month intensity (heatmap / matrix)

| Aspect | Detail |
|---|---|
| Purpose | Show many places' trajectories at once as a colored grid (place x month). |
| Base type / variant | Matrix/heatmap. |
| Encodings | x = Date, y = Location, color = measure or its change. |
| Source measures | ZHVI, ZORI, Market Heat Index. |
| Query shape | `matrix`. |

### Market temperature (diverging bar / gauge-style)

| Aspect | Detail |
|---|---|
| Purpose | Show how seller- or buyer-tilted each metro is. |
| Base type / variant | Diverging bar centered on the neutral value; single-value indicator per place. |
| Encodings | x = Market Heat Index, y = Location, color = diverging ramp. |
| Source measures | Market Heat Index; Sale-to-List Ratio; Percent Sold Above List. |
| Query shape | `category`. |

### Underlying data (table)

| Aspect | Detail |
|---|---|
| Purpose | Show and export the exact rows behind any chart. |
| Base type / variant | Table chart type (`dataTable`). |
| Encodings | Columns = place identifiers + selected measures over the chosen window. |
| Source measures | Any. |
| Query shape | `table`. |

---

## Derived Metrics

Several charts depend on quantities Zillow does not publish directly. These are computed in the data or transform layer and exposed as measures.

| Derived metric | Formula | Feeds |
|---|---|---|
| Price-to-rent ratio | ZHVI / (ZORI x 12) | Scatter, ranking, map (affordability framing) |
| Year-over-year growth | (value_t - value_t-12) / value_t-12 | YoY line, change map |
| Month-over-month growth | (value_t - value_t-1) / value_t-1 | MoM line |
| Indexed value | value_t / value_base x 100 | Indexed trend |
| List-to-sale gap | Median List Price - Median Sale Price | Range/dot plot, spread |
| Tier spread | Top-tier ZHVI - Bottom-tier ZHVI | Range/dot plot |

> [!warning] Compute growth on the level series, then chart it
> Growth and index transforms belong to the transform layer (`lib/visualization/transformRegistry.js`) and must be offered only where they are meaningful. A percent-change transform on an already-percentage measure (sale-to-list ratio, price-cut share) is nonsense and should be hidden for those measures, consistent with the acceptance criteria that transforms work on every chart type they are offered for or are hidden where they do not.

---

## Dashboard Plan

The dashboard presents the four families as a single California housing-market view, arranged so a reader moves from "where" (map) to "over time" (trend) to "who leads" (ranking) to "the numbers" (table), with global filters binding every panel.

### Layout

| Zone | Panel | Default content |
|---|---|---|
| Header | KPI cards | Statewide latest ZHVI, ZORI, Median Sale Price, and Market Heat Index, each with its YoY change and a provisional flag where relevant. |
| Left / main | Choropleth map | County-level ZHVI for the selected month, sequential ramp. |
| Right top | Trend line | Selected measure over the full window for the selected places, national/state benchmark overlay optional. |
| Right middle | Ranking bar | Top-N California places on the selected measure at the selected month. |
| Full width lower | Relationship scatter or heatmap | Value-vs-rent scatter (metro) or place-by-month heatmap, toggled. |
| Footer | Data table | The rows behind the active selection, with export. |

### Global Filters

The filter bar drives every panel. Each filter maps to a schema field or query parameter.

| Filter | Options | Notes |
|---|---|---|
| Metric family | Home values, rents, listings, sales, market temperature | Switching family re-scopes the geography and cadence options. |
| Measure | The metrics within the family | Gated by family. |
| Geographic level | Metro, county, city, ZIP (state and national as overlays) | Gated by measure coverage; metro-only families disable county/ZIP. |
| Places | Multi-select California places | Drives series/ranking membership; empty = all at that level. |
| Date range | Month-resolution range | The `TemporalRangeSection`; single-month panels read the range's end. |
| Segment / tier | All homes, SFR, condo; mid/top/bottom tier | Gated by family (tiers apply to ZHVI). |
| Smoothing | Smoothed+SA vs raw | Selects the cut; never mixes cuts in one series. |
| Benchmark overlay | None, California, United States | Adds a reference series to trend and indexed charts. |

> [!important] Filters must degrade with coverage, not error
> When the user selects a metro-only measure and a county map, the dashboard should disable the county map and explain why (metro-only coverage) rather than render an empty map or throw. This mirrors the project's rule that failures surface as named notices.

### Cross-Filtering and Interaction

Selecting a place on the map or a bar in the ranking filters the trend and table panels to that place. The date control is shared: moving the range end moves the map's month, the ranking's month, and the KPI "latest." Hovering a series shows a synchronized tooltip. The benchmark overlay is a toggle, not a place selection, so it persists across cross-filter changes.

### Default Views (Presets)

Presets seed the whole dashboard so a first-time user sees something meaningful immediately, reusing the module preset pattern (`lib/visualization/presetRegistry.js`).

| Preset | Seeds |
|---|---|
| California home values | ZHVI, county level, statewide + top-10 counties, full history, choropleth + trend. |
| Rent trends | ZORI, metro level, largest CA metros, indexed trend from 2015, benchmark = California. |
| Market heat | Market Heat Index + Days to Pending, metro level, ranking + diverging bar, latest 24 months. |
| Value vs rent | Price-to-rent scatter, metro level, latest month, size = ZHVI. |

---

## Cross-References

The measures, geographies, coverage limits, and caveats referenced throughout this plan are defined in the Zillow data fact-sheet. The chart-type base/variant model, the monthly temporal control, the transform registry, and the map/table chart types are from the graph-editor overhaul. The schema fields, query views, and preset mechanics this plan targets are specified in the module implementation guide outline.

---

## Open Questions for the Visualization Layer

- [ ] Is the price-to-rent ratio a first-class derived measure in the schema, or a chart-only computed field?
- [ ] Does the county choropleth need a maintained CA county GeoJSON, and does one already exist for the [[pophousing]] map?
- [ ] Should weekly-cadence series get their own higher-resolution trend, or is monthly the only temporal grain in v1?
- [ ] Which four presets ship first, and who signs off on the default statewide KPI set?

# June 18th 2026
- started refractor of PopHousing project
- Split the former Population & Housing-only config into general `lib/config.py`
  and specialized `lib/pophousing_config.py`.
- once established, create a style-guide.md file for AI & people modifying the code -> then CLAUDE.md & whatever chatgpt's version is

---

# June 22nd 2026
## agent docs notes
- include one paragraph of project context: this is a project refractor.
  - V1: jupyter notebook visualizations -> V2: partial shiny web app -> react website with all jupyter notebook visualizations, ability to add more visualizations, back end testing frameworks -- error handling and unit tests (pytest)
- primary final form of the project is intended to be a functioning website able to visualize all of the existing jupyter notebooks with detailed documentation for someone else to be able to easily make adjustments in the future and should be readable by non developers.
- the vs code workspace file is "/Users/trinity/Documents/Employment/PPIC/web-data-visualization/docs/technical/web-data-visualization.code-workspace"
- the workspace has two folders web-data-visuialization/ and Previous Tool/
  - web-data-visuialization/ is the new project root
  - Previous Tool/ contains the two originally separated folders
    - "Previous Tool/Visualization Tool" contains all of the jupyter notebooks; "Previous Tool/Automated Data Pipeline" contains the shiny web app version
> [!note] New Ideas:
> modify the pop housing so that it includes data from multiple states for easy comparative analysis
## Refractor Guide
| Existing file | New location | Why |
| --- | --- | --- |
| General project config | `lib/config.py` | Shared repository paths and HTTP defaults only |
| Population & Housing config | `lib/pophousing_config.py` | DOF, E-5/E-8, housing schema, and California geography rules |
| `data_cleaning_utils.py` | `lib/data_cleaning_utils.py` | Shared cleaning functions |
| `enhanced_forward_fill_helpers.py` | `lib/forward_fill_helpers.py` | Shared helper |
| `logging_config.py` | `lib/logging_config.py` | Shared logging setup |
| `download_historical_data.py` | `scripts/automatic-scrapping/` | Pure download/scrape |
| `pophousing_pipeline.py` | Split: scraping functions -> `scripts/automatic-scrapping/`, cleaning/merge logic -> `scripts/chart-creation/` or a new `scripts/etl/` | This file currently does both |
| `historical_data_processor.py` | `scripts/automatic-scrapping/` or `scripts/etl/` | Processing raw -> clean |
| `run_original_pipeline.py` | `scripts/` root (orchestrator) | Calls the others in sequence |
| `validate_production.py` | `scripts/validation/` | Already fits |
| `basic_visualizations.py` | `scripts/chart-creation/` | Plotly figure builders |
| `advanced_city_analysis.py` | `scripts/chart-creation/` | Plotly figure builders |
| Raw Excel files (E-5, E-8) | `data-raw/housing-population/` | Downloaded source files |
| `PopHousing_Current.csv` | `data-cleaned/housing-population/` | Pipeline output |

RE: [[pophousing-pipeline-refractor]]
- Checks:
  - Each part of the previous pipeline script maps to another in the refractor (does not have to be 1:1 but the core function must be maintained)
  - descriptive variable names
    - for scripts that can only be used on one project tie the description to that.
    - for scripts that are meant to be shared, use general names
- Tasks:
  - Create the scripts at their specified locations. Do not add any boilerplate code to the scripts. Simply create the files
  - Perform a comprehensive analysis of "scripts/orchestrators/pophousing_pipeline.py" and all programs that it calls located in "Automated Data Pipeline/CA Population Housing/production_pipeline". If a program is called and isn't found flag it.
  - Based on that analysis propose changes to make to "docs/PPIC Summer 2026/trinitys_notes/pophousing pipeline refractor.md" and provide justifications. Wait for user approval before making the changes. The pophousing pipeline refractor document is to act as an implementation guide.
  - Where possible reuse scripts that already exist rather than creating inline solutions. If an inline solution can be generalized, provide the user with what function to add to an existing script and await confirmation
  - Where possible resuse existing code during the refractor (from the original scripts in "/Users/trinity/Documents/Employment/PPIC/Previous Tool/Automated Data Pipeline/CA Population Housing/production_pipeline" -> scripts described in "docs/PPIC Summer 2026/trinitys_notes/pophousing-pipeline-refractor.md")

---
# 6.25.26
## Feature List
- [ ] Dashboard Views
- [ ] Editable graphs (with shared presets)
	- Bar; Map/Heatmap/Bubble/Scatter/Slope/Line/Dumbell
- [ ] Save graphs (svg, png, jpg, etc) AND configurations (copy-pastable)

>[!important] Tasks for Today and Tmr
> - [ ] Check for pre-existing visualization scripts and edit/remove as necessary to prevent overlap
> - [ ] Review and Edit "Details" -> Design front end architecture
> - [ ] Implement improved UI/UX
## UI Details

### Shared preset model

A preset should be **general**, not tied to `"Total Population"` or `"Bay Area"`.

For example, this is a generic trend preset:

```js
export const TREND_OVER_TIME = {
  id: "trend-over-time",
  chartType: "line",
  title: "Trend over time",

  requiredRoles: ["x", "y"],
  optionalRoles: ["series", "benchmark", "facet"],

  defaults: {
    x: { role: "temporal" },
    y: { role: "measure" },
    series: { role: "comparisonDimension", default: "Location" },
    transform: "actual",
    comparisonMode: "places",
  },

  sidebar: {
    data: true,
    encodings: ["x", "y", "series"],
    comparison: ["locations", "benchmark", "baseYear", "transform"],
    labels: ["title", "subtitle", "xAxis", "yAxis", "legend", "tooltip"],
    appearance: ["lineStyle", "markerMode", "legendPosition"],
  },

  constraints: {
    minPeriods: 2,
    maxSeries: 6,
    allowedTransforms: ["actual", "indexed", "percentChange", "differenceFromBenchmark"],
  },
};
```

A user then applies the preset to a module:

```js
{
  module: "pophousing",
  preset: "trend-over-time",

  bindings: {
    x: "Year",
    y: ["Total Population"],
    series: "Location",
  },

  filters: {
    subset: "Counties",
    locations: ["Alameda", "Contra Costa", "San Diego"],
    startYear: 2000,
    endYear: 2025,
  },

  labels: {
    title: "Population growth in selected counties",
    yAxis: "Residents",
  },
}
```

The **canonical field name** remains `"Total Population"`. The user’s `"Residents"` label is only a display override. That distinction prevents user edits from breaking the data contract.

### Shared field catalog

Every module should publish metadata describing its fields.

```js
export const POPHOUSING_FIELDS = {
  Year: {
    kind: "temporal",
    label: "Year",
    formatter: "year",
  },

  Location: {
    kind: "dimension",
    label: "Location",
    cardinality: "high",
    supportsComparison: true,
  },

  "Geographic Level": {
    kind: "dimension",
    label: "Geographic level",
    values: ["City", "Town", "County", "Region", "State"],
  },

  "Total Population": {
    kind: "measure",
    label: "Total population",
    unit: "people",
    comparisonGroup: "populationStock",
    aggregation: "notAllowed",
    transforms: ["actual", "numericChange", "percentChange", "indexed"],
    chartRoles: ["xMeasure", "yMeasure", "size", "color"],
  },

  "Total Housing Units": {
    kind: "measure",
    label: "Total housing units",
    unit: "housingUnits",
    comparisonGroup: "housingStock",
    aggregation: "notAllowed",
    transforms: ["actual", "numericChange", "percentChange", "indexed"],
    chartRoles: ["xMeasure", "yMeasure", "size", "color"],
  },

  "Vacancy Rate (%)": {
    kind: "measure",
    label: "Vacancy rate",
    unit: "percent",
    comparisonGroup: "housingRate",
    aggregation: "notAllowed",
    transforms: ["actual", "percentagePointChange"],
    chartRoles: ["xMeasure", "yMeasure", "color"],
  },
};
```

This is important because a numeric field is not automatically comparable to every other numeric field.

For example:

|Combination|Same axis allowed?|Better treatment|
|---|--:|---|
|Births and deaths|Yes|Grouped bar, waterfall, or line|
|Total population and total housing units|Usually no|Scatter, indexed trend, or small multiples|
|Vacancy rate and population|No|Scatter or separate panels|
|Net domestic migration and net foreign migration|Yes|Diverging/grouped bars or line|
|Vacancy rate in 2020 and 2025|Yes|Dumbbell or slopegraph|
|County population and city population|Not by default|Require explicit geography selection|

The PopHousing contract has population, housing, occupancy, vacancy, household, and housing-type variables, while Components of Change includes births, deaths, migration measures, population change, and crude rates. Those are rich enough for a shared field catalog with module-specific compatibility rules.

### Dynamic sidebar structure

The sidebar should have the same overall structure across modules, but its controls should be generated from the active chart type and field catalog.
The below is just an example of the Graph Editor portion. Refer to the mockup for detailed sidebar

```text
┌─────────────────────────────────┐
│ Preset                          │
│ [ Trend over time            ▼ ]│
├─────────────────────────────────┤
│ Data                            │
│ Module: Population & Housing    │
│ Geographic level: [Counties  ▼] │
│ Date range: [1991] — [2025]     │
├─────────────────────────────────┤
│ Encodings                       │
│ X axis: [Year                ▼] │
│ Y axis: [Total Population    ▼] │
│ Compare by: [Location        ▼] │
│ Color: [Location             ▼] │
│ [+ Add line]                    │
├─────────────────────────────────┤
│ Comparison                      │
│ Benchmark: [California       ▼] │
│ Transform: [Actual value     ▼] │
│ [ ] Index to base year           │
├─────────────────────────────────┤
│ Labels                          │
│ Title: [Population change...]   │
│ Y-axis: [Residents]             │
│ Tooltip: [Detailed            ▼]│
├─────────────────────────────────┤
│ Appearance                      │
│ Legend: [Bottom               ▼]│
│ Markers: [Off                  ]│
│ [Reset]        [Save view]      │
└─────────────────────────────────┘
```

#### Sidebar behavior rules

|User action|System behavior|
|---|---|
|Changes chart type|Revalidates all field bindings against the new chart’s required roles.|
|Selects a different module|Keeps compatible labels and filters; clears incompatible fields.|
|Adds a line|Adds a valid trace layer, not an unrestricted arbitrary query.|
|Adds a new measure|Checks unit and semantic compatibility before allowing it.|
|Changes a label|Changes display text only; never changes the canonical field name.|
|Chooses a benchmark|Adds a controlled comparison series or calculated difference.|
|Selects a rate field|Replaces percent-change options with percentage-point change where appropriate.|
|Selects too many categories|Recommends a different chart type, faceting, or a filtered subset.|

---

### How “add more lines or variables” should work

“Add more lines” should not mean “let users construct any Plotly trace they want.” It should mean users can add predefined **trace layers**.

#### Line-layer model

```js
{
  id: "county-population",
  type: "series",

  x: "Year",
  y: "Total Population",
  splitBy: "Location",

  values: ["Alameda", "Contra Costa", "San Diego"],
  filters: {
    subset: "Counties",
  },

  label: "Selected counties",
}
```

A user can add these layer types:

|Layer type|Example|
|---|---|
|**Selected places**|Alameda, Contra Costa, and San Diego population trends|
|**Benchmark line**|Add California to selected county trends|
|**Second source**|DoF versus Census, only for Components of Change|
|**Second measure**|Births and deaths, if metrics are in the same comparison group|
|**Reference value**|Statewide vacancy-rate target or historical average|
|**Derived comparison**|Difference from California, indexed values, percent change|

### Safe rules for multiple variables

- Allow multiple metrics on the same axis only when their `comparisonGroup` is compatible.
    
- Allow related counts together: births, deaths, natural increase, migration.
    
- Do not put population and vacancy rate on the same axis.
    
- Do not default to a dual y-axis.
    
- For incompatible measures, switch to:
    
    - indexed trends,
        
    - scatter/bubble,
        
    - faceted small multiples,
        
    - or a relationship chart.
        

The prior Shiny tool already supported multi-location lines, base-year indexing, two-period comparisons, and grouped multi-parameter bars. The new system should preserve those capabilities but expose them through a consistent configuration model.

---
# What each graph type needs

## Bar chart

### Core purpose

Compare values across discrete categories, places, groups, or time periods.

### Required bindings

|Role|Required?|Examples|
|---|--:|---|
|Category|Yes|County, Region, Race/Ethnicity, Housing Type|
|Measure|Yes|Total Population, Births, Vacancy Rate|
|Time / period|Usually|2025, or 2015–2025 change|
|Geographic subset|Usually|Counties, Regions, Cities|
|Aggregation rule|Sometimes|Sum, weighted average, precomputed metric|

### Optional encodings

|Encoding|Use|
|---|---|
|Group / color|Compare 2–5 categories within each bar group|
|Stack|Part-to-whole composition|
|Normalize to 100%|Compare shares instead of totals|
|Sort|Value, alphabetical, change, custom regional order|
|Orientation|Horizontal for long place names or rankings|
|Labels|Exact values, percent, rank, or no labels|

### Sidebar controls

```text
Category
Measure
Year or start/end years
Group by
Stack mode: None / Stacked / 100%
Sort by
Top N
Orientation
Show value labels
```

### Validation rules

- A normal bar chart needs one discrete category and one comparable numeric measure.
    
- Grouped bars should generally use no more than 3–5 groups.
    
- Stacked bars require additive categories; do not stack rates.
    
- A 100% stacked bar requires non-negative values that meaningfully form a whole.
    
- For a rate, use percentage-point change rather than percent change.
    
- For long geography lists, use a horizontal ranking bar and limit to a Top N.
    

### Strong module examples

- Population by county in 2025
    
- Population change from 2015–2025
    
- Births, deaths, and migration by region
    
- Housing stock composition by county
    
- Vacancy-rate comparison across selected cities
    

---

## Line chart

### Core purpose

Show change across an ordered sequence, usually years or months.

### Required bindings

|Role|Required?|Examples|
|---|--:|---|
|X axis|Yes|Year, Month|
|Y axis|Yes|Population, Vacancy Rate, Births|
|Series / split|Usually|Location, Source, Race/Ethnicity|
|Date range|Yes|1991–2025|
|Geographic subset|Usually|Counties, Regions, Cities|

### Optional encodings

|Encoding|Use|
|---|---|
|Color|Location, source, race, tenure|
|Dash pattern|Benchmark or secondary source|
|Markers|Sparse data or short periods|
|Base-year indexing|Compare proportional growth|
|Benchmark|California, median, peer geography|
|Facet|Too many lines for one chart|
|Annotation|Policy date, source break, methodology change|

### Sidebar controls

```text
X axis
Y measure
Compare by
Selected values
Add line
Benchmark
Display: Actual / Indexed / Percent change / Difference from benchmark
Base year
Markers
Line style
Legend placement
```

### Validation rules

- Require at least two periods after filtering.
    
- Default to a maximum of six visible lines.
    
- When more than six series are selected, recommend:
    
    - Top N,
        
    - small multiples,
        
    - a heatmap,
        
    - or a searchable selected subset.
        
- Do not interpolate missing values unless the data methodology explicitly allows it.
    
- Do not compare incompatible metrics on one axis.
    
- If a source changes over time, visibly annotate the source boundary.
    

### Strong module examples

- Population trend for selected counties
    
- Vacancy rate over time by region
    
- Births, deaths, and net migration over time
    
- California versus selected regions
    
- Indexed housing growth across selected cities
    

The Components of Change frontend already distinguishes source as an extra filter dimension, so an “add Census comparison line” control should appear only for that module and only when its geographic subset supports the selected source.

---

## Map / choropleth map

### Core purpose

Show geographic variation in a single measure at one point in time, or in the change between two periods.

### Required bindings

|Role|Required?|Examples|
|---|--:|---|
|Geography key|Yes|County name, state abbreviation, region ID|
|Geometry source|Yes|County GeoJSON, state polygons, region geometry|
|Color measure|Yes|Population growth, vacancy rate, migration rate|
|Geographic level|Yes|Counties, states, regions|
|Period|Yes|2025 or 2015–2025 change|

### Optional encodings

|Encoding|Use|
|---|---|
|Color scale|Sequential, diverging, categorical|
|Classification|Continuous, quantile, equal interval, custom bins|
|Hover fields|Value, rank, percent change, benchmark|
|Boundary overlay|County outlines, regional outlines|
|Selection state|Click a geography to add it to comparison|
|Animation / year slider|Time exploration, used sparingly|

### Sidebar controls

```text
Geographic level
Metric
Year or comparison period
Color scale
Color range
Classification
Number of bins
No-data treatment
Hover fields
Show boundaries
```

### Validation rules

- One chart can only display one compatible geographic level at a time.
    
- Never map cities unless you have city polygon or point geometry.
    
- Do not join on display names alone; use canonical IDs or a maintained geography crosswalk.
    
- Use a diverging scale when zero is meaningful, such as population change or net migration.
    
- Use a sequential scale for magnitude, such as total population.
    
- Show a distinct no-data state rather than implying zero.
    

The project already centralizes shared California geography for both active modules; that should be the source for map joins and geography metadata rather than a chart-level name-matching workaround.

---

## Matrix heatmap

This is different from a geographic map. It shows a two-dimensional grid.

### Core purpose

Reveal patterns across many places and periods when a multi-line chart would be unreadable.

### Required bindings

|Role|Required?|Examples|
|---|--:|---|
|X axis|Yes|Year, Month|
|Y axis|Yes|County, Region, Selected City|
|Color value|Yes|Percent change, vacancy rate, migration rate|
|Filtered scope|Yes|Counties, selected cities, regions|

### Optional encodings

|Encoding|Use|
|---|---|
|Row ordering|Latest value, cumulative change, alphabetical|
|Color scale|Sequential or diverging|
|Cell labels|Show only for small matrices|
|Missing-data display|Hatch, gray, blank|
|Pinned rows|Keep selected places visible|
|Clustering|Analyst-only, not initially recommended|

### Sidebar controls

```text
Columns
Rows
Color measure
Year range
Sort rows by
Pinned locations
Color scale
Show cell values
```

### Validation rules

- Cap the default matrix at roughly 30–50 rows.
    
- For more locations, require search, Top N, or filtering.
    
- Use a diverging color scale for positive/negative values.
    
- Preserve missing cells as missing, not as zero.
    
- Do not use a heatmap where the categories have no meaningful order.
    

### Strong module examples

- County migration rates by year
    
- Vacancy rates by region and year
    
- Building permits by metro area and month
    
- Housing stress by race/ethnicity and year
    

---

## Dumbbell chart

### Core purpose

Compare **exactly two values** for each category and emphasize the magnitude and direction of change.

### Required bindings

|Role|Required?|Examples|
|---|--:|---|
|Category|Yes|County, Region, City|
|Start value|Yes|Population in 2015|
|End value|Yes|Population in 2025|
|Same metric|Yes|Total Population, Vacancy Rate|
|Comparison dimension|Yes|Two years, two sources, two groups|

### Optional encodings

|Encoding|Use|
|---|---|
|Sort|Difference, percent change, end value|
|Point labels|Start, end, change|
|Benchmark line|State average, statewide value|
|Direction emphasis|Positive/negative change|
|Highlight selection|California or selected geography|

### Sidebar controls

```text
Metric
Category
Start year
End year
Sort by
Show: Values / Difference / Percent change
Show labels
Highlight benchmark
```

### Validation rules

- Exactly two periods or groups.
    
- The two values must use the same metric and unit.
    
- Keep the number of categories manageable: typically 6–20.
    
- Use percentage-point change for rates.
    
- Do not use this when the key story is a long multi-year trend.
    

### Strong module examples

- County vacancy rate: 2015 versus 2025
    
- City housing units: 2000 versus 2025
    
- Region births: 2020 versus 2024
    
- Domestic migration rate before and after a selected period
    

---

## Scatter plot

### Core purpose

Show the relationship between two numeric measures.

### Required bindings

|Role|Required?|Examples|
|---|--:|---|
|X measure|Yes|Population change|
|Y measure|Yes|Housing-unit change|
|Observation unit|Yes|County, city, region|
|Period / period pair|Usually|2015–2025|
|Geographic subset|Usually|Counties, Cities, Regions|

### Optional encodings

|Encoding|Use|
|---|---|
|Color|Region, geographic level, source|
|Shape|Secondary category, used sparingly|
|Benchmark lines|Statewide median, zero line, balanced-growth diagonal|
|Labels|Selected or extreme observations|
|Trendline|Analyst option with method disclosure|
|Facet|Compare groups without visual clutter|

### Sidebar controls

```text
X measure
Y measure
Observation unit
Time period
Color by
Reference lines
Label selected points
Show trendline
```

### Validation rules

- X and Y must be numeric.
    
- One point must represent a clearly defined observation unit.
    
- If values are changes, both must use the same period.
    
- Explain whether axes show raw values, percent changes, rates, or indexed values.
    
- Use a reference diagonal only when it has a substantive interpretation.
    
- Do not imply causation from the visual relationship.
    

### Strong module examples

- Population growth versus housing growth
    
- Vacancy rate versus persons per household
    
- Net migration versus population growth
    
- Birth rate versus death rate across counties
    

The old Shiny dashboard already had a population-versus-housing growth scatterplot with a balanced-growth diagonal and population-scaled bubbles, making this a proven analytical pattern for the PopHousing module.

---

## Bubble chart

A bubble chart is a scatter plot with a third numeric variable encoded as point size.

### Core purpose

Show a relationship while adding a meaningful scale variable.

### Required bindings

|Role|Required?|Examples|
|---|--:|---|
|X measure|Yes|Population percent change|
|Y measure|Yes|Housing percent change|
|Size measure|Yes|End-year population|
|Observation unit|Yes|County, city, region|
|Period|Usually|2015–2025|

### Optional encodings

|Encoding|Use|
|---|---|
|Color|Region, geographic level, source|
|Labels|Selected, largest, outlier points|
|Reference lines|Zero, median, balanced-growth diagonal|
|Opacity|Handle overlapping observations|
|Size range|Minimum and maximum displayed radius|

### Sidebar controls

```text
X measure
Y measure
Bubble size
Color by
Time period
Reference lines
Label selected places
Bubble-size range
```

### Validation rules

- Bubble size must be non-negative.
    
- Use area, not radius, to represent the underlying numeric quantity.
    
- Set a reasonable minimum and maximum rendered size.
    
- Keep exact bubble values in the tooltip.
    
- Do not use bubble size for a variable that users may mistake for importance unless the label makes the meaning explicit.
    
- When there are many overlapping cities, offer zoom, filtering, or an alternative county/region view.
    

### Strong module examples

- Population change versus housing change, bubble size = 2025 population
    
- Net migration rate versus birth rate, bubble size = total population
    
- Housing growth versus vacancy-rate change, bubble size = total housing stock
    

---

## Slope chart / slopegraph

### Core purpose

Show directional movement between exactly two ordered conditions, with direct endpoint labels.

A slopegraph is similar to a dumbbell chart but usually removes the endpoint dots and emphasizes rank or directional movement.

### Required bindings

|Role|Required?|Examples|
|---|--:|---|
|Category|Yes|County, Region, City|
|Left condition|Yes|2015 value|
|Right condition|Yes|2025 value|
|Measure|Yes|Same metric on both sides|
|Ordered comparison|Yes|Earlier/later year, before/after condition|

### Optional encodings

|Encoding|Use|
|---|---|
|Direct labels|Category and endpoint value|
|Sort|Left value, right value, difference|
|Highlight|Selected places or largest movers|
|Benchmark|California or median|
|Rank mode|Rank rather than raw value|

### Sidebar controls

```text
Metric
Left period
Right period
Category
Sort by
Show: Raw values / Rank / Percent change
Highlight selected locations
Show endpoint labels
```

### Validation rules

- Exactly two conditions.
    
- Best with roughly 5–15 categories.
    
- Use direct labels at the endpoints; do not rely only on a legend.
    
- Avoid using it when many line crossings make the chart unreadable.
    
- Use dumbbells when exact values matter more than directional movement.
    
- Use slopegraphs when movement, ordering, or rank change is the main story.
    

### Strong module examples

- County population rank: 2000 versus 2025
    
- Region vacancy-rate rank: 2015 versus 2025
    
- State migration-rate rank: 2020 versus 2024
    
- City housing-growth rank over a selected period
    

---

# 6. Recommended general presets

Rather than asking users to begin with “Bar” or “Line,” organize the shared presets by analytical task.

|Preset|Default chart|User question|
|---|---|---|
|**Trend over time**|Line|How did selected places change?|
|**Growth comparison**|Indexed line|Which places grew faster?|
|**Latest-year ranking**|Horizontal bar|Which places are highest or lowest?|
|**Two-period change**|Dumbbell|How did places move between two years?|
|**Before-and-after rank**|Slopegraph|Which places gained or lost rank?|
|**Geographic pattern**|Choropleth map|Where is the value highest or lowest?|
|**Pattern over time**|Heatmap|When and where did values change?|
|**Relationship explorer**|Scatter|How do two measures move together?|
|**Scale-aware relationship**|Bubble|Which places are largest within that relationship?|
|**Composition**|Stacked bar|What makes up a total?|
|**Population-change drivers**|Waterfall / diverging bar|What produced population change?|

This is preferable to a dashboard that begins with a blank chart canvas. Users choose an understandable question first, then the system selects a suitable chart structure.

---

# 7. Suggested implementation structure

Keep React-specific presets out of `scripts/shared/`, since that directory is Python-oriented pipeline/shared logic. Use a frontend-specific layer.

```text
lib/
  visualization/
    chartRegistry.js
    presetRegistry.js
    fieldTypes.js
    formatters.js
    transformRegistry.js
    validation.js
    moduleSchemas/
      pophousing.js
      componentsOfChange.js

components/
  charts/
    LineChart.js
    BarChart.js
    ChoroplethMap.js
    HeatmapChart.js
    DumbbellChart.js
    ScatterBubbleChart.js
    SlopeChart.js

  chart-builder/
    ChartSidebar.js
    PresetPicker.js
    EncodingSection.js
    ComparisonSection.js
    LabelEditor.js
    LayerEditor.js
    ValidationNotice.js
```

For each module, expose a pure, client-safe visualization schema. Do not import the server-side `node:fs` data modules into the sidebar. The existing architecture explicitly separates the server-only CSV access layer from client chart sections, so preserve that boundary.

---

# 8. The most important guardrails

1. **Display labels are editable; canonical field names are not.**
    
2. **Users can add traces, but only through supported layer types.**
    
3. **The field catalog determines which encodings are valid.**
    
4. **Rates are never summed, and percent changes are never used where percentage points are required.**
    
5. **Do not mix geographic levels silently.**
    
6. **Do not compare sources silently.**  
    Components of Change retains DoF and Census data side-by-side by design, so the sidebar should require a deliberate source choice or source-comparison mode.
    
7. **Limit visual complexity automatically.**  
    Too many series should trigger a recommendation for a heatmap, Top N bar chart, or small multiples.
    
8. **Store saved views as declarative JSON configs.**  
    Do not save rendered Plotly figures or duplicate datasets.
    

A saved user view should look like this:

```js
{
  version: 1,
  module: "pophousing",
  preset: "relationship-explorer",

  bindings: {
    x: "Percent Change in Population",
    y: "Percent Change in Housing Units",
    size: "Total Population",
    color: "Region",
  },

  period: {
    startYear: 2015,
    endYear: 2025,
  },

  filters: {
    subset: "Counties",
  },

  labels: {
    title: "Population and housing growth by county",
    xAxis: "Population change, 2015–2025",
    yAxis: "Housing-unit change, 2015–2025",
  },

  referenceLines: [
    {
      type: "diagonal",
      label: "Equal population and housing growth",
    },
  ],
}
```

This gives users real flexibility while preserving the project’s contract-driven architecture and preventing invalid or misleading charts.
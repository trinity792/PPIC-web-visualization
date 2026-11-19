# App Wiring Checklist

Stage 5 only: read this **after** the researcher said yes at Checkpoint 3. This puts the finished table into the app so the topic gets a landing-page card, its own chart-editor page, and a "last updated" date.

This stage edits shared app code. Keep every change **additive and minimal**: one new file or one new entry per place below. Don't refactor or restyle what's already there, and don't change how the editor behaves for other topics.

---

## Read first

| Read | Why |
|---|---|
| `docs/agent/frontend-skill.md` | File headers, component reuse, styling with tokens from `lib/constants.js` (never raw hex), accessibility |
| `docs/specifications/projectSpec.md` → "Frontend Architecture (UI Layer)" | How schemas, adapters, questions, and the API route fit together |
| Housing Stress: `lib/visualization/moduleSchemas/housingStress.js`, `lib/data/housing_stress.js`, `app/api/housing-stress/route.js` | **The model for most topics**: a yearly table with optional breakdown columns, served through the generic adapter |
| Building Permits (same three locations) | The model for **monthly** data (`Date`, `YYYY-MM`) |
| RHNA Progress (same three locations) | Only if the topic is a series of **snapshots** rather than years or months |

Don't model on Projections or Components of Change. They have custom adapters for multi-source data, which is out of scope here.

---

## Decisions to get from the researcher first

Ask these in plain language, with a drafted suggestion for each, *before* writing code. They're all about what readers will see:

1. **Display name** for the topic (e.g. "Child Care Costs").
2. **Card headline and one-sentence description** for the landing page. Draft them in the style of the existing cards in `lib/visualization/topicRegistry.js`.
3. **Which measures readers can pick**, with a friendly label and unit for each (count, percent, dollars…). Measures left off the list stay in the data but don't appear in the menu.
4. **Which breakdowns readers can compare** (e.g. age group, tenure) and the "all" value that means no breakdown.
5. **The chart source line**, e.g. "California Department of Social Services, Child Care Portfolio".
6. **A sensible starting chart:** one measure and a few places. This feeds the topic's default question (see step 6). Note that the topic page itself never pre-fills a reader's settings.

---

## The nine places, in order

Names: `<topic-slug>` is the kebab-case id the pipeline uses as `module_id`. `<camelName>` / `<CONST_NAME>` are its JavaScript forms (e.g. `childcareCosts` / `CHILDCARE_COSTS`). `<topic_snake>` matches the Python package.

### 1. Client schema: `lib/visualization/moduleSchemas/<camelName>.js` (new)

The single source of truth for the topic's fields in the app. It must be client-safe (no `node:fs`). Copy the shape of `housingStress.js`:

- `FIELDS`: one entry per column.
  - Temporal: `Year` with `formatter: "year"`, or `Date` for monthly data.
  - Dimensions: `Location` (`supportsComparison: true`), `Geographic Level` with its exact values, and each breakdown column with its `values`.
  - Measures: `kind`, `label`, `unit` from `UNITS`, `comparisonGroup` (measures that can share an axis share a group; counts and shares never do), `aggregation`, `transforms`, `chartRoles`, and `curated: true` for those in the reader's menu.
- `SUBSETS`: friendly name → `Geographic Level` values (e.g. `Counties: ["County"]`).
- `canonicalColumns`: **the finished CSV header, verbatim and in order.** Copy it from the file, not from memory.
- `numericColumns`, `curatedMeasures`, `comparisonDimensions` (if there are breakdowns), `labelMeta`, `time` (available and reporting periods).
- `id: "<topic-slug>"`, `label`, `sourceCitations`, `apiPath: "/api/<topic-slug>"`.

Every column name must match the Python `schemas.py` and the CSV exactly. A one-character mismatch makes a measure silently draw blank.

### 2. Registry: `lib/visualization/moduleRegistry.js`

Import the schema and add one `[<CONST_NAME>_SCHEMA.id]: <CONST_NAME>_SCHEMA` entry to `MODULE_SCHEMAS`.

### 3. Server reader: `lib/data/<topic_snake>.js` (new)

Server-only. Copy `lib/data/housing_stress.js` and drop what the topic doesn't need, such as its legacy-file merge:

- the data path `data/data-cleaned/<topic-slug>/<PascalName>_Current.csv`, read once and cached;
- numeric parsing driven by the schema's `numericColumns`;
- `queryLocations({ subset })` using `buildLocationList` from `lib/data/query_shapes.js`;
- `queryFullTable({ subset, locations, full })` returning `{ records, … }`. The generic adapter loads every row through it with `full: true`.

### 4. Adapter: `lib/data/visualization/moduleAdapters.js`

Add `export const <camelName>Adapter = genericModuleAdapter(<CONST_NAME>_SCHEMA, query<PascalName>Table);` and a `"<topic-slug>": <camelName>Adapter` entry in `MODULE_ADAPTERS`. If the generic adapter can't express the topic, stop. A custom adapter is a "needs a developer or programmer" item, not something to write in this session.

### 5. API route: `app/api/<topic-slug>/route.js` (new)

- `POST` → `handleQuestionPost(request, <camelName>Adapter)`. This is the path every chart uses.
- `GET` supports only `view=locations` and `view=table` (the location picker and the full-table download), validates `subset` with `invalid()` from `lib/data/apiParams.js`, and returns errors as `{ error, source: "<topic-slug> API: …" }`.
- Don't add the older chart-shaped GET views other topics still carry. They exist only for backward compatibility.

### 6. Default question: `lib/visualization/defaultQuestions.js`

Add a `"<topic-slug>"` entry shaped like the `"housing-stress"` one: `version: 3`, `dataset: { kind: "module", moduleId }`, `outcomes`, `geography`, `time: defaultTime("<topic-slug>")`, `calculation`, at least one `comparison` pinning each breakdown to its "all" value, and `presentation`. Use the researcher's starting chart from decision 6. The test suite requires every module to have one.

### 7. Landing card: `lib/visualization/topicRegistry.js`

Add a frozen entry with:

- `id`;
- `title` and `description` (decision 2);
- `accent: COLORS.<existing token>`. Pick from `lib/constants.js` and never add a hex value;
- `documentationHref: "/documents/<topic-slug>-topic-specification"`. The `/documents` slug is the specification's filename without `.md`, lowercased and hyphenated.

### 8. Card icon: `components/landing/topicIcons.js`

Add a `"<topic-slug>"` entry: a few stroke-only `<path>` / `<circle>` elements on the same 24×24 grid as the others, no fills or colors (the card supplies them). Keep it simple and literal. Show the researcher and offer one alternative.

### 9. Freshness date: `app/api/module-status/route.js`

Add `"<topic-slug>": "<topic-slug>"` to `LOG_MODULE_BY_SCHEMA`. This drives "Data last updated" in the export step, and it must match the `module_id` the pipeline logs under.

The topic page (`app/[module]/page.js`) and the landing-page count pick up the new topic automatically from the registries. (The Visualization Tool is for uploaded data only and does not list topics.) Don't edit them.

---

## Tests

Frontend tests live in `tests/js/`. Add the new topic wherever existing tests enumerate topics:

| File | Change |
|---|---|
| `tests/js/lib/visualization/defaultQuestions.test.js` | add `"<topic-slug>"` to the expected module id list |
| `tests/js/lib/visualization/topicRegistry.test.js` | add the expected registry entry |
| `tests/js/lib/data/generic_modules_v3_route.test.js` | add `["<topic-slug>", <PASCAL>_POST]` to the default-question `it.each`, plus map-join rows if the topic has `Counties`, `Regions`, or `States` subsets |
| `tests/js/lib/data/locations_view.test.js` | add the new route to the locations-view checks |
| `tests/js/lib/data/<topic_snake>_route.test.js` (new) | model on `rhna_progress_route.test.js`: locations, table, subset validation, and the error envelope |

Then run, from the project root:

```bash
npm test
npm run check:palette && npm run check:settings
npm run build
web-viz-venv/bin/python -m pytest -q
```

All must pass. Run the backend suite too, as a guard that nothing on the data side moved.

---

## Researcher preview

1. Start the dev server in the background: `npm run dev`. If it panics with "Next.js package not found" or loops endlessly, that's a stale build cache. `.next/` is a regenerated cache, so deleting it with `rm -rf .next` and restarting is safe.
2. Give the researcher the link `http://localhost:3000/<topic-slug>`, and the landing page `http://localhost:3000/` to see the card.
3. Ask them to build two charts they care about and check three things: the labels read correctly, the places and years are right, and one number matches the source. Fix what they flag, re-run the tests, and stop the dev server when done.

---

## Out of scope: record as hand-off items

- Maps for geography the app has no shapes for. Shared map geometry covers California counties, PPIC regions, and US states only; cities, metros, and jurisdictions have no map.
- A custom adapter, a new chart family, or a new editor setting.
- Built-in views (`lib/visualization/builtInViews.js`) and landing-dashboard widgets.
- Updating `projectSpec.md` (topic inventory, references, the "six topics" wording) and `docs/agent/AGENTS.md` (topic list).

# Shared visualization v3 fixtures

Two small, hand-readable fixture families back every test named in
`docs/PPIC Summer 2026/refractor-guide/visualization-backend-implementation-plan.md`.
API route tests, calculation tests, adapter tests, table tests, and export tests
all read their inputs from here so they cannot disagree about what *missing*,
*suppressed*, *observed*, *projected*, or *aggregate* means.

## Rules

- **Small enough to check by eye.** These are not data extracts. If a test needs
  a case that is not here, add the one row that expresses it — do not paste a
  slice of a cleaned CSV.
- **No test calculates its own expectation.** Every asserted number lives in the
  `*_EXPECTED` export and was worked out by hand. A test that derives an
  expectation with the code under test proves nothing.
- **Availability is not value kind.** `status` answers "can this be plotted?"
  (`available` / `missing` / `suppressed`); `valueKind` answers "what does this
  number mean?" (`observed` / `projected` / `derived`). A suppressed projection
  is both, and neither field may stand in for the other.
- **Unavailable is never zero.** A `missing` or `suppressed` row carries `null`.
  The one real zero in each fixture is data and must survive as `0`.

## `projections.js` — Age, Sex & Race Projections

Grain: `Year x Location x Age Group x Sex x Race/Ethnicity x Source`.

| Required case | Where |
|---|---|
| Aggregate rows beside base rows | `All Ages` / `Both Sexes` beside `0-4`, `5-9`, `Female`, `Male` |
| Black, White, and Latino groups | `Black`, `White`, `Hispanic` (label metadata renders `Hispanic` as Latina/Latino) |
| Two geographies plus a benchmark | `San Francisco`, `Los Angeles`, and `California` |
| Observed and projected periods | 2020 and 2025 observed; 2030 projected |
| A real zero | San Francisco / AIAN / Male / `0-4`, 2025 |
| A suppressed value | San Francisco / Black / Female / `All Ages`, 2025 |
| A missing value | Los Angeles / Black / Female / `All Ages`, 2025 |
| Two sources | `DoF P-3` and `Census cc-est` for the same San Francisco cell |
| Reporting year 2025 | `PROJECTIONS_TIME.defaultReportingPeriod` |

The primary series (San Francisco / Hispanic / Female / `All Ages`) is
40,000 → 50,000 → 60,000 so change, percent change, indexing, and averaging all
land on whole numbers.

## `componentsOfChange.js` — Components of Change

Grain: `Year x Location x Measure x Source`.

| Required case | Where |
|---|---|
| Stock, count, and rate measures | `Total Population`, `Births`, `Crude Birth Rate` |
| Two sources | `DoF` and `Census` for Fresno and Kern, 2025 |
| At least three geographies | `Fresno`, `Kern`, `Merced`, `Alpine`, plus `California` |
| Two periods for change | 2020 and 2025 |
| Ties for ranking | Fresno and Kern both report 12,000 births in 2025 |
| A zero base | Alpine `Total Population`, 2020 |
| A missing value | Merced `Crude Birth Rate`, 2025 |
| A suppressed value | Alpine `Births`, 2025 |

`COMPONENTS_OF_CHANGE_MEASURES` carries the unit, aggregation rule, and weight
field each measure declares, which is what gates the calculation registry: a
rate takes percentage-point change and a weighted mean, never percent change and
never a sum.

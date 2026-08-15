---
Topic: Frontend
Content Type: implementation plan
pinned: false
description: "Implementation plan for replacing the dashboard-based landing page with the topic-card directory drawn in mockups/new-landing, for the developer implementing it."
Date Published: August 14, 2026
Last Updated: 08/14/2026 - 05:40 PM
Status: Draft
---

# Landing Page Overhaul: From Dashboards to a Topic Directory

> [!info] Who this is for and how to read it
> Nothing in this document is built yet. It is written for the developer (or model) who will implement it without the planner present, and every claim about current behavior comes from reading the code named in the sentence. Tests are specified here and written by a different hand, before the implementation exists: the Tests sections name files and cases, never bodies.

The Figma Make mockup at `mockups/new-landing/src/App.tsx` replaces the landing page with a directory: a hero, then one card per data topic, each card a link into that topic's chart editor. Today `app/page.js` does something quite different - it renders two full server-side dashboards (population/housing and RHNA) with live charts, stat cards, and tables, then a row of "coming soon" placeholders. This plan converts the first into the second, using the site's own fonts, colors, and navbar rather than the mockup's standalone Tailwind theme.

Out of scope: the topic pages themselves. "Explore topic" lands on `/[module]`, which renders `ModuleWorkbench` exactly as it does today, in its deliberate un-populated skeleton state. No workbench behavior changes here. Also out of scope: any new global footer in `app/layout.js` - the mockup's source-note footer is built as part of the landing page only.

| # | Workstream | What it closes | Depends on |
|---|---|---|---|
| A | The landing page renders dashboards where the mockup renders a directory | Builds the topic registry, the topic card, and the new `app/page.js` | - |
| B | Five components and a registry survive only because the landing page renders them | Retires the dashboard surface to `.trash/`, drops `CATEGORIES`, renames the built-in-views module | A |
| C | The navbar keeps a second copy of the topic list, and it has already drifted | Points the navbar's Topic menu at the registry from A | A |

> [!warning] A must land first, and B must not run early
> B deletes the components `app/page.js` imports today. If B lands before A, the landing page fails to build. A leaves the dashboard files in place but unimported, which is a safe intermediate state; B is then a pure removal.

---

## Resolved Decisions

These were asked before drafting and are recorded so a later reader does not have to infer them.

| Decision | Answer |
|---|---|
| Fate of the existing landing dashboards | Unlink them from the page and move the files to `.trash/`, following the convention already established there. Not deleted outright. |
| The three "coming soon" categories (Economy, State Law, Climate) | Dropped entirely. The landing page shows exactly the six built topics. |
| The mono route path in each card's footer (`/pophousing`) | Dropped. The card footer keeps only the "Explore topic" affordance. This is the one intentional departure from the mockup's layout. |
| Whether the navbar shares the topic list | Yes. The navbar's Topic dropdown reads the same registry, so labels and routes cannot drift (Workstream C). |
| Where the mockup and the project disagree on a route, a color, or a name | The project wins, every time. Use the existing routes, the existing `COLORS` entries, and the existing schema labels. The mockup governs layout, copy, and visual treatment only. |
| The mockup's `line-clamp-2` and `max-w-6xl` | Both ship as drawn and get judged in the browser. Each is one utility class in `app/page.js`, and the revert path for each is named in the callouts below. |

The last row of that table settles two things the code already answered. The mockup's card accents are all exact values already in `lib/constants.js` `COLORS`, so no palette regeneration is needed and no new CSS token is introduced. And the mockup's six eyebrow strings are character-for-character the `label` field of the six module schemas, so the registry derives the display name from the schema instead of restating it.

---

## Workstream A - The landing page renders dashboards where the mockup renders a directory

### What is there now

`app/page.js` reads `CATEGORIES` from `lib/visualization/categoryRegistry.js`, splits it by `status`, and renders a dashboard component per live category:

> `app/page.js`:
>
> `const liveCategories = CATEGORIES.filter((category) => category.status === "live");`
>
> `const Dashboard = getDashboard(category.id);`

There are two such dashboards (`population-housing`, `rhna-progress`), each an async server component that queries CSVs at request time. The three remaining categories are `status: "coming-soon"` and render as titled cards with a badge. Nothing on the page links to `/components-of-change`, `/demographic-projections`, `/housing-stress`, or `/building-permits`; those four topics are reachable today only through the navbar's Topic dropdown. That is the gap the mockup closes.

### What the mockup specifies

The mockup is a standalone Vite app with its own Tailwind theme, so its class names and one of its routes do not exist in this project. Three translations are needed.

**Routes.** Five of the six `href` values in `TOPICS` are real routes. One is not:

| Mockup `href` | Real route | Note |
|---|---|---|
| `/pophousing` | `/pophousing` | Matches module id. |
| `/components-of-change` | `/components-of-change` | Matches. |
| `/projections` | `/demographic-projections` | **The mockup path does not resolve.** `MODULE_IDS` in `lib/visualization/moduleRegistry.js` has `demographic-projections`; `/projections` would hit `notFound()`. |
| `/housing-stress` | `/housing-stress` | Matches. |
| `/building-permits` | `/building-permits` | Matches. |
| `/rhna-progress` | `/rhna-progress` | Matches. |

Deriving `href` as `/${id}` from the module id removes this class of error permanently, and a test in this workstream pins it.

**Accents.** Every mockup accent is an existing `COLORS` value in `lib/constants.js`. Reference them by name; do not re-enter the hex strings.

| Topic | Mockup hex | `COLORS` key |
|---|---|---|
| Population & Housing | `#084d7c` | `dataBlue` |
| Components of Change | `#196348` | `officialGreen` |
| Age, Sex & Race Projections | `#693692` | `officialViolet` |
| ACS Housing Stress | `#832522` | `officialRed` |
| Building Permits | `#e36a36` | `primaryOrange` |
| RHNA Progress Report | `#1b5365` | `dataTeal` |

Three of these (`officialGreen`, `officialViolet`, `officialRed`) have no Tailwind utility in `app/globals.css`, because the generated `ppic-palette` block covers only the ramps. That is fine: the mockup already applies accents through inline `style`, per card, which is the only workable form for a per-item color anyway.

**Type and color tokens.** The mockup's theme block in `mockups/new-landing/src/index.css` defines names this project does not have. Each maps onto an existing token, and in four cases the hex is identical:

| Mockup class | Project equivalent | Value |
|---|---|---|
| `bg-ppic-bg` | `bg-ppic-surface` | `#f2f2f2`, identical |
| `text-ppic-ink` | `text-ppic-neutral-600` | `#191b1c`, identical |
| `text-ppic-gray` | `text-ppic-neutral-main` | `#6d7075`, identical |
| `text-ppic-orange` | `text-ppic-brand` | `#e36a36`, identical |
| `ring-ppic-line` / `border-ppic-line` | `ring-ppic-border` / `border-ppic-border` | `#d9dbdc` becomes `#c2c9cc`, one step darker |
| `bg-white` on cards | `bg-card` | `#ffffff`, identical |
| `font-serif` (Georgia) | `font-serif` | Source Serif 4, the site's established serif |
| body sans (Source Sans 3) | `font-body` | Source Sans 3, already the body font from `app/layout.js` |
| `font-mono` on the route path | none | The route text is dropped (see Resolved Decisions) |

The mockup's masthead (`<header>` with the "PPIC Data Explorer" wordmark and three nav links) is not built. `Navbar` in `app/layout.js` already renders on every page and already carries Custom visualizations, Logs, and UI Kit.

> [!important] The page measure is local to this page, and reverting it is one class
> The mockup centers everything in `max-w-6xl`. The project's `.page-container` helper reads `--page-max-width`, which `PAGE_LAYOUT.maxWidth` in `lib/constants.js` sets to `"none"` - so it is a no-op today and will not produce the mockup's measure. The landing sections therefore carry their own `mx-auto max-w-6xl`. **Do not change `PAGE_LAYOUT.maxWidth`**: it is global, and widening it would re-measure every other page on the site. If the landing page reads too narrow once it is live, the revert is deleting `max-w-6xl` from the three sections in `app/page.js`, which drops it back to full-bleed like its neighbors.

> [!important] `line-clamp-2` hides most of the card copy - ship it, then look at it
> The mockup clamps each description to two lines. At the three-column width inside `max-w-6xl`, the six descriptions run to roughly five lines each, so more than half of every description is hidden with no way to reveal it. Build it as drawn; the call on whether that reads well is a browser call, not a plan call. If it does not, there are two reverts and they are different edits: drop `line-clamp-2` from `TopicCard.js` to show the full description, or shorten the copy in `topicRegistry.js` to fit two lines. Raising the clamp to three or four lines is the one option worth avoiding - a clamp that rarely clips just makes card heights unpredictable.

### Implementation

1. **New file `lib/visualization/topicRegistry.js`.** Exports a frozen `TOPICS` array, in the mockup's order: `pophousing`, `components-of-change`, `demographic-projections`, `housing-stress`, `building-permits`, `rhna-progress`. Each entry carries `id` (the module id), `title` (the card headline), `description` (the card body), and `accent` (a `COLORS` reference, not a literal). It must **not** carry `href` or `label`: export helpers that derive `href` as `/${id}` and read the display name from `getModuleSchema(id).label`, so a renamed module cannot leave a stale label or a dead link behind. Keep this file free of JSX - the Navbar and the page both import it, and it lives in `lib/`.

   The copy comes from the mockup verbatim:

   | Topic id | Card title | Description |
   |---|---|---|
   | `pophousing` | People & housing units | Annual counts of residents and housing units with city-level detail - how much a place has grown and whether its housing stock kept pace. |
   | `components-of-change` | Births, deaths & migration | Natural increase and net migration, split into domestic and foreign. Explains why a place grew or shrank, and benchmarks California against every other state. |
   | `demographic-projections` | Demographic projections | Population by 5-year age group, sex, and race/ethnicity out to 2070 - who a population is made of and how its composition is expected to shift. |
   | `housing-stress` | Housing cost burden | Households spending over 30% and 50% of income on housing, cut by tenure and race/ethnicity. The affordability measure of the set, built for equity comparisons. |
   | `building-permits` | Residential permits | Monthly residential permits by structure size - the leading indicator of new supply, best for reading recent turning points. |
   | `rhna-progress` | Housing goal tracking | Progress toward state housing targets for 539 jurisdictions across the 5th and 6th cycles, with PPIC pace and on-track scoring by income level. |

2. **New file `components/landing/topicIcons.js`.** The six inline SVG path sets from the mockup, keyed by topic id, each exported as the path children of a 24x24 `viewBox` with `fill="none"`, `stroke="currentColor"`, `strokeWidth="1.6"`, and round caps and joins. They live here rather than in the registry so the registry stays JSX-free. Copy the paths exactly from `mockups/new-landing/src/App.tsx`; they are drawn to that stroke width and will look wrong at another.

3. **New file `components/landing/TopicCard.js`.** One card, taking a topic entry. Structure follows the mockup: an accent rail across the top, an accent-tinted icon square, the schema label as an uppercase tracked eyebrow in the accent color, the card title in `font-serif`, the clamped description, then a bordered footer holding only "Explore topic" and its arrow. The whole card is a single `next/link` `Link` (not an `<a>`), keeps `aria-label` naming the topic, and keeps the group hover transitions: lift, shadow, and the arrow's `translate-x`. Accent-derived colors stay inline styles; everything else is a utility class. Give the file the standard four-section header docblock required by `docs/agent/frontend-conventions.md`, and cite the "Card" UI Kit pattern.

   Do not reach for `components/ui/card.js` here. Its `Card` primitive is a fixed `gap-6` column with `bg-card` and a border, which the accent rail, the zero-gap internal spacing, and the hover treatment would all have to fight. This is a new pattern for the Kit, not a variant of an existing one.

4. **Rewrite `app/page.js`.** Three sections inside `bg-ppic-surface`, each `mx-auto max-w-6xl px-6`: the hero ("Explore the data" eyebrow in `text-ppic-brand`, the H1 **PPIC Interactive Visualization Tool** in `font-serif`, and the subtext "Each topic is a self-contained dataset with interactive charts and downloadable tables. Pick a topic below to open its dashboard and start exploring."); the grid, headed "Topics" with the topic count on the right, at `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`; and the mockup's italic source-note footer. Both the H1 and the subtext are exact strings the user specified - they are not placeholders to improve on. The count next to "Topics" reads `TOPICS.length`, never a literal `6`.

   The page must come out of this a **synchronous** server component with no data fetching, which is what makes it testable and instant. Remove the `CATEGORIES`, `getDashboard`, `Card`, and `Badge` imports; nothing else in the file survives.

5. **Update the page title.** `metadata.title` in `app/layout.js` is `"PPIC Data Explorer"`. The site's public name in the mockup and in the H1 is now "PPIC Interactive Visualization Tool". Change the layout metadata title to match, and leave `app/[module]/page.js`'s `generateMetadata` alone for now - it appends `| PPIC Data Explorer` per module, and rewriting six module titles is a separate, purely editorial decision.

### What this invalidates

- `docs/PPIC Summer 2026/specifications/projectSpec.md`, wherever it describes the landing page as a set of category dashboards, and its Module Audit Status section if that leans on `CATEGORIES`.
- Any screenshot of the landing page in `docs/PPIC Summer 2026/reference images`.

### Tests

New file: `tests/js/lib/visualization/topicRegistry.test.js`. Expected ids, titles, and routes are **written out by hand** in the test - a test that asks the registry what it declared and agrees with the answer passes unconditionally.

| Test | What it verifies |
|---|---|
| `lists the six built topics in mockup order` | A hand-written id array, in order, compared against the registry. |
| `derives a route for every topic that resolves to a registered module` | Each derived `href` maps to a member of `MODULE_IDS`. This is the check that catches a future typo'd id. |
| `does not expose the mockup's /projections path` | The one route the mockup got wrong; a regression guard on the translation table above. |
| `takes each display label from the module schema` | Labels equal `getModuleSchema(id).label`, so the registry cannot drift from the schema. |
| `gives every topic a non-empty title and description` | The card renders empty slots otherwise. |
| `gives every topic an accent that exists in COLORS` | Pins the "reference `COLORS`, do not paste hex" rule. |
| `excludes the retired coming-soon categories` | Economy, State Law, and Climate are absent. |

New file: `tests/js/components/landing/TopicCard.test.js`.

| Test | What it verifies |
|---|---|
| `links the whole card to the topic route` | The link's `href`. |
| `names the topic in the link's accessible label` | The card is one link with six words of visible text; the label is how a screen reader tells the cards apart. |
| `shows the schema label, title, and description` | The three copy slots render. |
| `renders no route path text` | The dropped mono path. This case exists to keep the decision from being quietly reverted. |
| `offers a single Explore topic affordance` | Exactly one, and it is inside the link rather than a nested interactive element. |

New file: `tests/js/app/page.test.js` (new directory - the app router has no tests today).

| Test | What it verifies |
|---|---|
| `renders the tool's name and the topic subtext` | The two exact strings the user specified. |
| `renders one card per registered topic` | Link count equals `TOPICS.length`, so adding a topic to the registry is the only step needed to add a card. |
| `renders no dashboards or coming-soon cards` | The behavior this workstream removes. |

> [!note] If the app-router page resists rendering under Vitest
> Step 4 makes `app/page.js` synchronous specifically so `@testing-library/react` can render it directly. If it still cannot be rendered in the jsdom environment, do not stub around it - move the card-count assertion into the registry test, drop the file, and say so in the PR rather than leaving a skipped test behind.

---

## Workstream B - Five components and a registry survive only because the landing page renders them

### What only the landing page uses

Grepping `app`, `components`, and `lib` for each landing component shows that after Workstream A nothing imports any of them. `components/charts/ChartPreview.js` is the non-obvious member of the set: its only importer is `components/landing/ChartTile.js`, so it becomes unreachable at the same moment. The rest of the site references three of these files only from inside docblock comments, which is documentation drift rather than wiring.

The registry is the one file that must **not** go wholesale. `lib/visualization/categoryRegistry.js` exports two unrelated things, and only one of them is landing-specific:

> `app/[module]/page.js`:
>
> `const builtIn = viewId ? getBuiltInView(viewId) : null;`
>
> `?view=` deep links into the workbench read `BUILT_IN_VIEWS` from that file. Deleting the module would break every saved or shared workbench link, including the three views (`population-area`, `persons-per-household-map`, `migration-trend`) that the landing dashboards were the only *page* to reference but that remain perfectly reachable by URL.

### Implementation

1. **Move to `.trash/`**, following the convention in `.trash/README.md`: `components/landing/DashboardShell.js`, `ChartTile.js`, `StatCard.js`, `RegionTable.js`, `RegionalOnTrackBars.js`, the whole `components/landing/dashboards/` folder (both dashboards and `index.js`), and `components/charts/ChartPreview.js`. Move `tests/js/components/landing/RegionTable.test.js` with them - a test for a retired component is not coverage. `components/landing/` survives as a directory; it is where `TopicCard.js` and `topicIcons.js` from Workstream A now live.

   The README's closing note about leaving a one-line `export {}` tombstone at each removed path describes a limitation of the environment that overhaul ran in. This environment can delete, so do not create tombstones.

2. **Trim `lib/visualization/categoryRegistry.js` to its built-in views and rename it** to `lib/visualization/builtInViews.js`. Delete the `CATEGORIES` export; keep `BUILT_IN_VIEWS` and `getBuiltInView` byte-for-byte, including all eleven view definitions. Update the single remaining importer, `app/[module]/page.js`. The invariant: every `?view=` id that resolves today must still resolve, so this is a rename plus a deletion, never an edit to a view definition. Rename rather than leave the file misnamed - a `categoryRegistry` with no categories is exactly the kind of drift this plan is trying to stop.

3. **Update `components/landing/dashboards/index.js`'s consumers**: there are none after Workstream A. Confirm with a grep for `getDashboard` before moving the file; if anything still calls it, Workstream A was landed incompletely and B should stop.

4. **Fix the four stale docblock pointers** left behind by the move, each of which names a retired path as its design reference: `components/charts/DataTableView.js`, `components/chart-builder/InputTableEditor.js`, `components/charts/GraphTabs.js`, and the comment at `components/chart-builder/sections/AppearanceSection.js:483`. Rewrite each to say the pattern originated in the retired landing table or on-track bars and now lives in `.trash/`. Do not delete the sentences: they explain why those components look the way they do.

5. **Add a section to `.trash/README.md`** for this overhaul, with a row per moved file naming what replaced it or why nothing did, and correct the README's line stating that everything in the folder was removed by the module workbench overhaul. Update its `Last Updated` field.

6. **Leave `lib/data/pop_housing.js` alone.** `queryStatewideStats` and `queryRegionTable` lose their only callers here, but they are query helpers in a data module with their own tests, not landing components, and `queryDataSources` in the same file is still covered by `tests/js/lib/data/dashboard_data_sources.test.js`. Retiring them is a separate judgement about the data layer and is not part of this plan.

### What this invalidates

- `.trash/README.md`'s opening claim about its own scope (fixed in step 5).
- Any section of `projectSpec.md` or `visualization-specification.md` that names `categoryRegistry.js` as the home of the landing categories.
- The docblock "Data sources" line in `lib/data/pop_housing.js:311`, which says `queryDataSources` is consumed by `DashboardShell`.

### Tests

New file: `tests/js/architecture/landing.removals.test.js`, following the import-graph contract pattern already in `tests/js/architecture/moduleWorkbench.removals.test.js` (walk `app`, `components`, `lib`; strip comments before checking for wiring, so a docblock that *discusses* a retired file does not read as an import).

| Test | What it verifies |
|---|---|
| `the landing dashboard components no longer exist` | Each of the seven moved paths is absent from the source tree. |
| `nothing imports the retired landing components` | Comment-stripped source contains no import of them, which is what a stale docblock would otherwise trip. |
| `lib/visualization/categoryRegistry.js no longer exists` | The rename actually happened rather than leaving two copies. |
| `nothing imports CATEGORIES or getDashboard` | The exports are gone from the graph, not just unused. |

Extension of coverage for the surviving half - new file `tests/js/lib/visualization/builtInViews.test.js`, with the expected view ids **hand-written**:

| Test | What it verifies |
|---|---|
| `resolves every built-in view id that shipped before the overhaul` | All eleven ids still return a config. This is the case that makes the rename safe. |
| `keeps the three views the landing dashboards used` | `population-area`, `persons-per-household-map`, and `migration-trend` survive their last page reference. |
| `returns undefined for an unknown view id` | Pins the behavior `app/[module]/page.js` relies on when `?view=` is junk. |

---

## Workstream C - The navbar keeps a second copy of the topic list, and it has already drifted

### Diagnosis

`components/Navbar.js` hardcodes its own list of the same six topics:

> `components/Navbar.js`:
>
> `const MODULE_LINKS = [ { href: "/pophousing", label: "Population & Housing" }, ... { href: "/housing-stress", label: "Housing Stress" }, ... ];`

Five of those labels match their module schema exactly. The sixth does not: `HOUSING_STRESS_SCHEMA.label` is `"ACS Housing Stress"`, and the navbar says `"Housing Stress"`. The mockup's eyebrow for that card is `"ACS Housing Stress"`. So the drift is not hypothetical, it is already here, and shipping a second list beside the registry from Workstream A would guarantee more of it.

### Implementation

1. **Replace `MODULE_LINKS` in `components/Navbar.js`** with the derived list from `lib/visualization/topicRegistry.js` - schema label plus derived `/${id}` route, in registry order. Registry order matches the current navbar order, so no menu item moves. One label changes, from "Housing Stress" to "ACS Housing Stress"; that is the point of the change, not a side effect of it.

2. **Leave the rest of the navbar untouched.** The logo link, Home, Custom visualizations, Documents, Logs, UI Kit, and the search form are not topics and must not be folded into the registry. `NavDropdown`'s `items` prop shape (`{href, label}`) does not change, so the component itself is not modified.

### What this invalidates

Nothing documented. The navbar's link list is not enumerated in the specs.

### Tests

Extension of `tests/js/components/Navbar.test.js`. The existing case (`provides logo and Home links to the landing page`) must keep passing untouched - it is the pin on the paths this workstream does not own.

| Test | What it verifies |
|---|---|
| `lists every topic in the Topic menu` | A hand-written array of the six labels, including "ACS Housing Stress". Writing them out is what makes the test able to fail. |
| `points each topic link at its module route` | Hand-written hrefs, catching a registry change that silently breaks navigation. |
| `keeps the non-topic links` | Custom visualizations, Documents, Logs, and UI Kit still render at their current paths, unaffected by the registry swap. |

---

## Verification

Beyond the suites above, run `npm run build` before opening the PR. Workstream B removes files from the module graph, and a missed import surfaces there rather than in Vitest. Then load `/` and click into at least two topics to confirm the derived routes land on a workbench rather than a 404, and open a `?view=` link (for example `/pophousing?view=population-area`) to confirm the rename in B kept deep links alive.

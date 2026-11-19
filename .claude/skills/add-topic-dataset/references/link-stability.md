# Link Stability: Classifying and Upgrading Sources

How a source's links behave decides whether a topic can update itself on a schedule later or will need the researcher every release. Classify **each source** separately. A topic is only as automatable as its least stable source.

The goal is not to label the source and move on. **Try to move each source up the ladder** before settling. Every step up is one less thing the researcher has to do each release, forever.

---

## The four classes

Listed from most to least automatable.

| Class | What it means | Researcher's job each release | Example in this project |
|---|---|---|---|
| **Fixed** | One URL always serves the newest data | Nothing | None yet. Typical cases: a portal's "latest" download link, or an API endpoint with a fixed query |
| **Predictable** | The URL changes, but in a pattern you can compute (year, month, vintage, decade) | Nothing | Building Permits (`cbsamonthly_{yyyymm}.xls`), Housing Stress (ACS year in the path), Census components (`{decade}-{year}`) |
| **Findable** | The URL changes unpredictably, but it's always listed somewhere stable: a landing page or a catalog API | Nothing, unless the listing page is redesigned | RHNA Progress (data.ca.gov CKAN package API), Population & Housing E-5 and Projections P-3 (DoF landing pages) |
| **Hand-delivered** | No reliable automatic route: links change with no stable listing, files arrive by email, or the portal needs clicking through | Paste the new link or drop in the new file (Mode B) | None yet. This skill introduces the pattern |

### How to tell them apart

1. **Read the URL.** Does it contain a year, month, release number, or date? That hints at Predictable. Test it by computing the *previous* period's URL: if that resolves to the previous release, the pattern is real.
2. **Walk up to the parent page.** Strip the filename and look at the page that links to it. If that page is stable and always links the current file, the source is at least Findable.
3. **Look for a data-portal API.** Many government portals have one even when the website doesn't advertise it. An API is more robust than reading a web page, because page redesigns don't break it.
   - data.ca.gov and other CKAN portals: `/api/3/action/package_show?id=<dataset>` lists every resource with its current URL and `last_modified` (RHNA uses this).
   - Socrata portals (many city/county "open data" sites): `/api/views/<id>` and `/resource/<id>.csv`.
   - ArcGIS Hub: each dataset has a stable item id with download endpoints.
   - Census: `api.census.gov` for tabulated data, plus predictable `www2.census.gov` directory paths.
4. **Ask the researcher** about history: "Do you remember what last year's link looked like?" or "Do they ever rename the file?" They often know the publisher's habits better than one download reveals.

Only fall back to **Hand-delivered** after steps 1–3 come up empty, or when the source needs a login or click-through. (A login or paid access is also a stop-and-flag item from Stage 2 of the skill.)

---

## Upgrading a source

Try these in order, and stop at the first that works reliably:

1. **Catalog API** (Findable via API): the most robust, because the listing is meant for machines.
2. **Fixed URL**: check whether the portal has a "latest" or permanent link next to the dated one.
3. **Predictable pattern**: compute the URL, then probe backward from the current period to find the newest one that exists, the way Building Permits does with `max_month_lookback`. A "not found" response moves the probe back a period. A network error retries, then fails loudly.
4. **Landing-page discovery** (Findable via page): read the page and match the link by a pattern. Make the pattern **tolerant of expected variation** (hyphens vs. underscores, the year in the name, letter case) but **strict enough to reject a different file** (anchor on the dataset's name, and check the downloaded file's headers). Population & Housing once broke because DoF switched a hyphen to an underscore in the E-5 filename. Learn from that.
5. **Hand-delivered**: no automatic discovery. See the design below.

Tell the researcher what you found in one or two plain sentences. For example: "Good news: the county files follow a pattern by year, so the pipeline can find each new release on its own. The state file has no pattern or listing page, so you'll need to send me that link each year."

### Watch for a rolling window

Some Predictable sources only keep recent periods online. Census Building Permits, for example, removes older months. If old periods disappear from the live source, the deep history has to come from a one-time **immutable history file** (`<Name>_Historical.csv`), built once and never overwritten by routine runs. Check this during Stage 2 by probing for the earliest period the researcher wants. `references/pipeline-build.md` covers how to build and protect that file.

---

## What each class means for the pipeline

**Every** class gets the standard fallback ladder, because even stable sites go down or change:

1. **Live**: download from the source using the class's method.
2. **Manual file**: a file placed at the topic's manual-download path (defined in `paths.py`, under `data/data-raw/<topic-slug>/`).
3. **Last saved table**: the existing finished table, returned as-is without re-cleaning, with the summary flagging that the source failed.

The run summary must always say which rung was used (`source_failed`, `source_used_manual`), so a recovered run is never reported as a clean success.

### Extra design for Hand-delivered sources

- In `scripts/<topic>/config/sources.py`, keep the current link in **one clearly named setting** with the date it was recorded and a comment pointing to this workflow:
  ```python
  # Hand-delivered: the publisher's link changes each release with no stable listing.
  # Updated by the researcher refresh workflow (add-topic-dataset skill, Mode B).
  "current_url": "https://example.gov/files/report_2026_final_v2.xlsx",
  "current_url_recorded": "2026-11-16",
  ```
  A link change then appears in the pull request as a one-line change. That gives a reviewable record of exactly where each release came from.
- The live rung downloads from `current_url`. If it returns data identical to what's saved, the run reports "no new data". That is the normal result when the publisher hasn't released anything new.
- When the link is dead (for example, a "not found" error), fail the live rung clearly so the fallback ladder takes over, and word the summary so a developer or programmer reading the logs knows a new link is needed, not that the code broke.
- In the topic specification, add a short **"Updating this topic"** section in plain language: where the researcher finds each new release, how often it appears, and that they can say "there's a new release of <topic>" to start a refresh.

### Mixed topics

When some sources are automatable and others are Hand-delivered, the scheduled run can still refresh the automatable parts on its own. The Hand-delivered parts keep their last saved values until a new link arrives. Make sure the finished table's provenance column (`Source`, or the topic's equivalent) makes it visible which parts are how current, and say so in the topic specification.

---

## Recording the classification

Put the result in three places:

| Where | What |
|---|---|
| Dataset plan (Checkpoint 1) | A plain-language table: each source, its class, and what the researcher will need to do each release |
| Topic specification | A "Sources" table: URL or discovery method, class, release cadence, rolling-window notes, and the "Updating this topic" section for any Hand-delivered source |
| Pull request | The same table, so a developer or programmer can judge how fragile the topic will be once it's on a schedule |

---

## Mode B: reading an existing topic

To see how an existing topic finds its data, read its `scripts/<topic>/config/sources.py` and its `acquisition/` folder. A `current_url` setting means Hand-delivered. A `*_pattern` or `*_template` with a date token means Predictable. A landing-page or catalog id means Findable.

If a researcher brings a new link for a topic that is supposed to be Predictable or Findable, the automatic discovery has probably broken (a renamed file, a redesigned page). Don't just paste the link in. Treat it as a discovery fix:

1. Use the new link to see what changed.
2. Update the pattern so discovery works again.
3. Add a test with the new filename or page shape.
4. Flag it in the pull request.

Only switch the source to Hand-delivered if discovery truly can't be repaired. The switch doesn't need a developer or programmer's approval, but it must be visible. Tell the researcher their role for this topic is changing (they'll now supply each release), update the topic specification's "Sources" table and "Updating this topic" section, and call out the switch in the pull request.

---
Topic: Data Sources
Content Type: codebook
pinned: false
description: "Reference and fact-sheet for the Zillow Research public housing datasets (ZHVI, ZORI, for-sale listings, and sales/market-temperature) proposed as a new V3 module, covering metrics, geographies, file schema, cadence, and caveats for a California-scoped build."
Date Published: July 17, 2026
Last Updated: 07/17/2026 - 12:00 PM
---

# Zillow Market Data: Fact-Sheet and Reference

Reference for the four Zillow Research public data families selected for the proposed housing-market module: home values (ZHVI), rents (ZORI), for-sale listings and inventory, and sales and market temperature. It documents what each series measures, at which geographies, on what cadence, in what file shape, and the caveats that shape how the ETL and the visualizations must treat it. It is the data-side companion to the visualization plan and the module implementation guide outline.

> [!info] Who this document is for
> Two audiences. A researcher deciding which Zillow series answer a policy question should read the dataset families and caveats. A programmer building the ETL and schema should read the file-schema, geography, and California-scoping sections, which define the data contract the pipeline must honor. Related project context: [[projectSpec]] and the existing [[pophousing]] module, whose annual California data this monthly national data sits alongside.

> [!warning] No data file was provided with this request
> This fact-sheet is compiled from the Zillow Research data catalog at [zillow.com/research/data](https://www.zillow.com/research/data/) (catalog dated July 2026) and Zillow's published methodology pages. The identifier-column lists below reflect Zillow's documented wide-CSV shape, but exact headers vary slightly by geography and drift between vintages. Confirm every column name against a freshly downloaded CSV before the schema is frozen.

---

## Overview

Zillow Research publishes a large catalog of free, public housing metrics as downloadable CSVs. Every series is a **wide time series**: each row is one place, each dated column is one period, and each cell is the metric value for that place in that period. The catalog is organized into families (home values, rentals, for-sale listings, sales, days-on-market and price cuts, market heat, new construction, and affordability), and within each family a metric is published in several **cuts** that vary the housing segment (all homes, single-family only, condo, by bedroom count), the smoothing (raw versus smoothed), the seasonal adjustment, the price tier, and the cadence (monthly or weekly).

The four families in scope for this module are home values, rentals, for-sale listings, and sales and market temperature. The days-on-market/price-cut family and the market heat index are treated as adjacent "market temperature" signals and are noted where they strengthen a visualization, but the core build targets the four selected families.

> [!important] Update cadence drives the refresh contract
> Monthly series are updated on the 16th of each month; most weekly series are updated every Tuesday. Sales-latency metrics (sales count nowcast, sale price, total transaction value) publish the prior month on the 16th after a two-week estimation window. The module's "update data" path (mirroring [[pophousing]]'s refreshable pipeline) should assume a monthly refresh floor and treat the newest month of any nowcast series as provisional.

---

## Dataset Family 1: Home Values (ZHVI)

The **Zillow Home Value Index (ZHVI)** is the typical home value for a region and housing type, reflecting the 35th-to-65th-percentile value range. It is published both as a raw measure and as a smoothed, seasonally adjusted measure. Since the January 2023 release the full back-series uses the neural Zestimate.

| Attribute | Detail |
|---|---|
| Core metric | Typical home value in dollars |
| Segment cuts | All homes (SFR + condo/co-op), single-family only, condo/co-op, and by bedroom count (1, 2, 3, 4, 5+) |
| Tier cuts | Mid-tier (35th-65th), top-tier (65th-95th), bottom-tier (5th-35th) |
| Smoothing | Raw, or smoothed and seasonally adjusted |
| Geographies | Metro and U.S., state, county, city, ZIP code, neighborhood |
| Cadence | Monthly |
| Typical coverage start | 2000 for mid-tier all-homes; shorter for finer cuts and smaller geographies |
| Related derived series | Mortgage Payment and Total Monthly Payment (5/10/20 percent down), derived from smoothed ZHVI |

> [!note] ZHVI is an index of typical value, not a count or an average sale price
> ZHVI answers "what is a typical home in this place worth this month," not "what did homes sell for." It is smooth by construction and appropriate for level and trend comparisons across places and over time. It is not a transaction average, and it must not be summed across places.

---

## Dataset Family 2: Rentals (ZORI)

The **Zillow Observed Rent Index (ZORI)** is a smoothed, repeat-rent measure of typical market-rate rent, dollar-denominated on the mean of listed rents in the 35th-to-65th-percentile range and weighted to the rental housing stock so it represents the whole market rather than only currently listed units.

| Attribute | Detail |
|---|---|
| Core metric | Typical observed market rent in dollars |
| Segment cuts | All homes plus multifamily, single-family residence, multifamily residence |
| Smoothing | Smoothed; also smoothed and seasonally adjusted |
| Geographies | Metro and U.S., ZIP code, county, city |
| Cadence | Monthly |
| Typical coverage start | 2015 |
| Adjacent series | Zillow Observed Renter Demand Index (ZORDI), an engagement-based demand proxy at national and metro levels |

> [!warning] ZORI has no neighborhood or state cut and starts later than ZHVI
> ZORI is published for metro/U.S., ZIP, county, and city, but not neighborhood, and its history begins around 2015 versus 2000 for ZHVI. Any visualization that overlays value and rent (for example a price-to-rent ratio) is bounded by the shorter, coarser ZORI coverage and must degrade gracefully where a place has ZHVI but no ZORI.

---

## Dataset Family 3: For-Sale Listings and Inventory

This family measures the active for-sale market: how many homes are listed, how many are newly listed, how many go pending, and at what list price.

| Metric | Definition | Units |
|---|---|---|
| For-Sale Inventory | Count of unique listings active at any time in the period | Count |
| New Listings | Count of listings newly on the market in the period | Count |
| Newly Pending Listings | Count of listings that moved from for-sale to pending | Count |
| Median List Price | Median list price across the geography | Dollars |

Each metric is published in raw and smoothed cuts, for all homes and single-family only, at monthly and (for most) weekly cadence.

> [!warning] Listings and sales families are metro-and-U.S. only
> The for-sale listings family, the sales family, the days-on-market/price-cut family, the market heat index, and new construction are published only at **Metro and U.S.** geography. They have no county, city, ZIP, or neighborhood cut. This is the single most consequential coverage fact for a California-scoped build: county and ZIP resolution exist for ZHVI and ZORI but not for listings, sales, days-on-market, or market heat.

---

## Dataset Family 4: Sales and Market Temperature

The sales family measures completed transactions and the balance of supply and demand.

| Metric | Definition | Notes |
|---|---|---|
| Sales Count (nowcast) | Estimated unique properties sold in the month | Latest month is a latency-corrected estimate |
| Median / Mean Sale Price | Price at which homes sold | Raw all-homes; latest month estimated |
| Total Transaction Value | Mean sale price x sales count | Latest month estimated |
| Mean / Median Sale-to-List Ratio | Sale price versus final list price | Raw and smoothed |
| Percent of Sales Above / Below List | Share of sales off the final list price | Excludes exact-list sales |

Two adjacent "market temperature" families sharpen these signals and share the metro/U.S. geography:

| Family | Representative metrics |
|---|---|
| Days on Market and Price Cuts | Mean/median Days to Pending, Days to Close, Share of Listings With a Price Cut, mean/median Price Cut ($ and %) |
| Market Heat Index | A single monthly index where higher means a more seller-tilted market |

> [!important] Nowcast latency changes what "current" means
> Sales count nowcast, sale price, and total transaction value publish the prior month on the 16th after a two-week estimation window (for example, June figures publish July 16th). The newest data point on any of these series is an estimate subject to revision and should be visually distinguished (for example, a dashed segment or a "provisional" marker) rather than presented as final.

---

## File Schema (Wide CSV)

Every series downloads as a single wide CSV. The leading columns identify the place; every remaining column is a dated period. The identifier set grows with geographic specificity.

| Geography (RegionType) | Identifier columns (leading), then one column per date |
|---|---|
| U.S. (`country`) | `RegionID`, `SizeRank`, `RegionName` ("United States"), `RegionType`, `StateName` |
| Metro (`msa`) | `RegionID`, `SizeRank`, `RegionName` ("Los Angeles, CA"), `RegionType`, `StateName` |
| State (`state`) | `RegionID`, `SizeRank`, `RegionName` ("California"), `RegionType`, `StateName` |
| County (`county`) | above + `State`, `Metro`, `StateCodeFIPS`, `MunicipalCodeFIPS` |
| City (`city`) | above + `State`, `Metro`, `CountyName` |
| ZIP (`zip`) | above + `State`, `City`, `Metro`, `CountyName` |
| Neighborhood (`neighborhood`) | above + `State`, `City`, `Metro`, `CountyName` |

The dated columns are period-end dates. Monthly files use month-end dates (`2000-01-31`, `2000-02-29`, ...); weekly files use week-end dates. Cell values are the metric in the units of that series (dollars, counts, ratios, days, or index points).

> [!note] The filename encodes the cut
> A path such as `County_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv` reads as: county geography, ZHVI metric, all-homes segment (`sfrcondo`), mid-tier bounds (`0.33_0.67`), smoothed (`sm`), seasonally adjusted (`sa`), monthly (`month`). Single-family-only cuts use `sfr`; weekly cuts use `week`. The acquisition layer should treat these filename tokens as the cut identifier, because Zillow occasionally changes download paths.

### Reshaping to the project's long grain

The project's data layer works in a **long** grain (one row per place per period per measure), as seen in [[pophousing]] where the cleaned CSV is keyed on `Geographic Level`, `Location`, and `Year`. The Zillow wide files must be melted from `(place columns | date columns)` into long rows keyed on a place, a period, and a value, then the many single-metric files must be joined on `RegionID` into one row per place-period carrying all selected measures. This melt-and-join is the core cleaning step and has no analog in the annual DoF pipeline.

---

## Geographic Scope and California Filtering

The module targets California at every geography Zillow offers, plus state and national context as comparison baselines. Filtering rules differ by file:

| Target subset | Filter rule |
|---|---|
| CA counties, cities, ZIPs, neighborhoods | Keep rows where `StateName` (or `State`) equals `CA` |
| CA metros | Keep metro rows whose `RegionName` ends in `, CA`; flag multi-state metros for review |
| California statewide | Keep the `state` file row where `RegionName` equals `California` |
| National benchmark | Keep the `country` row (`RegionName` "United States") as an optional overlay series |

> [!warning] Metros can cross state lines and places are not additive
> Some metropolitan areas span more than one state, so a `, CA` suffix filter is a heuristic that needs a reviewed allow-list. Separately, ZHVI and ZORI are indices, so ZIP-level values cannot be summed or averaged into a county value, and county values cannot be rolled into a state value. Unlike the DoF population pipeline, this module must not compute regional or state aggregates from finer geographies; it consumes Zillow's own published geography rows at each level.

### Alignment with the existing California geography model

The [[pophousing]] schema recognizes the levels `City`, `Town`, `County`, `Region`, and `State`, where `Region` is a PPIC-defined grouping (for example, Bay Area). Zillow's taxonomy is `country`, `msa`, `state`, `county`, `city`, `zip`, and `neighborhood`. County and city overlap conceptually but not by exact name, and Zillow has no PPIC `Region` and adds `zip`, `neighborhood`, and `msa` that the DoF data lacks. A **geography crosswalk** (Zillow `RegionName`/FIPS to the project's canonical `Location` and `Geographic Level`) is therefore required and is called out as a primary challenge in the implementation guide outline.

---

## Cross-Cutting Caveats

The following properties of the data must be honored by both the ETL and the visualization layer.

| Caveat | Consequence for the module |
|---|---|
| Indices are non-additive | Never sum or average ZHVI/ZORI across places; consume published rows per geography. |
| Raw versus smoothed, and seasonal adjustment | Expose the cut as a data-source choice or filter; never silently mix cuts within one series. |
| Nowcast latency | Mark the newest month of sales nowcast series as provisional. |
| Coverage differs by family and geography | Listings, sales, days-on-market, and market heat are metro/U.S. only; ZHVI and ZORI reach county and ZIP. Gate finer-geography chart options on data availability. |
| Coverage start differs by series | ZHVI from ~2000, ZORI from ~2015, listings/sales from ~2018; a shared date axis must handle ragged starts. |
| ZIP coverage is sparse in rural areas | Expect missing ZIPs in low-density counties; surface a notice on empty joins rather than dropping silently. |
| Monthly and weekly cadences coexist | Standardize on monthly for the core module; treat weekly as an optional higher-resolution cut. |
| Download paths change | Key acquisition on filename cut-tokens and validate the fetched header, not a hardcoded URL. |

> [!danger] Refresh must not overwrite good data with a bad fetch
> As with the DoF pipeline's flagged risk, a changed path or a partial download can produce a malformed frame. The acquisition and cleaning layers must validate row counts, expected identifier columns, and a plausible latest-date before writing over the canonical cleaned CSV.

---

## Citation, Licensing, and Attribution

Zillow provides this data free for public use and asks that it be cited as the source. ZHVI has a dedicated user guide covering correct citation and how to make calculations (such as growth rates) with the index. Charts and exports produced by the module should carry a "Source: Zillow Research" attribution, and any derived growth or ratio metric should follow the ZHVI user guide's guidance rather than differencing the index naively.

| Resource | URL |
|---|---|
| Data catalog | [zillow.com/research/data](https://www.zillow.com/research/data/) |
| ZHVI methodology | [zillow.com/research/methodology-neural-zhvi-32128](https://www.zillow.com/research/methodology-neural-zhvi-32128) |
| ZHVI user guide | [zillow.com/research/zhvi-user-guide](https://www.zillow.com/research/zhvi-user-guide/) |
| ZORI methodology | [zillow.com/research/methodology-zori-repeat-rent-27092](https://www.zillow.com/research/methodology-zori-repeat-rent-27092/) |
| Market heat index methodology | [zillow.com/research/market-heat-index-methodology-34057](https://www.zillow.com/research/market-heat-index-methodology-34057/) |

---

## Open Questions for Data Scoping

- [ ] Which cut is canonical for the module: smoothed-and-seasonally-adjusted for presentation, with raw available as an alternate, or the reverse?
- [ ] Which specific metrics within each family are in the first release versus deferred (the sales and days-on-market families each publish dozens of cuts)?
- [ ] Is weekly cadence in scope for v1, or monthly-only with weekly deferred?
- [ ] Does the module include ZHVF/ZORF forecasts, or values and rents only?
- [ ] What is the authoritative source for the Zillow-to-PPIC geography crosswalk (FIPS join, name match, or a maintained lookup)?

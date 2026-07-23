---
Topic: Other
Content Type: Notes
pinned: false
description: "Notes for me to stay on track"
Date Published: July 4, 2026
Last Updated: 07/23/2026
Status: Updating
---

# Presentation Notes
- [ ] Context can be trimmed to ~1 slide (audience already knows a bit about the project)
- [ ] Able to have multiple slides showing 1 sequence with 1 screenshot per slide and same title

---

# Follow Ups
## A Running List
- Combined SVG/PDF are raster-wrapped, not true vector (combining vector charts is substantially more work). Single-chart SVG/PDF stay vector-first. If crisp vector multi-chart output matters, that's a follow-up.

---

## Structured ToDos
- [ ] Viz tool: able to sort by value
- [ ] Viz tool: more color palettes
- [ ] RHNA: add Region as geographic level
- [x] Improve graph editor UI/UX
- [ ] Add a last updated footer to website, should include date and time in PT.
- [x] Additionally, each pipeline log card should have a show technical details toggle that displays **all** information available even if it is a success or recovered.
- Add a couple of features:
  - [x] For horizontal dot plots -> toggles for which variables/columns to show especially for regession models (lower, upper, middle bounds). 
  - [x] Especially: more line ends (arrows, none, '|', etc.)
  - [x] Undo/redo buttons
  - [x] Tabs/buttons
  - [x] Two charts side by side
  - [ ] Full control over axis labeling
  - [ ] Excel like csv editor features (especially grouping & sorting)
  - [x] Transpose over the data(?)
  - [x] add a Forest Plot
- Tweaks to Viz Tool UI/UX:
  - [x] Alter the view data section to have a "view original data" toggle enabled by default. When it is disabled it shows what data in the chart is.
  - [x] Add all official styling to visualization tool (color groups, typography, Key / legend structure, etc.)
  - [x] Module/Visualization Tool: Chart Type section gap between Base Chart Name and box for the chart needs to be increased.
  - [x] "Date Range" not needed for datasets w/o dates.
- [x] Stress test and validate all existing modules
- [x] Write `processes.md`
- [ ] Setup automatic data updates for existing modules
- [x] Add RHNA Progress Report Module. [Link](https://data.ca.gov/dataset/rhna-progress-report)
- [ ] Parcel / Terner
- [ ] Zillow Data

---
## Unstructured ToDos
Note: not in order
### Backend
- [x] Manually verify all modules -> based on flags on each refractor guide
- [ ] Add live tests
- [x] Setup logging
- [ ] Setup automatic updates and error handling
- [ ] Analyze all of the ways the module dataset formatting have changed over time to widen the parameters for acquisition phase and make pipeline more robust to formatting changes
### Documentation
- [x] Add all front end documentation to `projectSpec.md`
  - [x] what pulls from globals.css & constants.js
- [x] **Begin** documentation for graph editor overhaul. *Start* with feature list and user flow
- [ ] Write `proccesses.md`
- [x] Write `unit-tests.md`
- [ ] Instructions for adding a new module (human and AI instructions)
- [x] Documentation for logging format, explanations, and error handling
- [ ] Adjust or create a document that acts as a project hub readable by both AI and people (connects to other instruction pages)
- [ ] Automatic updates should have a `git-conventions.md` file
- [ ] Non technical explainer for how the website works
- [ ] Update refractor guides since logging has been implemented
- AI Comparison Guide Updates:
  - [ ] Skill files
  - [ ] Workflows
  - [ ] VSCode on MoWos
### Frontend
- [x] Graph editor overhaul
  - [x] Plan front and backend architecture & uses
  - [x] Write down/brainstorm feature list
- [x] Figure out how to display logs & errors on the front end
- [ ] Fix indentations on markdown renderer
- [ ] Need to strip identifying information from the logs. Should use relative paths.
- [x] Update UI kit fonts and graphs
- [x] Documents: Wire in Footnote YAML field
- [x] Footnotes on the graph clip the x axis labels. They should be rendered as callouts below the x axis title
- [ ] Test & Fix graph export visualitations
- [x] Tab feature on charts/graphs
### Information Gaps
- Internal server hardware capabilities
- Open ports to host visualizations, traefik or other reverse proxy setup viability (is there someone who can maintain it?)
### Codebase
- [ ] Scan frontend files for individual or duplicated configs (fonts, colors, styling, etc.)
  - [x] Centralize frontend configs
  - [x] Prefer adding variants to modifying components in place
  - Consider long centralized config for all components -> all status chips variants and where they go
- [ ] Review codebase structure for inefficiencies
- [x] Modularize `docs/` folder

---

## Other Fun Ideas
- [ ] Tracking for how often PPIC's work is referenced in CA state legislature w/ identification if possible -> replace tool Gov Affairs pays for & create visualization
- [ ] Economy stats
- [ ] Climate/Water stats
- [ ] Document edit mode that allows pushing to git
- [ ] Map geojson library

---
# Internship Feedback
- [ ] In person coffe chat option

---

# Archived ToDos
## To Dos Today (7/10)
- Graph Editor Clean Ups
  - [x] View original data checks & fixes
  - [x] Add a Forest Plot variant of the Range plot base
  - [x] Implement ability for Multi charts side by side (or grid layout)
    - User should be able to click an "add a chart" button where the user can add another chart in a 2x1, 1x2, or 2x2 grid using the data they've already implemented. Only one chart can be edited at a time. User should click a toggle to determine which chart/graph they are editing and the editor sidebar should update. 
  - [x] Undo/redo buttons
  - [x] Review the UI Kit page on the website and Add all official styling to visualization tool (color groups, typography, Key / legend structure, etc.). Note: only modifying the charts/graphs not the rest of the website UI. User should be able to choose coloring, styles, font sizes, etc.
  - [x] Module/Visualization Tool: Chart Type section gap between Base Chart Name and box for the chart needs to be increased.
  - [x] "Date Range" not needed for datasets w/o dates.
  - [x] Implement chart embeds
  - [x] Commit changes
## To Dos Monday (7/13)
- Module Issue Fixes & Audits
  - [x] Pop Housing
  - [x] Components of Change
  - [x] Age, Race, Sex Projections
  - [x] ACS Housing Stress
- [x] Add footnote rendering to docs viewer front end.
## To Dos Tuesday (7/14)
- [x] Plan Automations
- [x] Project Meeting
## To Dos Wednesday (7/15)
- [x] Presentation slides draft start
- Module Information:
- [x] Plan RHNA Progress Report Module
- [x] Plan Zillow Data Module
- [ ] Plan Parcel Data Module
- Viz Tool:
  - [x] Fix modules csv so that year column is rendered without commas
  - [x] Sidebar length incorrect on pophousing module
  - [x] Add top/bottom N lines to show
  - [ ] Fix embeds and export options
  - [x] Under edit section, the "Dataset" field dropdown shouldn't be a dropdown and should simply display the datasets used. For the standalone tool, if the data has a title use that (add an option for users to name their datasets (optionally))
  - [x] Standalone: when pasting the data, the box should not dynamically expand downward, use a verticle scroll bar
  - [x] Add top/bottom N option to all applicable charts
  - [x] Forest Plot: Why circles different sizes? Need to increase space between the lines
## To Dos Thursday (7/16)
- [x] Implement RHNA Module
- [ ] Implement Zillow Module
## Monday, July 20th, 2026
- [x] Add the option to Hide/Show specific legend items from the graph editor to ensure those changes survive the export
- [x] The export/import embed/config should -> Import config should be on the dataset section. Export config on the edit section
- [x] Center align the export image and export data buttons
- [x] "import/export" pop up is longer than the screen
- [x] Make footnote on graphs less harsh & it should extend the width of the x-axis. if the legend is on either side the footnote box should not extend to be under it
- [x] "Copy embed" button has no reaction to click
- [x] When you have multiple graphs, the export options only export one graph.
- [x] Fix all export paths (all export options should export the workspace (multi graphs))
- [x] Embed gets rolled into export image

## Wednesday, July 23rd, 2026
- [x] Add last updated to front end on export page (module Export step shows "Data last updated" in PT, from `/api/module-status` → newest successful pipeline run)
- [x] Fix "export all data" button so it exports the exact cleaned CSV for the module ("Original data (entire dataset)" now fetches `?view=table&full=1`, ignoring chart filters)
- [x] Change "Report a problem" button to "Feedback"
- [x] Add an "Export entire dataset" button to the module View Data tab (downloads the whole cleaned CSV via `?view=table&full=1`)
- [x] Render the module's last-updated date on the View Data section too (extracted shared `DatasetLastUpdated`, now on both View Data + Export steps)
- [x] Verify all modules save all historical data — confirmed: every pipeline unions an immutable historical seed + saved canonical + fresh live rows (dedup keep-last, retaining deep years) and writes the full composed file (atomic write + archive). No rolling-window truncation. No code change needed.

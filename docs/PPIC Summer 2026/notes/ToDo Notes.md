---
Topic: Other
Content Type: Notes
pinned: false
description: "Notes for me to stay on track"
Date Published: July 4, 2026
Last Updated: 07/10/2026 - 3:21 PM
Status: Updating
---
# To Do Notes
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
  - [ ] Building Permits
- [x] Add footnote rendering to docs viewer front end.
## To Dos Tuesday (7/14)
- [ ] Plan Automations
- [ ] Set up automations
## To Dos Wednesday (7/15)
- [ ] Presentation slides draft start
- [ ] Plan RHNA Progress Report Module

## Structured ToDos
- [x] Improve graph editor UI/UX
- [ ] Add a last updated footer to website, should include date and time in PT.
- [ ] Additionally, each pipeline log card should have a show technical details toggle that displays **all** information available even if it is a success or recovered.
- Add a couple of features:
  - [x] For horizontal dot plots -> toggles for which variables/columns to show especially for regession models (lower, upper, middle bounds). 
  - [ ] Especially: more line ends (arrows, none, '|', etc.)
  - [x] Undo/redo buttons
  - [x] Tabs/buttons
  - [x] Two charts side by side
  - [ ] Full control over axis labeling
  - [ ] Excel like csv editor features (especially grouping & sorting)
  - [x] Transpose over the data(?)
  - [x] add a Forest Plot
- Tweaks to Viz Tool UI/UX:
  - [x] Alter the view data section to have a "view original data" toggle enabled by default. When it is disabled it shows what data in the chart is.
  - [ ] Add all official styling to visualization tool (color groups, typography, Key / legend structure, etc.)
  - [ ] Module/Visualization Tool: Chart Type section gap between Base Chart Name and box for the chart needs to be increased.
  - [ ] "Date Range" not needed for datasets w/o dates.
- [ ] Stress test and validate all existing modules
- [x] Write `processes.md`
- [ ] Setup automatic data updates for existing modules
- [ ] Add RHNA Progress Report Module. [Link](https://data.ca.gov/dataset/rhna-progress-report)

---
## Unstructured ToDos
Note: not in order
### Backend
- [ ] Manually verify all modules -> based on flags on each refractor guide
- [ ] Add live tests
- [x] Setup logging
- [ ] Setup automatic updates and error handling
- [ ] Analyze all of the ways the module datasets have changed over time to widen the parameters for acquisition phase and make pipeline more robust to formatting changes
### Documentation
- [x] Add all front end documentation to `projectSpec.md`
  - [x] what pulls from globals.css & constants.js
- [x] **Begin** documentation for graph editor overhaul. *Start* with feature list and user flow
- [ ] Write `proccesses.md`
- [ ] Write `unit-tests.md`
- [ ] Instructions for adding a new module (human and AI instructions)
- [x] Documentation for logging format, explanations, and error handling
- [ ] Adjust or create a document that acts as a project hub readable by both AI and people (connects to other instruction pages)
- [ ] Automatic updates should have a `git-conventions.md` file
- [ ] Non technical explainer for how the website works
- [ ] Update refractor guides since logging has been implemented
### Frontend
- [x] Graph editor overhaul
  - [x] Plan front and backend architecture & uses
  - [x] Write down/brainstorm feature list
- [x] Figure out how to display logs & errors on the front end
- [ ] Fix indentations on markdown renderer
- [ ] Need to strip identifying information from the logs. Should use relative paths.
- [ ] Update UI kit fonts and graphs
- [ ] Documents: Wire in Footnote YAML field
- [ ] Footnotes on the graph clip the x axis labels. They should be rendered as callouts below the x axis title
- [ ] Test & Fix graph export visualitations
- [ ] Tab feature on charts/graphs
### Information Gaps
- Internal server hardware capabilities
- Open ports to host visualizations, traefik or other reverse proxy setup viability (is there someone who can maintain it?)
### Codebase
- [ ] Scan frontend files for individual or duplicated configs (fonts, colors, styling, etc.)
  - [x] Centralize frontend configs
  - [ ] Prefer adding variants to modifying components in place
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
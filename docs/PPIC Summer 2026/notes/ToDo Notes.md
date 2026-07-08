---
Topic: Other
Content Type: Notes
pinned: false
description: "Notes for me to stay on track"
Date Published: July 4, 2026
Last Updated: 07/04/2026 - 9:00 AM
Status: Updating
---

# Structured ToDos
- [ ] Improve graph editor UI/UX
- [ ] Add a couple of simple features
  - [ ] For horizontal dot plots -> toggles for which variables/columns to show especially for regession models (lower, upper, middle bounds). Especially: more line ends (arrows, none, '|', etc.)
  - [ ] Undo/redo buttons
  - [ ] Tabs/buttons
  - [ ] Two charts side by side
  - [ ] Full control over axis labeling
  - [ ] Excel like grouping
  - [ ] Transpose over the data(?)
- [ ] Stress test and validate all existing modules
- [ ] Setup automatic data updates for existing modules
- [ ] Add RHNA Progress Report Module. [Link](https://data.ca.gov/dataset/rhna-progress-report)

---
# Unstructured ToDos
Note: not in order
## Backend
- [ ] Manually verify all modules -> based on flags on each refractor guide
- [ ] Add live tests
- [x] Setup logging
- [ ] Setup automatic updates and error handling
## Documentation
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
## Frontend
- [x] Graph editor overhaul
  - [x] Plan front and backend architecture & uses
  - [x] Write down/brainstorm feature list
- [x] Figure out how to display logs & errors on the front end
- [ ] Fix indentations on markdown renderer
- [ ] Need to strip identifying information from the logs. Should use relative paths.
- [ ] Update UI kit fonts and graphs
- [ ] Documents: Wire in Footnote YAML field
## Information Gaps
- Internal server hardware capabilities
- Open ports to host visualizations, traefik or other reverse proxy setup viability (is there someone who can maintain it?)
## Codebase
- [ ] Scan frontend files for individual or duplicated configs (fonts, colors, styling, etc.)
  - [x] Centralize frontend configs
  - [ ] Prefer adding variants to modifying components in place
  - Consider long centralized config for all components -> all status chips variants and where they go
- [ ] Review codebase structure for inefficiencies
- [x] Modularize `docs/` folder

---

# Other Fun Ideas
- [ ] Tracking for how often PPIC's work is referenced in CA state legislature w/ identification if possible -> replace tool Gov Affairs pays for & create visualization
- [ ] Economy stats
- [ ] Climate/Water stats
- [ ] Document edit mode that allows pushing to git
- [ ] Map geojson library
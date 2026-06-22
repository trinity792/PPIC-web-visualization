# June 18th 2026
- started refractor of PopHousing project
- Need to create a general config.py file. Current one is just for the pophousing project
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
| `config.py` | `lib/config.py` | Shared by everything: paths, regions, column defs |
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


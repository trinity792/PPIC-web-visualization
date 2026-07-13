---
Topic: Other
Content Type: Notes
pinned: false
description: "Brainstorming notes about how to automate data updates"
Date Published: July 13, 2026
Last Updated: 07/13/2026 - 11:20 AM
Status: Updating
Footnote: Research, outline, edits, and verification by Trinity Jones. ChatGPT 5.6 Sol used for source gathering.
---

# Automated Data Update Notes
## Random Ideas

---

## Buy a Mini PC
Buy a mini pc who's only job is to upkeep the data and run local LLMS
### Pros
- Control
- Local LLM capabilities
- Stability
- "set it and forget it"
### Cons
- If something breaks badly, a dev may be needed
- High upfront costs
- Extra maintance

---

## GitHub Actions
> [!note] 
> Needs to be flushed out
> - [ ] Detailed GitHub Actions Workflow
### Prerequisites
- [ ] Create an official PPIC github and vercel account (if not, just choose a researcher's account)
### Step 1: Check for New Data
GitHub can run the existing update process automatically on a schedule.
For example:
- Building permits: once a month
- Census housing data: check periodically for the annual release
- Population projections: check every few months
This is similar to setting a recurring calendar reminder, except GitHub actually runs the update process.
### Step 2: System Prepares Updates
When new data is available, the system would:
- Download it
- Clean it
- Check for missing or unusual values
- Compare it with the current dataset
- Produce a report describing what changed
At this stage, the public website would not change yet.
This could run in GitHub’s cloud, using a GitHub-hosted runner. Or self-hosted GitHub runner, where GitHub starts the workflow, but the actual Python process runs on an organization-controlled server.
### Step 3: Review
A researcher or project owner would see something like:
> [!info ] 
> A new May 2026 building-permits release was found.
> 75 rows were added.
> No locations are missing.
> No duplicate records were found.
> All checks passed.
The reviewer could then approve or reject the update.
### Step 4: Storage
The updated dataset needs to be placed in permanent online storage.
Think of this as a controlled shared folder for the website’s data. An option for permanent online storage would be a shared Microsoft SharePoint document library. This matters because Vercel is good at hosting the website, but it is not designed to permanently save files created while the website is running.
### Step 5: Vercel Rebuilds
Once the update is approved, Vercel would rebuild the website using the new data.
The website would then show the updated charts.
The older version of the dataset would remain available as a backup.
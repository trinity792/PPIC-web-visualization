---
Topic: Technical
Content Type: Explainer
pinned: false
description: "Analysis of why the data visualization site cannot currently update itself, and a proposal for the infrastructure needed to automate it, for PPIC leadership and IT."
Date Published: July 27, 2026
Last Updated: 07/27/2026 - 01:01 PM
Status: Updating
Footnote: Research, outline, edits, and verification by Trinity Jones. GPT 5.6 Sol and GPT 5.6 Terra with Thinking (via Perplexity) used for source gathering. Claude Opus 5 used for grammatical fixes
---

# Automating the Data Pipeline: Analysis and Proposal
[The Website](https://ppic-web-visualization.vercel.app/) | [The Specification](https://ppic-web-visualization.vercel.app/documents/projectspec) | [GitHub Repo](https://github.com/trinity792/PPIC-web-visualization)
## Executive Summary
The data visualization site is live and working, but nothing about keeping its data current is automated.
The obstacle is architectural. Keeping the site current requires three separate capabilities: **running** the pipeline scripts, **saving** the resulting data, and **serving** the website and its data to users. The current system has the entire architecture on one device: every module's dataset has to be downloaded, cleaned, merged, and committed from an individual staff member's machine. This works, but the manual updates delay access to new data, which undercuts the project goal of getting the most up-to-date information quickly and easily. Vercel hosts and delivers the site well, but it was never designed to execute scheduled data jobs or to hold a dataset that grows every month.
There are two main options to bridge that gap. The first moves the entire system onto PPIC-controlled servers, which solves all three pillars at once but raises the maintenance burden and complicates any future move to a public-facing site. The second keeps Vercel for serving and adds GitHub Actions to run the pipelines on a schedule, which is a much smaller change to the existing setup but leaves the storage question partly unresolved and constrains the potential use of proprietary data. None of the current modules are using proprietary data, but it may be beneficial to keep the option open.
This document recommends the GitHub and Vercel path as the working default, with open questions regarding where the processed data lives and whether GitHub-hosted runners are allowed to write to PPIC servers. Those are network security questions rather than development ones.
### Decision at a Glance

| | PPIC-Hosted, Private Access | GitHub Actions + Vercel |
|---|---|---|
| Solves running the pipeline | Yes | Yes |
| Solves saving the data | Yes | Unresolved |
| Solves serving the site | Yes | Yes |
| Supports proprietary data | Likely | No |
| Change from current setup | Large | Small |
| Ongoing maintenance | Higher | Lower |
| Path to a public-facing site | Complicated | Straightforward |

---
## Current Architecture
This section describes what exists today and why it cannot support automated updates.
### The Website
The site is a React application using a combination of client-side rendering and server-side routing. It is hosted on Vercel and its source lives in a public GitHub repository. Vercel rebuilds and redeploys the site automatically on a commit to the main branch, which means that publishing new data is, from the website's perspective, simply a matter of committing new data files. More information about the technical details of the website can be found in the [project specification](https://ppic-web-visualization.vercel.app/documents/projectspec).
### The Three Pillars
Any system that keeps this site current has to do three distinct things. Separating them makes it clear which parts of the problem the current setup already handles and which it does not.

| Pillar | What it means | Where it happens today | Sufficient? |
|---|---|---|---|
| **Running** | Executing each module's pipeline: downloading the source data, cleaning it, and merging it with the existing dataset. | On an individual maintainer's personal device. | No |
| **Saving** | Persisting the cleaned dataset somewhere durable that the site can read from. | On the same personal device, then committed into the Git repository. | No |
| **Serving** | Hosting the built site and delivering it and its data to readers. | Vercel. | Yes |

> [!important] Vercel serves, but it does not run or store
> Vercel is designed to deliver a site that has already been built. It is not a place to run scheduled data jobs, and it is not durable storage for growing datasets. Any solution has to source the first two pillars elsewhere, regardless of whether Vercel remains the host.
### Limitations of the Current Setup
**There is no path to automated data updates.** The entire purpose of the modules is to give readers quick access to datasets that are refreshed at varying frequencies. Delivering on that today requires the repository to be cloned onto someone's machine, after which there are only two ways for new data to reach the website. Either that device runs its own local automations to execute the pipeline and then push and commit the results, or a person performs those steps manually for each module every time a source dataset is updated. The first option makes the project dependent on one person's machine staying configured and switched on. The second does not scale past a handful of modules.
**Storage requirements grow without bound.** Every refresh appends to the historical record, so dataset file sizes increase over time and someone has to donate local disk space indefinitely. Consumer cloud storage such as OneDrive is an option, but syncing large files during a pipeline run requires a consistently stable connection. If the connection dropped mid-run, only partial data might be written.

---
## Planned Process
This is the process the infrastructure needs to support. It is written as a sequence so that each proposed option can be evaluated against the same set of requirements.
### Step 1: Check for New Data
An automated process runs on a schedule set per dataset, since the source agencies publish on different cadences. Its only job is to detect whether a newer release exists than the one currently published on the site.
### Step 2: Pipeline Run
When new data is found, the system runs that module's pipeline: download, clean, check for missing or unusual values, compare against the current dataset, and produce a report describing what changed. Nothing on the live website changes at this stage. The output is a candidate dataset and a summary of how it differs from the published one.
This step could run on a GitHub-hosted runner in GitHub's cloud, or on a self-hosted GitHub Actions runner, where GitHub triggers the workflow but the Python process itself executes on an organization-controlled server.
### Step 3: Review
A researcher or project owner receives the change report and decides whether to accept it. The report should be legible without opening the code, along these lines:
> [!info] Example change report
> A new May 2026 building-permits release was found.
> 75 rows were added.
> No locations are missing.
> No duplicate records were found.
> All checks passed.
The reviewer can then approve or reject the update. This human checkpoint is what distinguishes the planned process from blind automation, and it is the reason the pipeline run and the publication step are kept separate.
### Step 4: Storage
The approved dataset is written to permanent online storage. This is the pillar the current architecture has no answer for, and the one that most differentiates the two options below.
### Step 5: Push and Commit
Once approved, the update is pushed and committed to GitHub, at which point Vercel rebuilds and redeploys the site with the new data. This step already works today; it is only the four steps preceding it that require new infrastructure.

---
## Options Analysis
Two approaches were considered. They are not mutually exclusive in every detail, since GitHub Actions can be configured to run on PPIC hardware, but they represent meaningfully different commitments in terms of control, cost, and maintenance.
### Option A: PPIC-Hosted, Private Access
Vercel is dropped entirely. The repository becomes private, and the site is hosted on PPIC internal servers, reached at an address such as `http://server-ip:port` or `https://server-ip:port`. The same servers run the pipelines on a schedule and hold the data.
This option solves all three pillars in a single move and gives PPIC full control over both access and data. That control is what would make it possible to build modules on proprietary datasets that cannot leave the organization's network.
However, this would likely increase maintenance requirements and complicate any path to a future public-facing version of this site. Serving over `https` would probably require setting up a [reverse proxy](https://en.wikipedia.org/wiki/Reverse_proxy), and the whole arrangement depends on hardware and policy questions that have not yet been answered (see [Appendix C](#appendix-c-open-questions)).
### Option B: GitHub Actions and Vercel (Recommended)
PPIC creates organizational GitHub and Vercel accounts. GitHub Actions runs the pipelines on GitHub's servers, Vercel continues to serve the site, and the storage question is resolved separately.
This is the smaller change. It integrates with what already exists, requires no new hardware, and keeps the site trivially publishable to a wider audience later. Its limitations are that it effectively rules out the possibility of modules built on proprietary data (at least on the Free tiers of GitHub and Vercel), and that the storage pillar remains open: the ideal destination is PPIC servers, but that would mean GitHub reaching into PPIC infrastructure, which is a network security decision outside the scope of this analysis.
If that turns out to be prohibited, GitHub Actions can be self-hosted, with runners installed on PPIC servers or another PPIC-controlled device. GitHub still schedules and orchestrates the workflow, but the code and the data stay inside the network. This is the natural middle path between the two options.
Third-party cloud storage is also worth keeping on the table. A service such as OneDrive, SharePoint, Amazon S3, or Azure Blob Storage could hold the processed datasets and be read by both the workflow and the build. This is workable, though not ideal: it adds another account, another set of credentials, and another recurring cost, and the data would sit outside PPIC's direct control without gaining the proprietary-data capability that Option A offers. It seems better suited as a fallback than a first choice, but it should stay in scope rather than be ruled out.
### Side-by-Side Comparison

| Dimension | Option A: PPIC-Hosted | Option B: GitHub + Vercel |
|---|---|---|
| Running the pipeline | PPIC servers, subject to whatever job scheduling is permitted. | GitHub-hosted runners, or self-hosted runners on PPIC hardware. |
| Saving the data | PPIC servers. Fully solved. | Unresolved. PPIC servers if GitHub is permitted to write to them; otherwise, third-party cloud storage. |
| Serving the site | PPIC servers, reachable by IP and port. | Vercel, as today. |
| Access control | Complete. Repo private, site internal only. | Repo can be made private; site access governed by Vercel. |
| Proprietary data | Likely viable. | Not viable. |
| Maintenance burden | Higher. Reverse proxy, uptime, capacity, and patching all become PPIC's responsibility. | Lower. Managed services handle hosting and runner infrastructure. |
| Future public site | Complicated. Would require re-architecting how the site is exposed. | Straightforward. Already how the site works. |
| Principal unknown | PPIC server capabilities and policy restrictions. | Where processed data is permitted to live. |

---
## Recommendation
**Option B**: create organizational GitHub and Vercel accounts, and treat self-hosted GitHub Actions runners as the fallback if data residency requirements rule out GitHub-hosted execution.
Storage remains the open piece. PPIC servers would be the preferred destination. If that is not permitted, third-party cloud storage is a workable second choice rather than a dead end, with the tradeoffs noted under Option B: an extra vendor, extra credentials, and data held outside PPIC. It is not the ideal arrangement, but it should not be ruled out before the network security questions are answered.
### Prerequisites
- [ ] Create a PPIC-owned GitHub organization and transfer or fork the repository into it.
- [ ] Create a PPIC-owned Vercel account and connect it to the organization repository.
- [ ] Get answers to the storage and network security questions in [Appendix C](#appendix-c-open-questions).
- [ ] Decide on a storage destination, in order of preference: PPIC servers, then third-party cloud storage.
- [ ] Choose a GitHub plan tier once the private-repository requirement is settled (see [Appendix A](#appendix-a-github-plan-comparison)).
- [ ] Implement the change report and approval step from the planned process, since automation without a review checkpoint is a regression, not an improvement.

---
## Appendix A: GitHub Plan Comparison
Paid GitHub team and enterprise plans close some of the security gaps that appear once the repository is private. This appendix summarizes what each tier provides, so that plan selection can follow from an actual requirement rather than a default.
### High-Level Differences
All three plans (Free, Team, and Enterprise) offer unlimited public and private repositories with unlimited collaborators. The real differences are in security features, governance, CI/CD quotas, and support. Free targets individuals and small or open-source teams, Team targets growing organizations that need enforced workflows, and Enterprise targets large or regulated organizations needing centralized security, compliance, and identity management.

> [!note] Actions minutes are the quota that matters here
> Because Option B runs pipelines as GitHub Actions workflows, the monthly Actions minutes allowance for private repositories is a functional constraint, not just a line item. Free provides 2,000 minutes per month, Team 3,000, and Enterprise 50,000. Estimating the total runtime across all modules at their intended refresh frequencies is a work in progress.
### Security Capabilities by Plan
#### Free
The Free tier provides Dependabot alerts for dependency vulnerabilities, code scanning and secret scanning for public repositories, basic branch protections without enforced review rules, and standard access controls.
Private repositories on Free do not have built-in Advanced Security features such as CodeQL-based scanning or secret push protection, and administrators cannot purchase the advanced security add-ons for Free organizations. This is the constraint that matters if the repository is made private.
#### Team: Same Baseline Plus Optional Add-Ons
On GitHub Team, organizations retain the same baseline security and public-repository scanning as Free, but they can purchase GitHub Advanced Security add-ons for private repositories. The two main add-ons are:
- **GitHub secret protection** provides secret scanning, push protection, AI-based detection, custom patterns, and a security overview, billed at roughly \$19 per active committer per month.
- **GitHub code security** provides code scanning via CodeQL, Copilot Autofix, dependency review, security campaigns, and integration of third-party security findings, billed at roughly \$30 per active committer per month.
Both add-ons require at least a Team or Enterprise plan and are charged per active committer, meaning users who pushed at least one commit in the last 90 days. For a 50-person team with roughly 40 active committers, secret protection and code security together come to about \$1,960 per month on top of the Team base price.
#### Enterprise: Advanced Security Included
GitHub Enterprise typically includes Advanced Security features for private repositories as part of the subscription rather than as separate add-ons. Enterprise customers gain code scanning and secret scanning for private repositories, push protection that blocks secrets before they reach the repository, supply chain security tools including dependency review, SBOM support, and artifact attestations, and organizational dashboards and security campaigns for addressing accumulated security debt.
Combined with SAML SSO, extensive audit logs, and compliance certifications such as SOC 2 and ISO 27001 in GitHub's environment, Enterprise provides a security posture suited to regulated organizations.
### Features

| Feature                                                   | Free                      | Team                               | Enterprise                              |
| --------------------------------------------------------- | ------------------------- | ---------------------------------- | --------------------------------------- |
| Price (indicative)                                        | \$0/user/month            | \$4/user/month                     | From \$21/user/month                    |
| Public repos                                              | Unlimited                 | Unlimited                          | Unlimited                               |
| Private repos                                             | Unlimited                 | Unlimited                          | Unlimited                               |
| Actions minutes (private repos)                           | 2,000/month               | 3,000/month                        | 50,000/month                            |
| Packages storage                                          | 500MB                     | 2GB                                | 50GB                                    |
| Basic security (Dependabot alerts)                        | Yes                       | Yes                                | Yes                                     |
| Code/secret scanning for private repos                    | No (add-on not available) | Via paid Advanced Security add-ons | Included (Advanced Security)            |
| Protected branches and required reviewers (private repos) | No                        | Yes                                | Yes                                     |
| SAML SSO                                                  | No                        | No                                 | Yes                                     |
| Advanced audit logs and compliance tooling                | No                        | Limited                            | Extensive                               |
| Support                                                   | Community                 | Web/email                          | Enterprise support and optional premium |

---

## Appendix B: Vercel Plan Comparison
Vercel's core plans in 2026 are **Hobby** (free, non-commercial), **Pro** (per-seat commercial), and **Enterprise** (custom contract). All three give modern hosting for frontend and full-stack apps, but they differ in bandwidth, function execution capacity, build limits, collaboration and security features, and how usage is billed. For an organization running a data visualization website, typically asset-heavy, API-driven, and traffic-sensitive, the key dimensions are **active visitors and traffic**, **bandwidth and edge requests**, **function and runtime limits**, **project and repo size constraints**, and **governance and security needs**.

| Plan       | Intended Use                           | Base Price               | Bandwidth (included) | Edge Requests (included) | Serverless Execution                     | Build Minutes              | Commercial Use |
| ---------- | -------------------------------------- | ------------------------ | -------------------- | ------------------------ | ---------------------------------------- | -------------------------- | -------------- |
| Hobby      | Personal, non-commercial projects      | Free                     | 100 GB/month         | ~1M/month                | 1M invocations + 4 CPU-hours             | Up to 6,000 minutes/month  | Prohibited     |
| Pro        | Small to mid-sized commercial teams    | \$20/user/month (annual) | 1 TB/month           | 10M/month                | Usage-based (1M included in some guides) | ~6,000 build minutes/month | Allowed        |
| Enterprise | High-traffic, regulated, or large orgs | Custom                   | Negotiated           | Negotiated               | Negotiated                               | Negotiated                 | Allowed        |

### Traffic and "Active Visitors" (Bandwidth and Edge Requests)
#### Hobby
- Includes 100 GB of bandwidth per month across all projects in the account.
- Includes roughly 1 million edge requests per month and 1 million serverless function invocations, as described in 2026 pricing guides.
- When limits are exceeded, the app typically pauses (Hobby does not bill overages), which can render a site unavailable for the remainder of the billing cycle.
#### Pro
- Pro includes 1 TB of bandwidth per month, with overages billed at around \$0.15/GB in US regions according to pricing calculators and analyses.
- Pro includes 10 million edge requests per month; overages are typically billed at around \$2 per million.
- Function invocations have included tiers (often around 1 million per month) and then overage charges (e.g., \$0.60 per million beyond included).
A 2026 calculator example estimates that 250,000 monthly visitors with 8 page views each and 35 assets per page generate roughly 70 million edge requests, far above the 10M included with Pro; the overage (about 60M requests) would cost around \$120 extra for edge requests alone before function and bandwidth costs.
For this site:
- Pro can comfortably support tens of thousands of MAU (monthly active users) with reasonable asset counts.
- Once traffic approaches hundreds of thousands of visitors or asset-heavy pages (e.g., many charts, large images), edge requests and bandwidth overages quickly become a major cost driver.
#### Enterprise
- Enterprise plans negotiate custom bandwidth and edge request quotas, often with prepaid usage credits and discounted overage rates, tailored to predictable high-traffic workloads.
- Enterprises can negotiate bandwidth ceilings high enough for hundreds of thousands or millions of active visitors, with multi-region failover and stricter SLAs (e.g., 99.99% uptime).
### Summary of Differences for this Site
In 2026, Vercel's Hobby, Pro, and Enterprise plans differ primarily in traffic capacity (bandwidth and edge requests), resource limits (build time, project size, function capacity), and governance and security features rather than in basic deployment workflows. For a data visualization website:
- Hobby is suitable only for low-traffic, non-commercial prototypes; limits on bandwidth and source size will be constraining for real users.
- Pro is the default choice for production, supporting tens of thousands of visitors and sizable repos, but requires careful monitoring of bandwidth and edge request overages as active visitors grow.
- Enterprise is justified for high-traffic, compliance-heavy, or analytics-intensive platforms needing negotiated limits, extended runtimes, and robust governance.
This project should model visitors × page views × assets per page to estimate edge requests and bandwidth under each plan and decide when Pro suffices versus when an Enterprise contract is needed to keep cost and performance under control.

---
## Appendix C: Open Questions
### Hardware Capabilities
What are the hardware capabilities of PPIC servers? Specifically, could they handle running local LLMs if the project eventually needs them, and would concurrent access by everyone at PPIC exhaust available capacity? This determines whether Option A is viable at all.
### Internal Server Access
What can be run on PPIC servers, and what is restricted? Scheduled jobs such as cron are the mechanism both options depend on for triggering pipeline runs. A related question under Option A is which ports are available for serving a site.
### External Service Access
May an external service write to PPIC storage? Under Option B, the ideal destination for processed data is PPIC servers, which would mean GitHub-hosted runners reaching into PPIC infrastructure. If that is prohibited, the options narrow to self-hosted runners or third-party cloud storage.
### Third-Party Cloud Storage
If PPIC servers are not available as a destination, which external storage service would be acceptable, and does PPIC already hold a suitable account? OneDrive and SharePoint may already exist under an institutional license, which would make them cheaper and easier to approve than standing up S3 or Azure Blob Storage from scratch.
### Gaps in This Document
> [!flag] Missing analysis
> A rough estimate of monthly Actions minutes consumed across all modules at their intended refresh frequencies is still missing, and without it the choice between the GitHub Free and Team tiers cannot be made on evidence. The same applies to Vercel: Appendix B lays out the plan limits but no traffic estimate has been modeled against them, so the Hobby versus Pro decision is still open.

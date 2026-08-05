---
Topic: Technical
Content Type: Explainer
pinned: false
description: "Analysis of how the data visualization site is kept current today, and options for automating it, for PPIC leadership and IT."
Date Published: July 27, 2026
Last Updated: 08/04/2026 - 03:14 PM
Status: Updating
Footnote: Research, outline, edits, and verification by Trinity Jones. GPT 5.6 Sol and GPT 5.6 Terra with Thinking (via Perplexity) used for source gathering. Claude Opus 5 used for grammatical fixes
---

# Automating the Data Pipeline: Analysis and Options
[The Website](https://ppic-web-visualization.vercel.app/) | [The Specification](https://ppic-web-visualization.vercel.app/documents/projectspec) | [GitHub Repo](https://github.com/trinity792/PPIC-web-visualization)
## Executive Summary
The data visualization site is live and working. Keeping its data current is presently a manual process.
The reason is architectural. Keeping the site current requires three separate capabilities: **running** the pipeline scripts, **saving** the resulting data, and **serving** the website and its data to users. The current system has the entire architecture on one device: every module's dataset has to be downloaded, cleaned, merged, and committed from an individual staff member's machine. This works. The tradeoff is that each refresh costs staff time, and new data reaches readers only as fast as someone can run the pipeline. Vercel hosts and delivers the site well, but it was never designed to execute scheduled data jobs or to hold a dataset that grows every month.
There are four options each with their own tradeoffs. The first is to keep the current arrangement, which costs nothing and requires nothing new from IT, but keeps a person in the loop for every update. The second moves the entire system onto PPIC-controlled servers, which solves all three capabilities at once but raises the maintenance burden and complicates any future move to a public-facing site. The third keeps Vercel for serving and adds GitHub Actions to run the pipelines on a schedule, which is a much smaller change to the existing setup but leaves the storage question partly unresolved and constrains the potential use of proprietary data. None of the current modules are using proprietary data, but it may be beneficial to keep the option open.
The fourth is the lightest to approve. A spare mobile workstation, left running in a corner, does the running and the saving while GitHub schedules the work and Vercel serves the site. It needs no PPIC GitHub or Vercel account and, importantly, no access to internal PPIC servers at all. The machine can be blocked from reaching internal resources entirely without affecting how it works. It is not a permanent answer, since a laptop is not built to run as a server, but it removes the manual burden immediately while the larger questions are decided.
My preference for the long term is the GitHub and Vercel path, for reasons given below. That preference depends on two open questions: where the processed data is allowed to live, and whether GitHub-hosted runners may write to PPIC servers. Both are network security decisions rather than development ones. In the near term, the spare workstation is the option that asks the least of IT.
### Decision at a Glance

| | A: Continue as Today | B: PPIC-Hosted, Private Access | C: GitHub Actions + Vercel | D: MoWo in a Corner |
|---|---|---|---|---|
| Solves running the pipeline | Manual, per refresh | Yes | Yes | Yes |
| Solves saving the data | Local device, then Git | Yes | Unresolved | Yes, on dedicated hardware |
| Solves serving the site | Yes | Yes | Yes | Yes |
| Needs internal server access | No | Yes | Only for storage | No, can be blocked |
| Needs new PPIC accounts | No | No | Yes | No |
| Supports proprietary data | No | Likely | No | No |
| Change from current setup | None | Large | Small | Small |
| Ongoing cost | Staff time per refresh | IT maintenance | Managed services | One machine, powered and patched |
| Path to a public-facing site | Straightforward | Complicated | Straightforward | Straightforward |
| Viable long term | At a modest module count | Yes | Yes | No, interim only |

---
## Current Architecture
This section describes what exists today and why it cannot support automated updates.
### The Website
The site is a React application using a combination of client-side rendering and server-side routing. It is hosted on Vercel and its source lives in a public GitHub repository. Vercel rebuilds and redeploys the site automatically on a commit to the main branch, which means that publishing new data is, from the website's perspective, simply a matter of committing new data files. More information about the technical details of the website can be found in the [project specification](https://ppic-web-visualization.vercel.app/documents/projectspec).
### The Three Pillars
Any system that keeps this site current has to do three distinct things. Separating them makes it clear which parts of the problem the current setup already handles and which it does not.

| Pillar | What it means | Where it happens today | Automated? |
|---|---|---|---|
| **Running** | Executing each module's pipeline: downloading the source data, cleaning it, and merging it with the existing dataset. | On an individual maintainer's personal device. | No |
| **Saving** | Persisting the cleaned dataset somewhere durable that the site can read from. | On the same personal device, then committed into the Git repository. | No |
| **Serving** | Hosting the built site and delivering it and its data to readers. | Vercel. | Yes |

> [!important] Vercel serves, but it does not run or store
> Vercel is designed to deliver a site that has already been built. It is not a place to run scheduled data jobs, and it is not durable storage for growing datasets. Any automated solution has to source the first two pillars elsewhere, regardless of whether Vercel remains the host.
### Constraints of the Current Setup
**Updates require a person in the loop at every step.** The purpose of the modules is to give readers quick access to datasets that are refreshed at varying frequencies. Delivering on that today requires the repository to be cloned onto someone's machine, after which there are two ways for new data to reach the website. Either that device runs its own local automations to execute the pipeline and then push and commit the results, or a person performs those steps manually for each module every time a source dataset is updated. The first option makes the project dependent on one person's machine staying configured and switched on. The second is sustainable at a handful of modules but grows costly as the module count rises.
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
The approved dataset is written to permanent online storage. This is the pillar the current setup handles locally rather than online, and the one that most differentiates the automated options below.
### Step 5: Push and Commit
Once approved, the update is pushed and committed to GitHub, at which point Vercel rebuilds and redeploys the site with the new data. This step already works today; it is only the four steps preceding it that require new infrastructure.

---
## Options Analysis
Four approaches are on the table, the first of which is to change nothing and the last of which is explicitly a stopgap. They are not mutually exclusive in every detail, since GitHub Actions can be configured to run on PPIC hardware, but they represent meaningfully different commitments in terms of control, cost, and maintenance.
### Option A: Continue as Today
No new infrastructure. The repository stays on a maintainer's machine, pipelines are run by hand when a source agency publishes, and the results are committed to GitHub, at which point Vercel rebuilds the site. Vercel and GitHub Free already cover this at no cost, and nothing new has to be approved, provisioned, or maintained.
This option is viable at the current scale. With a handful of modules and a maintainer who knows the pipelines, updates reach the site within a day or two of a source release.
Its costs are staff time and continuity. Each refresh requires a person to notice the release, run the pipeline, review the output, and commit. That cost scales with the number of modules, and the ability to do it at all depends on one person's machine remaining configured and one person remaining available. Dataset files also grow with every refresh, so local disk usage increases indefinitely.
If the questions in [Appendix C](#appendix-c-open-questions) make the other options impractical, this is a workable steady state rather than a failure. The judgment call is how many modules PPIC expects to run and how quickly readers need new data after a source release.
### Option B: PPIC-Hosted, Private Access
Vercel is dropped entirely. The repository becomes private, and the site is hosted on PPIC internal servers, reached at an address such as `http://server-ip:port` or `https://server-ip:port`. The same servers run the pipelines on a schedule and hold the data.
This option solves all three pillars in a single move and gives PPIC full control over both access and data. That control is what would make it possible to build modules on proprietary datasets that cannot leave the organization's network.
However, this would likely increase maintenance requirements and complicate any path to a future public-facing version of this site. Serving over `https` would probably require setting up a [reverse proxy](https://en.wikipedia.org/wiki/Reverse_proxy), and the whole arrangement depends on hardware and policy questions that have not yet been answered (see [Appendix C](#appendix-c-open-questions)).
### Option C: GitHub Actions and Vercel
PPIC creates organizational GitHub and Vercel accounts. GitHub Actions runs the pipelines on GitHub's servers, Vercel continues to serve the site, and the storage question is resolved separately.
This is a much smaller change than Option B. It integrates with what already exists, requires no new hardware, and keeps the site trivially publishable to a wider audience later. Its limitations are that it effectively rules out the possibility of modules built on proprietary data (at least on the Free tiers of GitHub and Vercel), and that the storage pillar remains open: the ideal destination is PPIC servers, but that would mean GitHub reaching into PPIC infrastructure, which is a network security decision outside the scope of this analysis.
If that turns out to be prohibited, GitHub Actions can be self-hosted, with runners installed on PPIC servers or another PPIC-controlled device. GitHub still schedules and orchestrates the workflow, but the code and the data stay inside the network. This is the natural middle path between Options B and C.
Third-party cloud storage is also worth keeping on the table. A service such as OneDrive, SharePoint, Amazon S3, or Azure Blob Storage could hold the processed datasets and be read by both the workflow and the build. This is workable, though not ideal: it adds another account, another set of credentials, and another recurring cost, and the data would sit outside PPIC's direct control without gaining the proprietary-data capability that Option B offers. It seems better suited as a fallback than a first choice, but it should stay in scope rather than be ruled out.
### Option D: MoWo in a Corner
A spare mobile workstation (MoWo) is set aside as dedicated hardware, plugged in, and left running somewhere out of the way. It registers with GitHub as a [self-hosted runner](https://docs.github.com/en/actions/hosting-your-own-runners), which means GitHub's cloud still schedules the workflow, stores the workflow definitions, and reports the results, while the actual work of downloading, cleaning, and merging happens on the MoWo. The processed dataset is held on that machine and committed to the repository, and Vercel rebuilds and serves the site exactly as it does today. Running and saving are both handled by a machine nobody has to babysit.
This option does not require a PPIC-owned GitHub or Vercel account. It runs on the free tiers of the accounts that already host the project, which means it can be stood up without provisioning, procurement, or a new vendor relationship. PPIC-owned accounts would still be preferable for continuity, since a project that lives under an individual's account leaves with that individual, but that is a governance improvement that can happen later and does not gate the setup.
It also removes both of the recurring costs described under Option A. No staff member gives up disk space on their own device, because the dataset lives on the dedicated machine. Nobody starts a pipeline and waits for it to finish, and nobody has to notice a source release and run scripts by hand. A further benefit specific to self-hosted runners is that they do not consume the monthly GitHub Actions minutes allowance, so the quota question in [Appendix A](#appendix-a-github-plan-comparison) largely falls away.

> [!important] This option requires no access to internal PPIC servers
> The MoWo needs outbound internet access to GitHub and to the source agency websites the pipelines download from. It does not read from, write to, or authenticate against any internal PPIC system, and nothing in the pipeline depends on internal network resources. The machine can be placed on an isolated or guest segment and explicitly blocked from reaching internal servers, and that restriction is welcome rather than something to work around. If it makes approval easier, blocking it is the preferred configuration.

> [!warning] This is a bridge, not a destination
> A laptop is not designed to act as a server. Sustained scheduled workloads mean thermal throttling and fan wear, consumer-grade storage with no redundancy, no remote management or monitoring, and OS patching and reboots that have to be handled by hand. There is a single point of hardware failure: if the machine dies, the published data and the code are safe in Git and on Vercel, but the automation stops until the machine is replaced and reconfigured. This option should be treated as a way to buy time, not as the permanent arrangement.

The bridge converts cleanly. The workflow definitions written for a self-hosted runner are the same ones a GitHub-hosted runner or a PPIC server would execute, so moving to Option B or Option C later means re-pointing where the job runs rather than rewriting how it works.
### Side-by-Side Comparison

| Dimension | Option A: Continue as Today | Option B: PPIC-Hosted | Option C: GitHub + Vercel | Option D: MoWo in a Corner |
|---|---|---|---|---|
| Running the pipeline | A maintainer's machine, run by hand at each release. | PPIC servers, subject to whatever job scheduling is permitted. | GitHub-hosted runners, or self-hosted runners on PPIC hardware. | A dedicated spare workstation, scheduled and orchestrated by GitHub. |
| Saving the data | The same machine, then committed to Git. Local disk grows over time. | PPIC servers. Fully solved. | Unresolved. PPIC servers if GitHub is permitted to write to them; otherwise, third-party cloud storage. | On the workstation, then committed to Git. No staff device involved. |
| Serving the site | Vercel, as today. | PPIC servers, reachable by IP and port. | Vercel, as today. | Vercel, as today. |
| Internal server access needed | None. | The whole option depends on it. | Only if data is written to PPIC servers. | None. Can be blocked outright. |
| New accounts required | None. | None, but new hardware and policy. | PPIC GitHub organization and Vercel account. | None. Existing free tiers suffice. |
| Access control | Repo currently public; can be made private. | Complete. Repo private, site internal only. | Repo can be made private; site access governed by Vercel. | Same as today, plus physical control of the machine. |
| Proprietary data | Not viable. | Likely viable. | Not viable. | Not viable. |
| Maintenance burden | No IT burden. Recurring staff time per refresh. | Higher. Reverse proxy, uptime, capacity, and patching all become PPIC's responsibility. | Lower. Managed services handle hosting and runner infrastructure. | Moderate. One machine to keep powered, patched, and running. |
| Future public site | Straightforward. Already how the site works. | Complicated. Would require re-architecting how the site is exposed. | Straightforward. Already how the site works. | Straightforward. Already how the site works. |
| Suitable as a permanent arrangement | Yes, at a modest module count. | Yes. | Yes. | No. Interim only. |
| Principal unknown | How many modules the manual process can carry. | PPIC server capabilities and policy restrictions. | Where processed data is permitted to live. | Whether a spare machine can be spared and where it sits on the network. |

---
## My Preference
If the network security questions in [Appendix C](#appendix-c-open-questions) allow writing to PPIC servers, my preference is **Option C**: create organizational GitHub and Vercel accounts, and treat self-hosted GitHub Actions runners as the fallback if data residency requirements rule out GitHub-hosted execution. It is the smallest permanent change from what already exists, and it removes the per-refresh staff cost without adding servers for PPIC to maintain or hardware for PPIC to keep alive.
This is a preference from the project side rather than an assessment of what is feasible or advisable given PPIC's infrastructure and policies. Option A remains fully functional if none of the others are approved, and the project can continue on it indefinitely at the current module count.
If a decision on Option C is going to take time, or if the storage question resolves against it, **Option D is the natural interim step**. It asks nothing of PPIC infrastructure, requires no new accounts or spending, and can be reversed by unplugging a machine. Because the workflow definitions are identical, time spent setting it up is not wasted if the project later moves to Option B or Option C. Its only real requirement is a spare workstation that can be left powered on and a decision about where it sits on the network, and the project is happy for that to be as restricted a place as IT prefers.
Storage is the open piece under Option C. PPIC servers would be the preferred destination. If that is not permitted, third-party cloud storage is a workable second choice rather than a dead end, with the tradeoffs noted above: an extra vendor, extra credentials, and data held outside PPIC. It is not the ideal arrangement, but it should not be ruled out before the network security questions are answered.
### What Option C Would Require
- [ ] Create a PPIC-owned GitHub organization and transfer or fork the repository into it.
- [ ] Create a PPIC-owned Vercel account and connect it to the organization repository.
- [ ] Get answers to the storage and network security questions in [Appendix C](#appendix-c-open-questions).
- [ ] Decide on a storage destination, in order of preference: PPIC servers, then third-party cloud storage.
- [ ] Choose a GitHub plan tier once the private-repository requirement is settled (see [Appendix A](#appendix-a-github-plan-comparison)).
- [ ] Implement the change report and approval step from the planned process, since automation without a review checkpoint would be a step backward from the current manual review.
### What Option D Would Require
- [ ] Identify a spare mobile workstation that can be left powered on and plugged in.
- [ ] Decide where that machine sits on the network, including whether to block it from internal PPIC resources entirely.
- [ ] Register it as a self-hosted GitHub Actions runner against the existing repository.
- [ ] Implement the same change report and approval step, which is shared with Option C.
- [ ] Agree on roughly how long the arrangement is expected to stand, so it does not become permanent by default.

---
## Appendix A: GitHub Plan Comparison
Paid GitHub team and enterprise plans close some of the security gaps that appear once the repository is private. This appendix summarizes what each tier provides, so that plan selection can follow from an actual requirement rather than a default.
### High-Level Differences
All three plans (Free, Team, and Enterprise) offer unlimited public and private repositories with unlimited collaborators. The real differences are in security features, governance, CI/CD quotas, and support. Free targets individuals and small or open-source teams, Team targets growing organizations that need enforced workflows, and Enterprise targets large or regulated organizations needing centralized security, compliance, and identity management.

> [!note] Actions minutes are the quota that matters here
> Because Option C runs pipelines as GitHub Actions workflows on GitHub's own runners, the monthly Actions minutes allowance for private repositories is a functional constraint, not just a line item. Free provides 2,000 minutes per month, Team 3,000, and Enterprise 50,000. Estimating the total runtime across all modules at their intended refresh frequencies is a work in progress.
> This quota does not apply to self-hosted runners. Under Option D, and under the self-hosted variant of Option C, the pipeline runs on PPIC-controlled hardware and consumes no billable minutes regardless of plan tier. That removes the plan-tier question from the critical path for those configurations.
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
What are the hardware capabilities of PPIC servers? Specifically, could they handle running local LLMs if the project eventually needs them, and would concurrent access by everyone at PPIC exhaust available capacity? This determines whether Option B is viable at all.
### Internal Server Access
What can be run on PPIC servers, and what is restricted? Scheduled jobs such as cron are the mechanism Options B and C depend on for triggering pipeline runs. A related question under Option B is which ports are available for serving a site. This question does not apply to Option D, which touches no internal servers.
### External Service Access
May an external service write to PPIC storage? Under Option C, the ideal destination for processed data is PPIC servers, which would mean GitHub-hosted runners reaching into PPIC infrastructure. If that is prohibited, the options narrow to self-hosted runners or third-party cloud storage.
### Third-Party Cloud Storage
If PPIC servers are not available as a destination, which external storage service would be acceptable, and does PPIC already hold a suitable account? OneDrive and SharePoint may already exist under an institutional license, which would make them cheaper and easier to approve than standing up S3 or Azure Blob Storage from scratch.
### Spare Hardware and Network Placement
Is there a spare mobile workstation that could be dedicated to this and left powered on, and where on the network should it sit? Option D needs only outbound access to GitHub and to the public source agency sites the pipelines download from. It does not need to reach any internal PPIC resource, so it can be placed on an isolated or guest segment and firewalled off from internal systems. If that restriction makes the machine easier to approve, it is the configuration the project would prefer.
### Estimates Still to Be Made
> [!note] Usage modeling in progress
> Two estimates are still being worked out on the project side. The first is monthly Actions minutes consumed across all modules at their intended refresh frequencies, which is what settles the choice between the GitHub Free and Team tiers. The second is a traffic estimate modeled against the Vercel plan limits in [Appendix B](#appendix-b-vercel-plan-comparison), which settles Hobby versus Pro. Both are needed regardless of which option is chosen, and neither blocks the infrastructure questions above.

---
Topic: Convention Guide
Content Type: agent instructions
pinned: false
description: "How an agent adds an entry to the /logs Changelog: edit the curated overlay keyed by commit hash, then rebuild the merged data file."
Date Published: July 17, 2026
Last Updated: 07/17/2026 - 12:00 PM
Status: Updating
---

# Changelog Updater Conventions

The Changelog tab on `/logs` is a **hybrid** of `git log` and hand-curated judgment. Git supplies the hash, date, author, and commit text; a human (or agent) supplies the fields git cannot infer. Your job when "update the changelog" is requested: add an overlay entry for the relevant commit, then rebuild.

---

## The Three Files

| File | Role | You edit it? |
|---|---|---|
| `data/changelog-overlay.json` | Curated input, keyed by short commit hash | **Yes** |
| `scripts/changelog/build-changelog.mjs` | Merges overlay + `git log` | No — you run it |
| `data/changelog.json` | Generated output the app reads | **Never** — regenerated |

---

## Workflow

1. Get the short hash of the commit to log: `git log --oneline -10`.
2. Add one entry to `data/changelog-overlay.json`, keyed by that short hash (see schema below).
3. Regenerate: `node scripts/changelog/build-changelog.mjs`.
4. Commit both `changelog-overlay.json` and the regenerated `changelog.json`.

> [!important] Only overlaid commits appear
> A commit is invisible to the changelog until it has an overlay entry. The overlay is the curation gate, not a mirror of every commit.

---

## Overlay Entry Schema

```json
"c80692e": {
  "title": "Short human-facing headline",
  "area": "Backend scripts",
  "intensity": "high",
  "audited": true,
  "module": "Population & Housing",
  "description": "One or two sentences on what changed and why it matters."
}
```

| Field | Required | Values / Notes |
|---|---|---|
| `title` | No | Headline. Falls back to the commit subject if omitted. |
| `description` | No | Falls back to the commit body, then the subject. Prefer writing it explicitly. |
| `area` | No | Free text, but **reuse existing values** (e.g. `Backend scripts`, `Front-end components`, `UI Kit`, `Documentation`). Defaults to `Uncategorized`. |
| `intensity` | No | `low`, `moderate`, or `high` only. Defaults to `low`. Invalid values warn but still build. |
| `audited` | No | `true` only once a human has reviewed the change; otherwise `false`. |
| `module` | No | The data module name if the change is module-specific, else `null`. |

---

## Rules

- **Match an existing `area`** rather than inventing a near-duplicate — areas drive the filter sidebar, which is derived from the data.
- **Reserve `high` intensity** for major features, refactors, or anything touching the data pipeline; use `low` for docs, cleanups, and small fixes.
- Set `audited: true` only for changes an actual person has verified. Default to `false` for agent-authored entries unless told otherwise.
- Keep `title` to a single line and `description` to one or two sentences — cards are compact.
- Keys beginning with `__` (e.g. `__doc__`) are metadata and are skipped by the build; leave them intact.
- Never hand-edit `data/changelog.json`; it is overwritten on every rebuild.

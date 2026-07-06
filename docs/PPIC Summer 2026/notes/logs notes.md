# Logs
Should include: 
- [ ] The error, where (the script, the function, the line), which phase, the traceback, date and time in PST, possible cause(?)
- [ ] Logs should have a toggle between technical and non technical mode. Technical mode should be formatted as normal. Each day's log go in a code block. Non Technical mode should be easier to read and use cleaner less noisy display but contain the same content. 
- [ ] Markdown file type?
- [ ] Ability to filter by date, type. Sort with most recent first. 
- [ ] Limit list to 15 log cards. Add a "show more" button and render the back to top button
- [ ] The technical details of the raw log should be in a code block under the show technical details dropdown.
- [ ] The log card should have a copy button to allow the user to copy the logs

# Examples
## Non Technical Mode
Each entry is a card, not a code block. Same underlying fields as technical mode (error, location, phase, traceback, timestamp, possible cause), just relabeled into plain language and with the traceback collapsed behind a disclosure toggle instead of shown inline.

**Card layout:**
```
[Icon]  <Module> — <one-line plain-English summary>
        When:   <date, time PST>
        Phase:  <step N of M — plain-language phase name>
        Cause:  <likely cause, plain language>
        Impact: <what this means for the data/site>
        ▸ Show technical details (collapsed traceback, file/function/line)
```

**Example — failure:**
```
[AlertTriangle]  Building Permits — this month's update failed to download
    When:   July 3, 2026 · 2:14 AM PST
    Phase:  Step 2 of 6 — Fetching source data
    Cause:  The Census Bureau renamed this month's file, which it does
            occasionally without notice.
    Impact: Building Permits data was not updated. Other modules are
            unaffected.
    ▸ Show technical details
```

**Example — success:**
```
[CheckCircle2]  Demographic Projections — update completed normally
    When:   July 3, 2026 · 1:02 AM PST
    Phase:  Step 6 of 6 — Publishing cleaned data
    Result: 1,718,208 rows refreshed, no changes needed to prior data.
```

**Example — recovered warning:**
```
[ShieldAlert]  ACS Housing Stress — update succeeded using backup data
    When:   July 3, 2026 · 1:47 AM PST
    Phase:  Step 1 of 6 — Fetching source data
    Cause:  The Census ACS server did not respond in time.
    Impact: None — the pipeline used yesterday's saved download instead.
    ▸ Show technical details
```

Severity icons (`lucide-react`): `AlertTriangle` (error, amber), `CheckCircle2` (success, green), `ShieldAlert` (recovered/fallback used, blue) — matches the `AlertTriangle`/`AlertCircle` and `RotateCcw` icons already used elsewhere in the app (e.g. `components/feedback/ReportProblemDialog.js`, `components/ui/*`). Phase names should use the same plain labels across modules (e.g. "Fetching source data," "Cleaning," "Publishing cleaned data") rather than each module's internal step names.
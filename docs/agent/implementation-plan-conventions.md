---
name: implementation-plan-conventions
description: >
  Enforces structure, decomposition, and hand-off conventions for implementation plans - the
  documents that specify work before it is built. Use this skill whenever a request produces a
  plan rather than code: a list of features or bug reports to be organized, a refactor to be
  sequenced, a spec to be extended with "what to build next", or any ask to write up work for
  someone (or some model) other than the planner to implement. Triggers on: "write an
  implementation plan", "plan out these features", "group these into workstreams", "spec this
  before we build it", "make a plan detailed enough for X to implement", "we're doing tests
  first", "break this down", or a bare list of features/fixes handed over with no instruction to
  write code. This skill defines HOW a plan is decomposed into workstreams, HOW a diagnosis is
  grounded, WHAT the tests section owes the person writing the tests, and WHAT a plan must never
  contain. Works alongside markdown-conventions (which governs formatting) and whichever
  language conventions file governs the code the plan describes.
Topic: Convention Guide
Content Type: agent instructions
pinned: false
Date Published: July 31, 2026
Last Updated: 07/31/2026 - 05:05 PM
Status: Finalized
---

# Implementation Plan Conventions Skill

Conventions for writing implementation plans that a different person - or a smaller model - can execute without the planner in the room. A plan is a hand-off document. Everything in it exists to survive that hand-off.

---

## Guiding Principle

**A plan specifies the change; it does not perform it.** The planner's job is to find out what is actually true, decide what should happen, and write it down precisely enough that implementing it is mechanical. The moment a plan starts pasting the finished code, it has stopped being a plan and started being a worse version of the commit - unreviewable, unsequenced, and stale the first time reality disagrees.

Three separations follow from that principle, and they are the whole skill:

| Separation | What it means |
|---|---|
| **Specification from implementation** | The plan says what changes, where, and why. It quotes existing code to prove a diagnosis, never to supply a solution. |
| **Tests from implementation** | Tests are specified by the plan and written by a different hand, before the implementation exists. The plan names cases and their assertions; it does not write the test bodies. |
| **Workstreams from tickets** | Related changes are grouped by the thing they are true about, not by the file they touch or the order they were reported. |

---

## When to Write a Plan

Write one when any of these hold:

- The work spans more than about three files, or more than one layer (renderer plus control, pipeline plus schema, API plus client).
- The request arrives as a **list** - features, bug reports, review comments - that has not been organized by anyone.
- Someone other than the planner will implement it, including a different model or a future session.
- Tests are being written first, by a person who needs to know what to assert before the code exists.
- The change invalidates something already documented, so the reconciliation needs to be tracked.

Do **not** write one for a single-file fix with an obvious shape, or when the user asked for the change itself. A plan for a one-line fix is a tax, and writing one when code was requested is a failure to do the work.

---

## Before Writing: Resolve the Branch Points

A plan built on a guess is worse than no plan, because it launders the guess into an instruction. Before drafting:

1. **Read the code the plan will change.** Every claim about current behavior must come from having read it, not from the report that prompted the work. Reports describe symptoms accurately and causes rarely.
2. **Identify the decisions the plan cannot make.** Anything where two reasonable implementations diverge and the choice is the user's - scope, whether a control is removed or rewired, which of two mechanisms survives a merge - is a question, not a default.
3. **Ask them together, before drafting.** A plan revised after the fact carries the seams. Ask the two to four decisions that actually branch the plan, then write once.
4. **Record the answers in the plan.** A reader six weeks later needs to know a choice was made, not infer it.

> [!warning] Do not ask questions you can answer by reading
> "Which file owns this?" and "Does this already exist?" are research, not decisions. Asking them spends the user's attention on work the planner should have done.

---

## Document Anatomy

A plan is either its own document or a clearly separated half of a living specification. Both shapes have the same skeleton.

```markdown
# <Plan Title>

> [!info] Who this is for and how to read it
> What is built vs. not built, who implements it, and the tests-first convention if it applies.

<One or two paragraphs: what prompted this and what the plan does not cover.>

| # | Workstream | What it closes | Depends on |
|---|---|---|---|
| A | ... | ... | - |

> [!warning] <The sequencing risk, if there is one>

---

## Workstream A - <A claim, not a label>

### <Diagnosis heading>
### Implementation
### What this invalidates
### Tests

---

## Workstream B - ...
```

### Appending to a living specification

When the plan extends a document that already describes shipped behavior, do not interleave them. Put the whole plan below a single heading, and open it with a callout stating plainly that everything above is as-built and everything below is not. A reader must never have to guess which half of a sentence is a promise.

---

## Workstream Decomposition

A workstream is **a set of changes that are true about the same thing**. It is not a file, a sprint, a size, or the order the items were reported in.

### How to group

| Group by | Example |
|---|---|
| **A shared root cause** | Three separate visual bug reports that all trace to one bad coercion belong together, however differently they present. |
| **A shared subject** | Every setting that fails to reach a renderer belongs in one pass, even across a dozen files, because the audit is the work. |
| **A shared decision** | "Remove this role" and "document what the neighbouring role is for" belong together: they are one judgement about what these roles are. |
| **A shared surface** | Changes that all rewrite the same shell belong together, because landing half of them leaves the surface incoherent. |

### How not to group

- **By file.** Two unrelated fixes in one module are two workstreams. One fix across nine modules is one.
- **By reported order.** The list arrives in the order symptoms were noticed, which is close to random.
- **By size.** Padding a small workstream to match a large one invents work; splitting a large one to match a small one invents dependencies.

### Sizing

A workstream should be landable on one branch and reviewable in one sitting. If it cannot be, that is information: either it has more than one subject and should split, or it is genuinely large and should say so in a callout and land alone.

Number workstreams with letters (A, B, C) rather than digits. Digits read as priority and invite reordering; letters read as names and survive being resequenced.

### Naming

Name a workstream with the claim it makes, not the area it touches. "The forest plot draws lines nobody asked for" tells a reader what they will find. "Forest plot fixes" does not. A reader scanning the index table should be able to guess the content of each workstream from its name alone.

### Sequencing

The index table carries a **Depends on** column. Dependencies are real only when one workstream reads something another writes - a validation flag, a new context, a renamed export. Preference is not dependency; if two workstreams could land in either order, they have none.

State the sequencing risk in a callout rather than burying it in the table. The common case is one workstream that touches the most surface area, has the most dependencies, and should land last and alone.

---

## Grounding a Diagnosis

The section before **Implementation** explains what is actually wrong. It is the part a plan most often gets wrong, in two opposite directions: asserting a cause it has not confirmed, or describing symptoms without ever naming a cause.

### Quote the code that proves it

Where a root cause is a specific line, quote it. Two to five lines, with the file and function named in the sentence before, and the consequence stated in the sentence after. The quote is evidence, not a patch site. In shape:

> `lib/render/plot.js`, in the forest branch:
>
> `const line = Number.isFinite(Number(appearance.threshold)) ? [ ... ] : [];`
>
> The descriptor's default is `null`, and `Number(null)` is `0`, not `NaN`. So the line is drawn on every chart, and clearing the control - which writes `null` back - restores exactly the line the reader was trying to remove.

A quote without the consequence spelled out is a code fragment, not a diagnosis.

### Separate the diagnosed from the observed

If three symptoms were reported and two share a confirmed cause, say so, and say the third is unconfirmed. Then give the implementer a procedure: fix the confirmed cause, re-check, and only then investigate - with the candidate explanations ranked and the reasoning for the ranking.

A plan that guesses on the third symptom and is wrong costs more than a plan that says "verify this", because the implementer will trust it.

> [!tip] Name the correct pattern when it already exists nearby
> If the codebase already handles the same class of bug somewhere else, point at it. "Reuse that shape rather than inventing another" is the single highest-leverage sentence a plan can contain, and it makes the change look native afterward.

---

## The Implementation Section

Numbered steps, each naming the file it touches, in the order they should be done. Not a diff.

Each step should say:

- **Where.** The file, and the function or section within it.
- **What changes.** In prose specific enough to be unambiguous: which key is added, what it defaults to, what reads it.
- **What must not change.** The invariant the step is at risk of breaking. This is what separates a plan from a wish.

Where a change has a backward-compatibility constraint - stored data, saved links, a public shape - state it as a constraint, not as a note. "Default rendering must not move" is checkable. "Try not to change the defaults" is not.

Add a short **What this invalidates** subsection whenever the change makes existing documentation wrong. Name the section by title. Reconciling documentation is cheap when the plan already lists what to reconcile, and nearly never happens otherwise.

---

## The Tests Section

Every workstream ends with one. Under a tests-first convention, this section is a **contract with the person writing the tests**, and it is the part of the plan that most needs to be complete: they cannot read the implementation, because it does not exist.

### What it must contain

- **The file each test goes in**, split into new files and extensions of existing ones, with real paths that follow the project's existing test layout.
- **A table per file**, with the test's name in the first column and what it verifies in the second.
- **Named cases, not coverage goals.** "Tests the palette resolver" is not a case. "`returns the legacy ramp for the default palette`" is.

```markdown
New file: `tests/lib/render/forest.test.js`.

| Test | What it verifies |
|---|---|
| `draws no reference line when the threshold is null` | The regression that started the workstream. |
| `draws a reference line at zero when the threshold is 0` | Zero is a real setting, not an absence. |
```

### Rules for the cases

**Name the assertion, not the code path.** A test case is written from the outside: what is true after the change, in the vocabulary of the person using the thing. `hides the toolbar out of advanced mode` survives a refactor; `calls useAdvancedMode and returns null` does not.

**A test must be able to fail.** Expectations are hand-written, not read back from the thing under test. A test that asks the registry what it declared and then agrees with the answer passes unconditionally. Where a plan specifies a test over a registry, catalog, or config table, it must say that the expected values are written out by hand.

**Pin the behavior that must not change.** Every workstream that touches shared machinery needs at least one case asserting the untouched path is untouched. These are the cases an implementer will not think to write, and the ones that make a risky change safe.

**Cover the boundary that caused the bug.** If the diagnosis was a coercion, the plan specifies cases for `null`, `undefined`, `""`, and `0` explicitly. If it was an ordering, the plan specifies both orders.

**Say when a case is expected to change an existing test.** If a change makes a currently-passing test wrong, name that test file and say so in the table or a callout. An implementer who hits an unexplained red test assumes they broke something.

### What it must not contain

No test bodies, no mock setup, no fixture code. The plan says what to assert; the test author decides how. A plan that writes the test has taken the job it was meant to hand off, and has done it without being able to run it.

---

## What a Plan Must Never Contain

| Never | Why |
|---|---|
| **Finished implementation code** | It is unreviewable in a document, goes stale immediately, and removes the implementer's judgement about the surrounding code. Quote existing code as evidence; describe new code in prose. |
| **Test bodies** | Same reason, plus it breaks the tests-first separation the plan exists to serve. |
| **Estimates in hours or story points** | A plan is about content and order. Sizing is a separate conversation with different inputs. |
| **Unverified claims about current behavior** | The single most expensive kind of error, because everything downstream is built on it. |
| **"Refactor X" as a step** | Not actionable. Say what shape it takes afterward and what invariant holds across the change. |
| **Silent scope creep** | A fix that also rewrites something adjacent needs to say so in its own step, or be its own workstream. |
| **Aspirational checkboxes** | Only check what is done. A pre-checked item is a lie the next reader inherits. |

---

## Reference Tables Inside Plans

Plans routinely need to enumerate a surface - every setting, every route, every field. When they do:

- **One row per thing, one column per question.** The questions are usually: what is it called, where does it live, where is it available, what reads it, what does it do.
- **Mark the rows a workstream changes** with that workstream's letter, so the table doubles as a coverage check.
- **Include a "declared but unwired" table** whenever the audit found keys nothing reads. This is almost always the highest-value output of an audit, and it is invisible unless collected.
- **Say plainly that the unwired table is not a to-do list.** Some entries are worth building and some are worth deleting, and the plan should say to decide per entry rather than implying a backlog.

---

## Voice

Write for an implementer who is competent but has never seen this code. Explain the why alongside the what: a step whose reason is stated gets implemented correctly when reality differs slightly from the plan, and a step without one gets implemented literally and wrongly.

Prefer prose to bullets for reasoning, tables for enumeration, and callouts only for the things that would genuinely be missed. Follow the project's `markdown-conventions` for everything structural - heading depth, callout types, hyphens over em dashes, frontmatter, and the `Last Updated` discipline.

---

## Checklist

Before handing a plan over:

- [ ] Every claim about current behavior came from reading the code, not from the report.
- [ ] The decisions that branch the plan were asked, answered, and recorded.
- [ ] Workstreams are grouped by subject, named as claims, and lettered.
- [ ] The index table lists what each workstream closes and what it depends on.
- [ ] Every diagnosis is grounded, and every unconfirmed symptom is labelled as such with a verification procedure.
- [ ] Every implementation step names its file and its invariant.
- [ ] Every workstream has a Tests section with real file paths and named cases.
- [ ] No implementation code and no test bodies appear anywhere.
- [ ] Everything the plan makes wrong in existing documentation is listed by section title.
- [ ] Frontmatter `Last Updated` reflects this edit.

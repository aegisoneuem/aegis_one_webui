# Deployments — restored against v129

Source of truth: `design-reference/Aegis-One-Console-v129.html`, Deployments page.

|                   |                                              |
| ----------------- | -------------------------------------------- |
| Reference         | `screenshots/deployments-v129-reference.png` |
| Restored          | `screenshots/deployments.png`                |
| Scheduled counter | `screenshots/deployments-scheduled.png`      |

## What the page is now

A heading with two actions, six counters, a search-and-type row, and one wide
grid. Every row is an action, and every row carries its own result breakdown.

The counters are the page's filters: All Actions · Active / waiting ·
Scheduled · Completed · With Failures · Paused / cancelled. They count every
action rather than the filtered page, because each one narrows the grid — a
counter that followed the filter would always read the same as the grid under
it. The "N actions" line in the toolbar is the one that follows the filter.

### The grid

| Column              | What it carries                                                                   |
| ------------------- | --------------------------------------------------------------------------------- |
| Action / package    | The action's name, then `id · type`, then the package it carries on its own line. |
| Computers           | The target count, and the first two target hostnames with a remainder.            |
| Status              | Coloured text, not a pill. A scheduled action also says when it starts.           |
| Results             | done / failed / pending, a two-segment bar, and "N / M Results Recorded".         |
| Triggered by / time | Who started it and when.                                                          |
| —                   | View Details.                                                                     |

Geometry from the reference: 94px rows over a 41px header band, 84px counter
tiles in a six-column grid with 13px gutters, a 365px search box and a 189px
type select, and a 145px × 5px result bar.

The result bar is drawn as an SVG, as the other figures in this console are:
a proportional width is data, and inline styles are not allowed here.

## Again: the contract already described this page

`DeploymentsSummary` is the six counters, named field for field — `all`,
`active`, `scheduled`, `completed`, `withFailures`, `pausedOrCancelled`. And
`DeploymentSummary` is the row: `package`, `targetCount`, `targetPreview`
(maximum three), `counts { done, failed, pending }`, `triggeredBy`,
`triggeredAt`, `startsAt`.

The server served none of those names. It had drifted to `content`,
`succeeded`, `createdBy`, `createdAt` and `scheduledAt`, carried no target
sample at all, and `GET /deployments/summary` was declared and unserved. The
console's page agreed with the server, so nothing complained.

No contract changes were needed for this page. That is the second time in a
row, and the fifth page where the drift was the server's rather than the
spec's.

### The rename

The table's columns now carry the contract's names rather than the drifted
ones, so a reader of the SQL and a reader of the spec see the same word:

| Was            | Is               |
| -------------- | ---------------- |
| `content`      | `package`        |
| `succeeded`    | `done`           |
| `created_by`   | `triggered_by`   |
| `created_at`   | `triggered_at`   |
| `scheduled_at` | `starts_at`      |
| —              | `target_preview` |

`counts` is nested in the contract and flat in the table, because a column is
what a filter and a sort can reach. `registerResourceRoutes` gained a `shape`
hook for exactly that: a resource can fold its row into the contract's shape
without a bespoke route.

### The target sample

`targetPreview` is materialised on the row at seed time. Reading it per row
would be a join into `deployment_results` for a line of secondary text. A
scheduled action has reported nothing yet, so it falls back to the head of the
estate rather than showing no targets at all. `POST /deployments` resolves the
sample from the targets it has just resolved, and clears the aggregate cache so
the counters do not serve the figures the write invalidated.

## Present in v129, not in the restored build

| Missing              | Why                                                                                                                                                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Example" row marker | The reference flags some fixture rows as illustrative. Nothing in `DeploymentSummary` carries that, and every row here is seeded data, so marking a subset would be inventing a distinction. See decisions.md D-030. |
| "Hide Examples"      | The toggle that filter marks, so it goes with them.                                                                                                                                                                  |
| Reference footnote   | Its first sentence is kept; the two about example rows and preview actions describe the reference's own fixture, not this build.                                                                                     |
| Export icon          | The reference's Export button carries a download glyph. Ours is the console's standard button.                                                                                                                       |

## Two things worth a decision

**"With Failures" is near-saturated here.** It counts actions with any failure
at all, which is what the label says. At this estate's scale — rollouts of
thousands of endpoints — thirteen of fifteen actions have recorded at least one
failure, so the tile separates almost nothing. The reference's fixture has
three-endpoint actions, where "any failure" is a real signal. Whether the
product means "any failure" or "a failure rate above a threshold" is a product
question, not a design one; the restored page implements the label.

**The package line is one string.** The reference prints a package title and a
bold build separately (`Google Chrome` · **145.0.2**). The contract's `package`
is a single string, and splitting it would be guessing where the title ends. It
is rendered whole, in the reference's position and typography.

## Type labels

The reference writes the type in title case, and calls `refresh-details`
"Refresh Computer Details" — which no general-purpose humaniser would produce.
The page carries an explicit label per enum member rather than deriving them.

## Library changes this needed

One: `registerResourceRoutes` gained the `shape` hook described above. No
change to `packages/ui`.

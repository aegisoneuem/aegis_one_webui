# Live Activity — restored against v129

Source of truth: `design-reference/Aegis-One-Console-v129.html`, Live Activity page.

|                |                                        |
| -------------- | -------------------------------------- |
| Reference      | `screenshots/liveops-v129-console.png` |
| Console        | `screenshots/liveops-console.png`      |
| Run Script     | `screenshots/liveops-script.png`       |
| Log Collection | `screenshots/liveops-logs.png`         |
| Storage & Mail | `screenshots/liveops-storage.png`      |
| Task Results   | `screenshots/liveops-results.png`      |

## What the page is now

Five tabs — **Console, Log Collection, Task Results, Task History, Audit
Trail** — drawn as five equal bands with the active one inverted.

The Console is three operation cards over a two-step grid: **01 Configure
Request** on the left, **02 Select Targets** on the right, and a submit bar
across the foot carrying the request in one line and the Review Request
button.

Ours was a page header, a five-tab strip in different words and a different
order, and a single "Submit a job" card: a stack of generic `Field`s with a
"What to do" dropdown where the reference has three cards, no target list at
all, and a group-or-zone select standing in for choosing endpoints.

Geometry from the reference: 52px tabs, 84px operation cards with a 42px icon
tile, 22px card padding, a step badge in cream, 36px inputs, 53px checklist
cards in two columns, a dark 37px target header band over 64px rows, and a
68px submit bar under a 2px gold rule.

## The three operations

Each is a job, and nothing here is a session. The page says so in its own
header comment and the e2e suite asserts the words "remote desktop", "remote
control", "screen share", "screen view", "remote session", "terminal session"
and "take control" appear nowhere on it.

| Operation        | What it configures                                               |
| ---------------- | ---------------------------------------------------------------- |
| **Live Data**    | the eight-field checklist, with the reference's own captions     |
| **Run Script**   | runtime, the editor, and Load Inventory Example                  |
| **Collect Logs** | the log source, and the note about permitted paths and redaction |

The example script, the runtime list, the log sources and all three notes are
the reference's own copy, read out of it rather than written here.

## The contract described most of it, and needed three additions

`LiveJobInput` already had every field of Configure Request, including
`timeoutSeconds` and `outputLimitKb`, which our page never sent.
`CollectedLogPage` already declared the five counters, in a `stats` object
nothing served. `LiveJob` already had `title`, `counts`, `submittedBy` and
`submittedAt` — while the table and the page had both drifted to `name`,
`completed`, `failed`, `createdBy` and `createdAt`.

### What was added, and why

| Schema          | Added                                                                                           |
| --------------- | ----------------------------------------------------------------------------------------------- |
| `LiveJobResult` | `connection`, `actionId`, `actionType`, `queuedAt`, `reason`, `detail`                          |
| `LogSchedule`   | `runs`, `delivery`, `lastRunAt`, `enabled`                                                      |
| `LogSettings`   | `rootPath`, `folderLayout`, `fileNamePattern`, `maxBundleSizeMb`, `sendAs`, `attachmentLimitMb` |

All three are the columns the approved grids and panels show. The Task
Results grid has ten columns and the contract described four of them.

## What changed behind the page

- `live_jobs` renamed to the contract's names and given the seven counters of
  `counts` as columns.
- `live_job_results` rewritten to the ten columns of the Task Results grid.
  Every target of a seeded job now has a row, so the counters are the tally of
  the rows behind them (decisions.md D-033).
- An offline endpoint reads QUEUED with an offline connection, as the
  reference draws it (D-034).
- `log_schedules` and `log_settings` added, with one settings row seeded.
- `/liveops/logs` gained its `stats` envelope, a `fileTypes` array rather than
  a JSON string, and the `logType` and `collected` parameters the contract
  declares.
- `POST /liveops/script-jobs` now returns 202 with a full `LiveJob`, which is
  what the contract says.
- `GET /liveops/script-jobs/{jobId}` is served for the first time.

## Present in v129, not in the restored build

| Missing                            | Why                                                             |
| ---------------------------------- | --------------------------------------------------------------- |
| Collect Now / New Schedule         | `POST /liveops/log-schedules` is declared and unserved.         |
| Save Settings                      | `PUT /liveops/log-settings` is declared and unserved (D-035).   |
| Export List / Export               | No export endpoint for either grid.                             |
| Download All (ZIP), Email Selected | `/liveops/script-jobs/{jobId}/bundle` is declared and unserved. |
| Column resize handles              | The reference's grids carry them; ours do not.                  |

Cancel Task is rendered and permission-gated but not wired — see
handover-backend.md 26.

## Our figures against the reference's

The reference's estate has collected nothing: Bundles Stored 0, Hosts Covered
0/32, Storage 0 MB, Next Scheduled "—", and the Collected Logs grid is empty.
Ours has 600 bundles over 600 hosts, so the grid, the status filter and the
log-type filter are all exercised. Schedules is empty in both, because nothing
seeds one and nothing runs one.

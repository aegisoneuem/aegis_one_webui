# AEGIS Insight — restored against v129

Source of truth: `design-reference/Aegis-One-Console-v129.html`, the AEGIS
Insight workspace (page id `insight`).

|           |                                                                    |
| --------- | ------------------------------------------------------------------ |
| Reference | `screenshots/insight-v129.png`, `screenshots/insight-run-v129.png` |
| Restored  | `screenshots/insight.png`, `screenshots/insight-run.png`           |

## What was there before

An estate-wide findings list: five or six cards reading "N vulnerabilities
with known exploits are open on M endpoints", each with a button that opened
another page filtered. It was a second Overview, not a diagnostic tool, and it
answered a question no one on this page is asking.

The approved page diagnoses **one endpoint** from a problem description.

## What the page is now

The reference's two-column split, with three states on the right.

**Left — Describe the Problem**: the endpoint line (hostname as a link, then
user, OS and DEX score), a four-row textarea, and **Run Diagnostics** /
**Save Diagnostic Template**.

**Right**:

| State   | Form                                                                  |
| ------- | --------------------------------------------------------------------- |
| Idle    | a plain bordered box reading "No Diagnosis Yet"                       |
| Running | a skeleton under the reference's "Collecting telemetry …" line        |
| Result  | the root-cause banner, then Diagnostic Checks and Recommended Actions |

The root cause sits on the near-black card under a gold rule, with the
confidence percentage in gold at the right. Below it, the checks panel lists
findings worst-first — one line each, name and severity — and the actions
panel lists what to do, each with what it should achieve, over **Run
Remediation** and **Review**.

## The contract already described it

The eleventh page in a row. `POST /insight/diagnostics` was declared, taking a
description and a device id and returning an `InsightRun` with `checks` and
`recommendations`; `GET`/`POST /insight/templates` and
`POST /insight/diagnostics/{runId}/remediation` were declared too. None of the
four was served.

What the server did serve was `GET /insight` — an estate-wide findings
aggregate the contract does not mention — and the page read that. It has been
deleted, as `/sites` was before it.

Three fields were added to the contract to carry what the reference prints and
the declared shape could not: `InsightRun.device` (the endpoint context line),
`InsightRun.rootCause` (summary and confidence), `checks[].severity` and
`recommendations[].expected`.

## The one deliberate difference, stated plainly

**v129 hard-codes its diagnosis.** In the reference bundle, the root cause
`"High Memory Pressure + Low Disk Space + Application Instability"` and the
`"91%"` beside it are string literals, as are the five check rows and three
recommendations. The preview shows the same answer for every endpoint and
every description.

Here the answer is computed. Ten checks read the endpoint's own stored
measures — memory, CPU, boot time, free disk, benchmark failures, open
critical findings, outstanding updates, pending restart, endpoint protection
and disk encryption. The root cause is the three worst findings named
together, and the confidence is how far they agree:

```
confidence = min(94, sum of each finding's severity weight)
             critical 34 · high 24 · medium 13 · low 5
```

It is capped at 94 because a correlation across ten measures is not
certainty, and an endpoint with nothing wrong gets **no** root cause rather
than being told it has high memory pressure. A contract assertion checks that
the root cause only ever names checks that actually failed.

The description steers which family of checks is weighted, through the
keywords in `FAMILY_WORDS` — "slow" and "boot" raise the performance checks,
"crash" the stability ones, "update" the patch ones. It does not invent a
finding the measures do not support.

## What the data says

The estate's worst-scoring endpoint is `PUN-SRV-0098`, a Windows Server 2019
at DEX 40, and the default diagnosis reads **Memory Pressure + CPU Pressure +
Startup Applications** at 94% with seven findings and four actions. Seven of
ten checks failing on one endpoint is a lot; that is what the measures say.

Two honest notes on the fixture rather than the page:

- **There are no laptops.** Every device's `chassis` is `Desktop` or `Rack`,
  so the reference's default description — "User reports that the laptop is
  slow …", kept verbatim — can never match the endpoint it is diagnosing. The
  wording is the reference's; the gap is the fixture's.
- **The default endpoint is a server.** The page opens on the worst-scoring
  endpoint, which a service desk is most likely to be asked about, and the
  contract has no parameter for excluding servers from `/devices`. A real
  deployment reaches this page from a device row, with `?device=` set.

## What is not restored

- **No saved-description picker.** v129 has **Save Diagnostic Template** but
  no way to load one back, so the restored page has none either. The
  templates are stored and `GET /insight/templates` serves them — three are
  seeded — but nothing in the approved layout reads them. See handover
  question 50.
- **No per-check detail line.** The server computes one ("Memory is at 80%")
  and the contract declares `detail`, but the reference's rows are a name and
  a severity on one line. The detail is carried as the row's `title` so it is
  available without changing the visual. See handover question 51.
- **No passing checks in the list.** The reference's panel lists findings, not
  a checklist. Three checks passing on the default endpoint are not printed.
  See handover question 51.

## Verification

Recorded in the commit message. ZAP has not been re-run since the Overview
work.

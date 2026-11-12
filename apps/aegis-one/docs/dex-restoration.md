# Digital Employee Experience — restored against v129

Source of truth: `design-reference/Aegis-One-Console-v129.html`, the Device
Experience workspace (page id `dex`).

|                     |                                   |
| ------------------- | --------------------------------- |
| Reference           | `screenshots/dex-v129.png`        |
| Reference, selected | `screenshots/dex-v129-picked.png` |
| Restored            | `screenshots/dex.png`             |
| Restored, selected  | `screenshots/dex-picked.png`      |

## What was there before

A page called "DEX" with four tiles, a **Score by department** bar chart, a
score-distribution pie and a table of the lowest-scoring endpoints showing
Aegis Zone, Department, Score, Disk free and Memory — where "Memory" was the
machine's installed RAM in gigabytes, not its memory pressure.

None of that is the approved page. The reference has no department breakdown
at all. What it does have — and the old page did not — is the whole reason the
page exists: the three measures the score is made of, the thresholds it is
scored against, and, for any endpoint you pick, the arithmetic that produced
its number.

Behind it, `dex_score` was a random integer: `78 + rng.int(-28, 20)`, nudged
down if the disk was nearly full. There was nothing to explain, because there
was nothing the score was made of.

## What the page is now

A head with the title and **Investigate in Live Activity**, then:

**Four counters** — the Experience Score leading on a dark card under a gold
rule with the estate it averages over, then Good, Warning and Poor with the
share of endpoints each holds.

**Three figures**, in the reference's own order:

| Figure                | Form                                                     |
| --------------------- | -------------------------------------------------------- |
| Distribution          | donut over the three bands, the score at its centre      |
| Score Breakdown       | four columns — Boot, CPU, Memory, Disk                   |
| Top Experience Issues | four columns, each labelled with the threshold behind it |

**Two panels side by side.** On the left, **Endpoints With the Lowest Scores**:
Computer, Score, Boot, CPU, Memory, Disk free, worst first, ten rows. On the
right, **How the Score Works** — the ten-row scoring table, Measure /
Threshold / Points — until a row is picked, at which point it becomes **Why is
&lt;name&gt; scored &lt;n&gt;?** with that endpoint's own penalties, each
against the measure that caused it, and the two actions the reference offers:
Open Device and Collect Logs.

## The contract already described all of it

The eighth page in a row. `DexSummary` was declared with `score`,
`distribution`, `breakdown`, `topIssues` and `method` — which is the four
counters, the three figures and the scoring table, named. `DexDevicePage`
declared `deviceId`, `name`, `score`, `bootSeconds`, `cpuPct`, `memoryPct` and
`diskFreePct` — the lowest-scores table's six columns exactly.

Neither `/dex/summary` nor `/dex/devices` was served. The server served `/dex`,
a shape with `byDepartment` and `byZone` that the contract does not mention,
and the page read that.

## The three measures were missing from the fixture

`devices` carried a CPU **model string**, an installed **RAM capacity** and a
disk-free percentage. Processor load, memory pressure and boot time — the
three things the score is actually made of — did not exist. They are now
columns of their own, and `dex_score` is computed from them with the
reference's own formula rather than drawn at random.

The measures are spread from each device's own row through a multiplicative
hash rather than taken from the seed's random stream. A first attempt used
`rowid % n`, which is periodic: it put exactly 6% of the estate in every
bucket and made the three measures correlate. Mixing each with its own salt
through a large prime fixed both.

## Additive schema changes

One, additive; nothing was removed or renamed in the contract.

- **`DexDevicePage`** items gained `os` and `site` (the reference prints
  "os · location" under the computer name), `band`, and `penalties` — a list
  of `{reason, points}`, which is what the right-hand panel lays out. The
  penalties ride on the row the table already fetched, so picking a row costs
  no request, exactly as the reference computes them from the row in hand.

## Judgement calls

One, recorded in `decisions.md`:

- **D-042** — the experience score is derived from its measures, not seeded.
  The page publishes the thresholds and then shows, per endpoint, what was
  lost against each one. A score that cannot be taken apart is a score nobody
  trusts, and a random score cannot be taken apart at all. `dex_score` is
  still stored, because the estate is ranked by it, but it is computed once
  from the three measures — the same arrangement as the configuration
  roll-up (D-039) and for the same reason.

## Where the reference was not followed

**The reference draws two of its bars in violet** (`#7C5CE0`): the CPU column
in Score Breakdown and the Memory Pressure column in Top Experience Issues.
The brief's hard rules forbid purple, indigo and violet outright. The rule is
unconditional and the reference's own use of the colour does not change it, so
both bars take the deep navy here, which keeps them distinct from the blue
beside them. Every other colour on the page is the reference's: the blue, the
teal, the gold, and the red/amber/green of the bands.

This is the one place in eight pages where restoring the design exactly and
the hard rules point in different directions. It is flagged rather than
quietly resolved.

## One honest wrinkle

**A band cap is a ceiling, not a deduction.** An endpoint whose boot takes 134
seconds loses 20 points but scores 55, because the Poor band caps it — so the
panel can show a single −20 beside a score of 55 and look like it cannot add
up. The reference has the same behaviour and says nothing about it. The
restored panel adds one line, "Capped at 55 by the Poor band", whenever a cap
is what set the figure. That is a deliberate addition, not a deviation from
the layout.

## What is not restored

- **The drill-through from the figures.** In the reference every bar, slice
  and band counter opens the Devices page filtered to exactly those endpoints,
  through an in-page drill overlay (`axDrill`). This console has no
  equivalent: its Devices grid filters on device fields, not on an arbitrary
  list of ids, and the contract declares no way to pass one. The counters and
  bars are therefore not clickable here — which is the one thing on this page
  I would most like back, and is raised as handover question 39.
- **Nothing else.** The layout, the five panel titles, both grids' columns,
  the scoring table, the penalty panel and both of its actions are all
  present.

## Geometry read back from the reference

The counters follow the reference's four-card strip on a 14px gap with the
score leading on the near-black card under a 3px gold rule; the panels take
the same 18px/20px padding and 3px gold title rule as the rest of the restored
console, and both grids take the near-black header band with gold uppercase
labels that this console's other restored grids use.

## Verification

Recorded in the commit message. ZAP has not been re-run since the Overview
work.

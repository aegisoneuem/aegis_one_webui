# Licensing — restored against v129

Source of truth: `design-reference/Aegis-One-Console-v129.html`, the Licensing
workspace (page id `licensing`).

|           |                                  |
| --------- | -------------------------------- |
| Reference | `screenshots/licensing-v129.png` |
| Restored  | `screenshots/licensing.png`      |

## What was there before

A four-row table of licensed products — Endpoint Management, Vulnerability
Management, Digital Experience, AEGIS Insight — each with its own entitlement,
consumption, expiry and support tier.

That shape cannot answer either question the approved page leads with: **which
plan is this**, and **how many days until it renews**. Four products with four
expiries have no single term, and no plan at all.

## What the page is now

**Four counters**, the first on the dark card under a gold rule: Plan,
Endpoints in Use, Renews in, Modules.

**Three panels**: Seat Usage (a donut over In Use / Available / Licensed
Seats), Seats by Platform (a column per platform), License Term (a donut of
days left over Started / Ends / Term Elapsed).

**A Modules panel** with a card per module: its name, how it is licensed, and
whether it counts against seats.

## The contract described it exactly

The fifteenth page in a row. `GET /licensing` was declared as a single
`License` with `plan`, `seats` (including `byPlatform`), `term` and `modules`
— which is the four counters and the three panels, field for field. The
server served `{ items: [...] }` instead, a shape the contract does not
mention. `PUT /licensing/file`, the Upload License button, was not served at
all.

Two changes were needed for the module cards, which print more than a boolean:

- **`tier`** — `included`, `add-on` or `preview`, which is the card's second
  line. `enabled: boolean` could not say that a module is offered as a
  preview rather than simply off.
- **`countsAgainstSeats`** — the card's "Not Counted in Licensed Seats" line.

## Every figure is counted, not stored

Seats in use is the number of enrolled endpoints, and the platform split is
those endpoints grouped. A licence page whose seat count disagreed with the
Devices page would be worse than no licence page, so a contract assertion
requires the two to match exactly.

**The platform split revealed a gap.** The estate runs five OS families —
Windows, Windows Server, macOS, Linux and **AIX on 455 endpoints** — while the
contract's `byPlatform` had exactly three keys and `additionalProperties:
false`. Those 455 seats had nowhere to go, so the split would not have added
up to the total. `byPlatform` now carries `other`, Windows Server counts as
Windows, and an assertion checks the four add up to `inUse`. The page draws a
fourth column only where something outside the three is licensed, so an estate
like the reference's still shows three.

## Days remaining are counted from the server's clock

`License` carries `asOf`. Two administrators in different time zones must not
see different days remaining from the same agreement, so the arithmetic runs
against the instant the server read the licence. Recorded as D-057.

## The licence has headroom, deliberately

Seats are sized at 110% of the estate: 55,000 against 50,000 endpoints, 91%
used. A licence with exactly as many seats as endpoints has nothing left to
show, and this page exists to show how much is left — a donut reading 100%
says nothing.

## What the data says

Premium plan, 50,000 of 55,000 seats in use, 138 days to renewal, six of seven
modules active. The seventh is AEGIS Insight, offered as a preview and not
counted against seats — which is both what the reference shows and consistent
with how that page is badged everywhere else in the console.

## What is not restored

- **Module glyphs.** The reference prints a product icon on each module card.
  Those are drawings rather than data and are not in the repository, so the
  card carries a plain tile in the same place. The same finding as the vendor
  logos on Integrations and Administration.
- **Upload License opens no file picker.** The button is present and
  permission-gated, and `PUT /licensing/file` is served — but it refuses
  everything, because the contract says the signature is verified server-side
  and this fixture has no issuer key. A dialog that accepted a file and then
  always failed would be worse than a button that says so. See handover
  question 65.

## Verification

Recorded in the commit message. ZAP has not been re-run since the Overview
work.

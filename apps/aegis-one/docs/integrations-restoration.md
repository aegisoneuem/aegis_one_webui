# Integrations — restored against v129

Source of truth: `design-reference/Aegis-One-Console-v129.html`, the
Integrations workspace (page id `integrations`).

| Tab           | Reference                                         | Restored                                     |
| ------------- | ------------------------------------------------- | -------------------------------------------- |
| Connectors    | `screenshots/integrations-connectors-v129.png`    | `screenshots/integrations-connectors.png`    |
| SIEM & Syslog | `screenshots/integrations-siem-syslog-v129.png`   | `screenshots/integrations-siem.png`          |
| Notifications | `screenshots/integrations-notifications-v129.png` | `screenshots/integrations-notifications.png` |
| Delivery Log  | `screenshots/integrations-delivery-log-v129.png`  | `screenshots/integrations-log.png`           |

## What was there before

A `ResourceList` over `/integrations` with five columns — Integration, Kind,
Status, Events (24 h), Last event — reading a flat table of eight rows. No
tabs, no cards, no counters, no alert rules, no delivery log.

That table could only ever print a name and a number, because it had nothing
else in it. The approved page shows **four different kinds of thing**, and
none of them is a row in one table.

## What the page is now

Four tabs, as the reference has them.

**Connectors** — a `+ Custom Webhook` button, a status filter (All /
Connected / Attention / Disabled) and a three-column card grid. Each card
prints a monogram and name, a status, what the connector is for, then Last
Sync and Scope, over **Configure** and a `⋯` menu holding Test and Activity.
The reference's own six: ServiceNow, Splunk, Microsoft Teams, Slack, Custom
Webhook, Directory Connector.

**SIEM & Syslog** — four counters (Connected n/5, Events Forwarded, Retrying,
Errors) over five destination cards, each with its transport, status, an
Events / Last Sent / Rate meta row and **Set Up** / **Test**. Then the
reference's footnote about the server vault.

**Notifications** — five channel cards in the same form, then an **Alert
Rules** panel: an Event select, a Channel select, **Add Rule**, and a table of
When / Send To / Channel Status / Enabled with an On–Off toggle and Remove.

**Delivery Log** — a search box and Connector / Event Type / Result filters
over a Time / Connector / Event Type / Event / Result table.

## The contract described two thirds of it

The twelfth page in a row whose endpoints were declared and never served. Six
existed — connectors (list, create, configure, test), `siem`, `notifications`
and `deliveries` — and the server served none of them. What it served instead
was `GET /integrations`, a flat lister the contract does not mention, which
the page read. That is now deleted, as `/sites` and `GET /insight` were.

The other third had to be added, because the reference has buttons the
contract had no route for:

| Added                                                    | Why                                                 |
| -------------------------------------------------------- | --------------------------------------------------- |
| `PUT`/`POST test` on `/integrations/siem/{id}`           | the Set Up and Test buttons on every SIEM card      |
| `/integrations/channels` + `{id}` + `test`               | the five Notifications cards had no endpoint at all |
| `POST`/`PATCH`/`DELETE` on `/notifications`              | Add Rule, the On–Off toggle and Remove              |
| `q`, `connector`, `eventType`, `result` on `/deliveries` | the log's own four filters                          |

And four schemas grew to carry what the cards print: `Connector` gained
`purpose`, `scope` and the reference's `attention` and `disabled` states;
`SiemDestination` gained `transport`, `status`, `eventTypes`, `lastSentAt`
and `ratePerHour`; `DeliveryAttempt` gained `eventType`.

**One declared field changed shape.** `NotificationRule.channel` was a single
string; the reference's Send To column lists two channels for two of its four
rules, and Channel Status lists a state for each. It is now `channels`, an
array of `{id, name, status}`. Nothing served or read the old shape, so
nothing broke — but it is a change to a declared schema, not an addition.

## What the reference does not settle, and what was decided

v129's Connectors tab shows six working connectors, Splunk among them. Its
SIEM tab shows five "Not Configured" cards, `Connected 0/5`, and an empty
delivery log reading "Connect a SIEM or Syslog target to start forwarding".
Those two tabs contradict each other: Splunk cannot be a connected connector
and an unconfigured destination at once. The preview has nothing wired up —
it says so itself.

So the connectors and the four alert rules are the reference's, verbatim, and
the destinations and channels those connectors imply are configured: two of
five destinations, three of five channels. The alternative was three tabs
that are blank for ever and a log that can never have a row — the same
mistake as hard-coding a diagnosis on AEGIS Insight. The empty state is still
there, and still reachable: filter the log to a destination that was never
set up. Recorded as D-048.

## Fixture changes

The flat `integrations` table is gone, replaced by `connectors`,
`siem_destinations`, `notification_channels`, `notification_rules`,
`notification_rule_channels` and `deliveries`. Its only real reader — the
Enrollment page's directory auto-enrol check, which counted connected
identity integrations — now reads `connectors`.

The delivery log is derived, not drawn: a multiplicative hash of the row
index decides each attempt's family, event name and outcome, so the mix is
stable across reseeds and does not shift any other fixture's random stream.
It keeps one row in forty of the stored hourly rate — 1,061 attempts rather
than the 29,832 a full day at Splunk's rate would be.

## What the data says

Two of five SIEM destinations and three of five channels are configured;
1,061 attempts are logged, of which 50 are retrying and 21 failed. That is a
93 / 5 / 2 split, which is a believable forwarding tail rather than a clean
sheet. Slack is a disabled connector and an unconfigured channel at the same
time — two different objects that happen to share a vendor, which the page
shows honestly rather than reconciling.

## What is not restored

- **Third-party brand logos.** v129's Connectors cards carry the ServiceNow,
  Splunk, Teams, Slack and Entra marks. Those assets are not in this
  repository, and the brief forbids redrawing a logo. The monogram tile the
  reference itself uses on its SIEM and Notifications cards is used on all
  three tabs instead. See handover question 54.
- **Configure and Set Up open nothing.** Both buttons are present and
  permission-gated, and the routes behind them are served, but the reference
  gives no dialog to copy — it is a preview, and its buttons do nothing
  either. See handover question 55.
- **Export on the Delivery Log is disabled.** The reference has the button;
  the contract has no export route for deliveries, and inventing one would be
  inventing API behaviour. See handover question 56.
- **Relative times read as dates.** The fixture's "now" is frozen at
  2026-11-01 (`docs/seed.md`), so every "2 min ago" in the reference reads as
  "01 Nov 2026" once the seed is more than a week old. This is estate-wide,
  not specific to this page. See handover question 57.

## Verification

Recorded in the commit message. ZAP has not been re-run since the Overview
work.

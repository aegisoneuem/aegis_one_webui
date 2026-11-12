# Administration — restored against v129

Source of truth: `design-reference/Aegis-One-Console-v129.html`, the
Administration workspace (page id `admin`).

| Tab                    | Reference                                        | Restored                                    |
| ---------------------- | ------------------------------------------------ | ------------------------------------------- |
| Identity & SSO         | `screenshots/administration-sso-v129.png`        | `screenshots/administration-sso.png`        |
| Users                  | `screenshots/administration-users-v129.png`      | `screenshots/administration-users.png`      |
| Roles & Content Access | `screenshots/administration-roles-v129.png`      | `screenshots/administration-roles.png`      |
| Agent Enrollment       | `screenshots/administration-enrollment-v129.png` | `screenshots/administration-enrollment.png` |

## What was there before

Four tabs — but not the reference's four. **Users**, **Roles & content
access**, **Identity & SSO** and **API access**, in that order. The approved
page has **Identity & SSO**, **Users**, **Roles & Content Access** and **Agent
Enrollment**.

Of the three that overlap:

- **Identity & SSO** was two paragraphs of prose about how the console's own
  sign-in works. The reference prints four provider cards.
- **Roles & content access** printed one of the three content scopes the
  reference prints, as a footer line reading "Scoped to 1 zone(s)".
- **Users** was a six-column `ResourceList` where the reference has four
  columns and two row actions.

## What the page is now

Four tabs in the reference's order.

**Identity & SSO** — a two-column grid of four provider cards: Okta, Microsoft
Entra ID, Generic SAML 2.0, LDAP / Active Directory. Each prints a protocol
tile, the name over its descriptive line, then **STATUS** and **CONNECTION** as
two labelled fields, over **Configure**.

**Users** — `+ Add user`, then User / Role / Access / Actions, with the name
over the email, **Edit Access** and a `⋯` holding Revoke Sessions.

**Roles & Content Access** — `+ Create role`, then a card per role: the name
with System or Scoped Role, a chip per resource with its verbs beside it, then
**Endpoint Zones**, **Software Content** and **Device Groups**, over **Edit
Permissions** — disabled on a built-in role, as the contract says.

**Agent Enrollment** — `+ Register endpoint`, then Endpoint / Zone / Agent
Version / Last Seen / Connection.

## Four hidden strings stay hidden

The reference's markup carries four strings with `display: none`: the page
subtitle ("Identity, scoped permissions and trusted console access."), a
"Configuration Preview" badge, a footer line on every provider card ("Only
Pre-Authorized Users Can Sign in"), and a count line on the Users tab ("1
accounts · explicit role assignments"). None of them renders, so none of them
is on the restored page — the same finding as Peer Cache's hidden subtitle,
and checked the same way rather than inferred from a screenshot.

## The contract described all four tabs

The fourteenth page in a row. Eight operations were declared across
`/admin/identity-providers`, `/admin/users`, `/admin/roles` and
`/admin/agent-enrollment`. Two of the eight were served, both in forms that
did not match: a flat `users` lister with `status` and `lastSignInAt` where
the contract declares `disabled` and `lastSignIn`, and a roles aggregate
missing `softwareCategories` and `groupIds` — two of the three scopes the
approved card prints.

`RoleInput` already declared all three scope lists. The design was in the
contract; the server was serving two thirds of one card.

Three fields were added to carry what the cards print: `IdentityProvider`
gained `description` and `enabled` (the card's STATUS, separate from
CONNECTION), `User` gained `zoneIds`, and `RoleDef` gained `userCount`.

**The token path was wrong.** The contract declares `/admin/api-tokens`; the
server served `/admin/tokens`. Both the list and the two write routes now sit
at the declared path.

## The API access tab: removed, then restored on instruction

v129 has no API-token surface — not on this page, not on any of its nineteen.
The restoration therefore removed the API access tab, leaving four, and
deleted the `admin/api-access` sub-route.

That left **nothing in the console able to revoke a token**: a real reduction
against the previous build, since the endpoints were still served but
unreachable, and a leaked token could only be retired through the API. The
question was put to the owner, who said to add it back.

So **API access is a fifth tab**, and it is a deliberate departure from the
approved design rather than an oversight. It lists Token / Prefix / Scopes /
State / Last used / Expires / Created by with a Revoke action, creates a token
through a dialog that shows the secret once, and confirms revocation before
acting. The `admin/api-access` sub-route stays deleted — the tab is reachable
at `?tab=tokens` like every other tab on the page, and a second URL for the
same view was only ever a duplicate.

### Two more contract defects this tab found

Restoring it against the declared contract — rather than the path the old page
used — surfaced two further mismatches, both of which had been invisible
because the old page was calling an undeclared path:

- **`expiresAt` was required on `ApiTokenInput`.** The old create flow never
  sent it, so "Create token" would have returned HTTP 400 against the declared
  schema. A token with no expiry is a credential nobody retires, so rather
  than making the caller always state one, the field is now optional and the
  server applies a documented default of one year.
- **`GET /admin/api-tokens` declared a bare array.** The server returns the
  same `{items, page}` envelope every other lister returns, and the page reads
  it. The contract now declares `ApiTokenPage`, with the cursor, limit and
  search parameters the lister already honours.

## Agent Enrollment reads the device list

The reference's table is a roster of endpoints with their agent and connection
state. That is the declared `/devices` list narrowed to five columns, so the
tab reads it rather than inventing a second source of truth for the same rows.
The declared `/admin/agent-enrollment` settings object is served too, because
it is declared — but no approved surface exposes it. See handover question 61.

## A contract-level bug this page found

`GET /devices?sort=-lastSeenAt` returned **400**. The contract states the
descending form plainly — "Column id, prefix with - for descending. Example:
-lastSeen." — and the shared query builder only ever read a separate `order`
parameter, so the declared form was refused for every list endpoint in the
console. The Agent Enrollment tab was simply the first caller to use it.

The builder now honours both: the declared `-` prefix, because the contract is
the source of truth, and `order`, because every existing page sends it. Two
contract assertions cover it. Recorded as D-052.

## What the data says

All four identity providers are switched off and unconfigured, which is both
what the reference shows and what is true: the console's own sign-in is the
built-in OIDC provider in `@aegis/mock-core`, and marking Okta "Connected"
would claim a federation that does not exist.

Eight console accounts, one disabled — and the disabled one is the only
account with no second factor enrolled, which is why it is disabled. Six
roles, of which one (Jaipur Branch Operator) is narrowed on both zones and
software categories, so at least one card shows the scoping doing something
rather than reading "All" three times. A contract assertion requires that.

## What is not restored

- **Vendor logos.** The reference's provider cards carry the Okta, Microsoft
  and LDAP marks. Those assets are not in this repository and are not ours to
  redraw, so the protocol — SAML, OIDC, LDAP — is set in the same tile. Same
  finding as Integrations, handover question 54.
- **Configure, Add user, Create role, Edit Access and Register endpoint open
  nothing.** All five are present and permission-gated, with their routes
  served behind them; the reference's own buttons open nothing, so there is no
  approved form to restore. See handover question 62.

## Verification

Recorded in the commit message. ZAP has not been re-run since the Overview
work.

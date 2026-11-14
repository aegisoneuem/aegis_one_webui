# Enrollment — restored against v129

Source of truth: `design-reference/Aegis-One-Console-v129.html`, Enrollment page.

|               |                                             |
| ------------- | ------------------------------------------- |
| Reference     | `screenshots/enrollment-v129-reference.png` |
| Restored      | `screenshots/enrollment.png`                |
| Linux command | `screenshots/enrollment-linux.png`          |

## What the page is now

Four counters, then a 59/41 split of **Enrollment Methods** beside **Enrolled
by Platform**, then the **Install Command** panel, then the token grid.

Ours was a page header, two paragraphs of prose in cards, and a nine-column
token table. The counters, the methods, the platform chart and the install
command were all absent; the prose was written here rather than read from the
reference.

Each counter carries a caption, which is what makes it readable: `50,000` over
_45,138 Online Now_, `30,878 /50,000` over _Agent 7.4.2_, `3` over _5 total_,
and `1,292` in amber over _Not seen for 7+ days_.

Geometry from the reference: 84px counters, a 20px gutter on the split,
panels whose titles carry a 3px gold rule down the left edge, a 176px plot
over a hairline axis, a 42px segmented control, a dark 12.5px monospace code
block, and 44px grid rows over the 41px header band.

## The install command keeps its placeholders

`<ENROLLMENT_TOKEN>` and `<CONSOLE_HOST>` stay placeholders on every platform,
exactly as the reference prints them, and the caption underneath says why:
_never paste real tokens into tickets or chat_. A console that substituted a
real token here would put a working credential on the screen people screenshot.

The three commands are the reference's own, read out of it rather than
written: `msiexec` for Windows, `installer -pkg` plus `aegis enroll` for macOS,
and `curl`/`dpkg` plus `aegis enroll` for Linux. There is an e2e test that the
rendered command never contains a token prefix.

## The contract described most of it, and needed one addition

`EnrollmentSummary` already had `enrolled`, `onLatestAgent`, `activeTokens`,
`notCheckingIn`, `byPlatform` and `installCommands` — the four counters, the
chart and the code block. `EnrollmentToken` already had `targetGroup` and a
`status` of `active | expired | revoked`, which is the approved grid exactly.

The server served none of it. `/enrollment/summary` was declared and unserved.
`/enrollment/tokens` went through the generic lister and returned
`platform`, `zoneId`, `prefix`, `createdBy` and `revokedAt` — four of which the
contract does not declare — while carrying neither `targetGroup` nor `status`.

### What was added, and why

Four fields on `EnrollmentSummary`, all of them to make a caption real rather
than invented:

| Field                | Caption it serves            |
| -------------------- | ---------------------------- |
| `online`             | "45,138 Online Now"          |
| `latestAgentVersion` | "Agent 7.4.2"                |
| `totalTokens`        | "5 total"                    |
| `methods`            | the Enrollment Methods panel |

`methods` is the one substantial addition: four named ways in, each with a
state of `ready | configured | available | not-configured`. Only one of the
four is a fact about this estate — **Directory Auto-Enroll** reads `configured`
when an identity integration is connected, and `not-configured` otherwise. The
other three are fixed, and the route says so in a comment: the installer always
works, imaging is a documented path with nothing to configure, and nothing
accepts a serial-number CSV. See decisions.md D-032.

### `/enrollment/tokens` is a bare array

The contract returns an array, not a page, so both enrollment endpoints have
their own route rather than going through the generic lister. The route
projects exactly the contract's eight fields; the token prefix, its hash, the
platform and the creating user never leave the server.

`status` is derived in SQL — revoked beats expired beats active — rather than
stored, so a token that lapses between two requests reports correctly without
anything having to write to it.

## Our tokens against the reference's

The reference's three tokens have all expired, which leaves its Active Tokens
counter reading zero and never exercises the other two states. Ours carries
three active, one expired and one revoked, each pointing at a group that
exists — Windows Workstations, macOS Fleet, Linux Endpoints, Windows 10 and
Pilot Ring.

## Present in v129, not in the restored build

| Missing        | Why                                                                                                                   |
| -------------- | --------------------------------------------------------------------------------------------------------------------- |
| `Create Token` | `POST /enrollment/tokens` is declared and unserved, and there is no form. Rendered, permission-gated.                 |
| Revoke         | `DELETE /enrollment/tokens/{tokenId}` is declared and unserved. The grid's last column is empty in the reference too. |
| Panel icons    | Each panel title in v129 carries a small SVG glyph. The gold rule — the distinctive part — is kept.                   |

## One figure that does not add up

`byPlatform` has three keys: windows, macos, linux. This estate also runs AIX,
so the three bars total 43,008 against 50,000 enrolled. The reference's own
estate is Windows/macOS/Linux only, so the question never arose there. The
chart is correct for what it declares; whether it should carry an "other"
bucket or a fourth key is a contract question — handover question 20.

# Device Groups — restored against v129

Source of truth: `design-reference/Aegis-One-Console-v129.html`, Device Groups page.

|             |                                         |
| ----------- | --------------------------------------- |
| Reference   | `screenshots/groups-v129-reference.png` |
| Restored    | `screenshots/groups.png`                |
| History tab | `screenshots/groups-history.png`        |

## What the page is now

A master–detail, not a list. Four estate counters across the top, a group
tree down the left, and the selected group's detail filling the rest: five
figures, seven tabs, and a member grid with its own segmented filter.

Ours was a six-column table of flat groups. The tree, the figures, the tabs
and the members were all absent, and so was the hierarchy they hang off.

### The tree

Roots in the order the fixture defines them — a platform tree, two more
platform groups, one tree per major zone, a static ring and a posture group —
each with its children indented beneath it. A row carries the group's name, a
one-letter kind badge (**D** dynamic, **S** static) and its member count. The
selected row is inverted with the sidebar's gold rule.

Searching the tree matches on name and then widens the match to the ancestors
of everything it hit, so a matched child is still drawn under its parent
rather than floating at the root.

### The detail pane

Five figures — Members, Online, Offline, Missing Patches, Sub-Groups — over
seven tabs. The Members grid repeats the first four as a segmented filter, and
each one narrows the query rather than hiding rows already fetched.

Geometry from the reference: a 300px tree beside the pane with a 16px gutter,
84px estate counters, a 74px five-column figure strip, 52px tabs with gold
count chips, a 44px segmented filter, 65px grid rows over the 41px header
band, and a 320px member search.

## The contract already described all of it

`Group` is a tree node with its figures: `parentId`, `members`, `online`,
`offline`, `missingPatches`, `subGroups`, and `kind: static | dynamic`.
`GroupsSummary` is the four estate counters. `GroupDetail` adds `rule`,
`policies` and `history`. `GET /groups/{id}/members` returns a `DevicePage`.

The server had none of it. `device_groups` was flat, with a `kind` of
`rule | static` the contract never declares and a `member_count` that was a
number in the fixture rather than a count of anything. `GET /groups/{id}` and
`GET /groups/{id}/members` were declared and unserved.

No contract changes were needed. That is the third page in a row.

### Membership is now real

This is the substantial change. Every group carries a SQL predicate, evaluated
once at seed time into a `group_members` table, and the five figures are
counted from it. Three things that used to disagree now cannot:

- the member grid and the figures above it read the same rows;
- `/groups/{id}/members` pages real devices instead of 404ing;
- a deployment targeting a group resolves to the devices in it. `resolveTargets`
  previously carried the comment _"Groups are fixture metadata rather than
  materialised membership"_ and resolved a group target to nothing at all.

About 250,000 membership rows for sixteen groups over 50,000 devices. The
rollup is five correlated subqueries in one `UPDATE`, which SQLite runs over
sixteen rows — the alternative is sixteen passes over the join for the same
answer.

### `/groups` is not a page

The contract's `GET /groups` returns `{ items, summary }` with no cursor,
because a tree paged halfway through is a tree with its branches cut off. It
therefore has its own route rather than going through the generic resource
lister, which would have added a `page` the schema forbids.

`GET /groups/{id}/members` composes two constraints into the one scope slot
`listRows` takes — the group's membership and the caller's zones — so a
zone-scoped user asking for a group they can see still gets only the members
inside their own zones.

## Present in v129, not in the restored build

| Missing                    | Why                                                                                                                                           |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Patches** tab            | No endpoint aggregates patches for a group. Rendered disabled rather than filled with something invented. Handover question 16.               |
| **Software** tab           | Same: no per-group software aggregate exists. Handover question 16.                                                                           |
| **Manage / Exempt** column | The reference's member grid ends with an Exempt action. Nothing in the contract expresses a per-device patch exemption. Handover question 17. |
| `Create Group`             | `POST /groups` is declared and unserved, and there is no form. Rendered and permission-gated.                                                 |
| `Add Sub-Group`, `Edit`    | `PATCH /groups/{id}` is declared and unserved.                                                                                                |
| `Import CSV`               | `POST /groups/import` is declared, takes `text/csv`, and is unserved.                                                                         |
| `Directory Sync`           | `POST /groups/directory-sync` is declared, returns a `Job`, and is unserved.                                                                  |

Everything in that list is a write, and every one of them is declared in the
contract. They are rendered and disabled rather than hidden, because the
approved design shows them to everyone.

## Callers that had to move with it

`DeploymentWizard` and `LiveActivity` both fetched `/groups` as a page and read
`memberCount`. They now read the tree's `items` and `members`. The group
picker in both is unchanged otherwise.

## Our tree against the reference's

The reference's fixture has 9 groups, 7 sub-groups and 32 endpoints, all of
them grouped. Ours has the same 9 and 7 against 50,000 endpoints, of which
48,788 fall into at least one group and 1,212 into none. The subnet sub-groups
are real /24 predicates over this estate's `10.(20 + zoneIndex).x.y`
addressing, so they are small — tens of devices — rather than holding the
whole zone as the reference's do.

# Software Catalog — restored against v129

Source of truth: `design-reference/Aegis-One-Console-v129.html`, Software page.

|                |                                           |
| -------------- | ----------------------------------------- |
| Reference      | `screenshots/software-v129-reference.png` |
| Restored       | `screenshots/software.png`                |
| Draft packages | `screenshots/software-draft.png`          |

## What the page is now

Not a table. The approved Software page is a **card catalogue**: a heading with
three actions, five counters, a search-and-filter row, and a three-column grid
of package cards.

Each card carries the package's monogram or icon, its name and publisher, its
category, then a 2×2 block of Version, Platform, Package status and Installer,
and a footer with Deploy and an overflow menu. The geometry is the reference's
own: 18px padding, a 46px icon, 16px above the meta block, a 13px footer rule,
15px between cards.

A card is a **package definition**, not an installed title. That is why it
reads version, platform, draft-or-published and whether an installer has been
uploaded — and why Deploy is disabled until one has.

### The counters

All Packages · Installer Added · Installer Missing · Draft Packages ·
Publishers. The first four narrow the grid; Publishers is a fact about the
catalogue, not a way to filter it.

They describe the **whole catalogue** and do not move when the search or the
filters do, which is the reference's own behaviour: they are what an
administrator is working through. The line on the right of the toolbar —
"N of M packages" — is the one that follows the filter.

## Again: the contract already described this page

`SoftwarePackage` is the card, field for field: `version`, `platform`,
`installer: missing | added`, `state: draft | published`, `logoUrl`,
`installerSha256`, `silentInstallCommand`, `silentUninstallCommand`. And
`SoftwarePage.counts` is the five counters, named exactly as the reference
labels them.

The server carried none of it — `software` had title, publisher, category,
version, size and two install counts. All of it is seeded now, and `/software`
returns the `counts` envelope the contract declares.

No contract changes were needed for this page. That is the first time in four.

## Icons are imported, not shipped

v129's cards carry real vendor logos as embedded base64. Three things in the
reference say those are customer data rather than product assets: the header's
**Import Icons** action, the `.appicon` class that styles a lettered tile for
packages without one, and the contract's `logoUrl`, documented as a nullable
"same-origin path".

So every seeded package has `logoUrl: null`, the card renders a monogram tile,
and it uses the image the moment one is imported. Shipping the vendor logos
would be a licensing decision rather than a design one — see decisions.md
D-029.

## The catalogue's own state

The reference's fixture has all 200 packages in draft with no installer, which
leaves three of its five counters reading the same number. Ours mixes them —
about two thirds published with an installer — so both card states are visible
and the counters say something different from each other.

The installer state, its SHA-256 and the silent switches are derived from the
package's own id rather than from the shared random stream, so adding them did
not shift every value seeded after them. The silent switches are the vendors'
own documented ones: `/qn` for an MSI, `/VERYSILENT` for Inno Setup, `/S` for
NSIS.

Our catalogue is 32 titles against the reference's 200, and 27 publishers
against 150. The design renders either; the numbers are the fixture's.

## The whole console was round, and the reference is square

Every card, panel, tile, button, input, select and nav item in v129 computes to
`border-radius: 0`. The console's scale was 4px on controls and 11px on cards,
so every page restored so far had rounded corners the reference does not have.

`--ui-radius-sm/md/lg` are now zero. This changes Overview, Devices and
Patches, all already reviewed. See decisions.md D-028.

## Present in v129, not in the restored build

| Missing              | Why                                                                                                                                                                                                                                           |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `+ Add package` form | **Closed.** `POST /software` is served and the button opens a dialog for name, publisher, version and platform.                                                                                                                               |
| `Import Icons`       | **Still open.** No endpoint accepts an icon bundle and there is no asset store, so the button is disabled with a title saying why rather than wired to something invented. `logoUrl` is read, so the card uses an icon the moment one exists. |
| `Edit Package`       | **Closed.** `PATCH /software/{id}` is served and the action is back in the overflow menu, opening the same dialog prefilled. Changing the version drops the installer built for the old one, and the toast says so.                           |
| Vendor logos         | Customer data, not product assets — see above.                                                                                                                                                                                                |
| Installer upload     | `PUT /software/{id}/installer` is declared, takes a binary body, and is unserved. Nothing in the page offers it.                                                                                                                              |

## Library changes this needed

One, and it is small: `useListController` now exposes `envelope`, the fields an
endpoint returns beside `items` and `page`. The catalogue counters arrive in
the same response as the page of cards, and a second request for them would
have been a second scan of the same table.

`registerResourceRoutes` gained the matching `envelope` hook, so a resource can
declare what its page carries without a bespoke route.

## The package writes, closed

`POST /software`, `PATCH /software/{id}` and `DELETE /software/{id}` were all
declared and none was served — which is why Add and Edit were rendered and did
nothing. All three are served now, and three rules came out of serving them:

- **A new definition is a draft with no installer.** The card says "missing"
  rather than implying the package is ready to deploy, and Deploy stays
  disabled until a binary is attached.
- **Changing the version invalidates the installer.** The binary on file was
  built for the old version, and keeping its hash against a new one would
  claim an integrity check that was never made. The server drops it and the
  dialog says so before you save.
- **A package endpoints have installed cannot be deleted.** The inventory rows
  point at it, and removing the definition would leave the Devices page
  listing software nothing can describe. It is refused with HTTP 409 and the
  message suggests retiring it instead.

`GET /software/{id}` is served by the shared resource lister, which already
owned that path — registering a second one is how the new route file first
failed to boot.

### A naming mismatch this turned up

The contract's `SoftwarePackage` calls the fields `name` and `version`; the
list and detail the lister serves call them `title` and `latestVersion`. Both
are in use, so the page reads the catalogue's names and the write routes
accept the contract's. See handover question 68.

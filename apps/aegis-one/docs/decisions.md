# Decisions

Non-obvious choices, newest last. Each entry says what was decided, why, and what would change it.

## D-001 Greenfield monorepo, nothing inherited from Saleos One

The first brief assumed an existing Saleos One monorepo. None exists in this workspace (only a
single-file `Saleos-One-Console.html`). The revised brief makes Aegis One the first of three
consoles, so `packages/ui` and `packages/mock-core` are built here and kept brand-free.
Revisit if a Saleos One source tree turns up.

## D-002 pnpm 12, Vite 8, React 18, react-router 6, TanStack Table 9

Versions are whatever `pnpm add` resolved on 2026-11-01. React stays on 18 and Router on 6 because
the brief fixes them. `@tanstack/react-table` resolved to v9; if its API proves unstable against
`@tanstack/react-virtual` in Phase 2, pin to the latest v8.

## D-003 The `--ui-*` variable contract is the only coupling between a console and `packages/ui`

`packages/ui` CSS reads `--ui-*` custom properties with no fallbacks and no colour literals.
`apps/aegis-one/src/styles/tokens.css` maps the brand palette (`--brand`, `--gold`, ...) onto them.
A sibling console ships its own `tokens.css` with the same `--ui-*` names, which is what lets Saleos
One use a different palette without touching the library. No fallbacks means a missing token shows
up immediately instead of silently rendering a default colour.

## D-004 Layout primitives live in `packages/ui`, the shell lives in the app

`Sidebar`, `NavGroup`, `NavItem`, `Breadcrumb` and `PageHeader` are in the library. `AppShell`
(sidebar plus breadcrumb plus outlet, route-handle breadcrumbs, Alt+Left) stays in
`apps/aegis-one/src/layout` because it knows the nav table and the router. A top-nav sibling console
writes its own shell from the same primitives.

## D-005 Inter is self-hosted

`@fontsource-variable/inter` ships the font from the bundle. The CSP in Phase 3 forbids third-party
style and font origins, so a CDN link is not an option. Monospace uses the system stack
(`ui-monospace`, Menlo) as specified, nothing is downloaded.

## D-006 Icons: Phosphor

The reference build bundles Phosphor icons (`weights` prop on its icon components), so
`@phosphor-icons/react` keeps the visual vocabulary. Tree-shaken per icon.

## D-007 Brand mark

The reference's sidebar mark is a 256x194 brushed-bronze angular "A" PNG, extracted unchanged to
`src/assets/brand/aegis-mark.png`. It is an A-shaped glyph rather than a literal shield; kept as is
because the brief says to keep the mark exactly. `aegis-mark.svg` is a vector trace of that PNG
(potrace, one path) filled with a gradient built from `--brand-deep`, `--brand` and `--gold`.
It is a trace, not the original artwork; replace it if the design team holds the master file.
`aegis-one-lockup.svg` sets the wordmark as live text in Inter; outline the text before using it
outside the console.

## D-008 Route skeleton shows an outline, not placeholder copy

Phase 1 pages render the sections, tabs and actions the feature inventory lists for that page. This
is scaffolding that Phase 4 deletes, and it is the real content list, not lorem ipsum.

## D-009 Sub-routes

`/devices/:deviceId[/:tab]`, `/deployments/new[/:step]`, `/deployments/created/:id`,
`/deployments/:id`, `/admin/api-access`, `/reports/custom`. Static segments are declared before
`:deploymentId` so `new` and `created` are never read as ids. Wizard step slugs follow the brief
(content, targets, schedule, network, options, review); see Open Questions in the feature inventory
for how this differs from the reference build.

## D-010 API contract conventions

- Redirect-only operations (`/auth/oidc/*`) have no 2xx response, hence `operation-2xx-response` is
  off in `redocly.yaml`. Static siblings of `/devices/{deviceId}` (`columns`, `summary`, `views`,
  `export`) trip `no-ambiguous-paths`; routers match static segments first, so it is off too.
- `additionalProperties: false` on every request body so the server can reject unknown fields
  (mass assignment). Response schemas are closed as well, so the Go side cannot drift silently.
- Secrets (`secret`, `clientSecret`) are `writeOnly` or returned exactly once on creation.
- `x-required-permission` on every operation and an `x-roles` matrix at the document root. The
  matrix is a first proposal for review; it contains no remote-control permission.
- Remote script execution is `liveops/script-jobs`: submit, poll, list per-endpoint results. No
  stream, socket or session resource exists.

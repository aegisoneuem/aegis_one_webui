# @aegis/ui

Brand-agnostic component library. No brand names, logos or colour values live here.

Every component reads the `--ui-*` CSS variables. A console supplies them in its own `tokens.css`
(see `apps/aegis-one/src/styles/tokens.css` for the full list of names). Components forward refs and
accept `className`.

Phase 1 ships only the layout primitives needed for the route skeleton: `Sidebar`, `NavGroup`,
`NavItem`, `Breadcrumb`, `PageHeader`. The rest of the library lands in Phase 2.

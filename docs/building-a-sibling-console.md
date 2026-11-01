# Building the next console on this foundation

Aegis One is the first of three. Saleos One and the third console reuse
`packages/ui` and `packages/mock-core` without modifying either — that was the
point of building them as separate packages rather than as folders inside this
app.

This is what reuse actually looks like, and where the seams are.

---

## 1. What you get, and what you write

|            | Reused as-is                                             | Written per console                          |
| ---------- | -------------------------------------------------------- | -------------------------------------------- |
| **UI**     | 27 components, Storybook, all behaviour                  | `tokens.css`, brand assets, page composition |
| **Server** | App factory, security, OIDC mock, SQLite and query layer | OpenAPI contract, seed, routes               |
| **App**    | —                                                        | Routes, pages, nav table                     |

Roughly: the hard parts are shared, the specific parts are yours.

---

## 2. Theming is one file

`packages/ui` contains no colour, no font name and no brand word. Every
component resolves its styling through `--ui-*` custom properties, so a
console's entire visual identity is one stylesheet.

```css
/* apps/saleos-one/src/styles/tokens.css */
:root {
  /* 1. Your brand palette — the only place these values exist */
  --brand: #0f6cbd;
  --brand-deep: #0a4f8a;
  --sidebar: #11161d;
  /* … */

  /* 2. Map it onto the contract packages/ui reads */
  --ui-accent: var(--brand);
  --ui-accent-strong: var(--brand-deep);
  --ui-nav-bg: var(--sidebar);
  --ui-font-sans: 'Your Face', system-ui, sans-serif;
  --ui-radius-md: 6px;
  --ui-row-height: 34px;
  /* … */
}
```

The full list of tokens a console must define is in
`packages/ui/.storybook/tokens-neutral.css`. Copy it, change the values, keep
the names.

**There are no fallbacks on purpose.** A missing token renders visibly wrong
rather than silently defaulting to someone else's grey, which is the failure
you want — you find it in Storybook rather than in production.

### Checking you did not leak brand into the library

```bash
grep -rniE "#[0-9a-f]{3,8}\b|rgb\(" packages/ui/src     # expect nothing
```

Storybook deliberately loads a neutral grey token set rather than any console's
palette. A component that only looks right in Aegis One's gold will look wrong
there, which is the check working.

---

## 3. A different layout, same components

Saleos One is specified with top navigation rather than a left sidebar. That
needs no change to `packages/ui`:

- `Sidebar`, `NavGroup` and `NavItem` are layout primitives, not a mandate.
  Compose a top bar from `NavItem` and your own CSS Module, or do not use them
  at all.
- Everything else — `DataTable`, `FilterBar`, `Drawer`, `Stepper`,
  `ChartFrame` — is layout-agnostic.
- `--ui-nav-width` and `--ui-topbar-height` exist so a console can change the
  shell's proportions without touching component code.

Aegis One's own shell is in `apps/aegis-one/src/layout/AppShell.tsx`. It is
about 150 lines and knows the nav table and the router. Write your own; do not
import it.

---

## 4. Standing up the mock server

`packages/mock-core` gives you the app factory, the security layer, the
contract-driven validation, the OIDC mock with MFA, the deterministic RNG, the
SQLite helpers and the keyset-pagination query layer. None of it knows what a
device is.

```ts
import { createMockServer, registerMockIdp, SessionStore } from '@aegis/mock-core';

const { app } = await createMockServer({
  basePath: '/api/v1',
  contractPath: resolve(root, 'contracts/saleos-one.openapi.yaml'),
  appOrigins: ['http://localhost:5174'],
  tokens: { secret, issuer, audience: 'saleos-one-console' },
  publicPaths: ['/auth/token', '/auth/refresh', '/auth/logout', '/health'],
  dev: true,
});
```

Authentication, permissions, CSRF and body validation are then applied from
**your** contract's `x-required-permission`, `x-csrf` and schemas. You do not
write those checks; you write the contract.

Then declare what each list may be filtered and sorted by:

```ts
export const accountsSpec: TableSpec = {
  table: 'accounts',
  idColumn: 'id',
  searchColumns: ['name', 'reference'],
  defaultSort: { field: 'name' },
  columns: {
    id: { column: 'id' },
    name: { column: 'name', sortable: true, filters: ['eq', 'like'] },
    status: { column: 'status', sortable: true, filters: ['eq', 'in'] },
    secret: { column: 'secret' }, // readable, but never sortable or filterable
  },
};
```

This is an allowlist, not documentation. A column name cannot be a bound
parameter in `ORDER BY`, so anything not declared here cannot reach SQL at all.

---

## 5. Three things that cost us time

Worth knowing before you hit them.

**Rows must be type aliases, not interfaces.** TanStack Table's `RowData`
constraint is `Record<string, any> | any[]`, and a TypeScript `interface` has
no implicit index signature. `type Device = { … }` satisfies it;
`interface Device { … }` does not. Types generated by `openapi-typescript` are
aliases, so this only bites on hand-written ones.

**React StrictMode will break single-use tokens.** The double effect in
development spends a PKCE verifier twice and fires two refreshes at once. The
second looks like a replay to a correctly written server, which then revokes
the session. Guard anything single-use with a `useRef` that outlives both runs
— a per-run `cancelled` flag makes it worse, because the cleanup discards the
result of the run that actually worked.

**`form-action 'self'` breaks OIDC.** Chrome enforces it across redirects, so
the identity provider cannot redirect back to the console. It fails _after_ the
password and the second factor are accepted, which is the hardest place to
notice. Include the console's origin in `formAction`.

---

## 6. Checklist for a new console

1. `apps/<console>/` with `package.json`, `tsconfig.json`, `vite.config.ts`.
2. `contracts/<console>.openapi.yaml` — including `x-roles`,
   `x-required-permission` on every operation, `x-csrf` on writes, and
   `additionalProperties: false` on every body. `pnpm contract:lint` must pass.
3. `src/styles/tokens.css` — every `--ui-*` token, your values.
4. `src/app/nav.ts` — the page table and the permission each page needs.
5. `src/layout/` — your shell, whatever shape it is.
6. `mock-server/` — `TableSpec`s, a deterministic seed, routes.
7. Pages composed from `@aegis/ui`. **Search the library before writing a
   component**; extend an existing one with a prop or a variant instead of
   adding a near-duplicate.
8. Tests: unit tests for anything that touches SQL or a token, and Playwright
   for every page and the sign-in flow.

---

## 7. If you need to change packages/ui

Sometimes you will, and that is fine. Two rules:

- **Add a prop or a variant; do not fork.** A second DataTable is how a shared
  library stops being shared.
- **No brand values, ever.** If a change needs a colour, it needs a new
  `--ui-*` token, which every console then defines.

Run `pnpm --filter @aegis/ui storybook` and check the component still reads
correctly in the neutral palette. Add a story for the new variant with a note
on what it does for accessibility — every existing component has one, and they
are the closest thing the library has to a specification.

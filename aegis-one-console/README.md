# Aegis One Console

React + TypeScript frontend using Vite, Tailwind, Phosphor icons and Semrush charts.
The approved console design and Reports module are preserved.

## Run

Use Node.js 20 or newer. Open a terminal in the directory containing package.json:

```sh
npm ci
npm run dev
```

## Build and verify

```sh
npm run build
npm run preview
```

Deploy the generated `dist/` contents to your web server. `npm run preview`
is a local build check, not a production web server.

## Project files

| Path | Purpose |
| --- | --- |
| `src/` | React/TypeScript screens, components, styles, data and Reports |
| `tests/` | Two optional browser regression scripts; not included in the app build |
| `index.html` | Required Vite entry document that mounts React |
| `package.json` | Dependencies and run/build commands |
| `package-lock.json` | Locked dependency versions for npm ci |
| `tsconfig.json` | TypeScript configuration |
| `vite.config.ts` | Build configuration |
| `components.json` | UI component tooling configuration |
| `.gitignore` | Excludes dependencies, build output, local environment files and logs |

`src/data/devices.ts` is a TypeScript source file. Windows may show a media-player
icon because of its extension association. Keep this file: the console imports it.
All CSS files in src/main.tsx are used by the approved design.

## GitHub

Copy this folder's contents into the existing `aegis_one_webui` checkout after
reviewing any existing files. Preserve the checkout's `.git` directory and
repository configuration. Commit source and package-lock.json. Do not commit
node_modules, dist or environment secrets. No repository history or remote
configuration is bundled in this ZIP.

## Current integration status

This package contains the frontend, including sample fleet data and local report
configuration. Live inventory, endpoint commands, authentication, installer
delivery and scheduled emails require backend integration. Removing the guided
demo package does not implement those backend services. The console retains its
sample-data labels and honest unavailable-action messages.

## Optional regression checks

These tests are developer tools and do not run in the deployed console. After
building, install Playwright separately if it is not available:

```sh
npm install --no-save playwright
npx playwright install chromium
node tests/functional-regression.cjs
node tests/reports-regression.cjs
```

The scripts start temporary local servers. CHROMIUM_PATH can select an existing
Chromium executable. These cover frontend interactions, not live agent execution.

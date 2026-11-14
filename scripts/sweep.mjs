#!/usr/bin/env node
/**
 * Side-by-side sweep of every page against the approved reference.
 *
 * Renders the reference and the rebuild at 1600x1000, saves both shots, and
 * measures the things a screenshot cannot be trusted on — which colours a
 * page actually paints, whether its icons come from the approved set,
 * whether a chart has an axis, how many counters it draws, what its header
 * and table offer, and how long it took.
 *
 * The measurements exist because eyeballing thirty-eight screenshots is how
 * a sweep quietly becomes a guess. A hex is either in the reference's output
 * or it is not.
 *
 *   node scripts/ref-server.mjs &       serves v129 on 4100 (see --help)
 *   pnpm mock                           terminal 2
 *   pnpm dev                            terminal 3
 *   DEMO_PASSWORD=... node scripts/sweep.mjs
 *
 * Writes PNGs to apps/aegis-one/docs/screenshots/sweep/ and a JSON summary
 * beside them. It reports; it does not fix.
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const REF = process.env['SWEEP_REF'] ?? 'http://localhost:4100/v129.html';
const BUILD = process.env['SWEEP_BUILD'] ?? 'http://localhost:5173';
const OUT = process.env['SWEEP_OUT'] ?? 'apps/aegis-one/docs/screenshots/sweep';
const EMAIL = process.env['DEMO_EMAIL'] ?? 'rohan.deshpande@example.co.in';
const PASSWORD = process.env['DEMO_PASSWORD'] ?? '';
const MFA = process.env['MOCK_MFA_CODE'] ?? '246813';
const ONLY = process.argv.slice(2);

/**
 * Every page, with the label the reference's sidebar uses. Remote Control
 * has no reference row: v129 does not have the page, and v130's is a
 * browser-only demo rather than a layout to copy.
 */
const PAGES = [
  { slug: 'overview', label: 'Overview', route: '/' },
  { slug: 'devices', label: 'Devices', route: '/devices' },
  { slug: 'device-groups', label: 'Device groups', route: '/groups' },
  { slug: 'enrollment', label: 'Enrollment', route: '/enrollment' },
  { slug: 'patches', label: 'Patches', route: '/patches' },
  { slug: 'software', label: 'Software', route: '/software' },
  { slug: 'live-activity', label: 'Live Activity', route: '/liveops' },
  { slug: 'remote-control', label: null, route: '/remote-control' },
  { slug: 'deployments', label: 'Deployments', route: '/deployments' },
  { slug: 'vulnerabilities', label: 'Vulnerabilities', route: '/vulns' },
  { slug: 'configuration', label: 'Configuration', route: '/profiles' },
  { slug: 'dex', label: 'DEX', route: '/dex' },
  { slug: 'insight', label: 'AEGIS Insight', route: '/insight' },
  { slug: 'zones', label: 'Aegis Zones', route: '/sites' },
  { slug: 'peer-cache', label: 'Peer cache', route: '/peercache' },
  { slug: 'reports', label: 'Reports', route: '/reports' },
  { slug: 'integrations', label: 'Integrations', route: '/integrations' },
  { slug: 'administration', label: 'Administration', route: '/admin' },
  { slug: 'licensing', label: 'Licensing', route: '/licensing' },
  { slug: 'diagnostics', label: 'Diagnostics', route: '/diagnostics' },
];

/**
 * Read out of the page rather than judged from a picture.
 *
 * Two rules, both learnt by getting them wrong. A control is identified by
 * its accessible name, resolved through `aria-labelledby` as a screen reader
 * would — reading `aria-label` alone made three controls on the Overview
 * look missing when they were there all along. And nothing is identified by
 * a class name: the reference and this console share a design, not a
 * stylesheet, so `[class*="tab"]` finds v129's tabs on one side and not the
 * other. Tabs are found by their words.
 */
function measure() {
  const root = document.querySelector('main') ?? document.body;
  const text = root.innerText;

  const accessibleName = (el) => {
    const direct = el.getAttribute('aria-label');
    if (direct) return direct.trim();
    const by = el.getAttribute('aria-labelledby');
    if (by) {
      return by
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
        .join(' ')
        .trim();
    }
    // A wrapping label names its control, including the visually hidden span
    // both codebases use for exactly that. Reading only the element's own
    // text made every search box on both sides look nameless.
    const label = el.closest('label');
    if (label) {
      const own = label.cloneNode(true);
      for (const child of own.querySelectorAll('input, select, textarea')) child.remove();
      const text = own.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      if (text !== '') return text;
    }
    return el.textContent.replace(/\s+/g, ' ').trim();
  };

  const rgbToHex = (value) => {
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(value ?? '');
    if (!m) return null;
    return (
      '#' + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')
    ).toUpperCase();
  };

  // Colours the page actually paints, not the ones its stylesheet declares.
  const paint = new Map();
  for (const el of root.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    for (const prop of ['backgroundColor', 'color', 'fill', 'stroke', 'borderTopColor']) {
      const hex = rgbToHex(cs[prop]);
      if (hex && hex !== '#000000') paint.set(hex, (paint.get(hex) ?? 0) + 1);
    }
    if (cs.backgroundImage.includes('gradient')) {
      paint.set('gradient', (paint.get('gradient') ?? 0) + 1);
    }
  }

  const svgs = [...document.querySelectorAll('svg')];

  /*
   * Named controls, so a difference in this list is a difference in what the
   * page offers rather than in how it is marked up.
   */
  const named = [];
  for (const el of root.querySelectorAll('select, button, [role="tab"], input')) {
    const box = el.getBoundingClientRect();
    if (box.width === 0 && box.height === 0) continue;
    const type = el.getAttribute('type') ?? '';
    if (type === 'checkbox' || type === 'radio') continue;
    const name = accessibleName(el).slice(0, 40);
    if (name !== '' && !named.includes(name)) named.push(name);
  }

  return {
    heading: root.querySelector('h1')?.textContent?.trim() ?? null,
    // The approved glyphs announce themselves; anything else is a stranger.
    icons: {
      total: svgs.length,
      approved: svgs.filter((s) => s.hasAttribute('data-icon') || s.hasAttribute('data-aegis-icon'))
        .length,
      square: svgs.filter((s) => s.getAttribute('stroke-linecap') === 'square').length,
      accents: document.querySelectorAll('[class*="accf"], [class*="accent"]').length,
    },
    colours: [...paint.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24),
    charts: {
      svgs: root.querySelectorAll('svg[viewBox]').length,
      // An axis is tick labels or gridlines; both sides draw them differently,
      // so look for either shape.
      axisTicks: root.querySelectorAll(
        '[class*="valueAxis"] span, [class*="axis-tick"], .recharts-cartesian-axis-tick-value',
      ).length,
      gridlines: root.querySelectorAll('[class*="gridlines"] span, .recharts-cartesian-grid line')
        .length,
      horizontalBars: root.querySelectorAll('[class*="barRow"], [class*="aw-bar-row"]').length,
    },
    controls: named.slice(0, 60),
    tiles: {
      count: root.querySelectorAll(
        '[class*="kpi"], [class*="summary-strip"] > div, [class*="counter"]',
      ).length,
      clickable: root.querySelectorAll(
        'button[class*="kpi"], [class*="kpi"] button, [class*="summary-strip"] button',
      ).length,
    },
    header: {
      selects: root.querySelectorAll(
        'header select, [class*="head"] select, [class*="scope"] select',
      ).length,
      buttons: root.querySelectorAll('header button, [class*="head"] button').length,
      star: /[★☆]/.test(text),
    },
    table: {
      tables: root.querySelectorAll('table').length,
      rows: root.querySelectorAll('tbody tr').length,
      search: root.querySelectorAll(
        'input[type="search"], input[placeholder*="…"], [class*="search"] input',
      ).length,
      sortable: root.querySelectorAll('th button').length,
      pager: /Page \d+ of \d+|\d+[–-]\d+ of/.test(text),
    },
    words: text.length,
  };
}

async function signIn(page) {
  await page.goto(`${BUILD}/sign-in`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Continue with SSO/ }).click();
  await page.waitForSelector('input[name=email]');
  await page.fill('input[name=email]', EMAIL);
  await page.fill('input[name=password]', PASSWORD);
  await page.evaluate(() => document.querySelector('form').submit());
  await page.waitForSelector('input[name=code]');
  await page.fill('input[name=code]', MFA);
  await page.evaluate(() => document.querySelector('form').submit());
  await page.waitForFunction(
    () => location.port === '5173' && !location.pathname.startsWith('/auth/callback'),
    null,
    { timeout: 40_000 },
  );
}

async function openReference(page, label) {
  await page.evaluate((name) => {
    /*
     * Two of the reference's nav items carry a "Beta" tag inside the same
     * button, so an exact match silently clicks nothing and the next page's
     * measurements are really the previous page's.
     */
    const want = name.toLowerCase();
    const items = [...document.querySelectorAll('button,a')];
    const hit =
      items.find((e) => e.textContent.trim().toLowerCase() === want) ??
      items.find((e) => e.textContent.trim().toLowerCase().startsWith(want));
    if (!hit) throw new Error(`no nav item for "${name}"`);
    hit.click();
  }, label);
  await page.waitForTimeout(1800);
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const viewport = { width: 1600, height: 1000 };

const refPage = await browser.newPage({ viewport });
await refPage.goto(REF, { waitUntil: 'networkidle' });
await refPage.waitForTimeout(2500);

const buildPage = await browser.newPage({ viewport });
await signIn(buildPage);

const rows = [];
for (const spec of PAGES) {
  if (ONLY.length > 0 && !ONLY.includes(spec.slug)) continue;

  let reference = null;
  if (spec.label !== null) {
    await openReference(refPage, spec.label);
    await refPage.screenshot({ path: `${OUT}/${spec.slug}-ref.png` });
    reference = await refPage.evaluate(measure);
  }

  const started = Date.now();
  await buildPage.goto(`${BUILD}${spec.route}`, { waitUntil: 'domcontentloaded' });
  await buildPage
    .waitForFunction(() => !/Loading|Skeleton/.test(document.body.innerText), null, {
      timeout: 60_000,
    })
    .catch(() => {});
  const settledMs = Date.now() - started;
  await buildPage.waitForTimeout(900);
  await buildPage.screenshot({ path: `${OUT}/${spec.slug}-build.png` });
  const build = await buildPage.evaluate(measure);

  rows.push({ ...spec, settledMs, reference, build });
  console.log(
    `${spec.slug.padEnd(16)} settled ${String(settledMs).padStart(6)}ms  ` +
      `icons ${build.icons.approved}/${build.icons.total}  tiles ${build.tiles.count}  ` +
      `tables ${build.table.tables}`,
  );
}

writeFileSync(`${OUT}/sweep.json`, JSON.stringify(rows, null, 1), 'utf8');
console.log(`\n${rows.length} pages -> ${OUT}`);
await browser.close();

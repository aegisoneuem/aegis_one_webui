import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';

/**
 * Drives the built console through ZAP's proxy so passive analysis sees every
 * route.
 *
 * ZAP's own AJAX spider could not run here: its bundled chromedriver is 143,
 * the installed Chrome is 156, and SeleniumManager is offline so it cannot
 * fetch a matching one. Every attempt reported `spiderAjax found 0 URLs` — and
 * a scan that crawls nothing passes. This walks the same ground with the
 * browser the repo already has, and reports how many views it reached so the
 * next person can tell a real crawl from an empty one.
 *
 * Start ZAP as a daemon first:
 *
 *   zap.bat -daemon -host 127.0.0.1 -port 8099 -config api.disablekey=true
 *
 * then run this, then write the report through ZAP's API.
 */

const { values } = parseArgs({
  options: {
    base: { type: 'string', default: 'http://localhost:4173' },
    proxy: { type: 'string', default: 'http://127.0.0.1:8099' },
    email: { type: 'string', default: 'rohan.deshpande@example.co.in' },
    settle: { type: 'string', default: '1800' },
  },
});

/** Every route in the console. Keep in step with the router. */
const PAGES = [
  '/',
  '/devices',
  '/groups',
  '/enrollment',
  '/patches',
  '/software',
  '/liveops',
  '/deployments',
  '/vulns',
  '/profiles',
  '/dex',
  '/insight',
  '/sites',
  '/peercache',
  '/reports',
  '/integrations',
  '/admin',
  '/licensing',
  '/diagnostics',
];

/** Tabbed views, so the crawl reaches more than each page's default tab. */
const TABS = [
  '/patches?tab=policies',
  '/integrations?tab=siem',
  '/integrations?tab=log',
  '/admin?tab=users',
  '/admin?tab=roles',
  '/admin?tab=tokens',
  '/profiles?tab=checks',
  '/vulns?tab=findings',
  '/liveops?tab=history',
];

const settle = Number(values.settle);

const browser = await chromium.launch({
  channel: 'chrome',
  proxy: { server: values.proxy },
  args: ['--ignore-certificate-errors'],
});

try {
  const page = await browser.newPage({ ignoreHTTPSErrors: true });

  // Signing in through the proxy matters: an unauthenticated crawl reaches the
  // sign-in screen and nothing else, which also looks like a clean scan.
  await page.goto(values.base, { waitUntil: 'load' });
  await page.getByRole('button', { name: /Continue with SSO/i }).click();
  await page.getByLabel('Work email').fill(values.email);
  await page.getByLabel('Password').fill(process.env['MOCK_PASSWORD'] ?? 'Aegis-Demo-2026');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Verification code').fill(process.env['MOCK_MFA_CODE'] ?? '246813');
  await page.getByRole('button', { name: 'Verify' }).click();
  await page.waitForURL('**/');
  console.log('signed in through the proxy');

  const targets = [...PAGES, ...TABS];
  let walked = 0;
  for (const path of targets) {
    try {
      await page.goto(`${values.base}${path}`, { waitUntil: 'load' });
      await page.waitForTimeout(settle);
      walked += 1;
    } catch (error) {
      console.log(`skipped ${path}: ${String(error).slice(0, 80)}`);
    }
  }

  console.log(`walked ${walked} of ${targets.length} views`);

  // A partial crawl is a partial scan. Fail loudly rather than let a report be
  // written over ground that was never covered.
  if (walked < targets.length) {
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}

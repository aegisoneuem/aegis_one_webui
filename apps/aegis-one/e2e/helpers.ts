import type { Page } from '@playwright/test';

/** Fixture accounts, one per role. See apps/aegis-one/docs/seed.md. */
export const ACCOUNTS = {
  superAdmin: 'rohan.deshpande@example.co.in',
  admin: 'ananya.iyer@example.co.in',
  operator: 'siddharth.kulkarni@example.co.in',
  auditor: 'kavya.chandrasekar@example.co.in',
  readOnly: 'imran.shaikh@example.co.in',
  zoneScoped: 'divya.nair@example.co.in',
} as const;

const PASSWORD = process.env['MOCK_PASSWORD'] ?? 'Aegis-Demo-2026';
const MFA_CODE = process.env['MOCK_MFA_CODE'] ?? '246813';

/**
 * Signs in through the real OIDC flow — authorize, password, second factor,
 * callback — rather than injecting a token. A test that fakes the session
 * would not notice the day sign-in breaks.
 */
export async function signIn(page: Page, email: string = ACCOUNTS.superAdmin): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: /single sign-on/i }).click();

  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByLabel('Verification code').fill(MFA_CODE);
  await page.getByRole('button', { name: 'Verify' }).click();

  await page.waitForURL('**/');
  await page.getByRole('navigation', { name: 'Breadcrumb' }).waitFor();
}

/** The 19 pages, in sidebar order. */
export const PAGES = [
  { path: '/', heading: 'Overview' },
  { path: '/devices', heading: 'Devices' },
  { path: '/groups', heading: 'Device groups' },
  { path: '/enrollment', heading: 'Enrollment' },
  { path: '/patches', heading: 'Patches' },
  { path: '/software', heading: 'Software' },
  { path: '/liveops', heading: 'Live Activity' },
  { path: '/deployments', heading: 'Deployments' },
  { path: '/vulns', heading: 'Vulnerabilities' },
  { path: '/profiles', heading: 'Configuration' },
  { path: '/dex', heading: 'DEX' },
  { path: '/insight', heading: 'AEGIS Insight' },
  { path: '/sites', heading: 'Aegis Zones' },
  { path: '/peercache', heading: 'Peer cache' },
  { path: '/reports', heading: 'Reports' },
  { path: '/integrations', heading: 'Integrations' },
  { path: '/admin', heading: 'Administration' },
  { path: '/licensing', heading: 'Licensing' },
  { path: '/diagnostics', heading: 'Diagnostics' },
] as const;

import { expect, test } from '@playwright/test';
import { ACCOUNTS, PAGES, signIn } from './helpers';

/**
 * Walks the console the way a person would: sign in, open every page, follow
 * the sub-routes, and check that what the server refuses the UI also refuses.
 */

test.describe('sign-in', () => {
  test('rejects a wrong password without saying which field was wrong', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /single sign-on/i }).click();
    await page.getByLabel('Work email').fill(ACCOUNTS.superAdmin);
    await page.getByLabel('Password').fill('not-the-password');
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByRole('alert')).toContainText('did not match');
    // The message must not distinguish a bad password from an unknown account.
    await expect(page.getByRole('alert')).not.toContainText(/account|user|exist/i);
  });

  test('requires the second factor', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /single sign-on/i }).click();
    await page.getByLabel('Work email').fill(ACCOUNTS.superAdmin);
    await page.getByLabel('Password').fill(process.env['MOCK_PASSWORD'] ?? 'Aegis-Demo-2026');
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByRole('heading', { name: 'Two-step verification' })).toBeVisible();
    await page.getByLabel('Verification code').fill('000000');
    await page.getByRole('button', { name: 'Verify' }).click();
    await expect(page.getByRole('alert')).toContainText('not correct');
  });

  test('sends an unauthenticated visitor to sign-in and back again', async ({ page }) => {
    await page.goto('/devices');
    await expect(page).toHaveURL(/\/sign-in/);
    await expect(page.getByRole('heading', { name: 'Sign in to the console' })).toBeVisible();
  });
});

test.describe('signed in as Super Admin', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  for (const { path, heading } of PAGES) {
    test(`${heading} loads with data`, async ({ page }) => {
      const errors: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });

      await page.goto(path);
      await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();

      // Nothing on any page should render an error state on a healthy server.
      await expect(page.getByText('Could not load this')).toHaveCount(0);
      expect(errors, `console errors on ${path}`).toEqual([]);
    });
  }

  test('Overview reports the whole estate', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: /Managed endpoints/ })).toContainText('50,000');
    await expect(page.getByRole('heading', { name: 'Service health' })).toBeVisible();
  });

  test('Devices lists, filters, sorts and pages', async ({ page }) => {
    await page.goto('/devices');
    const grid = page.getByRole('table', { name: 'Devices' });
    await expect(grid).toBeVisible();

    // Server-side total, not a count of what is on screen.
    await expect(page.getByText('50,000 devices', { exact: true })).toBeVisible();

    await page.getByLabel('Search devices').fill('MUM-WS-01');
    await expect(page.getByText('50,000 devices', { exact: true })).toHaveCount(0);
    await page.getByLabel('Clear').click();

    await page.getByRole('button', { name: /Compliance/ }).click();
    await expect(page).toHaveURL(/sort=compliancePct/);

    const first = await grid.locator('tbody tr').first().textContent();
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(grid.locator('tbody tr').first()).not.toHaveText(first ?? '');
  });

  test('a device opens, and its tabs are deep-linkable', async ({ page }) => {
    await page.goto('/devices');
    await page.getByRole('table', { name: 'Devices' }).locator('tbody tr').first().click();
    await expect(page).toHaveURL(/\/devices\/dev-/);

    await page.getByRole('tab', { name: 'Vulnerabilities' }).click();
    await expect(page).toHaveURL(/\/vulnerabilities$/);

    // The tab survives a cold load, which is the point of putting it in the URL.
    await page.reload();
    await expect(page.getByRole('tab', { name: 'Vulnerabilities' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await page.getByRole('tab', { name: 'Diagnostics' }).click();
    await expect(page.getByRole('heading', { name: 'Current posture' })).toBeVisible();
  });

  test('the deployment wizard runs through all six steps and creates an action', async ({
    page,
  }) => {
    await page.goto('/deployments/new');

    await expect(page.getByRole('listitem').filter({ hasText: 'Content' })).toBeVisible();
    await page.getByLabel('Package').selectOption({ index: 1 });
    await expect(page.getByLabel('Action name')).not.toHaveValue('');
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page).toHaveURL(/\/deployments\/new\/targets/);
    await page.getByLabel('Device group').selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page).toHaveURL(/\/schedule/);
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page).toHaveURL(/\/network/);
    await page.getByRole('switch', { name: /Wake offline/ }).click();
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page).toHaveURL(/\/options/);
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page).toHaveURL(/\/review/);
    await page.getByRole('button', { name: /Queue action now/ }).click();

    await expect(page).toHaveURL(/\/deployments\/created\//);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await page.getByRole('button', { name: 'View progress' }).click();
    await expect(page).toHaveURL(/\/deployments\/dep-/);
  });

  test('Live Activity submits a script job and never offers a session', async ({ page }) => {
    await page.goto('/liveops');

    await page.getByLabel('Task name').fill('Verify firewall profiles');
    await page.getByLabel('Aegis Zone').selectOption({ index: 1 });
    await page.getByLabel('Script').fill('Get-NetFirewallProfile | Select-Object Name, Enabled');
    await page.getByRole('button', { name: 'Submit job' }).click();

    await expect(page.getByRole('status').filter({ hasText: 'Job submitted' })).toBeVisible();

    // Rule 4: nothing anywhere on this page offers interactive access.
    const body = (await page.locator('body').innerText()).toLowerCase();
    for (const banned of [
      'remote desktop',
      'remote control',
      'screen share',
      'screen view',
      'remote session',
      'terminal session',
      'take control',
    ]) {
      expect(body, `"${banned}" must not appear in Live Activity`).not.toContain(banned);
    }
  });

  test('the sidebar collapses and the state survives a reload', async ({ page }) => {
    await page.goto('/devices');
    await page.getByRole('button', { name: 'Collapse sidebar' }).click();
    await expect(page.locator('aside[data-collapsed="true"]')).toBeVisible();

    await page.reload();
    await expect(page.locator('aside[data-collapsed="true"]')).toBeVisible();
    await page.getByRole('button', { name: 'Expand sidebar' }).click();
  });

  test('Alt+Left goes back, like the Back button', async ({ page }) => {
    await page.goto('/devices');
    await page.goto('/patches');
    await page.keyboard.press('Alt+ArrowLeft');
    await expect(page).toHaveURL(/\/devices$/);
  });

  test('signing out ends the session server-side', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Rohan Deshpande/ }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/sign-in/);

    // A reload must not resurrect it from a leftover cookie.
    await page.goto('/devices');
    await expect(page).toHaveURL(/\/sign-in/);
  });
});

test.describe('role restrictions', () => {
  test('a read-only user cannot reach write actions', async ({ page }) => {
    await signIn(page, ACCOUNTS.readOnly);

    await page.goto('/deployments');
    await expect(page.getByRole('button', { name: 'New action' })).toHaveCount(0);

    await page.goto('/devices');
    // No checkbox column: selection exists to drive actions this role lacks.
    await expect(page.getByRole('button', { name: 'Run script' })).toHaveCount(0);
  });

  test('a zone-scoped user sees only their own zone', async ({ page }) => {
    await signIn(page, ACCOUNTS.zoneScoped);
    await page.goto('/devices');

    await expect(page.getByRole('table', { name: 'Devices' })).toBeVisible();
    const total = await page
      .locator('span', { hasText: /^[\d,]+ devices$/ })
      .first()
      .innerText();
    expect(total).not.toContain('50,000');

    const zones = await page
      .getByRole('table', { name: 'Devices' })
      .locator('tbody tr')
      .allInnerTexts();
    for (const row of zones.slice(0, 20)) {
      expect(row).toContain('Jaipur Branch');
    }
  });

  test('a zone-scoped user gets nothing for a device in another zone', async ({ page }) => {
    await signIn(page, ACCOUNTS.zoneScoped);
    // dev-100000 is the first seeded device, which is in Mumbai HQ.
    await page.goto('/devices/dev-100000');
    await expect(page.getByText('Device not found')).toBeVisible();
  });
});

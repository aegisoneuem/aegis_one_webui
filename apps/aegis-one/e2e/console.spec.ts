import { expect, test } from '@playwright/test';
import { ACCOUNTS, PAGES, signIn } from './helpers';

/**
 * Walks the console the way a person would: sign in, open every page, follow
 * the sub-routes, and check that what the server refuses the UI also refuses.
 */

test.describe('sign-in', () => {
  test('rejects a wrong password without saying which field was wrong', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Continue with SSO/i }).click();
    await page.getByLabel('Work email').fill(ACCOUNTS.superAdmin);
    await page.getByLabel('Password').fill('not-the-password');
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByRole('alert')).toContainText('did not match');
    // The message must not distinguish a bad password from an unknown account.
    await expect(page.getByRole('alert')).not.toContainText(/account|user|exist/i);
  });

  test('requires the second factor', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Continue with SSO/i }).click();
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
    await expect(
      page.getByRole('heading', { name: 'Sign in to your endpoint management console.' }),
    ).toBeVisible();
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
    await expect(page.getByRole('button', { name: /Managed Endpoints/ })).toContainText('50,000');
    // The six widgets the approved design puts on this page. Service health
    // is not among them; it lives on Diagnostics, which is the only page that
    // reads it.
    for (const widget of [
      'Overall Health Score',
      'Patch Compliance',
      'Security Posture',
      'Deployment Status',
      'Expiring Soon',
      'Needs Attention',
      'Recent Activity',
    ]) {
      await expect(page.getByRole('heading', { name: widget, exact: true })).toBeVisible();
    }
  });

  test('Overview scope filters narrow the estate', async ({ page }) => {
    await page.goto('/');
    const managed = page.getByRole('button', { name: /Managed Endpoints/ });
    await expect(managed).toContainText('50,000');

    await page.getByLabel('Platform').selectOption('macos');
    // A narrower scope must report fewer endpoints, and the figure has to come
    // back from the server rather than being filtered in the browser.
    await expect(managed).not.toContainText('50,000');
    await expect(page.getByRole('heading', { name: 'Overall Health Score' })).toBeVisible();
  });

  test('Overview charts switch form without losing the figures', async ({ page }) => {
    await page.goto('/');
    const compliance = page
      .getByRole('article')
      .filter({ has: page.getByRole('heading', { name: 'Patch Compliance' }) });

    await expect(compliance.getByRole('table', { name: /Device compliance/i })).toBeAttached();
    await compliance.getByLabel('Chart type').selectOption('bar');
    await expect(compliance.getByRole('table', { name: /Device compliance/i })).toBeAttached();

    await compliance.getByLabel('View').selectOption('severity');
    await expect(compliance.getByRole('table', { name: /severity/i })).toBeAttached();
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

    // A column the approved grid shows by default; the posture columns are in
    // the chooser now, which the next assertion covers.
    await page.getByRole('button', { name: /Last Seen/ }).click();
    await expect(page).toHaveURL(/sort=lastSeenAt/);

    const first = await grid.locator('tbody tr').first().textContent();
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(grid.locator('tbody tr').first()).not.toHaveText(first ?? '');
  });

  test('Devices shows the approved columns, and hides the rest behind the chooser', async ({
    page,
  }) => {
    await page.goto('/devices');
    const grid = page.getByRole('table', { name: 'Devices' });

    // The approved grid's own columns, in its own order.
    for (const header of [
      'Computer Name',
      'OS',
      'IP Address',
      'Hostname',
      'MAC Address',
      'DNS Name',
      'Location',
      'User',
      'Status',
      'Last Seen',
    ]) {
      // Exact, because "OS" is also a prefix of "OS Version".
      await expect(grid.getByRole('columnheader', { name: header, exact: true })).toBeVisible();
    }

    // Posture is not on the inventory by default, but it is reachable.
    await expect(grid.getByRole('columnheader', { name: /Critical CVEs/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Columns' }).click();
    await expect(page.getByRole('checkbox', { name: 'Critical CVEs' })).toBeVisible();
  });

  test('Devices counts the estate, and the counts follow the search', async ({ page }) => {
    await page.goto('/devices');
    const all = page.getByRole('button', { name: /All Endpoints/ });
    await expect(all).toContainText('50,000');

    // The strip and the grid must agree: a count that ignored the search
    // would contradict the list under it.
    await page.getByLabel('Search devices').fill('MUM-WS-01');
    await expect(all).not.toContainText('50,000');
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

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

  test('Patch Management opens on its dashboard, with all eight tabs', async ({ page }) => {
    await page.goto('/patches');
    await expect(page.getByRole('heading', { name: 'Patch Management' })).toBeVisible();

    for (const label of [
      'Overview',
      'Patch Policies',
      'Windows',
      'macOS',
      'Linux',
      'Third-Party Apps',
      'Drivers & BIOS',
      'All Patches',
    ]) {
      await expect(page.getByRole('tab', { name: label, exact: true })).toBeVisible();
    }

    // The approved Overview tab: four counters, three charts, two tables.
    for (const heading of [
      'Compliance by OS Version',
      'Missing by Severity',
      'Missing Patch Age',
      'Top Missing Patches',
      'Devices Needing Attention',
    ]) {
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    }
    await expect(page.getByText('Average Patch Age')).toBeVisible();
  });

  test('a patch tab is a link, and carries its own columns and counters', async ({ page }) => {
    await page.goto('/patches?tab=windows');

    // Restored from the URL, not from a click: the tab is deep-linkable.
    await expect(page.getByRole('tab', { name: 'Windows', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByText('Windows Compliance')).toBeVisible();

    const grid = page.getByRole('table', { name: 'Windows OS Updates' });
    for (const header of ['Update', 'Vendor', 'Severity', 'Released', 'Applicable', 'Remediated']) {
      await expect(grid.getByRole('columnheader', { name: header, exact: true })).toBeVisible();
    }

    // Drivers & BIOS counts installs rather than remediations, and splits the
    // catalogue by type instead of naming a vendor.
    await page.getByRole('tab', { name: 'Drivers & BIOS' }).click();
    const drivers = page.getByRole('table', { name: 'Drivers & BIOS' });
    await expect(
      drivers.getByRole('columnheader', { name: 'Installed', exact: true }),
    ).toBeVisible();
    await expect(drivers.getByRole('columnheader', { name: 'Type', exact: true })).toBeVisible();
  });

  test('the patch grid filters by severity and by OS version', async ({ page }) => {
    await page.goto('/patches?tab=windows');
    const grid = page.getByRole('table', { name: 'Windows OS Updates' });
    const rows = grid.locator('tbody tr');
    const all = await rows.count();

    await page.getByRole('button', { name: 'Critical', exact: true }).click();
    await expect(page).toHaveURL(/severity=critical/);
    await expect(rows).not.toHaveCount(all);

    // The OS-version chips narrow to the updates outstanding on that build,
    // which is a join the server does — not a filter applied to this page.
    await page.getByRole('button', { name: 'All Severities' }).click();
    await page.getByRole('button', { name: /Windows Server 2016/ }).click();
    await expect(page).toHaveURL(/osVersion=/);
  });

  test('declining an update changes its state on the server', async ({ page }) => {
    const url = '/patches?tab=third-party&approval=review';
    const grid = () => page.getByRole('table', { name: 'Third-Party Application Updates' });

    await page.goto(url);
    const first = grid().locator('tbody tr').first();
    await expect(first).toBeVisible();
    // The grid is virtualised, so counting rows counts the window rather than
    // the result. The update's own reference is what the assertion follows.
    const reference = (await first.locator('small').first().innerText()).split(' ·')[0] ?? '';
    expect(reference).toMatch(/^VRF-/);

    await first.getByRole('button', { name: '…' }).click();
    await page.getByRole('menuitem', { name: 'Decline' }).click();

    // Loaded again, so it has moved because the server says so — not because
    // the page dropped it from a list it was holding.
    await page.goto('/patches?tab=third-party&approval=declined');
    await expect(grid().getByText(reference, { exact: false }).first()).toBeVisible();
  });

  test('the software catalogue is a card grid with its five counters', async ({ page }) => {
    await page.goto('/software');
    await expect(page.getByRole('heading', { name: 'Software Catalog' })).toBeVisible();

    for (const label of [
      'All Packages',
      'Installer Added',
      'Installer Missing',
      'Draft Packages',
      'Publishers',
    ]) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }

    // One card per package, each carrying the four fields the reference shows.
    const cards = page.locator('article');
    await expect(cards.first()).toBeVisible();
    await expect(cards.first().getByText('Version', { exact: true })).toBeVisible();
    await expect(cards.first().getByText('Platform', { exact: true })).toBeVisible();
    await expect(cards.first().getByText('Package status', { exact: true })).toBeVisible();
    await expect(cards.first().getByText('Installer', { exact: true })).toBeVisible();
  });

  test('a catalogue counter narrows the grid without moving the counters', async ({ page }) => {
    await page.goto('/software');
    const all = page.getByRole('button', { name: /All Packages/ });
    const drafts = page.getByRole('button', { name: /Draft Packages/ });
    const total = (await all.innerText()).replace(/\D/g, '');

    await drafts.click();
    await expect(drafts).toHaveAttribute('aria-pressed', 'true');

    // The counters describe the catalogue, so they do not follow the filter.
    await expect(all).toContainText(total);
    // Every card left is a draft, and a draft has no installer to deploy.
    const cards = page.locator('article');
    await expect(cards.first().getByText('Draft', { exact: true })).toBeVisible();
    await expect(cards.first().getByRole('button', { name: 'Deploy' })).toBeDisabled();
  });

  test('searching the catalogue narrows it server-side', async ({ page }) => {
    await page.goto('/software');
    const cards = page.locator('article');
    await expect(cards.first()).toBeVisible();
    const before = await cards.count();

    await page.getByLabel('Search software or publisher').fill('Chrome');
    await expect(cards).not.toHaveCount(before);
    await expect(page.getByRole('heading', { name: 'Google Chrome' })).toBeVisible();
  });

  test('Enrollment shows its counters, methods and token grid', async ({ page }) => {
    await page.goto('/enrollment');
    await expect(page.getByRole('heading', { name: 'Enrollment', exact: true })).toBeVisible();

    for (const label of [
      'Enrolled Endpoints',
      'On Latest Agent',
      'Active Tokens',
      'Not Checking in',
    ]) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }

    // The four ways in, each with the state the server computed.
    for (const method of [
      'Agent Installer',
      'Directory Auto-Enroll',
      'Imaging & VDI',
      'Bulk Import',
    ]) {
      await expect(page.getByText(method, { exact: true })).toBeVisible();
    }
    // An identity integration is connected in the fixture.
    await expect(page.getByText('Configured', { exact: true })).toBeVisible();

    const rows = page.locator('table tbody tr');
    await expect(rows.first()).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Target Group' })).toBeVisible();
  });

  test('the install command switches platform and never shows a real token', async ({ page }) => {
    await page.goto('/enrollment');
    const code = page.locator('pre');
    await expect(code).toContainText('msiexec');
    await expect(code).toContainText('<ENROLLMENT_TOKEN>');

    await page.getByRole('button', { name: 'Linux', exact: true }).click();
    await expect(code).toContainText('dpkg');
    await expect(code).toContainText('<ENROLLMENT_TOKEN>');

    // Whatever the platform, no token prefix or secret reaches the screen.
    await expect(page.locator('body')).not.toContainText('enr_');
  });

  test('Device groups is a tree beside the selected group', async ({ page }) => {
    await page.goto('/groups');
    await expect(page.getByRole('heading', { name: 'Device Groups' })).toBeVisible();

    for (const label of ['Groups', 'Sub-Groups', 'Endpoints Grouped', 'Not Grouped']) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }

    // The first group is selected, and its five figures sit over the tabs.
    await expect(page.getByRole('heading', { name: 'Windows Workstations' })).toBeVisible();
    // "Members 32,761", not "Membership".
    await expect(page.getByRole('tab', { name: /^Members \d/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const rows = page.getByRole('table', { name: 'Group members' }).locator('tbody tr');
    await expect(rows.first()).toBeVisible();
  });

  test('selecting a group swaps the pane, and the selection is in the URL', async ({ page }) => {
    await page.goto('/groups');
    await page.getByRole('button', { name: /^Security Gaps/ }).click();

    await expect(page).toHaveURL(/group=grp-gaps/);
    await expect(page.getByRole('heading', { name: 'Security Gaps' })).toBeVisible();

    // The selection survives a cold load, which is the point of the URL.
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Security Gaps' })).toBeVisible();
  });

  test("a group's figures agree with its member grid", async ({ page }) => {
    await page.goto('/groups?group=grp-macos');
    const online = page.getByRole('group', { name: 'Member filter' }).getByRole('button', {
      name: /^Online/,
    });
    await expect(online).toBeVisible();

    await online.click();
    await expect(online).toHaveAttribute('aria-pressed', 'true');

    const rows = page.getByRole('table', { name: 'Group members' }).locator('tbody tr');
    await expect(rows.first()).toBeVisible();
    for (const row of await rows.allInnerTexts()) expect(row).toContain('Online');
  });

  test("a group's other tabs read the contract's GroupDetail", async ({ page }) => {
    await page.goto('/groups?group=grp-win-ws');

    await page.getByRole('tab', { name: 'Membership' }).click();
    await expect(page.getByText('osFamily is Windows and kind is workstation')).toBeVisible();

    await page.getByRole('tab', { name: /^Sub-Groups/ }).click();
    await expect(page.getByRole('button', { name: /Windows 11/ }).last()).toBeVisible();

    await page.getByRole('tab', { name: /^Policies/ }).click();
    await expect(page.getByText('Windows Baseline 2026.1')).toBeVisible();

    await page.getByRole('tab', { name: /^History/ }).click();
    await expect(page.getByText('group.create')).toBeVisible();

    // Declared in the contract, served by nothing — disabled, not invented.
    await expect(page.getByRole('tab', { name: 'Patches' })).toBeDisabled();
    await expect(page.getByRole('tab', { name: 'Software' })).toBeDisabled();
  });

  test('Deployments shows its six counters over a grid of actions', async ({ page }) => {
    await page.goto('/deployments');
    await expect(page.getByRole('heading', { name: 'Deployments' })).toBeVisible();

    // By role, because two of these labels are also status words in the grid.
    for (const label of [
      'All Actions',
      'Active / waiting',
      'Scheduled',
      'Completed',
      'With Failures',
      'Paused / cancelled',
    ]) {
      await expect(page.getByRole('button', { name: new RegExp(`^${label}`) })).toBeVisible();
    }

    const rows = page.getByRole('table', { name: 'Deployments' }).locator('tbody tr');
    await expect(rows.first()).toBeVisible();
    // Every row carries its own result breakdown and its target sample.
    await expect(rows.first()).toContainText(/\d+ done/);
    await expect(rows.first()).toContainText(/Results Recorded/);
    await expect(rows.first().getByRole('button', { name: 'View Details' })).toBeVisible();
  });

  test('a Deployments counter narrows the grid without moving the counters', async ({ page }) => {
    await page.goto('/deployments');
    const all = page.getByRole('button', { name: /All Actions/ });
    const scheduled = page.getByRole('button', { name: /^Scheduled/ });
    await expect(all).toBeVisible();
    const total = (await all.innerText()).replace(/\D/g, '');

    await scheduled.click();
    await expect(scheduled).toHaveAttribute('aria-pressed', 'true');

    // The counters count every action, so they do not follow the filter.
    await expect(all).toContainText(total);
    // Everything left is scheduled, and a scheduled action says when it starts.
    const rows = page.getByRole('table', { name: 'Deployments' }).locator('tbody tr');
    await expect(rows.first()).toBeVisible();
    for (const row of await rows.allInnerTexts()) {
      expect(row).toContain('Scheduled');
      expect(row).toContain('Starts');
    }
  });

  test('an action opens its detail from the grid', async ({ page }) => {
    await page.goto('/deployments');
    const rows = page.getByRole('table', { name: 'Deployments' }).locator('tbody tr');
    await expect(rows.first()).toBeVisible();
    const name = await rows.first().locator('button').first().innerText();

    await rows.first().getByRole('button', { name: 'View Details' }).click();
    await expect(page).toHaveURL(/\/deployments\/dep-/);
    await expect(page.getByRole('heading', { name })).toBeVisible();
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

  test('Live Activity opens on the approved console: five tabs, three operations', async ({
    page,
  }) => {
    await page.goto('/liveops');

    for (const tab of ['Console', 'Log Collection', 'Task Results', 'Task History', 'Audit Trail'])
      await expect(page.getByRole('tab', { name: new RegExp('^' + tab) })).toBeVisible();

    for (const mode of ['Live Data', 'Run Script', 'Collect Logs'])
      await expect(page.getByRole('button', { name: new RegExp('^' + mode) })).toBeVisible();

    // Live Data is the operation the reference opens on, and its eight fields
    // are the checklist.
    await expect(page.getByRole('heading', { name: 'Configure Request' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Data to Request' })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: /Hostname/ })).toBeChecked();
    await expect(page.getByRole('heading', { name: 'Select Targets' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Review Request' })).toBeVisible();
  });

  test('Live Activity switches operation and submits, never offering a session', async ({
    page,
  }) => {
    await page.goto('/liveops');

    await page.getByRole('button', { name: /^Run Script/ }).click();
    await expect(page.getByLabel('Script Runtime')).toBeVisible();
    await expect(page.getByLabel('Custom Script')).toHaveValue(/Get-CimInstance/);

    await page.getByLabel('Task Name').fill('Verify firewall profiles');
    // A group is a target the server resolves, so the browser never sends ids.
    await page.getByLabel('Add Device Group').selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Review Request' }).click();

    await expect(page.getByRole('status').filter({ hasText: 'Request submitted' })).toBeVisible();

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

  test('Live Activity opens a task from history into the per-endpoint grid', async ({ page }) => {
    await page.goto('/liveops?tab=history');
    await expect(page.getByRole('heading', { name: 'Investigation History' })).toBeVisible();

    await page.getByRole('button', { name: 'Endpoint Health Investigation' }).click();
    await expect(page).toHaveURL(/tab=results/);
    await expect(
      page.getByRole('heading', { name: 'Endpoint Health Investigation' }),
    ).toBeVisible();

    for (const column of ['Device Name', 'Connection', 'Action Type', 'Exit Code', 'Timestamps'])
      await expect(page.getByRole('columnheader', { name: column })).toBeVisible();
  });

  test('Log Collection counts what is stored and filters by log type', async ({ page }) => {
    await page.goto('/liveops?tab=logs');

    for (const counter of [
      'Bundles Stored',
      'Hosts Covered',
      'Failed or Waiting',
      'Storage Used',
      'Next Scheduled',
    ])
      await expect(page.getByText(counter, { exact: true })).toBeVisible();

    await page.getByLabel('Log Type').selectOption('security');
    await expect(page.getByRole('cell', { name: /Security/ }).first()).toBeVisible();

    // Storage & Mail keeps the root path a placeholder: a real one names a server.
    await page.getByRole('tab', { name: 'Storage & Mail' }).click();
    await expect(page.getByText('<ROOT_SERVER>')).toBeVisible();
  });

  test('Vulnerabilities opens on the approved dashboard: six counters, six widgets', async ({
    page,
  }) => {
    await page.goto('/vulns');

    for (const kpi of [
      'Exposure Score',
      'Open Findings',
      'Critical & High',
      'Known Exploited',
      'SLA Overdue',
      'Scan Coverage',
    ])
      await expect(page.getByText(kpi, { exact: true }).first()).toBeVisible();

    for (const widget of [
      'Open Findings Trend',
      'SLA Status',
      'Top Priorities',
      'Vulnerability Age',
      'Top Fixes Out of Compliance',
      'Threat Indicators',
    ])
      await expect(page.getByRole('heading', { name: widget })).toBeVisible();

    for (const tab of ['Findings', 'Devices', 'Remediations', 'Projects', 'Scans'])
      await expect(page.getByRole('tab', { name: tab })).toBeVisible();

    // The grid sorts on the Priority Rating, not on CVSS: both columns are
    // there, and the reference puts Priority first. Scoped to the tab body,
    // because the Top Priorities widget above it has columns of its own.
    const grid = page.locator('[class*="tabBody"]');
    for (const column of ['Severity', 'Priority', 'CVSS', 'Finding', 'Threats', 'SLA', 'State'])
      await expect(grid.getByRole('columnheader', { name: column, exact: true })).toBeVisible();
  });

  test('a Vulnerabilities counter narrows the grid to what it counted', async ({ page }) => {
    await page.goto('/vulns');

    const exploited = await page
      .getByRole('button', { name: /Known Exploited/ })
      .first()
      .innerText();
    const expected = Number(/(\d[\d,]*)/.exec(exploited)?.[1]?.replace(/,/g, '') ?? '0');
    expect(expected).toBeGreaterThan(0);

    await page
      .getByRole('button', { name: /Known Exploited/ })
      .first()
      .click();
    await expect(page).toHaveURL(/threat=known-exploited/);
    await expect(page.getByText(`${expected} findings`)).toBeVisible();
  });

  test('a finding opens its drawer, with the solution and the scan evidence', async ({ page }) => {
    await page.goto('/vulns');

    await page.locator('[class*="tabBody"] table tbody tr').first().click();
    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();
    for (const fact of ['Priority Rating', 'CVSS v3.1 base', 'Fix type', 'Family'])
      await expect(drawer.getByText(fact, { exact: true })).toBeVisible();
    await expect(drawer.getByRole('heading', { name: 'Solution' })).toBeVisible();
    await expect(drawer.getByRole('heading', { name: 'Scan evidence' })).toBeVisible();
  });

  test('the other four Vulnerabilities tabs carry their own columns', async ({ page }) => {
    await page.goto('/vulns');

    const body = page.locator('[class*="tabBody"]');

    await page.getByRole('tab', { name: 'Devices' }).click();
    for (const column of ['Device Criticality', 'Exposure (0–1000)', 'Scan Method'])
      await expect(body.getByRole('columnheader', { name: column })).toBeVisible();

    await page.getByRole('tab', { name: 'Remediations' }).click();
    for (const column of ['Remediation', 'Risk Reduced', 'Fix Type'])
      await expect(body.getByRole('columnheader', { name: column })).toBeVisible();

    await page.getByRole('tab', { name: 'Projects' }).click();
    await expect(body.getByText(/devices remediated/).first()).toBeVisible();

    await page.getByRole('tab', { name: 'Scans' }).click();
    for (const column of ['Template', 'Targets', 'New Findings'])
      await expect(body.getByRole('columnheader', { name: column })).toBeVisible();
  });

  test('New Scan is accepted and the scan appears in the history', async ({ page }) => {
    await page.goto('/vulns?tab=scans');

    await page.getByRole('button', { name: '+ New Scan' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'New Scan' });
    await dialog.getByLabel('Scan name').fill('E2E ad-hoc scan');
    await dialog.getByLabel('Template').selectOption('critical-and-exploited-quick');
    await dialog.getByLabel('Targets').selectOption('windows');
    await dialog.getByRole('button', { name: 'Start Scan' }).click();

    await expect(dialog).toBeHidden();
    await expect(page.getByRole('cell', { name: 'Platform: Windows' }).first()).toBeVisible();
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
    // The reference shows this action to everyone, so it is rendered and
    // disabled rather than hidden — as on the software catalogue. The
    // permission itself is enforced on the endpoint, not by the button.
    await expect(page.getByRole('button', { name: '+ New action' })).toBeDisabled();

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

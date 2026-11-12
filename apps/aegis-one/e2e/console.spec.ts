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
    // The next page is a round trip, so the row has to be there before its
    // text can be compared: asserting straight away raced the fetch.
    await expect(grid.locator('tbody tr').first()).toBeVisible();
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

  test('Configuration opens on the approved dashboard: five counters, four widgets', async ({
    page,
  }) => {
    await page.goto('/profiles');

    for (const kpi of [
      'Overall Compliance',
      'Checks in Scope',
      'Failing Checks',
      'Non-Compliant Devices',
      'Exceptions',
    ])
      await expect(page.getByText(kpi, { exact: true }).first()).toBeVisible();

    for (const widget of [
      'Compliance by Framework',
      'Compliance by Platform',
      'Device Compliance',
      'Compliance by Category',
      'Top Failing Checks',
    ])
      await expect(page.getByRole('heading', { name: widget })).toBeVisible();

    for (const tab of ['Overview', 'Checks', 'Devices', 'Exceptions', 'Benchmarks', 'Profiles'])
      await expect(page.getByRole('tab', { name: tab })).toBeVisible();

    // All six filters narrow the page, and the Device Group one narrows the
    // counters too, not only the rows.
    for (const filter of [
      'Framework',
      'Platform',
      'Device Group',
      'Category',
      'Severity',
      'Result',
    ])
      await expect(page.getByLabel(filter, { exact: true })).toBeVisible();
  });

  test('the Checks grid carries the reference ten columns and pages through 200', async ({
    page,
  }) => {
    await page.goto('/profiles?tab=checks');

    // Scoped to the real grid: the dashboard figures carry visually-hidden
    // tables of their own for screen readers.
    const grid = page.locator('table[class*="grid"]');
    for (const column of [
      'Check',
      'Platform',
      'Severity',
      'Expected',
      'Frameworks',
      'Pass',
      'Fail',
      'Exc.',
      'Compliance',
    ])
      await expect(grid.getByRole('columnheader', { name: column, exact: true })).toBeVisible();

    await expect(page.getByText('1–50 of 200 checks')).toBeVisible();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByText('51–100 of 200 checks')).toBeVisible();
    await expect(page.getByText('Page 2 of 4')).toBeVisible();
  });

  test('a Configuration counter narrows the grid to what it counted', async ({ page }) => {
    await page.goto('/profiles');

    const scope = await page
      .getByRole('button', { name: /Checks in Scope/ })
      .first()
      .innerText();
    const expected = Number(/(\d[\d,]*)/.exec(scope)?.[1]?.replace(/,/g, '') ?? '0');
    expect(expected).toBeGreaterThan(0);

    await page
      .getByRole('button', { name: /Failing Checks/ })
      .first()
      .click();
    await expect(page).toHaveURL(/result=fail/);
    await expect(page.getByRole('tab', { name: 'Checks', selected: true })).toBeVisible();
    await expect(page.getByText('Result: Has Failures')).toBeVisible();
  });

  test('a check opens its drawer with the devices behind the count', async ({ page }) => {
    await page.goto('/profiles?tab=checks');

    await page.locator('table[class*="grid"] tbody tr button').first().click();
    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();
    for (const fact of [
      'Expected',
      'Severity',
      'Compliance',
      'Frameworks',
      'Pass · Fail · Exception',
      'Remediation',
    ])
      await expect(drawer.getByText(fact, { exact: true })).toBeVisible();

    // The per-device rows are derived from the same expression the counts
    // were rolled up with, so the drawer always has rows behind a failure.
    await expect(drawer.getByRole('heading', { name: 'Devices evaluated' })).toBeVisible();
    await expect(drawer.getByRole('columnheader', { name: 'Actual Value' })).toBeVisible();
    await expect(drawer.locator('tbody tr').first()).toBeVisible();
  });

  test('the other four Configuration tabs carry their own columns', async ({ page }) => {
    await page.goto('/profiles');
    const grid = page.locator('table[class*="grid"]');

    await page.getByRole('tab', { name: 'Devices' }).click();
    for (const column of ['Compliance', 'Failed', 'High Failed', 'Last Evaluated'])
      await expect(grid.getByRole('columnheader', { name: column, exact: true })).toBeVisible();

    await page.getByRole('tab', { name: 'Exceptions' }).click();
    for (const column of ['Scope', 'Reason', 'Expires', 'Created By'])
      await expect(grid.getByRole('columnheader', { name: column, exact: true })).toBeVisible();

    await page.getByRole('tab', { name: 'Benchmarks' }).click();
    for (const column of ['Benchmark', 'Checks', 'Assigned To', 'Devices'])
      await expect(grid.getByRole('columnheader', { name: column, exact: true })).toBeVisible();

    await page.getByRole('tab', { name: 'Profiles' }).click();
    await expect(page.getByRole('heading', { name: 'Security Posture' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Version History/ })).toBeVisible();
    for (const column of ['Profile', 'Assigned Devices', 'Status', 'Last Modified'])
      await expect(grid.getByRole('columnheader', { name: column, exact: true })).toBeVisible();
  });

  test('the Device Group filter narrows the counters, not only the rows', async ({ page }) => {
    await page.goto('/profiles');

    const before = await page
      .getByRole('button', { name: /Non-Compliant Devices/ })
      .first()
      .innerText();

    await page.getByLabel('Device Group', { exact: true }).selectOption({ label: 'Pilot Ring' });
    await expect(page.getByText('Device Group: Pilot Ring')).toBeVisible();

    await expect(async () => {
      const after = await page
        .getByRole('button', { name: /Non-Compliant Devices/ })
        .first()
        .innerText();
      expect(after).not.toBe(before);
    }).toPass();
  });

  test('Evaluate Now is accepted', async ({ page }) => {
    await page.goto('/profiles');

    await page.getByRole('button', { name: 'Evaluate Now' }).click();
    await expect(page.getByText('Evaluation queued')).toBeVisible();
  });

  test('DEX opens on the approved layout: four counters, three figures', async ({ page }) => {
    await page.goto('/dex');

    await expect(page.getByRole('heading', { name: 'Digital Employee Experience' })).toBeVisible();
    for (const kpi of ['Experience Score', 'Good', 'Warning', 'Poor'])
      await expect(page.getByText(kpi, { exact: true }).first()).toBeVisible();

    for (const panel of [
      'Distribution',
      'Score Breakdown',
      'Top Experience Issues',
      'Endpoints With the Lowest Scores',
      'How the Score Works',
    ])
      await expect(page.getByRole('heading', { name: panel })).toBeVisible();

    // Scoped to the real grid: the three figures carry visually-hidden tables.
    const grid = page.locator('table[class*="grid"]').first();
    for (const column of ['Computer', 'Score', 'Boot', 'CPU', 'Memory', 'Disk free'])
      await expect(grid.getByRole('columnheader', { name: column, exact: true })).toBeVisible();
  });

  test('the scoring method is published until an endpoint is picked', async ({ page }) => {
    await page.goto('/dex');

    // The thresholds are on the page, so the score can be checked by hand.
    const method = page.locator('table[class*="grid"]').nth(1);
    for (const column of ['Measure', 'Threshold', 'Points'])
      await expect(method.getByRole('columnheader', { name: column, exact: true })).toBeVisible();
    await expect(
      page.getByText('Select an endpoint in the table to see its score breakdown.'),
    ).toBeVisible();

    // Picking a row swaps the method out for that endpoint's own arithmetic.
    const first = page.locator('table[class*="grid"] tbody tr').first();
    const name = (await first.locator('button').first().innerText()).trim();
    const score = (await first.locator('td').nth(1).innerText()).trim();
    await first.click();

    await expect(
      page.getByRole('heading', { name: `Why is ${name} scored ${score}?` }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open Device' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Collect Logs' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'How the Score Works' })).toBeHidden();
  });

  test("a DEX penalty list accounts for the endpoint's own score", async ({ page }) => {
    await page.goto('/dex');

    const first = page.locator('table[class*="grid"] tbody tr').first();
    const score = Number((await first.locator('td').nth(1).innerText()).replace(/\D/g, ''));
    await first.click();

    // The penalties and the band cap together have to produce the figure the
    // grid showed: 100 minus what was lost, then capped.
    const items = page.locator('[class*="penalties"] li');
    const count = await items.count();
    expect(count).toBeGreaterThan(0);
    let lost = 0;
    for (let i = 0; i < count; i++) {
      lost += Number((await items.nth(i).locator('b').innerText()).replace(/\D/g, ''));
    }
    const cap = await page.getByText(/Capped at \d+ by the/).count();
    if (cap === 0) expect(100 - lost).toBe(score);
    else expect(score).toBeLessThanOrEqual(100 - lost);
  });

  test('Reports opens on the approved library: five counters, twenty cards', async ({ page }) => {
    await page.goto('/reports');

    for (const [label, count] of [
      ['All Reports', '20'],
      ['Computers & Software', '5'],
      ['Daily Operations', '6'],
      ['Security', '4'],
      ['Leadership', '5'],
    ]) {
      const tab = page.getByRole('tab', { name: new RegExp(`^${label}`) });
      await expect(tab).toBeVisible();
      await expect(tab).toContainText(count);
    }

    await expect(page.getByText('20 reports')).toBeVisible();
    await expect(page.locator('article')).toHaveCount(20);

    // Every card names what it would return, which is the point of the page.
    const first = page.locator('article').first();
    await expect(first.getByRole('heading', { name: 'All Computers' })).toBeVisible();
    await expect(first.getByText(/charts · \d+ columns/)).toBeVisible();
    await expect(first.getByRole('button', { name: 'Open Report →' })).toBeVisible();
  });

  test('a Reports category narrows the library to what it counted', async ({ page }) => {
    await page.goto('/reports');

    await expect(page.locator('article')).toHaveCount(20);
    const tab = page.getByRole('tab', { name: /^Security/ });
    const expected = Number((await tab.innerText()).replace(/\D/g, ''));
    expect(expected).toBe(4);

    await tab.click();
    await expect(page).toHaveURL(/category=security/);
    await expect(page.locator('article')).toHaveCount(expected);
    await expect(page.getByText(`${expected} reports`)).toBeVisible();
  });

  test('a report can be starred and found again under Favorites', async ({ page }) => {
    await page.goto('/reports');

    await page.getByRole('button', { name: 'Star Offline Computers' }).click();
    await expect(page.getByRole('button', { name: 'Unstar Offline Computers' })).toBeVisible();

    await page.getByRole('button', { name: /Favorites/ }).click();
    await expect(page.locator('article')).toHaveCount(1);
    await expect(page.getByRole('heading', { name: 'Offline Computers' })).toBeVisible();

    // Put it back, so the fixture is as the next test expects it.
    await page.getByRole('button', { name: 'Unstar Offline Computers' }).click();
  });

  test('opening a report shows its counters, charts and its own columns', async ({ page }) => {
    await page.goto('/reports');
    await page.locator('article').first().getByRole('button', { name: 'Open Report →' }).click();

    await expect(page).toHaveURL(/\/reports\/computers$/);
    await expect(page.getByRole('heading', { name: 'All Computers', exact: true })).toBeVisible();
    await expect(page.getByText('Computers in this report')).toBeVisible();

    for (const panel of [
      'Online and offline',
      'Operating systems',
      'Computers by location',
      'Computer types',
    ])
      await expect(page.getByRole('heading', { name: panel })).toBeVisible();

    // The reference lets the reader change a panel's form.
    await page.getByLabel('Chart type: Online and offline').selectOption('column');
    await expect(page.getByLabel('Chart type: Online and offline')).toHaveValue('column');

    const grid = page.locator('table[class*="grid"]');
    for (const column of ['Computer name', 'IP address', 'MAC address', 'Asset tag', 'TPM'])
      await expect(grid.getByRole('columnheader', { name: column, exact: true })).toBeVisible();

    await expect(page.getByText(/1–50 of .* computers/)).toBeVisible();
    await page.getByRole('button', { name: 'All Reports' }).click();
    await expect(page).toHaveURL(/\/reports$/);
  });

  test('Aegis Zones opens on the approved layout: five counters, three panels', async ({
    page,
  }) => {
    await page.goto('/sites');

    for (const kpi of [
      'WAN Saved',
      'WAN Avoided This Week',
      'Peer Cache Hit Rate',
      'Direct Downloads',
      'Avg Local Delivery',
    ])
      await expect(page.getByText(kpi, { exact: true })).toBeVisible();

    for (const panel of [
      'Delivery Distribution',
      'Aegis Zone Delivery Efficiency',
      'Content Delivery Path',
    ])
      await expect(page.getByRole('heading', { name: panel })).toBeVisible();

    // The path names every hop content takes, which is what the page is for.
    for (const hop of ['Central repository', 'Aegis Zone peer cache', 'Local peer', 'Endpoint'])
      await expect(page.getByText(hop, { exact: true })).toBeVisible();

    const grid = page.locator('table[class*="grid"]');
    for (const column of [
      'Aegis Zone',
      'Devices',
      'Connectivity',
      'Bandwidth',
      'Peer Cache',
      'Last Sync',
      'Status',
    ])
      await expect(grid.getByRole('columnheader', { name: column, exact: true })).toBeVisible();
  });

  test('a zone without a peer cache says so, and shows no local delivery', async ({ page }) => {
    await page.goto('/sites');

    // Three small branches carry no cache; the grid says "Not required"
    // rather than reporting them as a fault.
    const grid = page.locator('table[class*="grid"]');
    await expect(grid.getByText('Not required').first()).toBeVisible();
    await expect(grid.getByText('Peer cache active').first()).toBeVisible();

    // And the counters agree with each other: direct is the rest of local.
    const hit = Number(
      (await page.getByText('Peer Cache Hit Rate').locator('..').innerText()).match(
        /(\d+)%/,
      )?.[1] ?? '0',
    );
    const direct = Number(
      (await page.getByText('Direct Downloads').locator('..').innerText()).match(/(\d+)%/)?.[1] ??
        '0',
    );
    expect(hit + direct).toBe(100);
  });

  test('Refresh Discovery is accepted', async ({ page }) => {
    await page.goto('/sites');
    await page.getByRole('button', { name: 'Refresh Discovery' }).click();
    await expect(page.getByText('Discovery queued')).toBeVisible();
  });

  test('AEGIS Insight opens with no diagnosis, then reports a root cause', async ({ page }) => {
    await page.goto('/insight');

    // The reference's idle state: the form on the left, nothing on the right.
    await expect(page.getByRole('heading', { name: 'Describe the Problem' })).toBeVisible();
    await expect(page.getByText('No Diagnosis Yet')).toBeVisible();
    await expect(page.getByText('Endpoint:')).toBeVisible();

    await page.getByRole('button', { name: 'Run Diagnostics' }).click();

    await expect(page.getByText('Likely root cause')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Diagnostic Checks' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Recommended Actions' })).toBeVisible();
    await expect(page.getByText(/^\d+%$/)).toBeVisible();

    /*
     * The checks panel lists findings, not a checklist: every row carries a
     * severity, and none of them says "Pass".
     */
    const rows = page.locator('li', { hasText: /Critical|High|Medium|Low/ });
    expect(await rows.count()).toBeGreaterThan(0);
    await expect(page.getByText('Pass', { exact: true })).toHaveCount(0);
  });

  test('a diagnosis runs against the endpoint named in the URL', async ({ page }) => {
    await page.goto('/insight');

    // The endpoint link is the only place the page prints the device id, so
    // follow it to learn the id and then come back with it in the URL.
    const endpoint = page.getByText('Endpoint:').getByRole('button');
    const hostname = await endpoint.innerText();
    await endpoint.click();
    await expect(page).toHaveURL(/\/devices\/[^/]+$/);
    const id = new URL(page.url()).pathname.split('/').pop() ?? '';

    await page.goto(`/insight?device=${id}`);
    await expect(page.getByRole('button', { name: hostname })).toBeVisible();
  });

  test('Run Remediation queues a job rather than opening a session', async ({ page }) => {
    await page.goto('/insight');
    await page.getByRole('button', { name: 'Run Diagnostics' }).click();
    await expect(page.getByText('Likely root cause')).toBeVisible();

    await page.getByRole('button', { name: 'Run Remediation' }).click();

    // The toast and the button both read "Remediation queued", so scope the
    // first assertion to the notification region.
    await expect(
      page.getByRole('region', { name: 'Notifications' }).getByText('Remediation queued'),
    ).toBeVisible();
    await expect(
      page
        .getByRole('region', { name: 'Notifications' })
        .getByText('It runs as a job; the result appears under Live Activity.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remediation queued' })).toBeDisabled();
  });

  test('Integrations opens on the approved four tabs', async ({ page }) => {
    await page.goto('/integrations');

    for (const tab of ['Connectors', 'SIEM & Syslog', 'Notifications', 'Delivery Log'])
      await expect(page.getByRole('tab', { name: tab, exact: true })).toBeVisible();

    // The Connectors tab: its own status filter, and the reference's six cards.
    for (const f of ['All', 'Connected', 'Attention', 'Disabled'])
      await expect(page.getByRole('tab', { name: f, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '+ Custom Webhook' })).toBeVisible();
    await expect(page.locator('section').filter({ hasText: 'Last Sync' })).toHaveCount(6);

    // Each card prints what it is for and what it was granted.
    await expect(page.getByText('Incidents for Critical CVEs')).toBeVisible();
    await expect(page.getByText('Vulnerability: Read · Devices: Read')).toBeVisible();
  });

  test('the connector filter narrows to one status', async ({ page }) => {
    await page.goto('/integrations');
    await expect(page.locator('section').filter({ hasText: 'Last Sync' })).toHaveCount(6);

    await page.getByRole('tab', { name: 'Attention', exact: true }).click();
    const cards = page.locator('section').filter({ hasText: 'Last Sync' });
    await expect(cards).toHaveCount(1);
    await expect(cards.getByText('Microsoft Teams')).toBeVisible();

    await page.getByRole('tab', { name: 'Disabled', exact: true }).click();
    await expect(page.locator('section').filter({ hasText: 'Last Sync' })).toHaveCount(1);
    await expect(page.getByText('Deployment Alerts')).toBeVisible();
  });

  test('SIEM & Syslog counts what was forwarded, not what was configured', async ({ page }) => {
    await page.goto('/integrations?tab=siem');

    /*
     * "Connected" is both a counter label and a card status, so the counter
     * assertions are scoped to the counter row.
     */
    const kpis = page.locator('div[class*="kpis"]');
    for (const kpi of ['Connected', 'Events Forwarded', 'Retrying', 'Errors'])
      await expect(kpis.getByText(kpi, { exact: true })).toBeVisible();

    // Five destinations, and a target that was never set up cannot be tested.
    await expect(page.getByRole('button', { name: 'Set Up' })).toHaveCount(5);
    const tests = page.getByRole('button', { name: 'Test', exact: true });
    await expect(tests).toHaveCount(5);
    await expect(page.getByText('IBM QRadar')).toBeVisible();

    // The footnote is the page's security claim, so it must be on the page.
    await expect(page.getByText(/never stored in this browser/)).toBeVisible();
  });

  test('an alert rule can be added, switched off and removed', async ({ page }) => {
    await page.goto('/integrations?tab=notifications');

    const grid = page.locator('table[class*="grid"]');
    for (const column of ['When', 'Send To', 'Channel Status', 'Enabled'])
      await expect(grid.getByRole('columnheader', { name: column, exact: true })).toBeVisible();

    // A seeded rule that fans out to two channels prints both, in order.
    await expect(
      grid.locator('tr').filter({ hasText: 'Deployment Failed' }).locator('td').nth(1),
    ).toHaveText('SMTP Mail Server, Microsoft Teams');

    /*
     * The rest of this test adds its own rule rather than touching a seeded
     * one, so it leaves the fixture exactly as it found it and can be run
     * twice in a row.
     */
    await page.getByLabel('Event').selectOption('Agent offline over 7 days');
    await page.getByRole('button', { name: 'Add Rule' }).click();
    await expect(
      page.getByRole('region', { name: 'Notifications' }).getByText('Alert rule added'),
    ).toBeVisible();

    const mine = grid.locator('tr', { hasText: 'Agent offline over 7 days' });
    await expect(mine.getByRole('button', { name: 'On' })).toBeVisible();
    await mine.getByRole('button', { name: 'On' }).click();
    await expect(mine.getByRole('button', { name: 'Off' })).toBeVisible();

    await mine.getByRole('button', { name: 'Remove' }).click();
    await expect(
      page.getByRole('region', { name: 'Notifications' }).getByText('Alert rule removed'),
    ).toBeVisible();
    await expect(grid.locator('tr', { hasText: 'Agent offline over 7 days' })).toHaveCount(0);
  });

  test('the delivery log filters by result', async ({ page }) => {
    await page.goto('/integrations?tab=log');

    const grid = page.locator('table[class*="grid"]');
    for (const column of ['Time', 'Connector', 'Event Type', 'Event', 'Result'])
      await expect(grid.getByRole('columnheader', { name: column, exact: true })).toBeVisible();

    await expect(grid.locator('tbody tr').first()).toBeVisible();
    const all = await grid.locator('tbody tr').count();

    await page.getByLabel('Result').selectOption('retrying');
    await expect(grid.getByText('Delivered').first()).toHaveCount(0);
    expect(await grid.locator('tbody tr').count()).toBeLessThanOrEqual(all);
  });

  test('Peer Cache opens on the approved seven columns', async ({ page }) => {
    await page.goto('/peercache');

    const grid = page.locator('table[class*="grid"]');
    for (const column of [
      'Aegis Zone',
      'Current Peer Cache',
      'Agent Health',
      'Content Cached',
      'Cache Size',
      'Last Transfer',
      'Status',
    ])
      await expect(grid.getByRole('columnheader', { name: column, exact: true })).toBeVisible();

    // Every row offers Re-elect; Disable and Activity live behind the ⋯.
    await expect(grid.getByRole('button', { name: 'Re-elect' }).first()).toBeVisible();
    await expect(page.getByText('None elected').first()).toBeVisible();
  });

  test('an elected peer cache is a real endpoint, and opens it', async ({ page }) => {
    await page.goto('/peercache');

    /*
     * The page's whole claim is that a peer cache is a regular agent rather
     * than an appliance, so the hostname has to open that device.
     */
    const grid = page.locator('table[class*="grid"]');
    const peer = grid.locator('button[class*="link"]').first();
    const hostname = await peer.innerText();
    await peer.click();

    await expect(page).toHaveURL(/\/devices\/[^/]+$/);
    await expect(page.getByRole('heading', { name: hostname })).toBeVisible();
  });

  test('a zone with no cache offers no re-election', async ({ page }) => {
    await page.goto('/peercache');

    const grid = page.locator('table[class*="grid"]');
    const row = grid.locator('tr').filter({ hasText: 'None elected' }).first();
    await expect(row.getByText('Disabled')).toBeVisible();
    await expect(row.getByRole('button', { name: 'Re-elect' })).toBeDisabled();

    // Its ⋯ offers Enable rather than Disable, and Activity is unavailable.
    await row.getByRole('button', { name: /More actions/ }).click();
    await expect(page.getByRole('button', { name: 'Enable' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Activity' })).toBeDisabled();
  });

  test('Administration opens on the approved four tabs', async ({ page }) => {
    await page.goto('/admin');

    for (const tab of ['Identity & SSO', 'Users', 'Roles & Content Access', 'Agent Enrollment'])
      await expect(page.getByRole('tab', { name: tab, exact: true })).toBeVisible();

    // Identity & SSO opens first, with the reference's four provider cards.
    for (const provider of [
      'Okta',
      'Microsoft Entra ID',
      'Generic SAML 2.0',
      'LDAP / Active Directory',
    ])
      await expect(page.getByText(provider, { exact: true })).toBeVisible();

    // Each card prints STATUS and CONNECTION as two separate fields.
    await expect(page.getByText('Status', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Setup Required').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Configure' })).toHaveCount(4);
  });

  test('a role card prints its permissions and all three content scopes', async ({ page }) => {
    await page.goto('/admin?tab=roles');

    await expect(page.getByRole('button', { name: '+ Create role' })).toBeVisible();

    /*
     * The scoped role is the one the design exists for: narrowed on zones and
     * software, so the card shows names rather than "All" three times.
     */
    const scoped = page.locator('section').filter({ hasText: 'Jaipur Branch Operator' });
    await expect(scoped.getByText('Jaipur Branch', { exact: true })).toBeVisible();
    await expect(scoped.getByText('Browser, Utilities')).toBeVisible();
    await expect(scoped.getByText('All Groups')).toBeVisible();

    // A built-in role cannot be edited, which the contract states.
    const system = page.locator('section').filter({ hasText: 'Super Admin' });
    await expect(system.getByText('Full Console Access')).toBeVisible();
    await expect(system.getByRole('button', { name: 'Edit Permissions' })).toBeDisabled();
  });

  test('a console account can be disabled and re-enabled', async ({ page }) => {
    await page.goto('/admin?tab=users');

    const grid = page.locator('table[class*="grid"]');
    for (const column of ['User', 'Role', 'Access', 'Actions'])
      await expect(grid.getByRole('columnheader', { name: column, exact: true })).toBeVisible();

    /*
     * Acts on the Auditor account rather than a Super Admin, and puts it back,
     * so the test leaves the fixture exactly as it found it.
     */
    const row = grid.locator('tr').filter({ hasText: 'Kavya Chandrasekar' });
    await expect(row.getByText('Active')).toBeVisible();

    await row.getByRole('button', { name: /More actions/ }).click();
    await page.getByRole('button', { name: 'Revoke Sessions' }).click();
    await expect(row.getByText('Disabled')).toBeVisible();

    await row.getByRole('button', { name: /More actions/ }).click();
    await page.getByRole('button', { name: 'Enable account' }).click();
    await expect(row.getByText('Active')).toBeVisible();
  });

  test('Agent Enrollment lists the endpoints that have checked in', async ({ page }) => {
    await page.goto('/admin?tab=enrollment');

    const grid = page.locator('table[class*="grid"]');
    for (const column of ['Endpoint', 'Zone', 'Agent Version', 'Last Seen', 'Connection'])
      await expect(grid.getByRole('columnheader', { name: column, exact: true })).toBeVisible();

    await expect(grid.locator('tbody tr')).toHaveCount(25);
    await expect(page.getByText(/enrolled endpoints/)).toBeVisible();
  });

  test('an API token is created once, shown once, and can be revoked', async ({ page }) => {
    await page.goto('/admin?tab=tokens');

    const grid = page.locator('table[class*="grid"]');
    for (const column of ['Token', 'Prefix', 'Scopes', 'State', 'Last used', 'Expires'])
      await expect(grid.getByRole('columnheader', { name: column, exact: true })).toBeVisible();

    // An already-revoked token cannot be revoked twice.
    const dead = grid.locator('tr').filter({ hasText: 'legacy-inventory-export' });
    await expect(dead.getByText('Revoked')).toBeVisible();
    await expect(dead.getByRole('button', { name: 'Revoke' })).toBeDisabled();

    /*
     * Creates its own token and revokes it, so the test never touches a
     * seeded one and can be run twice in a row.
     */
    const name = `e2e-token-${Date.now()}`;
    await page.getByRole('button', { name: '+ New token' }).click();
    await page.getByLabel('Token name').fill(name);
    await page.getByRole('button', { name: 'Create token' }).click();

    // The secret is shown exactly once, and the dialog says so.
    await expect(page.getByText('This is the only time it will be shown.')).toBeVisible();
    const secret = await page.locator('pre').innerText();
    expect(secret).toMatch(/^aeg_[0-9a-f]+$/);
    await page.getByRole('button', { name: 'I have stored it' }).click();

    const row = grid.locator('tr').filter({ hasText: name });
    await expect(row.getByText('Active')).toBeVisible();
    // The grid shows a prefix, never the secret itself.
    await expect(page.getByText(secret)).toHaveCount(0);

    await row.getByRole('button', { name: 'Revoke' }).click();
    await page.getByRole('button', { name: 'Revoke token' }).click();
    await expect(
      page.getByRole('region', { name: 'Notifications' }).getByText('Token revoked'),
    ).toBeVisible();
    await expect(row.getByText('Revoked')).toBeVisible();
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

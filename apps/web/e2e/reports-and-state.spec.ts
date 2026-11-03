import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { choosePerson, open, ready, test } from './helpers';

type Captured = { name: string; text: string };
type W = { __csv: Captured[]; __print: { single: boolean; active: string[] } | null };

/** Records every CSV the page builds, so the test can read the content without Node APIs. */
async function captureCsv(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as W;
    w.__csv = [];
    let last: Blob | null = null;
    const create = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (b: Blob | MediaSource) => { last = b as Blob; return create(b); };
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      const blob = last;
      const name = this.download;
      if (blob) void blob.text().then((text) => w.__csv.push({ name, text }));
      return click.call(this);
    };
  });
}

const TABS = ['Risk profile', 'Resolution performance', 'Exceptions'];

async function exportCsv(page: Page, index: number): Promise<Captured> {
  await page.getByRole('tab', { name: new RegExp(`^${TABS[index]}`) }).click();
  const before = await page.evaluate(() => (window as unknown as W).__csv.length);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export CSV' }).click()]);
  await expect.poll(() => page.evaluate(() => (window as unknown as W).__csv.length)).toBe(before + 1);
  const csv = (await page.evaluate(() => (window as unknown as W).__csv)).at(-1)!;
  expect(download.suggestedFilename()).toBe(csv.name);
  return csv;
}

test('each report exports a CSV with the right header and rows', async ({ page }) => {
  await captureCsv(page);
  await open(page, '/reports');
  await expect(page.getByRole('tab')).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Export CSV' })).toHaveCount(1);

  const profile = await exportCsv(page, 0);
  expect(profile.name).toBe('risk-profile-by-department.csv');
  expect(profile.text.split('\r\n')[0]).toBe('Department,Critical,High,Medium,Low,Unrated,Total');
  expect(profile.text.split('\r\n')).toHaveLength(9); // header + 8 departments

  const resolution = await exportCsv(page, 1);
  expect(resolution.name).toBe('incident-resolution-performance.csv');
  expect(resolution.text.split('\r\n')[0]).toBe('Dimension,Group,Resolved,Mean hours,Median hours');
  expect(resolution.text.split('\r\n')).toHaveLength(1 + 4 + 8);

  const exceptions = await exportCsv(page, 2);
  expect(exceptions.name).toBe('incident-exceptions.csv');
  expect(exceptions.text.split('\r\n')[0]).toBe('Code,Title,Severity,Status,Department,Assignee,Linked risk,Occurred');
  // open incidents only: a closed incident can no longer be fixed, so it is not an exception to act on
  const rows = exceptions.text.split('\r\n').slice(1);
  expect(rows.length).toBeGreaterThan(0);
  for (const r of rows) expect(r).not.toMatch(/,Closed,/);
});

test('Print isolates one report, then restores the page', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as W;
    w.__print = null;
    window.print = () => {
      w.__print = {
        single: document.body.classList.contains('print-single'),
        active: [...document.querySelectorAll('[data-print-active]')].map((e) => e.getAttribute('data-report') ?? ''),
      };
      window.dispatchEvent(new Event('afterprint'));
    };
  });
  await open(page, '/reports');
  await page.getByRole('tab', { name: /^Resolution performance/ }).click();
  await page.getByRole('button', { name: 'Print' }).click();
  expect(await page.evaluate(() => (window as unknown as W).__print)).toEqual({ single: true, active: ['resolution'] });
  expect(await page.evaluate(() => document.body.classList.contains('print-single'))).toBe(false);
});

test('print styles hide navigation and chrome', async ({ page }) => {
  await open(page, '/reports');
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Export CSV' }).first()).toBeHidden();
});

test('changes are stored on the server, so they survive a reload and are not kept in the browser', async ({ page }) => {
  await open(page, '/risks/new');
  await page.getByLabel('Title').fill('Persistence check risk');
  await page.getByLabel('Description').fill('Created by the end-to-end test.');
  await page.getByLabel('Category').selectOption('Strategic');
  await page.getByLabel('Department').selectOption({ label: 'Sales' });
  await choosePerson(page, 'Owner', 'Ananya');
  await page.getByRole('button', { name: 'Register risk' }).click();
  await expect(page).toHaveURL(/\/risks\/RSK-\d{4}/);
  const url = page.url();

  await page.evaluate(() => localStorage.clear()); // nothing the app needs lives here
  await page.goto(url);
  await ready(page);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Persistence check risk');
  await open(page, '/risks');
  await page.getByRole('textbox', { name: 'Search', exact: true }).fill('Persistence check');
  await expect(page.locator('tbody tr.row-link')).toHaveCount(1);
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k !== 'aravalli:theme'))).toEqual([]); // no business data and no token in browser storage
});

test('a failed request shows an error state with a working retry', async ({ page }) => {
  let fail = true;
  await page.route('**/api/reports/overview', (route) => (fail ? route.abort() : route.continue()));
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('could not be loaded');
  fail = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Overview');
  await expect(page.getByText('Open risks').first()).toBeVisible();
});

test('anything an old version left in browser storage is ignored: the session lives in the cookie', async ({ page }) => {
  await open(page, '/risks');
  await page.evaluate(() => {
    localStorage.setItem('aravalli:session', JSON.stringify({ organisationId: 9999, actorId: 9999 }));
    localStorage.setItem('aravalli:theme', '{not json');
  });
  await page.reload();
  await ready(page);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Risk Register');
});

test('when the API is down the app says so and can retry', async ({ page }) => {
  let down = true;
  await page.route('**/api/auth/refresh', (route) => (down ? route.abort() : route.continue()));
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText("can't load");
  down = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Overview');
});

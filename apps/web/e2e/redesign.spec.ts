// The Overview, the Incident register, the Incident detail, and the fixes that came with it.
import { expect } from '@playwright/test';
import { open, test } from './helpers';

test('the Overview shows "N incidents on record · N open", open stages as bars, closed as text, and no per-month chart', async ({ page }) => {
  await open(page, '/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Overview');
  await expect(page.getByText(/\d[\d,]* incidents on record · \d[\d,]* open/)).toBeVisible();

  const stage = page.getByRole('heading', { name: 'Open incidents by stage' }).locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');
  await expect(stage.getByText(/^Closed\s*\d[\d,]*$/).first()).toBeVisible();
  for (const label of ['Open', 'Investigating', 'Contained', 'Resolved, awaiting close']) await expect(stage.locator("span", { hasText: label }).first()).toBeVisible();
  // Closed is not a bar, so it cannot hide the other stages
  await expect(stage.locator('span', { hasText: /^Closed$/ })).toHaveCount(0);
  await expect(page.getByText('Incidents per month')).toHaveCount(0);
});

test('the Incident register has saved-view tabs with counts, a Department filter, totals and pagination', async ({ page }) => {
  await open(page, '/incidents');
  const tabs = page.getByRole('tablist', { name: 'Saved views' });
  for (const name of ['All', 'Open', 'Assigned to me', 'Critical']) await expect(tabs.getByRole('tab', { name: new RegExp(`^${name}\\s*\\d+`) })).toBeVisible();
  await expect(page.getByLabel('Department')).toBeVisible();
  await expect(page.getByText(/Showing 1–20 of \d+ incidents/)).toBeVisible();

  await tabs.getByRole('tab', { name: /^Open\s*\d+/ }).click();
  await expect(page).toHaveURL(/view=open/);
  await expect(page.getByText(/Showing 1–\d+ of \d+ open incidents/)).toBeVisible();
  const rows = page.locator('tbody tr.row-link');
  const n = await rows.count();
  for (let i = 0; i < n; i++) await expect(rows.nth(i).locator('td').nth(4)).not.toHaveText(/Closed|Resolved/); // the Status column

  await tabs.getByRole('tab', { name: /^Critical\s*\d+/ }).click();
  const critical = page.locator('tbody tr.row-link');
  for (let i = 0; i < (await critical.count()); i++) await expect(critical.nth(i).locator('td').nth(3)).toContainText('Critical'); // the Severity column
  // a severity is a dot plus the word, never colour alone
  await expect(page.locator('tbody tr.row-link').first().locator('span[aria-hidden="true"]').first()).toBeAttached();
});

test('the Incident detail shows the stage progress, details with the linked risk, an update box and the timeline', async ({ page }) => {
  await open(page, '/incidents/INC-0003'); // seeded as Closed
  const steps = page.getByRole('list', { name: 'Incident progress' }).getByRole('listitem');
  await expect(steps).toHaveCount(5);
  await expect(steps.nth(4)).toHaveAttribute('aria-current', 'step');
  await expect(steps.nth(0)).toContainText('Open');
  await expect(page.getByRole('heading', { name: 'What happened' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Details' })).toBeVisible();
  await expect(page.getByText('Linked risk', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Add update' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Timeline/ })).toBeVisible();
});

test.describe('at 360px', () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test('the assignee dropdown has no horizontal scrollbar and shows full names with job titles', async ({ page }) => {
    await open(page, '/incidents/INC-0032');
    await page.getByLabel('Assignee').click();
    const list = page.getByRole('listbox');
    await expect(list.getByRole('option').first()).toBeVisible();
    const { scroll, client } = await list.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
    expect(scroll).toBeLessThanOrEqual(client);
    // the whole option is readable: the name is not cut off with an ellipsis, and a job title is shown
    const first = list.getByRole('option').first();
    const [name, title] = await first.locator('span').allInnerTexts();
    expect(name.length).toBeGreaterThan(3);
    expect(title).toMatch(/\S+,\s*\S+/);
    const cut = await first.locator('span').first().evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(cut).toBe(false);
  });

  test('the Incident register and its detail fit the screen', async ({ page }) => {
    for (const path of ['/incidents', '/incidents/INC-0003', '/']) {
      await open(page, path);
      const { scroll, inner } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
      expect(scroll, path).toBeLessThanOrEqual(inner);
    }
  });
});

test('Ctrl+K focuses the search box, and the page has a favicon and link-preview tags', async ({ page }) => {
  await open(page, '/');
  await expect(page.locator('kbd')).toBeVisible();
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('combobox', { name: 'Search risks and incidents' })).toBeFocused();
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/favicon.svg');
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /og\.png$/);
});

test('numbers use the proportional tabular font (so "5,481" has no gaps) and record codes use Geist Mono', async ({ page }) => {
  await open(page, '/incidents');
  const fonts = await page.evaluate(() => ({
    num: getComputedStyle(document.querySelector('.num')!).fontFamily,
    code: getComputedStyle(document.querySelector('tbody .code')!).fontFamily,
  }));
  expect(fonts.num).not.toContain('Geist Mono');
  expect(fonts.code).toContain('Geist Mono');
});

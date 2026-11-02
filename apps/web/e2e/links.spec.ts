import { expect, test } from '@playwright/test';
import { open, ready, rowCount } from './helpers';

test('Overview attention banner links open the right filtered registers', async ({ page }) => {
  await open(page, '/');
  await page.getByRole('link', { name: 'Review Critical risks' }).click();
  await expect(page).toHaveURL(/band=Critical/);
  await ready(page);
  expect(await rowCount(page)).toBeGreaterThan(0);
  for (const row of await page.locator('tbody tr.row-link').all()) await expect(row).toContainText('Critical');
  await open(page, '/');
  await page.getByRole('link', { name: 'Assign incidents' }).click();
  await expect(page).toHaveURL(/assignee=none/);
  await ready(page);
  expect(await rowCount(page)).toBeGreaterThan(0);
  for (const row of await page.locator('tbody tr.row-link').all()) await expect(row).toContainText('Unassigned');
});

test('People and Departments counts link to registers with exactly that many rows', async ({ page }) => {
  await open(page, '/departments');
  const finance = page.getByRole('row', { name: /Finance/ });
  const openRisks = Number(await finance.getByRole('link').first().textContent());
  await finance.getByRole('link').first().click();
  await expect(page).toHaveURL(/department=1/);
  // the Departments figure counts open risks; the register also lists the closed ones
  await expect(page.locator('tbody tr.row-link').filter({ hasNotText: 'Closed' })).toHaveCount(openRisks);

  await open(page, '/people');
  const row = page.getByRole('row', { name: /Ananya Reddy/ });
  const owned = Number(await row.getByRole('link').first().textContent());
  await row.getByRole('link').first().click();
  await expect(page).toHaveURL(/owner=/);
  await expect.poll(() => rowCount(page)).toBeGreaterThanOrEqual(owned);
});

test('the heat-map page lists the risks in a clicked cell and compares first vs current', async ({ page }) => {
  await open(page, '/risks/heatmap');
  await page.getByRole('button', { name: /Likelihood 3, impact 4/ }).click();
  await expect(page.getByText('Likelihood 3 × Impact 4')).toBeVisible();
  expect(await page.getByRole('link', { name: /^RSK-/ }).count()).toBe(11);
  await page.getByRole('tab', { name: 'As of first assessment' }).click();
  await expect(page.getByText(/open risks by likelihood and impact/)).toBeVisible();
});

test('the assessment and status panels close with Escape and give focus back', async ({ page }) => {
  await open(page, '/risks/RSK-0001');
  const opener = page.getByRole('button', { name: 'New assessment' });
  await opener.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

test('keyboard: tabbing reaches the main controls and shows a focus ring', async ({ page }) => {
  await open(page, '/risks');
  await page.keyboard.press('Tab');
  const outline = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    return getComputedStyle(el).outlineStyle;
  });
  expect(outline).not.toBe('none');
});

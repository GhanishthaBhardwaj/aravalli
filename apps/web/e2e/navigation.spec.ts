import { expect } from '@playwright/test';
import { open, test } from './helpers';

const PAGES: [string, string, string][] = [
  ['/', 'Overview', 'Overview'],
  ['/risks', 'Risk Register', 'Risk Register'],
  ['/risks/heatmap', 'Heat Map', 'Heat Map'],
  ['/risks/new', 'Register risk', 'Register risk'],
  ['/risks/RSK-0002', 'RSK-0002', 'Vendor payment approval bypass in ERP'],
  ['/incidents', 'Incident Register', 'Incident Register'],
  ['/incidents/new', 'Report incident', 'Report incident'],
  ['/incidents/INC-0003', 'INC-0003', 'Phishing compromise'],
  ['/departments', 'Departments', 'Departments'],
  ['/people', 'People', 'People'],
  ['/reports', 'Reports', 'Reports'],
];

for (const [path, , heading] of PAGES) {
  test(`renders ${path}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await open(page, path);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(heading);
    expect(errors).toEqual([]);
  });
}

test('sidebar links navigate to every main screen', async ({ page }) => {
  await open(page, '/');
  const nav = page.getByRole('navigation', { name: 'Main' });
  for (const [label, heading] of [
    ['Risk Register', 'Risk Register'], ['Heat Map', 'Heat Map'], ['Incident Register', 'Incident Register'],
    ['Report Incident', 'Report incident'], ['Departments', 'Departments'], ['People', 'People'],
    ['Reports', 'Reports'], ['Overview', 'Overview'],
  ]) {
    await nav.getByRole('link', { name: label }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(heading);
  }
});

test('unknown routes and unknown records show the 404 page', async ({ page }) => {
  await open(page, '/nope');
  await expect(page.getByText(/404/)).toBeVisible();
  await open(page, '/risks/RSK-9999');
  await expect(page.getByText(/404/)).toBeVisible();
  await open(page, '/incidents/INC-9999');
  await expect(page.getByText(/404/)).toBeVisible();
});

test('global search finds records by code and by title, and opens them', async ({ page }) => {
  await open(page, '/');
  const search = page.getByRole('combobox', { name: /search/i });
  await search.fill('RSK-0002');
  await page.getByRole('listbox').getByRole('option').first().click();
  await expect(page).toHaveURL(/\/risks\/RSK-0002/);
  await search.fill('phishing');
  await expect(page.getByRole('listbox').getByRole('option').first()).toBeVisible();
  await search.press('Enter');
  await expect(page).toHaveURL(/\/(risks|incidents)\//);
});

test('a heat-map cell on the Overview opens the register filtered to that cell', async ({ page }) => {
  await open(page, '/');
  await page.getByRole('button', { name: /Likelihood 3, impact 4/ }).click();
  await expect(page).toHaveURL(/l=3&i=4/);
  await expect(page.getByText(/Showing 1–11 of 11/)).toBeVisible();
});

import { expect } from '@playwright/test';
import { open, test } from './helpers';

const ROUTES = [
  '/', '/risks', '/risks/new', '/risks/heatmap', '/risks/RSK-0002', '/incidents', '/incidents/new',
  '/incidents/INC-0003', '/departments', '/people', '/reports', '/nope',
];

test.use({ viewport: { width: 360, height: 740 } });

for (const route of ROUTES) {
  test(`no page-level horizontal overflow at 360px on ${route}`, async ({ page }) => {
    await open(page, route);
    const { scroll, inner } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
    expect(scroll).toBeLessThanOrEqual(inner);
  });
}

test('mobile navigation opens, navigates and closes', async ({ page }) => {
  await open(page, '/');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav).toBeVisible();
  await nav.getByRole('link', { name: 'Risk Register' }).click();
  await expect(page).toHaveURL(/\/risks$/);
  await expect(page.getByRole('button', { name: 'Close navigation' })).toHaveCount(0);
});

test('the heat map and the register are usable on a phone', async ({ page }) => {
  await open(page, '/risks/heatmap');
  await page.getByRole('button', { name: /Likelihood 3, impact 4/ }).click();
  await expect(page.getByText('Likelihood 3 × Impact 4')).toBeVisible();
  await open(page, '/risks');
  await page.getByRole('textbox', { name: 'Search', exact: true }).fill('phishing');
  await expect(page.locator('tbody tr.row-link')).toHaveCount(1);
});

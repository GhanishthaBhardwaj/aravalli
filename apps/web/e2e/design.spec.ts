import { expect, test } from '@playwright/test';
import { open, ready } from './helpers';

const theme = (page: import('@playwright/test').Page) => page.evaluate(() => document.documentElement.dataset.theme);

test.describe('colour theme', () => {
  test('follows the system preference by default (dark)', async ({ browser }) => {
    const ctx = await browser.newContext({ colorScheme: 'dark' });
    const page = await ctx.newPage();
    await open(page, '/');
    expect(await theme(page)).toBe('dark');
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe('rgb(10, 10, 10)');
    await ctx.close();
  });

  test('follows the system preference by default (light)', async ({ browser }) => {
    const ctx = await browser.newContext({ colorScheme: 'light' });
    const page = await ctx.newPage();
    await open(page, '/');
    expect(await theme(page)).toBe('light');
    await ctx.close();
  });

  test('the toggle overrides the system, persists across reloads, and System goes back to following it', async ({ browser }) => {
    const ctx = await browser.newContext({ colorScheme: 'light' });
    const page = await ctx.newPage();
    await open(page, '/');
    await page.getByRole('radio', { name: 'Dark' }).click();
    expect(await theme(page)).toBe('dark');
    await page.reload();
    await ready(page);
    expect(await theme(page)).toBe('dark');
    await expect(page.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('radio', { name: 'System' }).click();
    expect(await theme(page)).toBe('light');
    await ctx.close();
  });

  test('the theme is applied before first paint, so there is no flash', async ({ browser }) => {
    const ctx = await browser.newContext({ colorScheme: 'dark' });
    const page = await ctx.newPage();
    await page.goto('/', { waitUntil: 'commit' });
    await page.waitForFunction(() => document.documentElement.dataset.theme !== undefined, null, { timeout: 2000 });
    expect(await theme(page)).toBe('dark');
    await ctx.close();
  });
});

test('Geist is the UI font, and Geist Mono is used for record codes', async ({ page }) => {
  await open(page, '/risks');
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    const body = getComputedStyle(document.body).fontFamily;
    const code = getComputedStyle(document.querySelector('tbody .num')!).fontFamily;
    return { body, code, sans: document.fonts.check('16px Geist'), mono: document.fonts.check('16px "Geist Mono"') };
  });
  expect(fonts.body).toContain('Geist');
  expect(fonts.code).toContain('Geist Mono');
  expect(fonts.sans && fonts.mono).toBe(true);
});

test('the one accent is orange, used for the primary action', async ({ page }) => {
  await open(page, '/risks');
  const bg = await page.getByRole('link', { name: 'Register risk' }).evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).toBe('rgb(242, 92, 5)');
});

test('a list with nothing in it explains itself instead of showing an empty table', async ({ page }) => {
  // an organisation that has just been created and has no departments yet
  await page.route('**/api/departments', (route) => route.fulfill({ json: { data: [] } }));
  await open(page, '/departments');
  await expect(page.getByText('No departments yet')).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
});

test('a crashing screen shows an error state instead of a blank page, and recovers on navigation', async ({ page }) => {
  await page.goto('/__crash');
  await expect(page.getByRole('alert')).toContainText('Something went wrong');
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'People' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('People');
});

test('pages show a loading state before their data appears', async ({ page }) => {
  // the loading state lasts a fraction of a second, so record that it appeared rather than racing to catch it
  await page.addInitScript(() => {
    const w = window as unknown as { __sawLoading: boolean };
    w.__sawLoading = false;
    new MutationObserver(() => {
      if (document.querySelector('[aria-label="Loading"]')) w.__sawLoading = true;
    }).observe(document, { childList: true, subtree: true });
  });
  await page.goto('/risks');
  await ready(page);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Risk Register');
  expect(await page.evaluate(() => (window as unknown as { __sawLoading: boolean }).__sawLoading)).toBe(true);
});

test('tabs work with the keyboard and expose the right roles', async ({ page }) => {
  await open(page, '/risks/heatmap');
  const first = page.getByRole('tab', { name: 'Current' });
  const second = page.getByRole('tab', { name: 'As of first assessment' });
  await expect(first).toHaveAttribute('aria-selected', 'true');
  await first.focus();
  await page.keyboard.press('ArrowRight');
  await expect(second).toHaveAttribute('aria-selected', 'true');
  await expect(second).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(first).toHaveAttribute('aria-selected', 'true');
});

test('modal traps focus and closes on the backdrop', async ({ page }) => {
  await open(page, '/risks/RSK-0001');
  await page.getByRole('button', { name: 'New assessment' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 25; i++) await page.keyboard.press('Tab');
  expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  await page.mouse.click(5, 5);
  await expect(dialog).toBeHidden();
});

test.describe('at 360px', () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test('the modal fits the screen', async ({ page }) => {
    await open(page, '/risks/RSK-0001');
    await page.getByRole('button', { name: 'New assessment' }).click();
    const box = await page.getByRole('dialog').boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(360);
  });

  test('theme can be switched from the mobile menu', async ({ page }) => {
    await open(page, '/');
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await page.getByRole('radio', { name: 'Dark' }).click();
    expect(await theme(page)).toBe('dark');
  });
});

test('motion is switched off when the system asks for reduced motion', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await open(page, '/');
  // the heat map reveal would otherwise animate cells in; with reduced motion they are simply there
  const cell = page.getByRole('button', { name: /Likelihood 3, impact 4/ });
  await expect(cell).toBeVisible();
  const opacity = await cell.evaluate((el) => getComputedStyle(el).opacity);
  expect(Number(opacity)).toBe(1);
  await ctx.close();
});

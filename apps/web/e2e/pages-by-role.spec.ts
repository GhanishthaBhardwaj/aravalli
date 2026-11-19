// Every page, for every role, at desktop, tablet and phone width: it loads, nothing overflows, and a role that may not open a page is told so.
import { expect } from '@playwright/test';
import { anonymous, open, signInAs, test, PEOPLE, type Person } from './helpers';

const ROUTES = [
  '/', '/risks', '/risks/new', '/risks/heatmap', '/risks/RSK-0002', '/incidents', '/incidents/new', '/incidents/INC-0003',
  '/departments', '/people', '/reports', '/users',
];

/** Pages a role may not open at all (the server refuses them too). */
const FORBIDDEN: Record<string, string[]> = {
  'Org Admin': [],
  'Risk Officer': ['/users'],
  Auditor: ['/users'],
  'Department Head': ['/users', '/reports', '/risks/heatmap'],
  Employee: ['/risks', '/risks/new', '/risks/heatmap', '/risks/RSK-0002', '/departments', '/people', '/reports', '/users'],
};

const WIDTHS = [1280, 768, 375];

for (const [who, role] of Object.entries(PEOPLE)) {
  test(`${role}: every page loads at desktop, tablet and phone width`, async ({ page }) => {
    await signInAs(page, who as Person);
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 800 });
      for (const route of ROUTES) {
        await open(page, route);
        const where = `${role} ${route} at ${width}px`;
        if (FORBIDDEN[role]!.includes(route)) {
          await expect(page.getByText(/cannot open this page/), where).toBeVisible();
        } else {
          // a page, or the plain "not found" page for a record this person may not see: never a crash or a blank screen
          await expect(page.getByRole('heading', { level: 1 }), where).toBeVisible();
          await expect(page.getByText('Something went wrong'), where).toHaveCount(0);
        }
        const { scroll, inner } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
        expect(scroll, `${where}: horizontal overflow`).toBeLessThanOrEqual(inner);
      }
    }
  });
}

test('the Auditor is read-only on every page that has buttons', async ({ page }) => {
  await signInAs(page, 'Sandeep Joshi');
  await open(page, '/risks');
  await expect(page.getByRole('link', { name: 'Register risk' }).or(page.getByRole('button', { name: 'Register risk' }))).toHaveAttribute('aria-disabled', 'true');
  await open(page, '/incidents/INC-0032');
  for (const name of ['Post update', 'Assign', 'Link risk']) await expect(page.getByRole('button', { name })).toHaveAttribute('aria-disabled', 'true');
  await open(page, '/risks/RSK-0002');
  await expect(page.getByRole('button', { name: 'New assessment' })).toHaveAttribute('aria-disabled', 'true');
});

test('refreshing an inner page keeps the person signed in on that page', async ({ page }) => {
  await open(page, '/incidents/INC-0003');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page).toHaveURL(/\/incidents\/INC-0003$/);
});

test('logging out returns to the landing page and closes the app pages', async ({ page }) => {
  await open(page, '/');
  await page.getByTestId('account-menu').click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(/See the next risk/);
  await page.goto('/incidents');
  await expect(page).toHaveURL(/\/login/);
});

test('an unknown address shows the 404 page with a way back', async ({ page }) => {
  await open(page, '/no-such-page');
  await expect(page.getByText('404')).toBeVisible();
  await page.getByRole('link', { name: 'Go to Overview' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Overview');
});

// The public pages, signed out.
for (const width of [1280, 768, 375]) {
  anonymous(`the landing page, log in and sign up fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    for (const path of ['/', '/login', '/signup']) {
      await page.goto(path);
      await page.waitForTimeout(400);
      const { scroll, inner } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
      expect(scroll, `${path} at ${width}px`).toBeLessThanOrEqual(inner);
    }
  });
}

anonymous('log in: each demo card shows its five roles in one row, and the form fits a 1366x768 screen', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/login');
  await expect(page.getByTestId('demo-aravalli-industries-Auditor')).toBeVisible();
  const tops = await page.locator('[data-testid^="demo-aravalli-industries-"]').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
  expect(tops).toHaveLength(5);
  expect(new Set(tops).size).toBe(1); // one row
  const { scroll, inner } = await page.evaluate(() => ({ scroll: document.documentElement.scrollHeight, inner: window.innerHeight }));
  expect(scroll).toBeLessThanOrEqual(inner); // no scrolling needed
});

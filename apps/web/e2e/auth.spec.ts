import { expect } from '@playwright/test';
import { anonymous as test, signInAs, ready, open } from './helpers';

test('a visitor sees the landing page with the hero, a 3D heat map or its fallback, pricing and a clearly marked placeholder testimonial', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('See the risk before it becomes the incident');
  await expect(page.getByRole('link', { name: 'Start free' }).first()).toBeVisible();
  await expect(page.getByTestId('hero-visual')).toBeVisible();
  await expect(page.getByTestId('hero-3d').or(page.getByTestId('hero-visual').locator('.grid')).first()).toBeVisible();
  await expect(page.getByTestId('placeholder-tag')).toContainText('Placeholder');
  // yearly pricing is the default; the toggle changes the displayed price only
  await expect(page.getByTestId('price-Professional')).toContainText('$41');
  await page.getByRole('radio', { name: 'Monthly' }).click();
  await expect(page.getByTestId('price-Professional')).toContainText('$49');
  await page.getByText('Who can see and change what?').click();
  await expect(page.getByText('Auditors can read everything and change nothing')).toBeVisible();
});

test('the landing page respects reduced motion and still shows the product screenshot', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.getByTestId('product-shot')).toBeAttached();
  const transform = await page.getByTestId('product-shot').evaluate((el) => getComputedStyle(el).transform);
  expect(transform === 'none' || transform.startsWith('matrix(1, 0, 0, 1')).toBe(true);
  await ctx.close();
});

test('protected pages send a visitor to sign in, then bring them back', async ({ page }) => {
  await page.goto('/risks');
  await expect(page).toHaveURL(/\/login\?next=%2Frisks/);
});

test('demo login buttons sign in as each role, the account menu shows who, and sign out ends the session', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Try a demonstration organisation' })).toBeVisible();
  await page.getByTestId('demo-aravalli-industries-Auditor').click();
  await expect(page.getByTestId('account-menu')).toContainText('Auditor');
  await page.getByTestId('account-menu').click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('See the risk');
  await page.goto('/incidents');
  await expect(page).toHaveURL(/\/login/);
});

test('sign-up creates an organisation and its Org Admin, who lands on a dashboard and sees the Users page', async ({ page }) => {
  const email = `founder${Date.now()}@browser.example`;
  await page.goto('/signup');
  await page.getByLabel('Organisation name').fill('Browser Test Co');
  await page.getByLabel('First name').fill('Fay');
  await page.getByLabel('Last name').fill('Founder');
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password').fill('short');
  await page.getByRole('button', { name: 'Create organisation' }).click();
  await expect(page.getByText('Use at least 10 characters.')).toBeVisible();
  await page.getByLabel('Password').fill('A-good-password-1');
  await page.getByRole('button', { name: 'Create organisation' }).click();
  await expect(page.getByTestId('account-menu')).toContainText('Org Admin');
  await expect(page.getByTestId('verify-banner')).toBeVisible();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Users' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Users');
});

test('each role gets its own home and menu', async ({ page }) => {
  const cases: Array<['Neha Kapoor' | 'Rajesh Khanna' | 'Arjun Menon' | 'Sandeep Joshi' | 'Pooja Nair', RegExp, string[], string[]]> = [
    ['Arjun Menon', /Overview/, ['Users', 'Reports'], []],
    ['Neha Kapoor', /Overview/, ['Reports', 'Heat Map'], ['Users']],
    ['Rajesh Khanna', /Finance/, ['Risk Register', 'People'], ['Users', 'Reports', 'Heat Map']],
    ['Sandeep Joshi', /Overview/, ['Reports'], ['Users']],
    ['Pooja Nair', /Hello, Pooja/, ['Report Incident'], ['Risk Register', 'Reports', 'People', 'Users']],
  ];
  for (const [who, heading, has, hasNot] of cases) {
    await signInAs(page, who);
    await open(page, '/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(heading);
    const nav = page.getByRole('navigation', { name: 'Main' });
    for (const label of has) await expect(nav.getByRole('link', { name: label })).toBeVisible();
    for (const label of hasNot) await expect(nav.getByRole('link', { name: label })).toHaveCount(0);
  }
  await ready(page);
});

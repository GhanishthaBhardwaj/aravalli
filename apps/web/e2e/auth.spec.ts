import { expect } from '@playwright/test';
import { anonymous as test, open, ready, signInAs } from './helpers';

test('a visitor sees the landing page: the typed headline, the sections, the data credits, and no pricing', async ({ page }) => {
  await page.goto('/');
  const headline = 'See the next risk before it becomes an incident.';
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(headline);
  await expect(page.getByRole('link', { name: 'Start free' }).first()).toBeVisible();
  await expect(page.getByTestId('hero-visual')).toBeVisible();
  await expect(page.getByText('OSHA severe injury report 2025010024')).toBeAttached();
  await expect(page.getByRole('heading', { name: 'How it works' })).toBeAttached();
  await expect(page.getByRole('heading', { name: 'Open a demo company' })).toBeAttached();
  await expect(page.getByRole('heading', { name: 'Questions' })).toBeAttached();
  await expect(page.getByText('OSHA Severe Injury Reports · US manufacturing 2024–2025').first()).toBeAttached();
  await expect(page.getByText('UCI ServiceNow Incident Log · anonymised IT company').first()).toBeAttached();
  await expect(page.getByTestId('landing-demo-osha-manufacturing-Org Admin')).toBeAttached();
  await expect(page.getByText(/pricing|per user|testimonial|placeholder/i)).toHaveCount(0);
  // the headline types itself, once
  await expect(page.locator('h1 span[aria-hidden]').first()).toHaveText(headline, { timeout: 5000 });
});

test('the 3D landscape is hidden on a small screen', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 900 });
  await page.goto('/');
  await expect(page.getByTestId('hero-visual')).toBeHidden();
});

test('the landing page respects reduced motion: no animation, the whole headline at once, and the product screenshot still there', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.locator('h1 span[aria-hidden]').first()).toHaveText('See the next risk before it becomes an incident.');
  await expect(page.locator('.lp-cursor')).toHaveCount(0);
  await expect(page.getByTestId('product-shot')).toBeAttached();
  const transform = await page.getByTestId('product-shot').evaluate((el) => getComputedStyle(el).transform);
  expect(transform === 'none' || transform.startsWith('matrix(1, 0, 0, 1')).toBe(true);
  expect(await page.locator('.lp-spin').evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  await ctx.close();
});

test('protected pages send a visitor to sign in', async ({ page }) => {
  await page.goto('/risks');
  await expect(page).toHaveURL(/\/login\?next=%2Frisks/);
});

test('the old email pages are gone', async ({ page }) => {
  await page.goto('/forgot-password');
  await expect(page).toHaveURL(/\/login\?next=/);
  await page.goto('/login');
  await expect(page.getByText('Forgot password?')).toHaveCount(0);
  await expect(page.getByText(/ask your org admin/i)).toBeVisible();
});

test('demo login buttons sign in as each role, the account menu shows who, and sign out ends the session', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'or try a demo organisation' })).toBeVisible();
  await page.getByTestId('demo-aravalli-industries-Auditor').click();
  await expect(page.getByTestId('account-menu')).toContainText('Auditor');
  await page.getByTestId('account-menu').click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(/See the next risk/);
  await page.goto('/incidents');
  await expect(page).toHaveURL(/\/login/);
});

test('sign-up creates an organisation and its Org Admin, who adds a person who can then sign in', async ({ page, browser }) => {
  const stamp = Date.now();
  await page.goto('/signup');
  await page.getByLabel('Organisation name').fill('Browser Test Co');
  await page.getByLabel('First name').fill('Fay');
  await page.getByLabel('Last name').fill('Founder');
  await page.getByLabel('Work email').fill(`founder${stamp}@browser.example`);
  await page.getByLabel('Password').fill('short');
  await page.getByRole('button', { name: 'Create organisation' }).click();
  await expect(page.getByText('Use at least 10 characters.')).toBeVisible();
  await page.getByLabel('Password').fill('A-good-password-1');
  await page.getByRole('button', { name: 'Create organisation' }).click();
  await expect(page.getByTestId('account-menu')).toContainText('Org Admin');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Users' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Users');

  const person = `sam${stamp}@browser.example`;
  const form = page.getByRole('form', { name: 'Add a person' });
  await form.getByLabel('First name').fill('Sam');
  await form.getByLabel('Last name').fill('Auditor');
  await form.getByLabel('Email (their login)').fill(person);
  await form.getByLabel('Role').selectOption('Auditor');
  await form.getByLabel('First password').fill('weak');
  await form.getByRole('button', { name: 'Add person' }).click();
  await expect(form.getByText('Use at least 10 characters.')).toBeVisible();
  await form.getByLabel('First password').fill('Sams-password-77');
  await form.getByRole('button', { name: 'Add person' }).click();
  await expect(page.getByRole('table', { name: 'Users' }).getByRole('row', { name: /Sam Auditor/ })).toBeVisible();

  // the new person signs in from a clean browser
  const ctx = await browser.newContext();
  const other = await ctx.newPage();
  await other.goto('/login');
  await other.getByLabel('Email').fill(person);
  await other.getByLabel('Password').fill('Sams-password-77');
  await other.getByRole('button', { name: 'Log in' }).click();
  await expect(other.getByTestId('account-menu')).toContainText('Auditor');

  // the admin sets a new password for them
  await page.getByRole('button', { name: 'Set password for Sam Auditor' }).click();
  await page.getByLabel('New password').fill('Sams-new-password-88');
  await page.getByRole('dialog').getByRole('button', { name: 'Set password' }).click();
  await expect(page.getByTestId('toast').last()).toContainText('New password set');
  await ctx.close();
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

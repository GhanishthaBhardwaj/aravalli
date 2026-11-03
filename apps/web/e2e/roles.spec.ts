import { expect } from '@playwright/test';
import { actAs, open, ready, toast, test } from './helpers';

test('an Auditor is read-only everywhere, and disabled buttons say why', async ({ page }) => {
  await open(page, '/risks');
  await actAs(page, 'Sandeep Joshi');
  const register = page.getByRole('button', { name: 'Register risk' });
  await expect(register).toHaveAttribute('aria-disabled', 'true');
  await register.hover();
  await expect(page.getByRole('tooltip')).toContainText('Auditors have read-only access.');
  await register.click({ force: true });
  await expect(page).toHaveURL(/\/risks$/);

  await open(page, '/risks/RSK-0001');
  await expect(page.getByRole('button', { name: 'New assessment' })).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByRole('button', { name: 'Change status' })).toHaveAttribute('aria-disabled', 'true');

  await open(page, '/incidents/INC-0030');
  await expect(page.getByRole('button', { name: 'Post update' })).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByRole('button', { name: 'Assign' })).toHaveAttribute('aria-disabled', 'true');

  await open(page, '/incidents/new');
  await expect(page.getByRole('button', { name: 'Report incident' })).toHaveAttribute('aria-disabled', 'true');
});

test('an Employee can report incidents but not manage risks, and can only update their own incidents', async ({ page }) => {
  await open(page, '/risks');
  await actAs(page, 'Pooja Nair');
  // the risk register is not part of an Employee's world: no menu entry, and the page says so
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Risk Register' })).toHaveCount(0);
  await expect(page.getByText('cannot open this page')).toBeVisible();

  // reports an incident
  await open(page, '/incidents/new');
  await page.getByLabel('Title').fill('Spillage in the AP records room');
  await page.getByLabel('Description').fill('Water on the floor under the archive shelves.');
  await page.getByLabel('Severity').selectOption('Low');
  await page.getByLabel('Occurred').fill('2026-10-19T10:00');
  await page.getByLabel('Affected department').selectOption({ label: 'Finance' });
  await page.getByRole('button', { name: 'Report incident' }).click();
  await expect(page).toHaveURL(/\/incidents\/INC-\d{4}/);
  await expect(toast(page)).toContainText(/INC-\d{4}/);

  // may update it, may not assign it, may not close it
  await page.getByLabel('Note').fill('Mopped up and moved the boxes.');
  await page.getByRole('button', { name: 'Post update' }).click();
  await expect(page.getByText('Mopped up and moved the boxes.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Assign' })).toHaveAttribute('aria-disabled', 'true');

  // someone else's incident is locked
  await open(page, '/incidents/INC-0030');
  await expect(page.getByText(/not found/i).first()).toBeVisible(); // it is not theirs, so for them it does not exist
  await expect(page.getByLabel('Note')).toHaveCount(0);
});

test('Risk Officer, Department Head and Org Admin have full actions', async ({ page }) => {
  for (const who of ['Neha Kapoor', 'Rajesh Khanna', 'Arjun Menon'] as const) {
    await open(page, '/risks');
    await actAs(page, who);
    await ready(page);
    await expect(page.getByRole('link', { name: 'Register risk' })).toBeVisible();
  }
});

test('the session survives a reload and the account menu names the signed-in person', async ({ page }) => {
  await open(page, '/');
  await actAs(page, 'Arjun Menon');
  await page.reload();
  await ready(page);
  await expect(page.getByTestId('account-menu')).toContainText('Arjun Menon');
  await expect(page.getByTestId('account-menu')).toContainText('Org Admin');
});

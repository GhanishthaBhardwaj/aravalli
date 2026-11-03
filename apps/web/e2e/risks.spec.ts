import { expect } from '@playwright/test';
import { choosePerson, open, pick, rowCount, toast, test } from './helpers';

test('register risk validates, previews the score and creates a generated code and shows it as Assessed', async ({ page }) => {
  await open(page, '/risks/new');
  await page.getByRole('button', { name: 'Register risk' }).click();
  for (const msg of ['Title is required.', 'Description is required.', 'Choose a category.', 'Choose a department.', 'Choose an owner.']) {
    await expect(page.getByText(msg)).toBeVisible();
  }

  await page.getByLabel('Title').fill('abc');
  await page.getByRole('button', { name: 'Register risk' }).click();
  await expect(page.getByText('Title must be 5–150 characters.')).toBeVisible();

  await page.getByLabel('Title').fill('Single point of failure in the night-shift handover');
  await page.getByLabel('Description').fill('Handover notes live in one shared notebook.');
  await page.getByLabel('Category').selectOption('Operational');
  await page.getByLabel('Department').selectOption({ label: 'Operations' });
  // anyone active can own a risk, whatever their department: the search finds people from every department
  await page.getByLabel('Owner').fill('Harpreet');
  await expect(page.getByRole('listbox').getByRole('option', { name: /Harpreet Singh/ })).toBeVisible();
  await choosePerson(page, 'Owner', 'Rajesh Khanna'); // a Finance person owning an Operations risk

  await pick(page, 'Likelihood', 4);
  await pick(page, 'Impact', 5);
  await expect(page.getByText('20').first()).toBeVisible();
  await expect(page.getByText('Critical').first()).toBeVisible();

  await page.getByRole('button', { name: 'Register risk' }).click();
  await expect(page).toHaveURL(/\/risks\/RSK-\d{4}/);
  await expect(toast(page)).toContainText(/RSK-\d{4}/);
  await expect(page.getByText('Assessed').first()).toBeVisible();
  await expect(page.getByRole('main').getByText('Rajesh Khanna').first()).toBeVisible();
});

test('a risk registered without a score is Identified and cannot move to Assessed until it is assessed', async ({ page }) => {
  await open(page, '/risks/new');
  await page.getByLabel('Title').fill('Unscored supplier insolvency risk');
  await page.getByLabel('Description').fill('Not yet assessed.');
  await page.getByLabel('Category').selectOption('Financial');
  await page.getByLabel('Department').selectOption({ label: 'Finance' });
  await choosePerson(page, 'Owner', 'Ananya');
  await page.getByRole('button', { name: 'Register risk' }).click();
  await expect(page).toHaveURL(/\/risks\/RSK-\d{4}/);
  await expect(page.getByText('Identified').first()).toBeVisible();

  await page.getByRole('button', { name: 'Change status' }).click();
  const options = await page.getByLabel('New status').locator('option').allTextContents();
  expect(options.join(',')).not.toContain('Assessed');
});

test('assessing a risk twice grows its history and moves the heat map', async ({ page }) => {
  await open(page, '/risks/RSK-0027'); // seeded as Identified, never assessed
  await expect(page.getByText('Identified').first()).toBeVisible();

  await page.getByRole('button', { name: 'New assessment' }).click();
  await page.getByRole('button', { name: 'Save assessment' }).click();
  await expect(page.getByText('Select likelihood (1–5).')).toBeVisible();
  await pick(page, 'Likelihood', 2);
  await pick(page, 'Impact', 3);
  await page.getByRole('button', { name: 'Save assessment' }).click();
  await expect(toast(page)).toContainText('Assessment saved');
  await expect(page.getByText('Assessed').first()).toBeVisible();

  await page.getByRole('button', { name: 'New assessment' }).click();
  await pick(page, 'Likelihood', 5);
  await pick(page, 'Impact', 5);
  await page.getByRole('button', { name: 'Save assessment' }).click();
  await expect(page.getByText('Assessment history (2)')).toBeVisible();

  await open(page, '/risks/heatmap');
  await page.getByRole('button', { name: /Likelihood 5, impact 5/ }).click();
  await expect(page.getByText('RSK-0027')).toBeVisible();
  await page.getByRole('tab', { name: 'As of first assessment' }).click();
  await page.getByRole('button', { name: /Likelihood 2, impact 3/ }).click();
  await expect(page.getByText('RSK-0027')).toBeVisible();
});

test('assessment form rejects a future date and a date before the risk was identified', async ({ page }) => {
  await open(page, '/risks/RSK-0001');
  await page.getByRole('button', { name: 'New assessment' }).click();
  await pick(page, 'Likelihood', 3);
  await pick(page, 'Impact', 3);
  await page.getByLabel('Assessment date').fill('2030-01-01');
  await page.getByRole('button', { name: 'Save assessment' }).click();
  await expect(page.getByText('Date cannot be in the future.')).toBeVisible();
  await page.getByLabel('Assessment date').fill('2020-01-01');
  await page.getByRole('button', { name: 'Save assessment' }).click();
  await expect(page.getByText(/cannot predate/)).toBeVisible();
});

test('closing a risk needs a note and the closure is applied', async ({ page }) => {
  await open(page, '/risks/RSK-0008');
  await page.getByRole('button', { name: 'Change status' }).click();
  await page.getByLabel('New status').selectOption('Closed');
  await page.getByRole('button', { name: 'Save status' }).click();
  await expect(page.getByText('A closure note is required.')).toBeVisible();
  await page.getByLabel('Closure note').fill('Mitigated by the new reconciliation routine.');
  await page.getByRole('button', { name: 'Save status' }).click();
  await expect(toast(page)).toContainText('Closed');
  await expect(page.getByText('Closed').first()).toBeVisible();
  // a closed risk can only be reopened to Monitoring
  await page.getByRole('button', { name: 'Change status' }).click();
  const options = await page.getByLabel('New status').locator('option').allTextContents();
  expect(options.filter((o) => o.trim() && o !== 'Select…').length).toBe(1);
  expect(options.join(',')).toContain('Monitoring');
});

test('register filters keep their state in the URL, sort, paginate and show an empty state', async ({ page }) => {
  await open(page, '/risks');
  const summary = page.getByText(/Showing 1–20 of \d+ risks/);
  await expect(summary).toBeVisible();
  const total = Number(/of (\d+) risks/.exec((await summary.textContent()) ?? '')![1]);
  expect(total).toBeGreaterThan(20);

  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.getByText(`Showing 21–${Math.min(40, total)} of ${total} risks`)).toBeVisible();

  await page.getByLabel('Department').selectOption({ label: 'Finance' });
  await expect(page).toHaveURL(/department=1/);
  await expect(page).not.toHaveURL(/page=2/);
  const finance = await rowCount(page);
  expect(finance).toBeGreaterThan(0);
  expect(finance).toBeLessThan(20);

  await page.reload();
  await expect(page.getByLabel('Department')).toHaveValue('1');
  expect(await rowCount(page)).toBe(finance);

  await page.getByLabel('Severity').selectOption('Critical');
  await page.getByRole('textbox', { name: 'Search', exact: true }).fill('zzzz-no-such-risk');
  await expect(page.getByText('No risks match these filters')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).first().click();
  await expect(page.getByText(`Showing 1–20 of ${total} risks`)).toBeVisible();

  await page.getByRole('button', { name: /^Score/ }).click();
  await expect(page.getByRole('columnheader', { name: /^Score/ })).toHaveAttribute('aria-sort', 'ascending');
  await page.getByRole('button', { name: /^Score/ }).click();
  await expect(page.getByRole('columnheader', { name: /^Score/ })).toHaveAttribute('aria-sort', 'descending');
});

test('clicking a register row opens the record, and Enter works from the keyboard', async ({ page }) => {
  await open(page, '/risks');
  await page.locator('tbody tr.row-link').first().click();
  await expect(page).toHaveURL(/\/risks\/RSK-0001/);
  await open(page, '/risks');
  await page.locator('tbody tr.row-link').nth(1).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/risks\/RSK-0002/);
});

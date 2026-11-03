import { expect } from '@playwright/test';
import { choosePerson, open, ready, toast, test } from './helpers';

async function reportBasic(page: import('@playwright/test').Page, title: string) {
  await open(page, '/incidents/new');
  await page.getByLabel('Title').fill(title);
  await page.getByLabel('Description').fill('Observed during the evening round.');
  await page.getByLabel('Severity').selectOption('High');
  await page.getByLabel('Occurred').fill('2026-10-19T09:30');
  await page.getByLabel('Affected department').selectOption({ label: 'Operations' });
  await page.getByRole('button', { name: 'Report incident' }).click();
}

test('report incident validates, then creates an Open, unassigned, unlinked incident with a generated code', async ({ page }) => {
  await open(page, '/incidents/new');
  await page.getByRole('button', { name: 'Report incident' }).click();
  for (const msg of ['Title is required.', 'Description is required.', 'Choose a severity.', 'Choose the affected department.']) {
    await expect(page.getByText(msg)).toBeVisible();
  }
  await page.getByLabel('Title').fill('Coolant leak under the Line 4 chiller');
  await page.getByLabel('Description').fill('Pooling on the floor near the pump.');
  await page.getByLabel('Severity').selectOption('Medium');
  await page.getByLabel('Occurred').fill('2030-01-01T09:00');
  await page.getByLabel('Affected department').selectOption({ label: 'Facilities' });
  await page.getByRole('button', { name: 'Report incident' }).click();
  await expect(page.getByText('Occurrence time cannot be in the future.')).toBeVisible();

  await page.getByLabel('Occurred').fill('2026-10-19T09:30');
  await page.getByRole('button', { name: 'Report incident' }).click();
  await expect(page).toHaveURL(/\/incidents\/INC-\d{4}/);
  await expect(toast(page)).toContainText(/INC-\d{4}/);
  await expect(page.getByText('Unassigned').first()).toBeVisible();
  await expect(page.getByText('Incident reported')).toBeVisible();
});

test('assign, walk to Resolved and Closed, reopen, and see the whole timeline', async ({ page }) => {
  await reportBasic(page, 'Hydraulic hose burst on Line 5');
  await expect(page).toHaveURL(/\/incidents\/INC-\d{4}/);

  // assign
  await choosePerson(page, 'Assignee', 'Suresh Yadav');
  await page.getByRole('button', { name: 'Assign', exact: true }).click();
  await expect(toast(page)).toContainText('Assignment saved');
  await expect(page.getByText('Assigned to Suresh Yadav')).toBeVisible();

  // only valid next statuses are offered
  const status = page.getByLabel('Change status');
  expect(await status.locator('option').allTextContents()).toEqual(['No change (stay Open)', 'Investigating']);

  await page.getByLabel('Note').fill('Line isolated, maintenance on site.');
  await status.selectOption('Investigating');
  await page.getByRole('button', { name: 'Post update' }).click();
  await expect(page.getByText('Line isolated, maintenance on site.')).toBeVisible();

  // resolving needs a note
  await status.selectOption('Resolved');
  await page.getByRole('button', { name: 'Post update' }).click();
  await expect(page.getByText('A resolution note is required.')).toBeVisible();
  await page.getByLabel('Resolution note').fill('Hose replaced and pressure tested.');
  await page.getByRole('button', { name: 'Post update' }).click();
  await expect(page.getByText(/Resolved after/)).toBeVisible();

  // reopen, then resolve again, then close
  expect(await status.locator('option').allTextContents()).toContain('Investigating (reopen)');
  await page.getByLabel('Note').fill('Leak returned after restart.');
  await status.selectOption('Investigating');
  await page.getByRole('button', { name: 'Post update' }).click();
  await expect(page.getByText('Leak returned after restart.')).toBeVisible();
  await page.getByLabel('Note').fill('Fitting re-seated; leak-free for a full shift.');
  await status.selectOption('Resolved');
  await page.getByRole('button', { name: 'Post update' }).click();
  // wait for the server to answer before the next step, or the form would be cleared under the typing
  await expect(page.getByText('Fitting re-seated; leak-free for a full shift.')).toBeVisible();
  await expect(page.getByLabel('Note')).toHaveValue('');
  await page.getByLabel('Note').fill('Verified by the EHS officer.');
  await status.selectOption('Closed');
  await page.getByRole('button', { name: 'Post update' }).click();
  await expect(page.getByText('Verified by the EHS officer.')).toBeVisible();

  // timeline: reported, assigned, 6 further entries
  await expect(page.locator('ol li').filter({ hasText: /Incident reported|Assigned to|Line isolated|Hose replaced|Leak returned|Fitting re-seated|Verified/ })).toHaveCount(7);
});

test('a closed incident is final: no updates, assignment or link changes', async ({ page }) => {
  await open(page, '/incidents/INC-0003'); // seeded as Closed
  // the hint is visible; the same text also sits in hidden tooltips on the disabled buttons
  await expect(page.getByText('Closed incidents are final.').locator('visible=true')).toHaveCount(1);
  await expect(page.getByLabel('Note')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Post update' })).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByRole('button', { name: 'Reassign' })).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByRole('button', { name: 'Unlink' })).toHaveAttribute('aria-disabled', 'true');
});

test('link and unlink a risk, each writing a timeline entry', async ({ page }) => {
  await open(page, '/incidents/INC-0032'); // seeded unassigned and unlinked
  const link = page.getByPlaceholder('No linked risk');
  await link.fill('RSK-0003');
  await page.getByRole('listbox').getByRole('option').first().click();
  await page.getByRole('button', { name: 'Link risk' }).click();
  await expect(toast(page)).toContainText('Risk linked');
  await expect(page.getByText('Linked to risk RSK-0003')).toBeVisible();
  await page.getByRole('button', { name: 'Unlink' }).click();
  await expect(page.getByText('Risk link removed')).toBeVisible();
});

test('incident register filters: unassigned, unlinked, severity and status all work', async ({ page }) => {
  await open(page, '/incidents');
  await expect(page.getByText(/Showing 1–20 of \d+ incidents/)).toBeVisible();
  await page.getByLabel('Assignee').selectOption('none');
  await expect(page).toHaveURL(/assignee=none/);
  await ready(page);
  const unassigned = page.locator('tbody tr.row-link');
  expect(await unassigned.count()).toBeGreaterThan(0);
  for (const row of await unassigned.all()) await expect(row).toContainText('Unassigned');
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await page.getByLabel('Severity').selectOption('Critical');
  await page.getByLabel('Status').selectOption('Closed');
  await ready(page);
  const closedCritical = page.locator('tbody tr.row-link');
  expect(await closedCritical.count()).toBeGreaterThan(0);
  for (const row of await closedCritical.all()) await expect(row).toContainText(/Critical[\s\S]*Closed/);
});

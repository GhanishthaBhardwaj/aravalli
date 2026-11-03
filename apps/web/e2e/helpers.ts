import { expect, test as base } from '@playwright/test';
import type { Page } from '@playwright/test';

/** The sample organisation's people the tests use, and the role each signs in as (demo accounts made by scripts/e2e-api.mjs). */
export const PEOPLE = {
  'Neha Kapoor': 'Risk Officer',
  'Rajesh Khanna': 'Department Head',
  'Arjun Menon': 'Org Admin',
  'Sandeep Joshi': 'Auditor',
  'Pooja Nair': 'Employee',
} as const;
export type Person = keyof typeof PEOPLE;

/** Signs the browser in as one of the sample people through the demo login. The refresh cookie lands in the browser context. */
export async function signInAs(page: Page, name: Person, organisation = 'aravalli-industries') {
  const res = await page.request.post('/api/auth/demo-login', { data: { organisation, role: PEOPLE[name] } });
  expect(res.ok(), 'demo login').toBe(true);
}

/** Every test starts signed in as the Risk Officer, like opening the app as a normal user. Use `anonymous` for signed-out tests. */
export const test = base.extend({
  page: async ({ page }, provide) => {
    await signInAs(page, 'Neha Kapoor');
    await provide(page);
  },
});
export const anonymous = base;

/** Switch to another person: sign in as them and reload. */
export async function actAs(page: Page, name: Person) {
  await signInAs(page, name);
  await page.reload();
  await ready(page);
}

/** The newest toast message. */
export const toast = (page: Page) => page.getByTestId('toast').last();

/** Wait until the page, and any table on it, has finished loading from the API. */
export async function ready(page: Page) {
  await expect(page.getByRole('status', { name: 'Loading' })).toHaveCount(0);
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
}

/** Search for a person in a people picker (owner, assignee) and choose them. */
export async function choosePerson(page: Page, label: string, search: string) {
  await page.getByLabel(label).fill(search);
  await page.getByRole('listbox').getByRole('option').filter({ hasText: search }).first().click();
}

export async function open(page: Page, path: string) {
  await page.goto(path);
  await ready(page);
}

/** Pick a 1–5 score on a labelled segmented control. */
export async function pick(page: Page, group: 'Likelihood' | 'Impact', value: number) {
  // click the visible label; the radio input itself is visually hidden
  await page.getByRole('group', { name: group }).locator('label').nth(value - 1).click();
}

export const rowCount = (page: Page) => page.locator('tbody tr.row-link').count();

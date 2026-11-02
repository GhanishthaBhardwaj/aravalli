import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/** Switch the "Acting as" user by (part of) their name. */
export async function actAs(page: Page, name: string) {
  const select = page.getByLabel('Acting as');
  const option = select.locator('option', { hasText: name }).first();
  await select.selectOption({ value: (await option.getAttribute('value')) ?? '' });
}

/** The newest toast message. */
export const toast = (page: Page) => page.getByTestId('toast').last();

/** Wait until the page has finished its simulated loading state. */
export async function ready(page: Page) {
  await expect(page.getByRole('status', { name: 'Loading' })).toHaveCount(0);
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

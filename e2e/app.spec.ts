import { test, expect } from '@playwright/test';
import fs from 'node:fs';
test('register, upload, explore charts, reload, and delete', async ({ page }) => {
  const email = `browser-${Date.now()}@example.com`;
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  fs.mkdirSync('docs/screenshots', { recursive: true });
  await page.screenshot({ path: 'docs/screenshots/sign-in.png', fullPage: true });
  await page.getByRole('button', { name: 'Create an account', exact: true }).click();
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('browser-test-password');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('heading', { name: "Meet your data's potential." })).toBeVisible();
  await page.getByRole('button', { name: 'Or explore a sample sales dataset' }).click();
  await expect(page.getByRole('heading', { name: 'Revenue by Month', exact: true })).toBeVisible();
  await expect(page.locator('.metric strong').first()).toHaveText('120');
  await page.getByLabel('Group by').selectOption('Category');
  await expect(page.getByRole('heading', { name: 'Revenue by Category' })).toBeVisible();
  await expect(page.locator('.recharts-bar-rectangle').first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: 'docs/screenshots/dashboard.png', fullPage: true });
  await page.getByRole('button', { name: 'Data preview', exact: true }).click();
  await expect(page.locator('.preview tbody tr')).toHaveCount(100);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Revenue by Month', exact: true })).toBeVisible();
  await page
    .getByLabel('Upload CSV file')
    .setInputFiles({ name: 'broken.csv', mimeType: 'text/csv', buffer: Buffer.from('x,x\n1,2') });
  await expect(page.getByRole('alert')).toContainText('Column names must be unique');
  await page.getByRole('button', { name: 'Dismiss error' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  await expect(page.locator('.recharts-bar-rectangle').first()).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'Delete dataset', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Delete dataset', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: "Meet your data's potential." })).toBeVisible();
  await page.getByLabel('Sign out').click();
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
});

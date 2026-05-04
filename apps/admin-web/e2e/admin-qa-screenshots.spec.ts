import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';

const credentials = {
  email: 'admin@dmc.local',
  password: 'admin123',
};

const routes = ['/leads', '/quotes', '/bookings', '/hotels', '/suppliers', '/contacts', '/companies', '/transport', '/users'];

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(credentials.email);
  await page.getByLabel('Password').fill(credentials.password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).toHaveURL(/\/admin\/dashboard/);
}

async function captureFullPage(page: Page, screenshotsDir: string, name: string) {
  await page.waitForLoadState('networkidle');
  await expect(page).not.toHaveURL(/\/login/);
  await page.screenshot({
    path: path.join(screenshotsDir, `${name}.png`),
    fullPage: true,
  });
}

async function clickFirstVisible(page: Page, selector: string) {
  const targets = page.locator(selector);
  const count = await targets.count();

  for (let index = 0; index < count; index += 1) {
    const target = targets.nth(index);
    if (await target.isVisible()) {
      await target.click();
      return true;
    }
  }

  return false;
}

async function waitForQuoteContent(page: Page) {
  const quoteTitle = page.locator('.quote-dashboard-title-row h1').first();
  await expect(quoteTitle).toBeVisible();
  await expect(quoteTitle).not.toHaveText(/loading quote/i);
}

test('captures admin QA screenshots for core pages', async ({ page }) => {
  const screenshotsDir = path.join(process.cwd(), 'screenshots');
  await mkdir(screenshotsDir, { recursive: true });

  await login(page);

  for (const route of routes) {
    await page.goto(route);
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/\/login/);

    const screenshotName = route.replace(/^\//, '').replace(/\//g, '-') || 'home';
    await page.screenshot({
      path: path.join(screenshotsDir, `${screenshotName}.png`),
      fullPage: true,
    });
  }
});

test('captures admin QA screenshots for workflow and detail pages', async ({ page }) => {
  const screenshotsDir = path.join(process.cwd(), 'screenshots', 'workflows');
  await mkdir(screenshotsDir, { recursive: true });

  await login(page);

  await page.goto('/quotes');
  await page.waitForLoadState('networkidle');

  const firstQuoteView = page.locator('tbody a[href^="/quotes/"]').filter({ hasText: /^View$/ }).first();
  if ((await firstQuoteView.count()) === 0) {
    throw new Error('No quote View link was found on /quotes.');
  }

  await firstQuoteView.click();
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveURL(/\/quotes\/[^/?#]+/);
  await waitForQuoteContent(page);

  const quotePath = new URL(page.url()).pathname;
  await captureFullPage(page, screenshotsDir, 'quote-overview');

  const quoteSteps = [
    ['itinerary', 'quote-itinerary-step'],
    ['services', 'quote-services-step'],
    ['pricing', 'quote-pricing-step'],
    ['group-pricing', 'quote-group-pricing-step'],
    ['review', 'quote-review-step'],
    ['preview', 'quote-preview-step'],
  ] as const;

  for (const [step, screenshotName] of quoteSteps) {
    const stepUrl = `${quotePath}?tab=${step === 'group-pricing' ? 'pricing' : step === 'preview' ? 'review' : step}&step=${step}`;
    await page.goto(stepUrl);
    await waitForQuoteContent(page);
    await captureFullPage(page, screenshotsDir, screenshotName);

    if (step === 'group-pricing') {
      const autoBuildTiers = page.getByRole('button', { name: /auto build tiers/i }).first();
      if ((await autoBuildTiers.count()) > 0 && (await autoBuildTiers.isVisible())) {
        await autoBuildTiers.click();
        await page.waitForLoadState('networkidle');
      }

      const tableArea = page.locator('.quote-group-pricing-slab-list, .quote-pricing-workspace .table-wrap').first();
      if ((await tableArea.count()) > 0 && (await tableArea.isVisible())) {
        await tableArea.screenshot({
          path: path.join(screenshotsDir, 'quote-group-pricing-table.png'),
        });
      }
    }
  }

  await page.goto('/leads');
  await page.waitForLoadState('networkidle');

  const openedLeadDetails = await clickFirstVisible(page, 'summary:has-text("Details")');
  if (!openedLeadDetails) {
    throw new Error('No lead Details control was found on /leads.');
  }

  const openLead = page.getByRole('link', { name: 'Open lead' }).first();
  if ((await openLead.count()) === 0) {
    throw new Error('No Open lead link was found after expanding the first lead details.');
  }

  await openLead.click();
  await captureFullPage(page, screenshotsDir, 'lead-detail');

  await page.goto('/suppliers');
  await page.waitForLoadState('networkidle');
  if (await clickFirstVisible(page, 'button:has-text("Edit")')) {
    await captureFullPage(page, screenshotsDir, 'supplier-detail');
  }

  await page.goto('/companies');
  await page.waitForLoadState('networkidle');
  if (await clickFirstVisible(page, 'summary:has-text("Open details")')) {
    await captureFullPage(page, screenshotsDir, 'company-detail');
  }

  await page.goto('/contacts');
  await page.waitForLoadState('networkidle');
  if (await clickFirstVisible(page, 'summary:has-text("Open details")')) {
    await captureFullPage(page, screenshotsDir, 'contact-detail');
  }
});

import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const baseURL = process.env.ADMIN_WEB_BASE_URL || 'http://localhost:3000';
const quoteId = process.env.QUOTE_LAYOUT_TEST_QUOTE_ID || '74ee023b-bfcc-44e7-b995-363a64b8b0d6';

async function signIn(request: APIRequestContext) {
  const response = await request.post(`${baseURL}/api/auth/login`, {
    data: {
      email: 'admin@dmc.local',
      password: 'admin123',
      next: '/admin/dashboard',
    },
  });

  expect(response.ok()).toBeTruthy();
}

async function measureQuoteItinerary(page: Page, viewportWidth: number) {
  await page.setViewportSize({ width: viewportWidth, height: 1000 });
  await page.goto(`${baseURL}/quotes/${quoteId}?tab=itinerary`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="quote-service-lane-board"]');

  return page.evaluate(() => {
    function widthOf(selector: string) {
      const element = document.querySelector(selector);
      return element ? Math.round(element.getBoundingClientRect().width * 10) / 10 : 0;
    }

    return {
      quoteLayout: widthOf('.quote-builder-layout'),
      quoteMain: widthOf('.quote-builder-main-content'),
      itineraryOps: widthOf('.quote-itinerary-ops-layout'),
      itineraryMain: widthOf('.quote-itinerary-ops-main'),
      plannerShell: widthOf('.quote-service-planner-shell.quote-service-planner-saas-grid'),
      dayColumn: widthOf('.quote-service-day-column'),
      serviceEditor: widthOf('.quote-service-current-services'),
      serviceBoard: widthOf('[data-testid="quote-service-lane-board"]'),
    };
  });
}

test('quote itinerary layout keeps readable width chain at desktop sizes', async ({ page }) => {
  await signIn(page.context().request);

  const desktop = await measureQuoteItinerary(page, 1366);
  expect(desktop.quoteMain).toBeGreaterThanOrEqual(900);
  expect(desktop.itineraryMain).toBeGreaterThanOrEqual(900);
  expect(desktop.plannerShell).toBeGreaterThanOrEqual(900);
  expect(desktop.serviceBoard).toBeGreaterThanOrEqual(700);

  const wide = await measureQuoteItinerary(page, 1920);
  expect(wide.quoteMain).toBeGreaterThanOrEqual(1400);
  expect(wide.itineraryMain).toBeGreaterThanOrEqual(1400);
  expect(wide.dayColumn).toBeGreaterThanOrEqual(1100);
  expect(wide.serviceEditor).toBeGreaterThanOrEqual(900);
  expect(wide.serviceBoard).toBeGreaterThanOrEqual(700);
});

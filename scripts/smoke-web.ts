import * as smokeUtils from './smoke-utils.ts';

type LoginProxyResponse = {
  actor?: {
    id: string;
    email: string;
    role: string;
    companyId?: string | null;
  };
  message?: string;
};

type QuoteSummary = {
  id: string;
  quoteNumber: string | null;
  quoteCurrency: string;
};

type QuoteDetail = {
  id: string;
  quoteNumber: string | null;
  quoteCurrency: string;
};

async function main() {
  const webUrl = smokeUtils.getRequiredEnv('SMOKE_WEB_URL');
  const email = smokeUtils.getRequiredEnv('SMOKE_EMAIL');
  const password = smokeUtils.getRequiredEnv('SMOKE_PASSWORD');
  const quoteNumber = smokeUtils.getOptionalEnv('SMOKE_QUOTE_NUMBER', 'Q-2026-0005');
  const cookieJar = new smokeUtils.CookieJar();

  smokeUtils.logStep('Logging into admin-web proxy');
  const loginResult = await smokeUtils.requestJson<LoginProxyResponse>(
    webUrl,
    '/api/auth/login',
    {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    },
    cookieJar,
  );
  smokeUtils.ensureOk(loginResult.response, loginResult.text, 'Admin-web proxy login', [200, 201]);
  smokeUtils.assert(cookieJar.toHeader().includes('dmc_session='), 'Admin-web login did not set dmc_session cookie');
  smokeUtils.assert(loginResult.json?.actor?.email, 'Admin-web login did not return actor');
  smokeUtils.logPass(`Admin-web login ok for ${loginResult.json.actor.email}`);

  smokeUtils.logStep('Verifying authenticated quote proxy endpoints');
  const quotesResult = await smokeUtils.requestJson<QuoteSummary[]>(webUrl, '/api/quotes', {}, cookieJar);
  smokeUtils.ensureOk(quotesResult.response, quotesResult.text, '/api/quotes');
  smokeUtils.assert(Array.isArray(quotesResult.json), '/api/quotes did not return an array');
  const quote = quotesResult.json.find((item) => item.quoteNumber === quoteNumber);
  smokeUtils.assert(quote, `Could not find quote ${quoteNumber} through /api/quotes`);
  smokeUtils.logPass(`/api/quotes forwarded auth and returned ${quoteNumber}`);

  const quoteDetailResult = await smokeUtils.requestJson<QuoteDetail>(webUrl, `/api/quotes/${quote.id}`, {}, cookieJar);
  smokeUtils.ensureOk(quoteDetailResult.response, quoteDetailResult.text, `/api/quotes/${quote.id}`);
  smokeUtils.logPass(`/api/quotes/${quote.id} forwarded auth`);

  const itineraryResult = await smokeUtils.requestJson(webUrl, `/api/quotes/${quote.id}/itinerary`, {}, cookieJar);
  smokeUtils.ensureOk(itineraryResult.response, itineraryResult.text, `/api/quotes/${quote.id}/itinerary`);
  smokeUtils.logPass(`/api/quotes/${quote.id}/itinerary forwarded auth`);

  const versionsResult = await smokeUtils.requestJson(webUrl, `/api/quotes/${quote.id}/versions`, {}, cookieJar);
  if (versionsResult.response.status === 200) {
    smokeUtils.logPass(`/api/quotes/${quote.id}/versions returned 200`);
  } else if (versionsResult.response.status === 403) {
    smokeUtils.logWarn(`/api/quotes/${quote.id}/versions returned 403; quote detail page must still render`);
  } else {
    throw new smokeUtils.SmokeFailure(
      `/api/quotes/${quote.id}/versions failed with ${versionsResult.response.status}: ${versionsResult.text || versionsResult.response.statusText}`,
    );
  }

  smokeUtils.logStep('Updating quote currency through admin-web proxy');
  const originalCurrency = quoteDetailResult.json?.quoteCurrency || quote.quoteCurrency;
  smokeUtils.assert(originalCurrency, 'Quote detail did not return quoteCurrency');
  const nextCurrency = smokeUtils.chooseAlternateQuoteCurrency(originalCurrency);

  const patchResult = await smokeUtils.requestJson<QuoteDetail>(
    webUrl,
    `/api/quotes/${quote.id}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        quoteCurrency: nextCurrency,
      }),
    },
    cookieJar,
  );
  smokeUtils.ensureOk(patchResult.response, patchResult.text, `PATCH /api/quotes/${quote.id}`);
  smokeUtils.logPass(`PATCH /api/quotes/${quote.id} forwarded auth`);

  const quoteAfterPatch = await smokeUtils.requestJson<QuoteDetail>(webUrl, `/api/quotes/${quote.id}`, {}, cookieJar);
  smokeUtils.ensureOk(quoteAfterPatch.response, quoteAfterPatch.text, `GET /api/quotes/${quote.id} after PATCH`);
  smokeUtils.assert(
    quoteAfterPatch.json?.quoteCurrency === nextCurrency,
    `quoteCurrency did not persist after PATCH. Expected ${nextCurrency}, got ${quoteAfterPatch.json?.quoteCurrency || 'missing'}`,
  );
  smokeUtils.logPass(`quoteCurrency persisted as ${nextCurrency}`);

  const restoreResult = await smokeUtils.requestJson<QuoteDetail>(
    webUrl,
    `/api/quotes/${quote.id}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        quoteCurrency: originalCurrency,
      }),
    },
    cookieJar,
  );
  smokeUtils.ensureOk(restoreResult.response, restoreResult.text, `restore PATCH /api/quotes/${quote.id}`);
  const quoteAfterRestore = await smokeUtils.requestJson<QuoteDetail>(webUrl, `/api/quotes/${quote.id}`, {}, cookieJar);
  smokeUtils.ensureOk(quoteAfterRestore.response, quoteAfterRestore.text, `GET /api/quotes/${quote.id} after restore`);
  smokeUtils.assert(
    quoteAfterRestore.json?.quoteCurrency === originalCurrency,
    `quoteCurrency did not restore. Expected ${originalCurrency}, got ${quoteAfterRestore.json?.quoteCurrency || 'missing'}`,
  );
  smokeUtils.logPass(`quoteCurrency restored to ${originalCurrency}`);

  smokeUtils.logStep('Verifying SSR pages stay healthy');
  const quotesPage = await smokeUtils.requestHtml(webUrl, '/quotes', {}, cookieJar);
  smokeUtils.ensureOk(quotesPage.response, quotesPage.text, '/quotes page');
  smokeUtils.assert(!quotesPage.text.includes('Application error'), '/quotes rendered an application error page');
  smokeUtils.logPass('/quotes rendered without application error');

  const quotePage = await smokeUtils.requestHtml(webUrl, `/quotes/${quote.id}`, {}, cookieJar);
  smokeUtils.ensureOk(quotePage.response, quotePage.text, `/quotes/${quote.id} page`);
  smokeUtils.assert(!quotePage.text.includes('Application error'), `/quotes/${quote.id} rendered an application error page`);
  smokeUtils.logPass(`/quotes/${quote.id} rendered without application error`);

  const dashboardPage = await smokeUtils.requestHtml(webUrl, '/dashboard', {}, cookieJar);
  smokeUtils.ensureOk(dashboardPage.response, dashboardPage.text, '/dashboard page');
  smokeUtils.assert(!dashboardPage.text.includes('Application error'), '/dashboard rendered an application error page');
  smokeUtils.logPass('/dashboard rendered without application error');

  console.log(`\nSmoke web completed for ${quoteNumber} (${quote.id})`);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n[FAIL] ${message}`);
    process.exit(1);
  });

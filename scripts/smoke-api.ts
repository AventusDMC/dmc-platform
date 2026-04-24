import * as smokeUtils from './smoke-utils.ts';

type Actor = {
  id: string;
  email: string;
  role: string;
  companyId: string | null;
};

type LoginResponse = {
  token?: string;
  actor?: Actor;
  message?: string;
};

type QuoteSummary = {
  id: string;
  quoteNumber: string | null;
  quoteCurrency?: string;
};

async function main() {
  const apiUrl = smokeUtils.getRequiredEnv('SMOKE_API_URL');
  const email = smokeUtils.getRequiredEnv('SMOKE_EMAIL');
  const password = smokeUtils.getRequiredEnv('SMOKE_PASSWORD');
  const quoteNumber = smokeUtils.getOptionalEnv('SMOKE_QUOTE_NUMBER', 'Q-2026-0005');

  smokeUtils.logStep('Logging into API');
  const loginResult = await smokeUtils.requestJson<LoginResponse>(apiUrl, '/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  smokeUtils.ensureOk(loginResult.response, loginResult.text, 'API login', [200, 201]);
  smokeUtils.assert(loginResult.json?.token, 'API login did not return a token');
  smokeUtils.assert(loginResult.json?.actor?.id, 'API login did not return actor.id');
  smokeUtils.assert(loginResult.json?.actor?.email, 'API login did not return actor.email');
  smokeUtils.assert(loginResult.json?.actor?.role, 'API login did not return actor.role');
  smokeUtils.assert(loginResult.json?.actor?.companyId, 'API login did not return actor.companyId');
  smokeUtils.logPass(`Login ok for ${loginResult.json.actor.email} (${loginResult.json.actor.role})`);

  const authHeaders = {
    Authorization: `Bearer ${loginResult.json.token}`,
  };

  smokeUtils.logStep('Verifying /auth/me');
  const meResult = await smokeUtils.requestJson<Actor>(apiUrl, '/auth/me', {
    headers: authHeaders,
  });
  smokeUtils.ensureOk(meResult.response, meResult.text, '/auth/me');
  smokeUtils.assert(meResult.json?.companyId, '/auth/me returned no companyId');
  smokeUtils.logPass(`/auth/me returned companyId ${meResult.json.companyId}`);

  smokeUtils.logStep('Loading quotes');
  const quotesResult = await smokeUtils.requestJson<QuoteSummary[]>(apiUrl, '/quotes', {
    headers: authHeaders,
  });
  smokeUtils.ensureOk(quotesResult.response, quotesResult.text, '/quotes');
  smokeUtils.assert(Array.isArray(quotesResult.json), '/quotes did not return an array');
  const quote = quotesResult.json.find((item) => item.quoteNumber === quoteNumber);
  smokeUtils.assert(quote, `Could not find quote ${quoteNumber} in /quotes`);
  smokeUtils.logPass(`/quotes returned ${quotesResult.json.length} records and included ${quoteNumber}`);

  smokeUtils.logStep('Loading quote detail endpoints');
  const quoteDetailResult = await smokeUtils.requestJson(apiUrl, `/quotes/${quote.id}`, {
    headers: authHeaders,
  });
  smokeUtils.ensureOk(quoteDetailResult.response, quoteDetailResult.text, `/quotes/${quote.id}`);
  smokeUtils.logPass(`/quotes/${quote.id} returned 200`);

  const itineraryResult = await smokeUtils.requestJson(apiUrl, `/quotes/${quote.id}/itinerary`, {
    headers: authHeaders,
  });
  smokeUtils.ensureOk(itineraryResult.response, itineraryResult.text, `/quotes/${quote.id}/itinerary`);
  smokeUtils.logPass(`/quotes/${quote.id}/itinerary returned 200`);

  const versionsResult = await smokeUtils.requestJson(apiUrl, `/quotes/${quote.id}/versions`, {
    headers: authHeaders,
  });
  if (versionsResult.response.status === 200) {
    smokeUtils.logPass(`/quotes/${quote.id}/versions returned 200`);
  } else if (versionsResult.response.status === 403) {
    smokeUtils.logWarn(`/quotes/${quote.id}/versions returned 403; web smoke should verify page fallback`);
  } else {
    throw new smokeUtils.SmokeFailure(
      `/quotes/${quote.id}/versions failed with ${versionsResult.response.status}: ${versionsResult.text || versionsResult.response.statusText}`,
    );
  }

  smokeUtils.logStep('Loading remaining admin endpoints');
  const bookingsResult = await smokeUtils.requestJson(apiUrl, '/bookings', {
    headers: authHeaders,
  });
  smokeUtils.ensureOk(bookingsResult.response, bookingsResult.text, '/bookings');
  smokeUtils.logPass('/bookings returned 200');

  const invoicesResult = await smokeUtils.requestJson(apiUrl, '/invoices', {
    headers: authHeaders,
  });
  smokeUtils.ensureOk(invoicesResult.response, invoicesResult.text, '/invoices');
  smokeUtils.logPass('/invoices returned 200');

  const usersResult = await smokeUtils.requestJson(apiUrl, '/users', {
    headers: authHeaders,
  });
  smokeUtils.ensureOk(usersResult.response, usersResult.text, '/users');
  smokeUtils.logPass('/users returned 200');

  console.log(`\nSmoke API completed for ${quoteNumber} (${quote.id})`);
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

import test = require('node:test');
import assert = require('node:assert/strict');
import { GET } from './[id]/guarantee-letter/route';

test('guarantee letter proxy returns binary PDF response with download headers', async () => {
  const originalFetch = globalThis.fetch;
  const pdfBytes = new Uint8Array([37, 80, 68, 70, 45]);
  let requestedUrl = '';
  let authorizationHeader = '';

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requestedUrl = String(input);
    authorizationHeader = new Headers(init?.headers).get('authorization') || '';
    return new Response(pdfBytes, {
      status: 200,
      statusText: 'OK',
      headers: {
        'Content-Type': 'application/octet-stream',
      },
    });
  }) as typeof fetch;

  try {
    const request = {
      headers: new Headers({ authorization: 'Bearer test-token' }),
      cookies: {
        get: () => undefined,
      },
    };

    const response = await GET(request as any, { params: Promise.resolve({ id: 'booking-1' }) });
    const returnedBytes = new Uint8Array(await response.arrayBuffer());

    assert.equal(requestedUrl, 'http://localhost:3001/bookings/booking-1/guarantee-letter');
    assert.equal(authorizationHeader, 'Bearer test-token');
    assert.deepEqual(Array.from(returnedBytes), Array.from(pdfBytes));
    assert.equal(response.headers.get('Content-Type'), 'application/pdf');
    assert.equal(response.headers.get('Content-Disposition'), 'attachment; filename="guarantee-letter.pdf"');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('guarantee letter proxy returns readable backend error text', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    new Response('Booking not found', {
      status: 404,
      statusText: 'Not Found',
      headers: {
        'Content-Type': 'application/json',
      },
    })) as typeof fetch;

  try {
    const request = {
      headers: new Headers(),
      cookies: {
        get: () => undefined,
      },
    };

    const response = await GET(request as any, { params: Promise.resolve({ id: 'missing-booking' }) });

    assert.equal(response.status, 404);
    assert.equal(response.headers.get('Content-Type'), 'text/plain; charset=utf-8');
    assert.equal(await response.text(), 'Booking not found');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

// Booking Creation V2 — Slice 1D: the Quote Builder V2 "Create booking" trigger.
// Source-grep tests (same convention as builder-v2-add-activity) pinning the flag +
// role + convertible-status gating, the prop threading page → client → builder → card,
// the V2-scoped proxy, the typed-error handling, and the Operations V2 handoff CTA.

const pageSrc = readFileSync(new URL('./builder-v2/page.tsx', import.meta.url), 'utf8');
const clientSrc = readFileSync(new URL('./builder-v2/builder-v2-client.tsx', import.meta.url), 'utf8');
const builderSrc = readFileSync(new URL('../../../components/quote/v2/quote-builder-v2.tsx', import.meta.url), 'utf8');
const cardSrc = readFileSync(new URL('../../../components/quote/v2/create-booking-card.tsx', import.meta.url), 'utf8');
const routeSrc = readFileSync(new URL('../../api/quotes/[id]/v2/booking/route.ts', import.meta.url), 'utf8');

function contains(src: string, fragments: string[]) {
  for (const f of fragments) {
    assert.ok(src.includes(f), `Expected source to contain: ${f}`);
  }
}

describe('Quote Builder V2 — Create booking (Slice 1D)', () => {
  it('page.tsx reads the BOOKING_CREATE flag and gates on role + convertible status', () => {
    contains(pageSrc, [
      "process.env.NEXT_PUBLIC_QUOTE_BOOKING_CREATE === 'true'",
      'const CONVERTIBLE_STATUSES = new Set(["ACCEPTED", "CONFIRMED"])',
      'const canCreateBooking =',
      'hasRequiredRole(role, ["admin", "operations"])',
      'CONVERTIBLE_STATUSES.has(quoteStatusCode)',
      'canCreateBooking={canCreateBooking}',
    ]);
  });

  it('client accepts and threads canCreateBooking to the builder', () => {
    contains(clientSrc, [
      'canCreateBooking = false,',
      'canCreateBooking?: boolean',
      'canCreateBooking={canCreateBooking}',
    ]);
  });

  it('builder renders the CreateBookingCard in the sidebar, gated by canCreateBooking', () => {
    contains(builderSrc, [
      'import { CreateBookingCard } from "./create-booking-card"',
      '<CreateBookingCard quoteId={quote.id} canCreateBooking={canCreateBooking} />',
      'canCreateBooking = false,',
    ]);
  });

  it('the card posts to the V2-scoped booking route and only renders when allowed', () => {
    contains(cardSrc, [
      'if (!canCreateBooking)',
      '`/api/quotes/${quoteId}/v2/booking`',
      'method: "POST"',
    ]);
  });

  it('the card handles every typed backend error code', () => {
    contains(cardSrc, [
      '"feature_disabled"',
      '"quote_not_convertible"',
      '"missing_accepted_version"',
      '"booking_exists"',
      '"conversion_failed"',
    ]);
  });

  it('the card surfaces success, already-exists, and the Operations V2 handoff CTA', () => {
    contains(cardSrc, [
      'result.alreadyExisted',
      'Booking already exists',
      'Booking created',
      'Open in Operations V2',
      'Open booking',
      '`/operations/v2/${result.bookingId}`',
    ]);
  });

  it('the proxy forwards to the backend V2 booking route with actor headers', () => {
    contains(routeSrc, [
      '`${API_BASE_URL}/quotes/${id}/v2/booking`',
      'buildActorHeaders(request)',
      "method: 'POST'",
    ]);
  });
});

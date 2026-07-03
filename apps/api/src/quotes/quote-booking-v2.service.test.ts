import { test, afterEach } from 'node:test';
import * as assert from 'node:assert/strict';
import { PATH_METADATA } from '@nestjs/common/constants';
import { ROLES_KEY } from '../auth/auth.decorators';
import { QuoteBookingV2Service } from './quote-booking-v2.service';
import { QuoteBookingV2Controller } from './quote-booking-v2.controller';

// Fakes for PrismaService + the delegated QuotesService.convertToBooking + AuditService.
// The V2 service is thin (flag-gate → access-guard → convertibility → duplicate
// pre-check → delegate → audit), so plain object fakes exercise every branch without a
// DB. The heavy conversion engine (snapshot / service mapping / booking-ref) lives in
// QuotesService.convertToBooking and is intentionally NOT re-tested here.

type Options = {
  flag?: boolean;
  quote?: { id: string; brandCompanyId?: string | null; status?: string; acceptedVersionId?: string | null } | null;
  newerRevision?: { id: string } | null;
  existingBooking?: { id: string; bookingRef: string | null } | null;
  created?: any;
  convertThrows?: Error | null;
  auditThrows?: boolean;
};

function setFlag(on: boolean) {
  if (on) process.env.QUOTE_BOOKING_CREATE = 'true';
  else delete process.env.QUOTE_BOOKING_CREATE;
}
afterEach(() => { delete process.env.QUOTE_BOOKING_CREATE; });

const QID = 'quote-1';
const ACTOR = { id: 'user-1', companyId: 'company-A', auditLabel: 'Alice' };

function build(opts: Options = {}) {
  const calls: Record<string, any[]> = { convert: [], auditLog: [] };

  const prisma = {
    quote: {
      findFirst: async (args: any) => {
        if (args?.where?.revisedFromId) return opts.newerRevision ?? null;
        return opts.quote === undefined
          ? { id: QID, brandCompanyId: null, status: 'ACCEPTED', acceptedVersionId: 'ver-1' }
          : opts.quote;
      },
    },
    booking: {
      findFirst: async () => (opts.existingBooking === undefined ? null : opts.existingBooking),
    },
  };

  const quotes = {
    convertToBooking: async (id: string, actor: any) => {
      calls.convert.push({ id, actor });
      if (opts.convertThrows) throw opts.convertThrows;
      return opts.created ?? { id: 'bk-new', bookingRef: 'BK-2026-0001', persisted: true };
    },
  };

  const audit = {
    log: async (values: any) => {
      calls.auditLog.push(values);
      if (opts.auditThrows) throw new Error('audit boom');
      return { id: 'audit-1' };
    },
  };

  setFlag(opts.flag ?? true);
  const service = new QuoteBookingV2Service(prisma as any, quotes as any, audit as any);
  return { service, calls };
}

async function expectRejects(promise: Promise<unknown>, codeOrText: string) {
  await assert.rejects(promise, (err: any) => {
    const response = err?.response ?? err;
    const code = response?.code;
    const message = Array.isArray(response?.message) ? response.message.join('; ') : response?.message ?? err?.message;
    assert.ok(
      code === codeOrText || String(message).includes(codeOrText),
      `expected code/message to include "${codeOrText}", got code=${code} message=${message}`,
    );
    return true;
  });
}

// 1. Flag OFF blocks conversion and writes nothing
test('createBookingFromQuote is blocked (feature_disabled) when the flag is OFF and delegates nothing', async () => {
  const { service, calls } = build({ flag: false });
  await expectRejects(service.createBookingFromQuote(QID, ACTOR), 'feature_disabled');
  assert.equal(calls.convert.length, 0);
  assert.equal(calls.auditLog.length, 0);
});

// 2. Flag ON + accepted quote delegates to convertToBooking and writes a sanitized audit
test('createBookingFromQuote delegates to convertToBooking and returns the V2 handoff payload', async () => {
  const { service, calls } = build({ flag: true });
  const result = await service.createBookingFromQuote(QID, ACTOR);

  assert.equal(calls.convert.length, 1);
  assert.equal(calls.convert[0].id, QID);
  assert.equal(calls.convert[0].actor.companyId, 'company-A');
  assert.equal(calls.convert[0].actor.id, 'user-1');

  assert.equal(result.bookingId, 'bk-new');
  assert.equal(result.bookingRef, 'BK-2026-0001');
  assert.equal(result.quoteId, QID);
  assert.equal(result.opsV2Url, '/operations/v2/bk-new');
  assert.equal(result.alreadyExisted, false);

  assert.equal(calls.auditLog.length, 1);
  const a = calls.auditLog[0];
  assert.equal(a.action, 'quote.booking.created');
  assert.equal(a.entity, 'booking');
  assert.equal(a.entityId, 'bk-new');
  assert.deepEqual(Object.keys(a.metadata).sort(), ['bookingId', 'bookingRef', 'quoteId', 'source'].sort());
  assert.equal(a.metadata.source, 'quote_builder_v2');
  assert.equal(a.metadata.quoteId, QID);
  // no PII / token / secret keys
  for (const k of Object.keys(a.metadata)) {
    assert.ok(!/passenger|passport|token|secret|cookie|url|password|access/i.test(k), `unexpected metadata key: ${k}`);
  }
});

// 3. Draft / Sent quotes are not convertible
for (const status of ['DRAFT', 'SENT', 'REVISION_REQUESTED', 'EXPIRED']) {
  test(`a ${status} quote is rejected (quote_not_convertible) and delegates nothing`, async () => {
    const { service, calls } = build({ flag: true, quote: { id: QID, brandCompanyId: null, status, acceptedVersionId: 'ver-1' } });
    await expectRejects(service.createBookingFromQuote(QID, ACTOR), 'quote_not_convertible');
    assert.equal(calls.convert.length, 0);
  });
}

// 3b. Cancelled quotes are explicitly not convertible
test('a CANCELLED quote is rejected (quote_not_convertible)', async () => {
  const { service, calls } = build({ flag: true, quote: { id: QID, brandCompanyId: null, status: 'CANCELLED', acceptedVersionId: 'ver-1' } });
  await expectRejects(service.createBookingFromQuote(QID, ACTOR), 'quote_not_convertible');
  assert.equal(calls.convert.length, 0);
});

// 4. Accepted quote without an accepted version is blocked
test('an accepted quote missing acceptedVersionId is rejected (missing_accepted_version)', async () => {
  const { service, calls } = build({ flag: true, quote: { id: QID, brandCompanyId: null, status: 'ACCEPTED', acceptedVersionId: null } });
  await expectRejects(service.createBookingFromQuote(QID, ACTOR), 'missing_accepted_version');
  assert.equal(calls.convert.length, 0);
});

// 5a. Duplicate pre-check returns the existing booking idempotently (no delegate)
test('an existing primary booking returns booking_exists idempotently (alreadyExisted) without delegating', async () => {
  const { service, calls } = build({ flag: true, existingBooking: { id: 'bk-existing', bookingRef: 'BK-2026-0007' } });
  const result = await service.createBookingFromQuote(QID, ACTOR);
  assert.equal(result.alreadyExisted, true);
  assert.equal(result.bookingId, 'bk-existing');
  assert.equal(result.bookingRef, 'BK-2026-0007');
  assert.equal(result.opsV2Url, '/operations/v2/bk-existing');
  assert.equal(calls.convert.length, 0);
  assert.equal(calls.auditLog.length, 0); // no new booking created → no success audit
});

// 5b. A duplicate race inside the transaction resolves to the existing booking
test('a duplicate race in convertToBooking resolves to the existing booking (alreadyExisted)', async () => {
  const { service, calls } = build({
    flag: true,
    convertThrows: new Error('A booking already exists for this quote'),
  });
  // Simulate the race: the pre-check sees nothing (first lookup → null) so it delegates;
  // by the time convertToBooking throws and we re-query, the row exists (second lookup).
  let lookups = 0;
  (service as any).findExistingPrimaryBooking = async () => {
    lookups += 1;
    return lookups === 1 ? null : { id: 'bk-raced', bookingRef: 'BK-2026-0009' };
  };
  const result = await service.createBookingFromQuote(QID, ACTOR);
  assert.equal(result.alreadyExisted, true);
  assert.equal(result.bookingId, 'bk-raced');
  assert.equal(calls.convert.length, 1); // it did attempt the delegated conversion
});

// 6. A non-duplicate conversion failure is surfaced as conversion_failed
test('a non-duplicate conversion failure is surfaced as conversion_failed', async () => {
  const { service, calls } = build({ flag: true, convertThrows: new Error('snapshot exploded') });
  await expectRejects(service.createBookingFromQuote(QID, ACTOR), 'conversion_failed');
  assert.equal(calls.convert.length, 1);
  assert.equal(calls.auditLog.length, 0);
});

// 7. Cross-company access rejected; legacy null-brand allowed
test('a quote owned by a different company is rejected (cross-company)', async () => {
  const { service, calls } = build({ flag: true, quote: { id: QID, brandCompanyId: 'company-B', status: 'ACCEPTED', acceptedVersionId: 'ver-1' } });
  await expectRejects(service.createBookingFromQuote(QID, ACTOR), 'different company');
  assert.equal(calls.convert.length, 0);
});

test('a legacy quote with no brandCompanyId is accessible (no regression)', async () => {
  const { service, calls } = build({ flag: true, quote: { id: QID, brandCompanyId: null, status: 'ACCEPTED', acceptedVersionId: 'ver-1' } });
  const result = await service.createBookingFromQuote(QID, ACTOR);
  assert.equal(result.bookingId, 'bk-new');
  assert.equal(calls.convert.length, 1);
});

// 8. Non-latest revision rejected
test('a superseded (non-latest) quote revision is rejected', async () => {
  const { service, calls } = build({ flag: true, newerRevision: { id: 'quote-2' } });
  await expectRejects(service.createBookingFromQuote(QID, ACTOR), 'latest quote revision');
  assert.equal(calls.convert.length, 0);
});

// 9. Missing company context rejected
test('a caller without a company context is rejected (company isolation)', async () => {
  const { service, calls } = build({ flag: true });
  await expectRejects(
    service.createBookingFromQuote(QID, { id: 'user-1', companyId: null, auditLabel: 'NoCo' }),
    'Company context is required',
  );
  assert.equal(calls.convert.length, 0);
});

// 10. Missing actor rejected
test('a null actor is rejected (audited writes require an actor)', async () => {
  const { service, calls } = build({ flag: true });
  await expectRejects(service.createBookingFromQuote(QID, null), 'Authenticated actor is required');
  assert.equal(calls.convert.length, 0);
});

// 11. Audit failure does not block a successful conversion
test('a failing audit write does not block the conversion', async () => {
  const { service, calls } = build({ flag: true, auditThrows: true });
  const result = await service.createBookingFromQuote(QID, ACTOR);
  assert.equal(result.bookingId, 'bk-new');
  assert.equal(calls.convert.length, 1);
  assert.equal(calls.auditLog.length, 1); // attempted, threw, swallowed
});

// 12. Controller route + role metadata: POST quotes/:quoteId/v2 → booking, admin+operations
test('the V2 booking route is POST-scoped under quotes/:quoteId/v2/booking and gated to admin+operations', () => {
  const controllerPath = (Reflect as any).getMetadata(PATH_METADATA, QuoteBookingV2Controller);
  assert.equal(controllerPath, 'quotes/:quoteId/v2');

  const routePath = (Reflect as any).getMetadata(PATH_METADATA, QuoteBookingV2Controller.prototype.createBooking);
  assert.equal(routePath, 'booking');

  const roles = (Reflect as any).getMetadata(ROLES_KEY, QuoteBookingV2Controller.prototype.createBooking);
  assert.deepEqual([...roles].sort(), ['admin', 'operations']);
});

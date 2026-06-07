import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { QuotesService } from './quotes.service';

// K.2.1 — PackageTemplate preview/apply must load real quote context (adults,
// children, roomCount, nightCount, travelStartDate, currency) so pax-dependent
// apply logic (esp. the K.1 guide pax-band gate) uses the real pax count instead
// of defaulting to 1. This covers the loading mechanism + getQuotePaxCount; the
// 2-pax-local / 8-pax-escort behaviour is proven by the live verification and
// the K.1 band unit tests.

function makeService(quoteRow: any) {
  const calls: any[] = [];
  const prisma: any = {
    quote: {
      findFirst: async (args: any) => {
        calls.push(args);
        // assertLatestQuoteRevision queries by revisedFromId -> no newer revision
        if (args?.where?.revisedFromId) return null;
        return quoteRow;
      },
    },
  };
  const service = new QuotesService(prisma, {} as any, {} as any, {} as any, {} as any) as any;
  return { service, calls };
}

const ACTOR = { companyId: 'co-1' } as any;
const PACKAGE_QUOTE_SELECT = { id: true, adults: true, children: true, roomCount: true, nightCount: true, travelStartDate: true, quoteCurrency: true };

test('assertQuoteMutationAccess forwards a provided select to the quote lookup', async () => {
  const { service, calls } = makeService({ id: 'q1', adults: 8, children: 0, roomCount: 4 });
  const quote = await service.assertQuoteMutationAccess('q1', ACTOR, { select: PACKAGE_QUOTE_SELECT });
  const idLookup = calls.find((c) => c.where?.id === 'q1');
  assert.ok(idLookup, 'should look up the quote by id');
  assert.deepEqual(idLookup.select, PACKAGE_QUOTE_SELECT, 'the package-apply select must reach the query');
  assert.equal(quote.adults, 8, 'returned quote carries real pax');
});

test('default (no args) still loads id-only — proving the fix is opt-in per call site', async () => {
  const { service, calls } = makeService({ id: 'q1' });
  await service.assertQuoteMutationAccess('q1', ACTOR);
  const idLookup = calls.find((c) => c.where?.id === 'q1');
  assert.deepEqual(idLookup.select, { id: true });
});

test('getQuotePaxCount returns real pax when present, and only falls back to 1 when absent', () => {
  const { service } = makeService({ id: 'q1' });
  assert.equal(service.getQuotePaxCount({ adults: 2, children: 0 }), 2);
  assert.equal(service.getQuotePaxCount({ adults: 6, children: 2 }), 8);
  assert.equal(service.getQuotePaxCount({}), 1, 'fallback only when adults/children absent (the pre-fix behaviour)');
});

test('with the real-context select, the guide pax-band resolves correctly (2 -> in band, 8 -> out of band)', async () => {
  const { service } = makeService({ id: 'q1', adults: 8, children: 0 });
  const localComponent = {
    componentType: 'SERVICE',
    supplierServiceId: 'svc-guide',
    supplierService: { id: 'svc-guide', category: 'Guiding', serviceType: { code: 'GUIDE' } },
    guideType: 'local',
    guideDuration: 'full_day',
    minPax: 1,
    maxPax: 5,
  };
  const inBand = await service.getPackageComponentMappingStatus(localComponent, { adults: 2, children: 0 });
  assert.equal(inBand.insertable, true, 'local guide applies for 2 pax');
  const outOfBand = await service.getPackageComponentMappingStatus(localComponent, { adults: 8, children: 0 });
  assert.equal(outOfBand.insertable, false, 'local guide not applicable for 8 pax');
  assert.match(outOfBand.reason, /applies to 1–5 pax.*has 8/);
});

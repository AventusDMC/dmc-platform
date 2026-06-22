import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { QuotesService } from './quotes.service';
import { QuotePricingService } from './quote-pricing.service';

const ACTOR = { companyId: 'company-1' } as any;

type ItemRow = {
  id: string;
  quoteId: string;
  totalCost: number;
  totalSell: number;
  transportLabel: string | null;
  externalClientDescription: string | null;
  externalIncludes: string | null;
  externalExcludes: string | null;
  externalHotelsOrSimilar: string | null;
  quantity: number;
  clientCompanyId?: string;
  brandCompanyId?: string | null;
};

function makeService(item: ItemRow) {
  const calls: { update?: { where: any; data: any }; pricingTriggered: boolean } = {
    pricingTriggered: false,
  };

  const prisma = {
    quote: {
      // assertQuoteMutationAccess → findFirst({ where: { id } });
      // assertLatestQuoteRevision → findFirst({ where: { revisedFromId } }) must be null.
      findFirst: async ({ where }: any) => {
        if (where?.revisedFromId) {
          return null;
        }
        return { id: where.id };
      },
      // recalculateQuoteTotals would call quote.findUnique — flag if ever hit.
      findUnique: async () => {
        calls.pricingTriggered = true;
        throw new Error('recalculateQuoteTotals path was triggered');
      },
    },
    quoteItem: {
      findFirst: async ({ where }: any) => {
        if (where.id === item.id && where.quoteId === item.quoteId) {
          return {
            ...item,
            quote: {
              clientCompanyId: item.clientCompanyId ?? 'company-1',
              brandCompanyId: item.brandCompanyId ?? null,
            },
          };
        }
        return null;
      },
      // recalculateQuoteTotals would call quoteItem.findMany — flag if ever hit.
      findMany: async () => {
        calls.pricingTriggered = true;
        throw new Error('recalculateQuoteTotals path was triggered');
      },
      update: async ({ where, data }: any) => {
        calls.update = { where, data };
        return { ...item, ...data };
      },
    },
  };

  const service = new QuotesService(
    prisma as any,
    {} as any,
    { findMatchingRate: async () => { throw new Error('Unexpected transport pricing lookup'); } } as any,
    { evaluate: async () => null } as any,
    new QuotePricingService(),
  );

  // Belt-and-braces: if any repricing routine is invoked the test fails loudly.
  (service as any).recalculateQuoteTotals = async () => {
    calls.pricingTriggered = true;
    throw new Error('recalculateQuoteTotals was called');
  };
  (service as any).resolveQuoteItemValues = async () => {
    calls.pricingTriggered = true;
    throw new Error('resolveQuoteItemValues was called');
  };
  (service as any).syncJordanPassEntranceFees = async () => {
    calls.pricingTriggered = true;
    throw new Error('syncJordanPassEntranceFees was called');
  };

  return { service, calls };
}

function baseItem(overrides: Partial<ItemRow> = {}): ItemRow {
  return {
    id: 'item-1',
    quoteId: 'quote-1',
    totalCost: 100,
    totalSell: 150,
    transportLabel: 'Old label',
    externalClientDescription: 'Old description',
    externalIncludes: 'Old includes',
    externalExcludes: 'Old excludes',
    externalHotelsOrSimilar: 'Old hotels',
    quantity: 2,
    ...overrides,
  };
}

test('updates only whitelisted display-text fields and never re-prices', async () => {
  const { service, calls } = makeService(baseItem());

  const updated = await service.updateItemDisplayText(
    'quote-1',
    'item-1',
    {
      externalClientDescription: 'New client description',
      externalIncludes: 'New includes',
      externalExcludes: 'New excludes',
      externalHotelsOrSimilar: 'Hotel X or similar',
      transportLabel: 'Amman → Petra',
      // Forbidden fields below must be ignored (whitelist) — never written.
      totalCost: 9999,
      totalSell: 9999,
      sellPrice: 1,
      quantity: 99,
      paxCount: 99,
      markupPercent: 50,
      markupAmount: 50,
      overrideCost: 5,
      currency: 'EUR',
      serviceDate: '2030-01-01',
      serviceType: 'HACK',
      serviceId: 'svc-x',
      optionId: 'opt-x',
      clientDescription: 'should-not-write',
      customServiceName: 'should-not-write',
      internalNotes: 'should-not-write',
      externalInternalNotes: 'should-not-write',
      pricingDescription: 'should-not-write',
    } as any,
    ACTOR,
  );

  const data = calls.update?.data as Record<string, unknown>;
  // Whitelisted fields written.
  assert.deepEqual(data, {
    externalClientDescription: 'New client description',
    externalIncludes: 'New includes',
    externalExcludes: 'New excludes',
    externalHotelsOrSimilar: 'Hotel X or similar',
    transportLabel: 'Amman → Petra',
  });
  // Forbidden fields NOT written.
  for (const forbidden of [
    'totalCost', 'totalSell', 'sellPrice', 'quantity', 'paxCount', 'markupPercent', 'markupAmount',
    'overrideCost', 'currency', 'serviceDate', 'serviceType', 'serviceId', 'optionId',
    'clientDescription', 'customServiceName', 'internalNotes', 'externalInternalNotes', 'pricingDescription',
  ]) {
    assert.equal(Object.prototype.hasOwnProperty.call(data, forbidden), false, `must not write ${forbidden}`);
  }
  // No repricing was triggered, and item totals are unchanged.
  assert.equal(calls.pricingTriggered, false);
  assert.equal((updated as any).totalCost, 100);
  assert.equal((updated as any).totalSell, 150);
});

test('accepts null to clear a display-text field without re-pricing', async () => {
  const { service, calls } = makeService(baseItem());

  await service.updateItemDisplayText('quote-1', 'item-1', { externalClientDescription: null }, ACTOR);

  assert.deepEqual(calls.update?.data, { externalClientDescription: null });
  assert.equal(calls.pricingTriggered, false);
});

test('rejects when no editable display-text fields are provided', async () => {
  const { service } = makeService(baseItem());

  await assert.rejects(
    () => service.updateItemDisplayText('quote-1', 'item-1', {}, ACTOR),
    /No editable display-text fields provided/,
  );
});

test('rejects editing an item that belongs to a different quote', async () => {
  // Item belongs to quote-1; request targets quote-2 → scoped lookup returns null.
  const { service, calls } = makeService(baseItem({ quoteId: 'quote-1' }));

  await assert.rejects(
    () => service.updateItemDisplayText('quote-2', 'item-1', { transportLabel: 'x' }, ACTOR),
    /Quote item not found/,
  );
  assert.equal(calls.update, undefined);
});

test('rejects when the actor company does not own the quote', async () => {
  const { service, calls } = makeService(baseItem({ clientCompanyId: 'other-co', brandCompanyId: null }));

  await assert.rejects(
    () => service.updateItemDisplayText('quote-1', 'item-1', { transportLabel: 'x' }, ACTOR),
    /Quote item not found/,
  );
  assert.equal(calls.update, undefined);
});

test('requires company context on the actor', async () => {
  const { service } = makeService(baseItem());

  await assert.rejects(
    () => service.updateItemDisplayText('quote-1', 'item-1', { transportLabel: 'x' }, null as any),
    /Company context is required/,
  );
});

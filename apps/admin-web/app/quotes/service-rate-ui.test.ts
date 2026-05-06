import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const quoteServicesTableSource = readFileSync(new URL('./[id]/QuoteServicesTable.tsx', import.meta.url), 'utf8');

describe('quote services service-rate UI helpers', () => {
  it('recognizes persisted PER_GROUP capacity rates', () => {
    assert.ok(
      quoteServicesTableSource.includes("serviceRate.pricingMode === 'PER_GROUP'"),
      'Expected capacity helper to recognize persisted PER_GROUP rates',
    );
    assert.ok(
      quoteServicesTableSource.includes('Math.ceil(pax / maxPaxPerUnit)'),
      'Expected capacity helper to keep ceil pax over max pax per unit behavior',
    );
  });
});

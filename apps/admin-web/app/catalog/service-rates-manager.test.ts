import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const serviceRatesManagerSource = readFileSync(new URL('./ServiceRatesManager.tsx', import.meta.url), 'utf8');
const catalogTypesSource = readFileSync(new URL('./types.ts', import.meta.url), 'utf8');

function expectSourceContains(source: string, fragments: string[]) {
  for (const fragment of fragments) {
    assert.ok(source.includes(fragment), `Expected source to contain: ${fragment}`);
  }
}

describe('service rates manager max pax per unit support', () => {
  it('keeps maxPaxPerUnit in the admin rate form payload and returned type', () => {
    expectSourceContains(catalogTypesSource, ['maxPaxPerUnit?: number | null;']);

    expectSourceContains(serviceRatesManagerSource, [
      'maxPaxPerUnit: string;',
      "maxPaxPerUnit: rate.maxPaxPerUnit == null ? '' : String(rate.maxPaxPerUnit)",
      "maxPaxPerUnit: showMaxPaxPerUnit && formState.maxPaxPerUnit.trim() ? Number(formState.maxPaxPerUnit) : null",
      'name="maxPaxPerUnit"',
    ]);
  });
});

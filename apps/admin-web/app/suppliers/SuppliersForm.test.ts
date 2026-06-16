import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

// PR 12B-3B — Supplier "Base city" capture (UI only). Source-grep assertions over the
// existing supplier form/table (no new endpoint; reuses POST/PATCH /suppliers). No pricing.

const formSource = readFileSync(new URL('./SuppliersForm.tsx', import.meta.url), 'utf8');
const tableSource = readFileSync(new URL('./SuppliersTable.tsx', import.meta.url), 'utf8');

function expectSourceContains(source: string, fragments: string[]) {
  for (const fragment of fragments) {
    assert.ok(source.includes(fragment), `Expected source to contain: ${fragment}`);
  }
}

describe('PR 12B-3B — supplier base-city capture control', () => {
  it('1. the form renders a labelled Base city input with the no-pricing help text', () => {
    expectSourceContains(formSource, [
      'Base city',
      'value={baseCity}',
      'Used later for driver overnight evaluation. Leave blank if unknown. This does not change pricing yet.',
    ]);
  });

  it('2. the form sends baseCity in the body (transport only; blank → null)', () => {
    expectSourceContains(formSource, [
      'baseCity: type === \'transport\'',
      'baseCity.trim() === \'\' ? null',
    ]);
  });

  it('3. the form introduces no pricing/total fields and reuses the existing /suppliers path', () => {
    expectSourceContains(formSource, ['/suppliers', "method: supplierId ? 'PATCH'"]);
    assert.ok(!/markup|totalSell|totalCost|overrideCost|sellPrice/i.test(formSource), 'no pricing fields');
  });

  it('4. the table seeds baseCity into the edit form initial values', () => {
    expectSourceContains(tableSource, ['baseCity: supplier.baseCity ?? \'\'']);
  });
});

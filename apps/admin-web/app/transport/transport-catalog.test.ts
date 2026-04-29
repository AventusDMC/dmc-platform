import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const pageSource = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
const sectionSource = readFileSync(new URL('./VehicleRatesSection.tsx', import.meta.url), 'utf8');
const tableSource = readFileSync(new URL('./VehicleRatesTable.tsx', import.meta.url), 'utf8');

function expectSourceContains(source: string, fragments: string[]) {
  for (const fragment of fragments) {
    assert.ok(source.includes(fragment), `Expected source to contain: ${fragment}`);
  }
}

describe('transport catalog supplier rate-card UX', () => {
  it('labels the rates tab as Supplier Rate Cards', () => {
    expectSourceContains(pageSource, [
      "{ id: 'rates', label: 'Supplier Rate Cards' }",
      "'Supplier rate cards'",
      '`${summary.vehicleRates} rate lines`',
    ]);

    expectSourceContains(sectionSource, [
      'title="Supplier Rate Cards"',
      'Manage supplier transport rate cards, vehicle rates, routes, pax ranges, and validity periods.',
      '+ New Supplier Rate Card',
      'Create rate line',
      'No supplier rate-card lines yet.',
    ]);
  });

  it('groups supplier rate cards by supplier with an unassigned fallback', () => {
    expectSourceContains(tableSource, [
      'function getSupplierName(rate: VehicleRate)',
      "rate.vehicle.supplier?.name || rate.vehicle.supplierId || 'Unassigned supplier'",
      'function groupRatesBySupplier(vehicleRates: VehicleRate[])',
      'const supplierGroups = groupRatesBySupplier(vehicleRates);',
      'transport-contract-supplier-group',
      '{group.rates.length} rate lines',
      'transport-contract-divider',
      'aria-label={`Rate lines for ${group.supplierName}`}',
      'Rate Card',
      'Effective from',
      'Category',
      'Rate lines',
    ]);
  });

  it('uses a full-width rate-card page and supplier rate-line table', () => {
    expectSourceContains(pageSource, ["activeTab === 'rates' ? 'transport-contracts-page' : ''"]);

    expectSourceContains(tableSource, [
      'transport-contract-table',
      '<th>Service / Route</th>',
      '<th>Vehicle Size</th>',
      '<th>Duration / Basis</th>',
      '<th>Pax / Capacity</th>',
      '<th>Validity</th>',
      '<th>Price</th>',
      '<th>Actions</th>',
      'colSpan={7}',
    ]);

    assert.equal(tableSource.includes('<th>Service type</th>'), false);
  });

  it('keeps existing edit duplicate and delete actions rendered', () => {
    expectSourceContains(tableSource, [
      "setEditingId((current) => (current === rate.id ? null : rate.id))",
      "<DuplicateVehicleRateButton apiBaseUrl={apiBaseUrl} rateId={rate.id} />",
      'onClick={() => handleDelete(rate)}',
      '<VehicleRatesForm',
      'rateId={rate.id}',
      'submitLabel="Save rate line"',
    ]);
  });
});

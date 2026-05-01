import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const pageSource = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
const sectionSource = readFileSync(new URL('./VehicleRatesSection.tsx', import.meta.url), 'utf8');
const tableSource = readFileSync(new URL('./VehicleRatesTable.tsx', import.meta.url), 'utf8');
const importPanelSource = readFileSync(new URL('./TransportContractImportPanel.tsx', import.meta.url), 'utf8');

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
      'Upload supplier Excel contracts, confirm the parsed rows, and publish route rates, full-day packages, and add-ons for Quote Planner.',
    ]);

    assert.equal(sectionSource.includes('Create rate line'), false);
  });

  it('groups flat rows into supplier rate cards with an unassigned fallback', () => {
    expectSourceContains(tableSource, [
      'type SupplierRateCard =',
      'function getSupplierName(rate: VehicleRate)',
      "rate.vehicle.supplier?.name || rate.vehicle.supplierId || 'Unassigned supplier'",
      'function groupRatesIntoSupplierRateCards(vehicleRates: VehicleRate[]): SupplierRateCard[]',
      'const rateCards = groupRatesIntoSupplierRateCards(vehicleRates);',
      'transport-contract-supplier-group',
      '{rateCard.rates.length} rate lines',
      'transport-contract-divider',
      'aria-label={`Rate lines for ${rateCard.name}`}',
      'Supplier Rate Card',
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
      '<th>Classification</th>',
      '<th>Vehicle Size</th>',
      '<th>Duration / Basis</th>',
      '<th>Pax / Capacity</th>',
      '<th>Validity</th>',
      '<th>Price</th>',
      '<th>Actions</th>',
    ]);

    assert.equal(tableSource.includes('<th>Service type</th>'), false);
  });

  it('keeps creation and edit forms in a single side panel instead of inline rows', () => {
    expectSourceContains(tableSource, [
      'const [activeForm, setActiveForm] = useState<ActiveRateForm>(null);',
      'transport-rate-card-toolbar',
      'Advanced / manual rate card',
      "onClick={() => setActiveForm({ mode: 'create-rate-card' })}",
      'transport-rate-card-form-panel',
      "activeForm.mode === 'create-rate-card' ? 'Manual Rate Card' : activeForm.rate.routeName",
    ]);

    assert.equal(sectionSource.includes("import { VehicleRatesForm }"), false);
    assert.equal(tableSource.includes('InlineRowEditorShell'), false);
    assert.equal(tableSource.includes('colSpan={7}'), false);
  });

  it('keeps existing edit duplicate and delete actions rendered', () => {
    expectSourceContains(tableSource, [
      "onClick={() => setActiveForm({ mode: 'edit-line', rate })}",
      "<DuplicateVehicleRateButton apiBaseUrl={apiBaseUrl} rateId={rate.id} />",
      'onClick={() => handleDelete(rate)}',
      '<VehicleRatesForm',
      'rateId={activeForm.rate.id}',
      'submitLabel="Save rate line"',
    ]);
  });

  it('renders a phase-one Create Rate Card metadata form', () => {
    expectSourceContains(tableSource, [
      '<form className="transport-rate-card-metadata-form"',
      'Supplier',
      'Rate Card Name',
      'Category',
      'Effective From',
      'Currency',
      'Notes',
      'Alpha Bus and Limo Co',
      'Buses 2026 Rates in USD',
      'Use Excel contract upload for normal supplier rates.',
    ]);
  });

  it('makes contract import the primary supplier rate-card workflow', () => {
    expectSourceContains(sectionSource, [
      'transport-contract-import-hero',
      'Upload Contract',
      '<TransportContractImportPanel apiBaseUrl={ACTION_API_BASE_URL} />',
    ]);

    expectSourceContains(importPanelSource, [
      'Route transfers',
      'Full-day services',
      'Add-ons',
      'Confirm import',
      'detected service classification',
      'window.location.href = \'/transport?tab=rates&imported=1\'',
    ]);
  });
});

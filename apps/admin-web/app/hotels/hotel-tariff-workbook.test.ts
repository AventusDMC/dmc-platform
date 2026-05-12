import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { filterHotelTariffContracts } from './HotelTariffWorkbookSection';

describe('hotel tariff workbook phase 1', () => {
  it('adds a hotels workspace tariff workbook tab without pricing engine writes', () => {
    const pageSource = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
    const sectionSource = readFileSync(new URL('./HotelTariffWorkbookSection.tsx', import.meta.url), 'utf8');

    assert.match(pageSource, /'tariff-workbook'/);
    assert.match(pageSource, /HotelTariffWorkbookSection/);
    assert.match(sectionSource, /getHotelRates/);
    assert.match(sectionSource, /getMealPlans/);
    assert.match(sectionSource, /getSupplements/);
    assert.match(sectionSource, /getChildPolicy/);
    assert.doesNotMatch(sectionSource, /calculate-hotel-cost/);
    assert.doesNotMatch(sectionSource, /method:\s*'POST'/);
    assert.doesNotMatch(sectionSource, /method:\s*'PUT'/);
    assert.doesNotMatch(sectionSource, /method:\s*'PATCH'/);
  });

  it('keeps the workbook grid bulk-edit friendly with export and template-only import foundation', () => {
    const gridSource = readFileSync(new URL('./HotelTariffWorkbookGrid.tsx', import.meta.url), 'utf8');
    const cssSource = readFileSync(new URL('../globals.css', import.meta.url), 'utf8');

    assert.match(gridSource, /Export workbook/);
    assert.match(gridSource, /Import template/);
    assert.match(gridSource, /useEffect\(\(\) => \{\s*setWorkbookRows\(rows\);/);
    assert.match(gridSource, /Edits are staged in\s+the browser only for Phase 1/);
    assert.match(gridSource, /hotel-tariff-import-template\.csv/);
    assert.match(cssSource, /\.hotel-tariff-workbook-scroll\s*{[\s\S]*?overflow-x:\s*auto/);
    assert.match(cssSource, /\.hotel-tariff-workbook-table\s*{[\s\S]*?min-width:\s*1560px/);
    assert.match(cssSource, /\.hotel-tariff-workbook-table th\s*{[\s\S]*?position:\s*sticky/);
    assert.match(cssSource, /\.hotel-tariff-workbook-table input\s*{[\s\S]*?white-space:\s*nowrap/);
  });

  it('applies hotel and contract filters by ids and restores rows when filters clear', () => {
    const hotels = [
      { id: 'hotel-corp', cityId: 'city-amman' },
      { id: 'hotel-resort', cityId: 'city-aqaba' },
    ];
    const contracts = [
      { id: 'contract-corp-2026', validFrom: '2026-01-01', validTo: '2026-12-31', hotel: { id: 'hotel-corp' } },
      { id: 'contract-corp-2027', validFrom: '2027-01-01', validTo: '2027-12-31', hotel: { id: 'hotel-corp' } },
      { id: 'contract-resort-2026', validFrom: '2026-01-01', validTo: '2026-12-31', hotel: { id: 'hotel-resort' } },
    ];

    assert.deepEqual(
      filterHotelTariffContracts(contracts, hotels, { hotelId: 'hotel-corp' }).map((contract) => contract.id),
      ['contract-corp-2026', 'contract-corp-2027'],
    );
    assert.deepEqual(
      filterHotelTariffContracts(contracts, hotels, { contractId: 'contract-resort-2026' }).map((contract) => contract.id),
      ['contract-resort-2026'],
    );
    assert.deepEqual(
      filterHotelTariffContracts(contracts, hotels, { hotelId: 'hotel-corp', contractId: 'contract-corp-2027' }).map(
        (contract) => contract.id,
      ),
      ['contract-corp-2027'],
    );
    assert.deepEqual(filterHotelTariffContracts(contracts, hotels, { hotelId: 'hotel-corp', contractId: 'contract-resort-2026' }), []);
    assert.deepEqual(
      filterHotelTariffContracts(contracts, hotels, {}).map((contract) => contract.id),
      ['contract-corp-2026', 'contract-corp-2027', 'contract-resort-2026'],
    );
  });
});

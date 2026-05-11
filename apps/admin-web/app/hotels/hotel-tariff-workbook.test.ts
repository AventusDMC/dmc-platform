import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

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
    assert.match(gridSource, /Edits are staged in\s+the browser only for Phase 1/);
    assert.match(gridSource, /hotel-tariff-import-template\.csv/);
    assert.match(cssSource, /\.hotel-tariff-workbook-scroll\s*{[\s\S]*?overflow-x:\s*auto/);
    assert.match(cssSource, /\.hotel-tariff-workbook-table\s*{[\s\S]*?min-width:\s*1560px/);
    assert.match(cssSource, /\.hotel-tariff-workbook-table th\s*{[\s\S]*?position:\s*sticky/);
    assert.match(cssSource, /\.hotel-tariff-workbook-table input\s*{[\s\S]*?white-space:\s*nowrap/);
  });
});

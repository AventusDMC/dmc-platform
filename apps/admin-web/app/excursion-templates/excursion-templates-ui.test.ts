import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { buildExcursionTariffRowSources, filterExcursionTariffRowSources } from './ExcursionTariffWorkbookSection';

const pageSource = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
const editorSource = readFileSync(new URL('./ExcursionTemplateEditor.tsx', import.meta.url), 'utf8');
const tariffWorkbookSectionSource = readFileSync(new URL('./ExcursionTariffWorkbookSection.tsx', import.meta.url), 'utf8');
const tariffWorkbookGridSource = readFileSync(new URL('./ExcursionTariffWorkbookGrid.tsx', import.meta.url), 'utf8');
const fillMissingRouteSource = readFileSync(new URL('../api/excursion-templates/[id]/fill-missing-metadata/route.ts', import.meta.url), 'utf8');

function expectSourceContains(source: string, fragments: string[]) {
  for (const fragment of fragments) {
    assert.ok(source.includes(fragment), `Expected source to contain: ${fragment}`);
  }
}

describe('excursion template admin UI', () => {
  it('adds an excursion tariff workbook without flattening Activity Master variants', () => {
    expectSourceContains(pageSource, [
      "type ExcursionCatalogTab = 'templates' | 'tariff-workbook';",
      "href: '/excursion-templates?tab=tariff-workbook'",
      '<ExcursionTariffWorkbookSection',
      "activeTab === 'tariff-workbook'",
    ]);

    expectSourceContains(tariffWorkbookSectionSource, [
      "adminPageFetchJson<Activity[]>('/api/activities'",
      'buildExcursionTariffRowSources',
      'const safeActivities = Array.isArray(activities) ? activities : [];',
      'const variants = Array.isArray(activity.rateVariants) ? activity.rateVariants : [];',
      'filterExcursionTariffRowSources',
      'No excursion tariff rows match the selected filters.',
      'Activity Master records',
    ]);

    assert.equal(tariffWorkbookSectionSource.includes("method: 'POST'"), false);
    assert.equal(tariffWorkbookSectionSource.includes('calculate'), false);
  });

  it('renders the excursion tariff workbook as a local spreadsheet-style grid with CSV actions', () => {
    const cssSource = readFileSync(new URL('../globals.css', import.meta.url), 'utf8');

    expectSourceContains(tariffWorkbookGridSource, [
      'Excursion Tariff Workbook',
      'Import template',
      'Export workbook',
      'excursion-tariff-workbook.csv',
      'excursion-tariff-import-template.csv',
      'Edits are staged',
      'setWorkbookRows(safeRows);',
      'Activity / excursion',
      'Pricing basis',
      'Operational notes',
      'Active / inactive',
    ]);

    assert.match(cssSource, /\.excursion-tariff-workbook-scroll\s*{[\s\S]*?overflow-x:\s*auto/);
    assert.match(cssSource, /\.excursion-tariff-workbook-table\s*{[\s\S]*?min-width:\s*1480px/);
    assert.match(cssSource, /\.excursion-tariff-workbook-table th\s*{[\s\S]*?position:\s*sticky/);
    assert.match(cssSource, /\.excursion-tariff-workbook-table input\s*{[\s\S]*?white-space:\s*nowrap/);
  });

  it('applies excursion tariff workbook category city supplier pricing basis and active filters', () => {
    const activities = [
      {
        id: 'activity-petra',
        name: 'Petra Hiking Experiences',
        category: 'Hiking',
        city: 'Petra',
        region: 'South Jordan',
        supplierCompanyId: 'supplier-petra',
        pricingBasis: 'PER_PERSON',
        active: true,
        rateVariants: [
          { id: 'variant-monastery', name: 'Monastery Trail', pricingBasis: 'PER_PERSON', active: true },
          { id: 'variant-private', name: 'Private Group Trail', pricingBasis: 'PER_GROUP', active: false },
        ],
      },
      {
        id: 'activity-aqaba',
        name: 'Aqaba Boat Trip',
        category: 'Marine',
        city: 'Aqaba',
        region: 'Red Sea',
        supplierCompanyId: 'supplier-aqaba',
        pricingBasis: 'CAPACITY',
        active: true,
        rateVariants: [{ id: 'variant-boat', name: 'Private Boat', pricingBasis: 'CAPACITY', active: true }],
      },
    ];
    const sources = buildExcursionTariffRowSources(activities);

    assert.equal(sources.length, 3);
    assert.deepEqual(filterExcursionTariffRowSources(sources, { category: 'Hiking' }).map((source) => source.variant?.id), [
      'variant-monastery',
      'variant-private',
    ]);
    assert.deepEqual(filterExcursionTariffRowSources(sources, { cityRegion: 'Aqaba / Red Sea' }).map((source) => source.variant?.id), [
      'variant-boat',
    ]);
    assert.deepEqual(filterExcursionTariffRowSources(sources, { supplierId: 'supplier-petra', pricingBasis: 'PER_GROUP' }).map((source) => source.variant?.id), [
      'variant-private',
    ]);
    assert.deepEqual(filterExcursionTariffRowSources(sources, { activeState: 'active' }).map((source) => source.variant?.id), [
      'variant-monastery',
      'variant-boat',
    ]);
    assert.deepEqual(filterExcursionTariffRowSources(sources, {}).map((source) => source.variant?.id), [
      'variant-monastery',
      'variant-private',
      'variant-boat',
    ]);
  });

  it('keeps excursion tariff workbook variant access null-safe for SSR builds', () => {
    const activities = [
      {
        id: 'activity-null-variants',
        name: 'Null Variant Activity',
        supplierCompanyId: 'supplier-null',
        pricingBasis: 'PER_PERSON',
        active: true,
        rateVariants: null,
      },
      {
        id: 'activity-missing-variants',
        name: 'Missing Variant Activity',
        supplierCompanyId: 'supplier-missing',
        pricingBasis: 'PER_GROUP',
        active: true,
      },
    ];

    const sources = buildExcursionTariffRowSources(activities);

    assert.equal(sources.length, 2);
    assert.deepEqual(sources.map((source) => source.variant), [null, null]);
    assert.deepEqual(buildExcursionTariffRowSources(null), []);
    assert.deepEqual(filterExcursionTariffRowSources(null, null), []);
  });

  it('exposes a safe fill missing operational metadata action', () => {
    expectSourceContains(editorSource, [
      'function fillMissingMetadata()',
      '`/api/excursion-templates/${template.id}/fill-missing-metadata`',
      'Fill Missing Metadata',
      'Filling...',
      'setStatusMessage(result?.message ||',
      'No blank metadata fields needed filling.',
      '{statusMessage ? <p className="form-success">{statusMessage}</p> : null}',
      'Fills only blank operational fields with safe defaults. Existing values and pricing are preserved.',
    ]);

    expectSourceContains(fillMissingRouteSource, [
      '/excursion-templates/${encodeURIComponent(id)}/fill-missing-metadata',
      "'POST'",
    ]);
  });
});

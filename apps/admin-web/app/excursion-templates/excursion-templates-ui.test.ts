import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { buildExcursionTariffRowSources, filterExcursionTariffRowSources } from './ExcursionTariffWorkbookSection';
import { buildExcursionTariffCsvRows } from './ExcursionTariffWorkbookGrid';

const pageSource = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
const detailPageSource = readFileSync(new URL('./[id]/page.tsx', import.meta.url), 'utf8');
const petraFullDayPageSource = readFileSync(new URL('./petra-full-day/page.tsx', import.meta.url), 'utf8');
const editorSource = readFileSync(new URL('./ExcursionTemplateEditor.tsx', import.meta.url), 'utf8');
const operationalBlueprintImportPanelSource = readFileSync(new URL('./OperationalBlueprintImportPanel.tsx', import.meta.url), 'utf8');
const tariffWorkbookSectionSource = readFileSync(new URL('./ExcursionTariffWorkbookSection.tsx', import.meta.url), 'utf8');
const tariffWorkbookGridSource = readFileSync(new URL('./ExcursionTariffWorkbookGrid.tsx', import.meta.url), 'utf8');
const fillMissingRouteSource = readFileSync(new URL('../api/excursion-templates/[id]/fill-missing-metadata/route.ts', import.meta.url), 'utf8');

function expectSourceContains(source: string, fragments: string[]) {
  for (const fragment of fragments) {
    assert.ok(source.includes(fragment), `Expected source to contain: ${fragment}`);
  }
}

describe('excursion template admin UI', () => {
  it('lets transport components link touring routes without flattening transport inventory', () => {
    expectSourceContains(editorSource, [
      'transportProductType',
      "value=\"TOURING_ROUTE\"",
      'Touring route',
      'touringRouteId',
      'catalogs.touringRoutes',
      'selectedTouringRouteId',
    ]);
  });

  it('groups touring route transport variants by origin on template detail pages', () => {
    expectSourceContains(editorSource, [
      'Origin Variants',
      'originVariantComponents',
      'isOriginVariantTransport',
      'isTouringVariantTransport',
      'getOriginVariantStartCity',
      'getOriginVariantName',
      'getInventoryWarnings',
      'ROUTE_CODE_PATTERN',
      'extractVariantRouteCode(component.label)',
      'extractVariantRouteCode(component.operationalNotes)',
      'formatOriginCode(sourceOriginCode)',
      'TOURING_TRANSPORT_CLASSIFICATIONS',
      'TOURING_TRANSPORT_TEXT_PATTERN',
      'hasTouringTransportServiceType',
      'hasRouteMovement',
      'Tickets',
      'Guides',
      'Dining',
      'Activities',
      'Optional',
      'Open route',
      'formatTouringRouteLabel',
      'showAllOnFocus={options.originVariant}',
    ]);
    expectSourceContains(detailPageSource, ['transportType=TOURING_ROUTE&limit=500']);
    expectSourceContains(petraFullDayPageSource, ['transportType=TOURING_ROUTE&limit=500']);
  });

  it('supports add duplicate remove and persistence controls for origin variants', () => {
    expectSourceContains(editorSource, [
      'function addOriginVariant()',
      'function duplicateOriginVariant(component: ExcursionTemplate[\'components\'][number])',
      'Origin variant draft',
      'Add Origin Variant',
      'Duplicate Variant',
      "renderComponentControls(component, { removeLabel: 'Remove Variant' })",
      'routeId: null',
      'touringRouteId: null',
      'suggestedDepartureCity: null',
      'supplierConfirmationRequired: component.supplierConfirmationRequired ?? null',
      'voucherRequired: component.voucherRequired ?? null',
      'pickupNotes: component.pickupNotes || null',
      'operationalDependency: component.operationalDependency || null',
      'Duplicate origin variant: this origin city and touring route variant already exist.',
      'router.refresh();',
    ]);
  });

  it('marks unlinked origin variants as draft instead of quote-ready', () => {
    expectSourceContains(editorSource, [
      'function isQuoteReadyOriginVariant',
      "return 'Draft / Missing touring route';",
      'Link a touring route to make this origin available in quotes.',
      'touringRouteId: null',
      'suggestedDepartureCity: null',
    ]);
  });

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

  it('exposes the operational blueprint workbook import workflow without flattening reusable inventory', () => {
    expectSourceContains(pageSource, [
      "import { OperationalBlueprintImportPanel } from './OperationalBlueprintImportPanel';",
      '<OperationalBlueprintImportPanel />',
    ]);

    expectSourceContains(operationalBlueprintImportPanelSource, [
      'Operational Blueprint Workbook Import',
      'Choose File',
      'Preview Workbook',
      'Import Workbook',
      '/api/excursion-templates/operational-blueprint/import-preview',
      '/api/excursion-templates/operational-blueprint/import',
      'Excursion templates',
      'Touring route variants',
      'Transport components',
      'Ticket components',
      'Guide components',
      'Dining / activity components',
      'Blocking validation errors',
      'Review warnings',
      'Duplicate TemplateCode',
      'unknown touring route refs',
      'missing required transport component',
      'missing reusable',
      'Reusable inventory references',
      'Templates stay linked to reusable operational components instead of becoming flat pricing rows.',
    ]);
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

  it('exports excursion tariff rows with origin-aware display names when an origin variant exists', () => {
    const csvRows = buildExcursionTariffCsvRows([
      {
        id: 'petra-aqaba',
        activityName: 'Petra Guided Experience',
        originCity: 'Aqaba',
        variant: 'Base rate',
        category: 'Excursion',
        cityRegion: 'Petra / South Jordan',
        supplier: 'Supplier name',
        pricingBasis: 'PER_PERSON',
        currency: 'JOD',
        duration: '4 hr',
        cost: '0.00',
        sell: '0.00',
        operationalNotes: '',
        status: 'Active',
      },
    ]);

    assert.equal(csvRows[1][0], 'Petra Guided Experience — From Aqaba');
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

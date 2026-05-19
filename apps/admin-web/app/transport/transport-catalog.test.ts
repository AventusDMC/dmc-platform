import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { filterCanonicalGeographicPlaces, formatPlaceSelectorLabel, getCanonicalPlaceDisplayName, getCanonicalPlaceSecondaryText } from '../lib/places';
import { filterCanonicalFleetVehicles, isCanonicalFleetVehicle } from '../lib/transport-vehicles';
import { filterTransportTariffRates } from './TransportTariffWorkbookSection';

const pageSource = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
const sectionSource = readFileSync(new URL('./VehicleRatesSection.tsx', import.meta.url), 'utf8');
const tableSource = readFileSync(new URL('./VehicleRatesTable.tsx', import.meta.url), 'utf8');
const tariffWorkbookSectionSource = readFileSync(new URL('./TransportTariffWorkbookSection.tsx', import.meta.url), 'utf8');
const tariffWorkbookGridSource = readFileSync(new URL('./TransportTariffWorkbookGrid.tsx', import.meta.url), 'utf8');
const touringRoutesSectionSource = readFileSync(new URL('./TouringRoutesSection.tsx', import.meta.url), 'utf8');
const touringRouteArchiveButtonSource = readFileSync(new URL('./TouringRouteArchiveButton.tsx', import.meta.url), 'utf8');
const touringRouteDuplicateButtonSource = readFileSync(new URL('./touring-routes/TouringRouteDuplicateButton.tsx', import.meta.url), 'utf8');
const touringRouteCreateFormSource = readFileSync(new URL('./touring-routes/TouringRouteCreateForm.tsx', import.meta.url), 'utf8');
const touringRouteCreatePageSource = readFileSync(new URL('./touring-routes/new/page.tsx', import.meta.url), 'utf8');
const touringRouteDuplicateProxySource = readFileSync(new URL('../api/touring-routes/[id]/duplicate/route.ts', import.meta.url), 'utf8');
const touringRouteDetailPageSource = readFileSync(new URL('./touring-routes/[id]/page.tsx', import.meta.url), 'utf8');
const touringRouteEditorSource = readFileSync(new URL('./touring-routes/[id]/TouringRouteEditor.tsx', import.meta.url), 'utf8');
const touringRouteWorkbookImportPanelSource = readFileSync(new URL('./TouringRouteWorkbookImportPanel.tsx', import.meta.url), 'utf8');
const safeLoaderSource = readFileSync(new URL('./SupplierRateCardsSafeLoader.tsx', import.meta.url), 'utf8');
const importPanelSource = readFileSync(new URL('./TransportContractImportPanel.tsx', import.meta.url), 'utf8');
const vehicleRatesFormSource = readFileSync(new URL('../vehicle-rates/VehicleRatesForm.tsx', import.meta.url), 'utf8');
const routeComboboxSource = readFileSync(new URL('../components/RouteCombobox.tsx', import.meta.url), 'utf8');
const placeComboboxSource = readFileSync(new URL('../components/PlaceCombobox.tsx', import.meta.url), 'utf8');
const pricingRuleFormSource = readFileSync(new URL('../transport-pricing/TransportPricingRuleForm.tsx', import.meta.url), 'utf8');
const routesFormSource = readFileSync(new URL('../routes/RoutesForm.tsx', import.meta.url), 'utf8');
const routesProxySource = readFileSync(new URL('../api/routes/route.ts', import.meta.url), 'utf8');
const routeDetailProxySource = readFileSync(new URL('../api/routes/[id]/route.ts', import.meta.url), 'utf8');
const routeDuplicateProxySource = readFileSync(new URL('../api/routes/[id]/duplicate/route.ts', import.meta.url), 'utf8');
const transportRoutesSource = readFileSync(new URL('../lib/transport-routes.ts', import.meta.url), 'utf8');
const quotePageSource = readFileSync(new URL('../quotes/[id]/page.tsx', import.meta.url), 'utf8');
const quoteTransportPickerSource = readFileSync(new URL('../quotes/[id]/QuoteTransportPicker.tsx', import.meta.url), 'utf8');
const transportPricingCalculatorSource = readFileSync(new URL('../transport-pricing/TransportPricingCalculator.tsx', import.meta.url), 'utf8');
const touringRouteEditorSourceForSelectors = readFileSync(new URL('./touring-routes/[id]/TouringRouteEditor.tsx', import.meta.url), 'utf8');

function expectSourceContains(source: string, fragments: string[]) {
  for (const fragment of fragments) {
    assert.ok(source.includes(fragment), `Expected source to contain: ${fragment}`);
  }
}

describe('transport catalog supplier rate-card UX', () => {
  it('aligns transport workspace labels and counts to route taxonomy', () => {
    expectSourceContains(pageSource, [
      "{ id: 'routes', label: 'Transfer Routes' }",
      "{ id: 'touring-routes', label: 'Touring Routes' }",
      "{ id: 'excursion-templates', label: 'Excursion Templates', href: '/excursion-templates', helper: 'Sellable products' }",
      "`${API_BASE_URL}/routes?type=TRANSFER_ROUTE`",
      "`${API_BASE_URL}/excursion-templates`",
      "label: 'Transfer Routes'",
      "label: 'Touring Routes'",
      "label: 'Excursion Templates'",
      'summary.excursionTemplates',
    ]);

    expectSourceContains(readFileSync(new URL('./RoutesSection.tsx', import.meta.url), 'utf8'), [
      'title="Transfer Routes"',
      'transfer routes in scope',
      'Create transfer route',
      'Add transfer route',
      'No transfer routes yet.',
      '/routes?type=TRANSFER_ROUTE',
    ]);
  });

  it('keeps Transfer Routes form limited to transfer routes only', () => {
    expectSourceContains(transportRoutesSource, ["'TRANSFER_ROUTE'", 'MOVEMENT_ROUTE_TYPE_LABELS']);
    assert.equal(transportRoutesSource.includes("'TOURING_ROUTE'"), false);
    expectSourceContains(routesFormSource, [
      "const TRANSFER_ROUTE_TYPE = 'TRANSFER_ROUTE';",
      'MOVEMENT_ROUTE_TYPES.map((option)',
      'getMovementRouteTypeLabel(option)',
      'const nextRouteType = isFixedMovementRouteType(routeType) ? routeType : TRANSFER_ROUTE_TYPE;',
      'routeType: nextRouteType,',
      'Legacy route type',
      'needs taxonomy review before it can be saved.',
    ]);
    expectSourceContains(readFileSync(new URL('./RoutesTable.tsx', import.meta.url), 'utf8'), [
      'function formatRouteOperations(route: RouteOption)',
      'operations.sicPossible ? \'SIC possible\'',
      'operations.longDistance ? \'Long distance\'',
      'operations.guideRecommended ? \'Guide recommended\'',
      'Review taxonomy',
    ]);

    assert.equal(transportRoutesSource.includes("'Excursion'"), false);
    assert.equal(transportRoutesSource.includes("'Other'"), false);
    assert.equal(routesFormSource.includes('otherRouteType'), false);
  });

  it('proxies transfer route create edit delete actions to the backend routes API', () => {
    expectSourceContains(routesProxySource, [
      "`${API_BASE_URL}/routes${request.nextUrl.search}`",
      "'GET'",
      "`${API_BASE_URL}/routes`",
      "'POST'",
    ]);

    expectSourceContains(routeDetailProxySource, [
      "params: Promise<{ id: string }>",
      "`${API_BASE_URL}/routes/${encodeURIComponent(id)}${request.nextUrl.search}`",
      "'GET'",
      "`${API_BASE_URL}/routes/${encodeURIComponent(id)}`",
      "'PATCH'",
      "'DELETE'",
    ]);

    expectSourceContains(routeDuplicateProxySource, [
      "`${API_BASE_URL}/routes/${encodeURIComponent(id)}/duplicate`",
      "'POST'",
    ]);
  });

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
      'rate.supplier?.name ??',
      'rate.supplierName ??',
      'rate.transportService?.supplier?.name ??',
      'rate.service?.supplier?.name',
      'null,',
      'function groupRatesIntoSupplierRateCards(vehicleRates: VehicleRate[]): SupplierRateCard[]',
      'const [preparedRateCardTarget, setPreparedRateCardTarget] = useState(RATE_CARD_PAGE_SIZE);',
      'async function prepareRateCards()',
      "fetch(`${apiBaseUrl}/vehicle-rates/cards?${params.toString()}`",
      "fetch(`${apiBaseUrl}/vehicle-rates/cards/${encodeURIComponent(rateCardId)}`",
      'const key = [getSupplierIdentityKey(rate), routeOrServiceArea, rate.currency, validFrom, validTo].join(\'|\');',
      'function groupRateLinesByVehicleType(rates: VehicleRate[])',
      'function getRateCardServiceCategory(rates: VehicleRate[]): ServiceCategory',
      "type ServiceCategory = 'Transfers' | 'Disposal' | 'Add-ons';",
      "const SERVICE_CATEGORIES: ServiceCategory[] = ['Transfers', 'Disposal', 'Add-ons'];",
      'transport-contract-supplier-group',
      '{rateCard.rateLineCount ?? rateCard.rates.length} rate lines',
      'transport-contract-divider',
      'aria-label={`Rate lines for ${rateCard.name}`}',
      'Supplier Rate Card',
      'Effective from',
      'ServiceCategory',
      'Rate lines',
    ]);
  });

  it('uses a full-width rate-card page and supplier rate-line table', () => {
    expectSourceContains(pageSource, ["activeTab === 'rates' || activeTab === 'tariff-workbook' ? 'transport-contracts-page' : ''"]);

    expectSourceContains(tableSource, [
      'transport-contract-table',
      '<th>{routeFieldLabel}</th>',
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

  it('adds a transportation tariff workbook without changing transport pricing or route architecture', () => {
    expectSourceContains(pageSource, [
      "{ id: 'tariff-workbook', label: 'Tariff Workbook' }",
      '<TransportTariffWorkbookSection',
      "activeTab === 'tariff-workbook'",
    ]);

    expectSourceContains(tariffWorkbookSectionSource, [
      'getVehicleRates',
      'getSuppliers',
      'getRoutes',
      'getVehicles',
      'TRANSPORT_RATE_CARD_PRICING_MODES',
      'deriveTransportPricingMode(rate)',
      'filterTransportTariffRates',
      'No transportation tariff rows match the selected filters.',
    ]);

    assert.equal(tariffWorkbookSectionSource.includes('method: \'POST\''), false);
    assert.equal(tariffWorkbookSectionSource.includes('calculate'), false);
  });

  it('renders the transportation tariff workbook as a local spreadsheet-style grid with CSV actions', () => {
    const cssSource = readFileSync(new URL('../globals.css', import.meta.url), 'utf8');

    expectSourceContains(tariffWorkbookGridSource, [
      'Transportation Tariff Workbook',
      'Import template',
      'Export workbook',
      'transportation-tariff-workbook.csv',
      'transportation-tariff-import-template.csv',
      'Edits are staged',
      'useEffect(() => {',
      'setWorkbookRows(rows);',
      'Pricing mode',
      'Pax range',
      'Active / inactive',
    ]);

    assert.match(cssSource, /\.transport-tariff-workbook-scroll\s*{[\s\S]*?overflow-x:\s*auto/);
    assert.match(cssSource, /\.transport-tariff-workbook-table\s*{[\s\S]*?min-width:\s*1320px/);
    assert.match(cssSource, /\.transport-tariff-workbook-table th\s*{[\s\S]*?position:\s*sticky/);
    assert.match(cssSource, /\.transport-tariff-workbook-table input\s*{[\s\S]*?white-space:\s*nowrap/);
  });

  it('applies transportation tariff workbook supplier route mode vehicle validity and active filters by ids', () => {
    const rates = [
      {
        id: 'rate-alpha-airport',
        supplierId: 'supplier-alpha',
        supplier: { id: 'supplier-alpha' },
        routeId: 'route-airport-petra',
        routeName: 'Airport to Petra',
        minPax: 1,
        maxPax: 3,
        price: 100,
        currency: 'USD',
        validFrom: '2026-01-01',
        validTo: '2026-12-31',
        active: true,
        vehicle: { name: 'Sedan', vehicleType: 'Sedan' },
        serviceType: { name: 'Airport Transfer', code: 'AIRPORT_TRANSFER', classification: 'ROUTE_TRANSFER' },
        route: { id: 'route-airport-petra', name: 'Airport to Petra' },
      },
      {
        id: 'rate-alpha-day',
        supplierId: 'supplier-alpha',
        supplier: { id: 'supplier-alpha' },
        routeId: 'route-amman-city',
        routeName: 'Amman City',
        minPax: 1,
        maxPax: 49,
        price: 400,
        currency: 'USD',
        validFrom: '2026-01-01',
        validTo: '2026-12-31',
        active: false,
        vehicle: { name: 'Large 49', vehicleType: 'Coach' },
        serviceType: { name: 'Full Day', code: 'FULL_DAY', classification: 'FULL_DAY' },
        route: { id: 'route-amman-city', name: 'Amman City' },
      },
      {
        id: 'rate-beta-extra',
        supplierId: 'supplier-beta',
        supplier: { id: 'supplier-beta' },
        routeId: 'route-airport-petra',
        routeName: 'Airport to Petra',
        minPax: 1,
        maxPax: 49,
        price: 5,
        currency: 'USD',
        validFrom: '2027-01-01',
        validTo: '2027-12-31',
        active: true,
        vehicle: { name: 'Large 49', vehicleType: 'Coach' },
        serviceType: { name: 'Extra KM', code: 'EXTRA_KM', classification: 'ADD_ON' },
        route: { id: 'route-airport-petra', name: 'Airport to Petra' },
      },
    ];

    assert.deepEqual(filterTransportTariffRates(rates, { supplierId: 'supplier-alpha' }).map((rate) => rate.id), [
      'rate-alpha-airport',
      'rate-alpha-day',
    ]);
    assert.deepEqual(filterTransportTariffRates(rates, { routeId: 'route-airport-petra' }).map((rate) => rate.id), [
      'rate-alpha-airport',
      'rate-beta-extra',
    ]);
    assert.deepEqual(filterTransportTariffRates(rates, { pricingMode: 'Daily Full Day' }).map((rate) => rate.id), ['rate-alpha-day']);
    assert.deepEqual(filterTransportTariffRates(rates, { vehicleType: 'Coach', activeState: 'active' }).map((rate) => rate.id), [
      'rate-beta-extra',
    ]);
    assert.deepEqual(filterTransportTariffRates(rates, { validity: '2026-01-01:2026-12-31' }).map((rate) => rate.id), [
      'rate-alpha-airport',
      'rate-alpha-day',
    ]);
    assert.deepEqual(
      filterTransportTariffRates(rates, { supplierId: 'supplier-alpha', routeId: 'route-airport-petra', pricingMode: 'Airport Transfer' }).map(
        (rate) => rate.id,
      ),
      ['rate-alpha-airport'],
    );
    assert.deepEqual(filterTransportTariffRates(rates, {}).map((rate) => rate.id), [
      'rate-alpha-airport',
      'rate-alpha-day',
      'rate-beta-extra',
    ]);
  });

  it('structures supplier rate-card details into readable pricing workflow sections', () => {
    expectSourceContains(tableSource, [
      'transport-rate-card-summary-head',
      'transport-rate-card-chip-row',
      'Vehicle Pricing',
      'transport-vehicle-pricing-group',
      'Add-ons &amp; Supplements',
      'Discounts / quote pricing driver',
      'Backend rows',
      '<th>Vehicle Type</th>',
      '<th>Pax Range</th>',
      'getRouteFieldLabel(rateCard.category)',
      'getRateRouteOrServiceAreaDisplay(rate, rateCard.category)',
      "return category === 'Transfers' ? 'Route' : 'Service Area';",
      '<th>Currency</th>',
      '<th>Notes</th>',
      '<th>Actions</th>',
      'open={sectionIndex === 0}',
    ]);
  });

  it('displays disposal and add-on rate cards as service areas instead of routes', () => {
    expectSourceContains(tableSource, [
      'function getRateRouteOrServiceAreaDisplay',
      'function getServiceAreaFallbackLabel',
      "if (normalizedLabel.includes('jordan_program')) return 'Jordan Program';",
      "if (normalizedLabel.includes('amman_city')) return 'Amman City';",
      "return 'Disposal / Day Services';",
      'Service Area',
      '{routeFieldLabel}: {routeOrServiceAreaLabel}',
      '<span>{routeFieldLabel}</span>',
      '<th>{routeFieldLabel}</th>',
    ]);
  });

  it('keeps creation and edit forms in a single side panel instead of inline rows', () => {
    expectSourceContains(tableSource, [
      "const [activeForm, setActiveForm] = useState<ActiveRateForm>(initialCreateOpen ? { mode: 'create-rate-card' } : null);",
      'transport-rate-card-toolbar',
      '+ Add Rate Card',
      "onClick={() => setActiveForm({ mode: 'create-rate-card' })}",
      'transport-rate-card-form-panel',
      "activeForm.mode === 'create-rate-card' ? 'Create Rate Card (Manual)' : formatRouteLabel(activeForm.rate.routeName)",
    ]);

    assert.equal(sectionSource.includes("import { VehicleRatesForm }"), false);
    assert.equal(tableSource.includes('InlineRowEditorShell'), false);
    assert.equal(tableSource.includes('colSpan={7}'), false);
  });

  it('keeps existing edit duplicate and delete actions rendered', () => {
    expectSourceContains(tableSource, [
      "onClick={() => setActiveForm({ mode: 'edit-line', rate: withRateCardSupplier(rate, rateCard) })}",
      "<DuplicateVehicleRateButton onDuplicate={() => setActiveForm({ mode: 'duplicate-line', rate: withRateCardSupplier(rate, rateCard) })} />",
      'onClick={() => handleDelete(rate)}',
      '<VehicleRatesForm',
      "rateId={activeForm.mode === 'edit-line' ? activeForm.rate.id : undefined}",
      "submitLabel={activeForm.mode === 'duplicate-line' ? 'Save duplicate rate line' : 'Save rate line'}",
    ]);
  });

  it('duplicates supplier pricing rows inside the same grouped rate-card context', () => {
    expectSourceContains(tableSource, [
      'function withRateCardSupplier(rate: VehicleRate, rateCard: SupplierRateCard): VehicleRate',
      "const supplierId = rate.supplierId || rate.supplier?.id || rateCard.supplierId || '';",
      'supplierId: supplierId || null,',
      'supplierName: rate.supplierName || rate.supplier?.name || rateCard.supplierName',
      "lockRateCardContext={activeForm.mode === 'duplicate-line'}",
      "supplierId: activeForm.rate.supplierId || activeForm.rate.supplier?.id || null",
      "routeId: activeForm.rate.routeId || ''",
      "vehicleId: activeForm.rate.vehicleId",
      "currency: normalizeSupportedCurrency(activeForm.rate.currency)",
      "notes: activeForm.rate.notes || ''",
      "validFrom: activeForm.rate.validFrom.slice(0, 10)",
      "validTo: activeForm.rate.validTo.slice(0, 10)",
    ]);

    expectSourceContains(vehicleRatesFormSource, [
      'lockRateCardContext?: boolean;',
      'supplierId?: string | null;',
      "const [supplierId] = useState(initialValues?.supplierId || '');",
      'supplierId: supplierId || null,',
      'notes: notes.trim() || null,',
      'disabled={selectableVehicles.length === 0 || lockRateCardContext}',
      'disabled={lockRateCardContext}',
    ]);
  });

  it('adds safe supplier rate-card deletion from the grouped card', () => {
    expectSourceContains(tableSource, [
      'type PendingRateCardDelete = { rateCard: SupplierRateCard };',
      'const [pendingRateCardDelete, setPendingRateCardDelete] = useState<PendingRateCardDelete | null>(null);',
      'const [deletedRateIds, setDeletedRateIds] = useState<string[]>([]);',
      'deletedRateIdSet.has(rate.id)',
      'async function handleConfirmDeleteRateCard()',
      "method: 'DELETE'",
      'setDeletedRateIds((current) => Array.from(new Set([...current, ...deletedIds])));',
      "setSuccessMessage('Rate card deleted');",
      'Delete Supplier Rate Card',
      'Confirm delete',
      'quote transport selection',
      'Locked or system rate cards cannot be deleted.',
    ]);
  });

  it('allows fixing the supplier assigned to a supplier rate card', () => {
    expectSourceContains(sectionSource, [
      'async function getSuppliers(): Promise<Supplier[]>',
      'getSuppliers(),',
      'suppliers={suppliers}',
    ]);

    expectSourceContains(tableSource, [
      'type ActiveSupplierEdit = { rateCardId: string; supplierId: string };',
      'Edit Supplier',
      'setActiveSupplierEdit({ rateCardId: rateCard.id, supplierId: getSupplierId(rateCard.rates[0]) })',
      'Save supplier',
      "body: JSON.stringify({ supplierId: activeSupplierEdit.supplierId })",
      'Supplier must exist.',
    ]);
  });

  it('lets operators export a supplier rate card as Excel', () => {
    expectSourceContains(tableSource, [
      'async function handleExportRateCard(rateCard: SupplierRateCard)',
      "`${apiBaseUrl}/vehicle-rates/export?rateCardId=${encodeURIComponent(rateCard.id)}`",
      'Export Excel',
      'response.blob()',
      'content-disposition',
    ]);
  });

  it('lets operators auto-fill missing transport add-ons for a supplier rate card', () => {
    expectSourceContains(tableSource, [
      'type AutoFillAddOnsSummary =',
      'async function handleAutoFillAddOns(rateCard: SupplierRateCard)',
      "`${apiBaseUrl}/vehicle-rates/auto-fill-addons`",
      "body: JSON.stringify({ rateCardId: rateCard.id })",
      'Auto-fill add-ons',
      'Daily created:',
      'Overnight created:',
      'Stationary created:',
      'Waiting created:',
      'Skipped existing:',
    ]);
  });

  it('loads enough saved routes and keeps route selectors searchable', () => {
    expectSourceContains(sectionSource, [
      '`${API_BASE_URL}/routes?type=transfer&limit=200`',
    ]);

    expectSourceContains(routeComboboxSource, [
      'maxResults = 50',
      'route.fromPlace.name',
      'route.toPlace.name',
      'route.fromPlace.city',
      'route.toPlace.city',
      '.slice(0, maxResults)',
    ]);

    expectSourceContains(vehicleRatesFormSource, [
      '<RouteCombobox',
      'placeholder="Search active routes"',
      'maxResults={50}',
    ]);

    expectSourceContains(pricingRuleFormSource, [
      '<RouteCombobox',
      'placeholder={routes.length === 0 ? \'Create a route first\' : \'Search saved routes\'}',
      'maxResults={50}',
    ]);
  });

  it('keeps place combobox selections committed while operators search', () => {
    expectSourceContains(placeComboboxSource, [
      'const [committedSelectedPlace, setCommittedSelectedPlace] = useState<PlaceOption | null>(null);',
      'const selectedPlace = selectedPlaceFromOptions || committedSelectedPlace;',
      'if (selectedPlaceFromOptions) {',
      'setCommittedSelectedPlace(selectedPlaceFromOptions);',
      'if (isOpen) {',
      'setCommittedSelectedPlace(place);',
      'Selected <strong>{formatPlaceSelectorLabel(selectedPlace)}</strong>',
      'aria-label={`Clear ${label}`}',
    ]);

    assert.equal(placeComboboxSource.includes("onChange('');\r\n            setIsOpen(true);"), false);
    assert.equal(placeComboboxSource.includes("onChange('');\n            setIsOpen(true);"), false);
  });

  it('keeps transport selector data boundaries separated by catalog area', () => {
    expectSourceContains(sectionSource, [
      '`${API_BASE_URL}/routes?type=transfer&limit=200`',
    ]);

    expectSourceContains(routesFormSource, [
      'places={fromPlaceOptions}',
      'places={toPlaceOptions}',
      '<PlaceComboboxWithCreate',
    ]);

    expectSourceContains(quotePageSource, [
      '`${API_BASE_URL}/routes?type=TRANSFER_ROUTE&limit=200`',
      '`${API_BASE_URL}/touring-routes?active=true&transportType=TOURING_ROUTE&limit=500`',
      "canonicalRouteType: 'TOURING_ROUTE'",
      "transportPickerMode: 'TOURING_ROUTE'",
    ]);

    expectSourceContains(quoteTransportPickerSource, [
      'const routeTransferOptions = routeSelectorGroups.transferRoutes;',
      'const touringRouteOptions = routeSelectorGroups.touringRoutes;',
      'const serviceAreaOptions = routeSelectorGroups.serviceAreas;',
      "if (mode === 'TOURING_ROUTE') return groups.touringRoutes;",
      "if (mode === 'DISPOSAL') return groups.serviceAreas;",
      'return groups.transferRoutes;',
      "if (isTouringRouteOption(route) || isProgramOrDisposalRouteOption(route)) {",
      "if (isTouringRouteOption(route) || !isProgramOrDisposalRouteOption(route)) {",
    ]);
  });

  it('filters operator-facing place selectors to canonical geographic places', () => {
    const places = [
      { id: 'amman', name: 'Amman', type: 'City', placeTypeId: null, cityId: null, city: 'Amman', country: 'Jordan', isActive: true },
      { id: 'petra', name: 'Petra Visitor Center', type: 'Site', placeTypeId: null, cityId: null, city: 'Petra', country: 'Jordan', isActive: true },
      { id: 'qaia', name: 'Queen Alia International Airport', type: 'Airport', placeTypeId: null, cityId: null, city: 'Amman', country: 'Jordan', isActive: true },
      { id: 'border', name: 'Allenby Bridge', type: 'Border', placeTypeId: null, cityId: null, city: null, country: 'Jordan', isActive: true },
      { id: 'port', name: 'Aqaba Port', type: 'Port', placeTypeId: null, cityId: null, city: 'Aqaba', country: 'Jordan', isActive: true },
      { id: 'wadi-rum', name: 'Wadi Rum Camp Area', type: 'Location', placeTypeId: null, cityId: null, city: 'Wadi Rum', country: 'Jordan', isActive: true },
      { id: 'full-day', name: 'Alpha Bus Full Day 200km', type: 'Supplier Rate', placeTypeId: null, cityId: null, city: null, country: null, isActive: true },
      { id: 'extra-km', name: 'Alpha Bus Extra KM', type: 'Site', placeTypeId: null, cityId: null, city: null, country: null, isActive: true },
      { id: 'driver-overnight', name: 'Alpha Driver Overnight', type: 'Location', placeTypeId: null, cityId: null, city: null, country: null, isActive: true },
      { id: 'extra-hour', name: 'Alpha Limo Extra Hour', type: 'Location', placeTypeId: null, cityId: null, city: null, country: null, isActive: true },
      { id: 'half-day', name: 'Alpha Limo Half Day', type: 'Location', placeTypeId: null, cityId: null, city: null, country: null, isActive: true },
      { id: 'transfer-deduction', name: 'Alpha Transfer Deduction', type: 'Location', placeTypeId: null, cityId: null, city: null, country: null, isActive: true },
      { id: 'disposal', name: 'Dead Sea Disposal', type: 'Location', placeTypeId: null, cityId: null, city: null, country: null, isActive: true },
      { id: 'stationary', name: 'Alpha Bus Stationary', type: 'Pricing Mode', placeTypeId: null, cityId: null, city: null, country: null, isActive: true },
      { id: 'limo-full-day', name: 'Alpha Limo Full Day 8H', type: 'Service', placeTypeId: null, cityId: null, city: null, country: null, isActive: true },
      { id: 'supplier-service', name: 'Airport Assistance', type: 'Supplier Service', placeTypeId: null, cityId: null, city: null, country: null, isActive: true },
    ];

    assert.deepEqual(filterCanonicalGeographicPlaces(places).map((place) => place.id), ['amman', 'petra', 'qaia', 'border', 'port', 'wadi-rum']);
    assert.deepEqual(filterCanonicalGeographicPlaces(places, ['stationary']).map((place) => place.id), [
      'amman',
      'petra',
      'qaia',
      'border',
      'port',
      'wadi-rum',
      'stationary',
    ]);

    expectSourceContains(placeComboboxSource, ['filterCanonicalGeographicPlaces(places, [value])']);
    expectSourceContains(routesFormSource, ['filterCanonicalGeographicPlaces(availablePlaces, [fromPlaceId])', 'filterCanonicalGeographicPlaces(availablePlaces, [toPlaceId])']);
    expectSourceContains(vehicleRatesFormSource, ['filterCanonicalGeographicPlaces(availablePlaces, [fromPlaceId])', 'filterCanonicalGeographicPlaces(availablePlaces, [toPlaceId])']);
    expectSourceContains(transportPricingCalculatorSource, ['filterCanonicalGeographicPlaces(availablePlaces, [fromPlaceId])', 'filterCanonicalGeographicPlaces(availablePlaces, [toPlaceId])']);
  });

  it('shows clean canonical place selector labels and dedupes operational aliases', () => {
    const places = [
      { id: 'qaia-short', name: 'QAIA Airport Airport', type: 'Airport', placeTypeId: null, cityId: null, city: 'Amman', country: 'Jordan', isActive: true },
      { id: 'qaia-long', name: 'Queen Alia International Airport Airport', type: 'Airport', placeTypeId: null, cityId: null, city: 'Amman', country: 'Jordan', isActive: true },
      { id: 'marka', name: 'Marka Airport Airport', type: 'Airport', placeTypeId: null, cityId: null, city: 'Amman', country: 'Jordan', isActive: true },
      { id: 'aqj-long', name: 'King Hussein International Airport Airport', type: 'Airport', placeTypeId: null, cityId: null, city: 'Aqaba', country: 'Jordan', isActive: true },
      { id: 'aqj-short', name: 'AQJ Airport', type: 'Airport', placeTypeId: null, cityId: null, city: 'Aqaba', country: 'Jordan', isActive: true },
      { id: 'aqaba-center', name: 'Aqaba City Center City Center', type: 'City Center', placeTypeId: null, cityId: null, city: 'Aqaba', country: 'Jordan', isActive: true },
      { id: 'amman', name: 'Amman City', type: 'City', placeTypeId: null, cityId: null, city: 'Amman', country: 'Jordan', isActive: true },
      { id: 'petra', name: 'Petra Visitor Center', type: 'Site', placeTypeId: null, cityId: null, city: 'Petra', country: 'Jordan', isActive: true },
      { id: 'dead-sea', name: 'Dead Sea Location', type: 'Location', placeTypeId: null, cityId: null, city: 'Dead Sea', country: 'Jordan', isActive: true },
      { id: 'wadi-rum', name: 'Wadi Rum Camp Area', type: 'Location', placeTypeId: null, cityId: null, city: 'Wadi Rum', country: 'Jordan', isActive: true },
      { id: 'allenby-bridge', name: 'Allenby Bridge Border', type: 'Border', placeTypeId: null, cityId: null, city: 'Jordan Valley', country: 'Jordan', isActive: true },
      { id: 'allenby-border', name: 'Allenby Border', type: 'Border', placeTypeId: null, cityId: null, city: 'Jordan Valley', country: 'Jordan', isActive: true },
      { id: 'sheikh-hussein', name: 'Sheikh Hussein Bridge Border', type: 'Border', placeTypeId: null, cityId: null, city: 'Jordan Valley', country: 'Jordan', isActive: true },
      { id: 'south-border', name: 'Aqaba South Border Border', type: 'Border', placeTypeId: null, cityId: null, city: 'Aqaba', country: 'Jordan', isActive: true },
    ];

    assert.equal(getCanonicalPlaceDisplayName(places[0]), 'QAIA Airport');
    assert.equal(formatPlaceSelectorLabel(places[0]), 'QAIA Airport (Airport · Amman)');
    assert.equal(getCanonicalPlaceDisplayName(places[3]), 'AQJ Airport');
    assert.equal(getCanonicalPlaceDisplayName(places[5]), 'Aqaba City');
    assert.equal(getCanonicalPlaceDisplayName(places[10]), 'Allenby Border');
    assert.equal(getCanonicalPlaceSecondaryText(places[10]), 'Border · Jordan Valley');

    assert.deepEqual(filterCanonicalGeographicPlaces(places).map((place) => place.id), [
      'qaia-short',
      'marka',
      'aqj-short',
      'aqaba-center',
      'amman',
      'petra',
      'dead-sea',
      'wadi-rum',
      'allenby-border',
      'sheikh-hussein',
      'south-border',
    ]);
    assert.deepEqual(filterCanonicalGeographicPlaces(places, ['qaia-long']).map((place) => place.id), [
      'qaia-short',
      'marka',
      'aqj-short',
      'aqaba-center',
      'amman',
      'petra',
      'dead-sea',
      'wadi-rum',
      'allenby-border',
      'sheikh-hussein',
      'south-border',
      'qaia-long',
    ]);

    expectSourceContains(placeComboboxSource, [
      'formatPlaceSelectorLabel(selectedPlace)',
      'getCanonicalPlaceDisplayName(place)',
      'getCanonicalPlaceSecondaryText(place)',
    ]);
  });

  it('keeps major Jordan tourism destinations visible while hiding operational service labels', () => {
    const places = [
      { id: 'petra', name: 'Petra', type: 'Archaeological Site', placeTypeId: null, cityId: null, city: 'Petra', country: 'Jordan', isActive: true },
      { id: 'wadi-rum', name: 'Wadi Rum', type: 'Region', placeTypeId: null, cityId: null, city: 'Wadi Rum', country: 'Jordan', isActive: true },
      { id: 'dead-sea', name: 'Dead Sea', type: 'Destination', placeTypeId: null, cityId: null, city: 'Dead Sea', country: 'Jordan', isActive: true },
      { id: 'jerash', name: 'Jerash', type: 'Heritage Site', placeTypeId: null, cityId: null, city: 'Jerash', country: 'Jordan', isActive: true },
      { id: 'nebo', name: 'Mount Nebo', type: 'Landmark', placeTypeId: null, cityId: null, city: 'Madaba', country: 'Jordan', isActive: true },
      { id: 'bethany', name: 'Bethany Beyond the Jordan', type: 'Tourism Site', placeTypeId: null, cityId: null, city: 'Jordan Valley', country: 'Jordan', isActive: true },
      { id: 'dana', name: 'Dana', type: 'Region', placeTypeId: null, cityId: null, city: 'Dana', country: 'Jordan', isActive: true },
      { id: 'aqaba', name: 'Aqaba', type: 'City', placeTypeId: null, cityId: null, city: 'Aqaba', country: 'Jordan', isActive: true },
      { id: 'madaba', name: 'Madaba', type: 'City', placeTypeId: null, cityId: null, city: 'Madaba', country: 'Jordan', isActive: true },
      { id: 'alpha-bus-full-day', name: 'Alpha Bus Full Day 200km', type: 'Destination', placeTypeId: null, cityId: null, city: null, country: null, isActive: true },
      { id: 'alpha-bus-extra-km', name: 'Alpha Bus Extra KM', type: 'Location', placeTypeId: null, cityId: null, city: null, country: null, isActive: true },
      { id: 'alpha-bus-stationary', name: 'Alpha Bus Stationary', type: 'Region', placeTypeId: null, cityId: null, city: null, country: null, isActive: true },
      { id: 'alpha-bus-waiting', name: 'Alpha Bus Waiting', type: 'Landmark', placeTypeId: null, cityId: null, city: null, country: null, isActive: true },
      { id: 'alpha-bus-disposal', name: 'Alpha Bus Disposal', type: 'Tourism Site', placeTypeId: null, cityId: null, city: null, country: null, isActive: true },
      { id: 'alpha-driver-overnight', name: 'Alpha Driver Overnight', type: 'Heritage Site', placeTypeId: null, cityId: null, city: null, country: null, isActive: true },
      { id: 'alpha-supplier-rate', name: 'Alpha Bus Supplier Rate', type: 'Supplier Rate', placeTypeId: null, cityId: null, city: null, country: null, isActive: true },
      { id: 'alpha-supplier-service', name: 'Alpha Bus Supplier Service', type: 'Supplier Service', placeTypeId: null, cityId: null, city: null, country: null, isActive: true },
    ];

    assert.deepEqual(filterCanonicalGeographicPlaces(places).map((place) => place.id), [
      'petra',
      'wadi-rum',
      'dead-sea',
      'jerash',
      'nebo',
      'bethany',
      'dana',
      'aqaba',
      'madaba',
    ]);
  });

  it('hides route-pattern place rows while keeping canonical destinations visible', () => {
    const places = [
      { id: 'amman-madaba-dash', name: 'Amman - madaba', type: 'Destination', placeTypeId: null, cityId: null, city: 'Amman', country: 'Jordan', isActive: true },
      { id: 'amman-madaba-arrow', name: 'Amman -> Madaba', type: 'Destination', placeTypeId: null, cityId: null, city: 'Amman', country: 'Jordan', isActive: true },
      { id: 'petra', name: 'Petra', type: 'Site', placeTypeId: null, cityId: null, city: 'Petra', country: 'Jordan', isActive: true },
      { id: 'madaba', name: 'Madaba', type: 'City', placeTypeId: null, cityId: null, city: 'Madaba', country: 'Jordan', isActive: true },
      { id: 'dead-sea', name: 'Dead Sea', type: 'Destination', placeTypeId: null, cityId: null, city: 'Dead Sea', country: 'Jordan', isActive: true },
      { id: 'wadi-rum', name: 'Wadi Rum', type: 'Region', placeTypeId: null, cityId: null, city: 'Wadi Rum', country: 'Jordan', isActive: true },
    ];

    assert.deepEqual(filterCanonicalGeographicPlaces(places).map((place) => place.id), ['petra', 'madaba', 'dead-sea', 'wadi-rum']);
    assert.deepEqual(filterCanonicalGeographicPlaces(places, ['amman-madaba-dash']).map((place) => place.id), [
      'petra',
      'madaba',
      'dead-sea',
      'wadi-rum',
      'amman-madaba-dash',
    ]);
  });

  it('filters operator-facing vehicle selectors to canonical fleet rows', () => {
    const vehicles = [
      { id: 'sedan', name: 'Sedan 2', maxPax: 2 },
      { id: 'mini-van', name: 'Mini Van 6', maxPax: 6 },
      { id: 'van', name: 'Van 9', maxPax: 9 },
      { id: 'coaster', name: 'Toyota Coaster / Mini Bus 17', maxPax: 17 },
      { id: 'medium-bus', name: 'Medium Bus 30', maxPax: 30 },
      { id: 'large-coach', name: 'Large Coach 49', maxPax: 49 },
      { id: 'legacy-mini-van', name: 'Mini Van 6', maxPax: 9 },
      { id: 'alpha-bus', name: 'Alpha Bus 49', maxPax: 49 },
    ];

    assert.equal(isCanonicalFleetVehicle(vehicles[0]), true);
    assert.equal(isCanonicalFleetVehicle(vehicles[6]), false);
    assert.deepEqual(filterCanonicalFleetVehicles(vehicles).map((vehicle) => vehicle.id), ['sedan', 'mini-van', 'van', 'coaster', 'medium-bus', 'large-coach']);
    assert.deepEqual(filterCanonicalFleetVehicles(vehicles, ['legacy-mini-van']).map((vehicle) => vehicle.id), [
      'sedan',
      'mini-van',
      'van',
      'coaster',
      'medium-bus',
      'large-coach',
      'legacy-mini-van',
    ]);

    expectSourceContains(vehicleRatesFormSource, ['filterCanonicalFleetVehicles(vehicles, [vehicleId])']);
    expectSourceContains(pricingRuleFormSource, ['filterCanonicalFleetVehicles(vehicles, [vehicleId])']);
    expectSourceContains(quoteTransportPickerSource, ['filterCanonicalFleetVehicles(propVehicles.filter(isActiveVehicle), [selectedVehicleId])']);
    expectSourceContains(touringRouteEditorSourceForSelectors, [
      'filterCanonicalFleetVehicles(catalogs.vehicles)',
      'filterCanonicalFleetVehicles(canonicalVehicles, [pricing.vehicleId])',
    ]);
  });

  it('renders a phase-one Create Rate Card metadata form', () => {
    expectSourceContains(tableSource, [
      '<form className="transport-rate-card-metadata-form"',
      'Supplier',
      'Rate Card Name',
      'Service Category',
      'SERVICE_CATEGORIES.map((category)',
      'Effective From',
      'Currency',
      'Create one supplier and route card, then save vehicle type pricing modes inside it.',
      'Pricing Mode',
      'Route or Service Area',
      'Status',
      'Notes',
      'Select supplier',
      'Buses 2026 Rates in USD',
      'Create Rate Card (Manual)',
      'Save Rate Card',
    ]);
  });

  it('saves manual supplier rate cards locally with a clear primary action', () => {
    expectSourceContains(tableSource, [
      'readManualSupplierRateCards',
      'upsertManualSupplierRateCard',
      'type ManualRateCardFormState =',
      'const [manualRateCards, setManualRateCards] = useState<ManualSupplierRateCard[]>([]);',
      'const [manualRateCardForm, setManualRateCardForm] = useState<ManualRateCardFormState>',
      'const manualRateCardCanSave = Boolean(',
      'function handleSaveManualRateCard()',
      "setSuccessMessage('Rate card saved');",
      'setExpandedRateCardId(card.id);',
      'Save Rate Card creates card info.',
      '<button type="button" className="primary-button" onClick={handleSaveManualRateCard} disabled={!manualRateCardCanSave}>',
      'Save Rate Card',
    ]);

    assert.equal(tableSource.includes("fetch(`${apiBaseUrl}/vehicle-rates`, {"), false);
  });

  it('uses catalog dropdowns for supplier rate-card vehicle type and route fields', () => {
    expectSourceContains(tableSource, [
      'readStoredVehicleTypeOptions',
      'const [vehicleTypeOptions, setVehicleTypeOptions] = useState<VehicleTypeOption[]>(getDefaultVehicleTypeOptions());',
      "const [manualVehicleType, setManualVehicleType] = useState(getDefaultVehicleTypeOptions()[0]?.label || '');",
      "const [manualRouteOrServiceArea, setManualRouteOrServiceArea] = useState('General / All Routes');",
      '<select name="vehicleType" value={manualVehicleType} onChange={(event) => setManualVehicleType(event.target.value)} required>',
      '<option key={vehicleType.id} value={vehicleType.label}>',
      '<select',
      'name="routeOrServiceArea"',
      '<option value="General / All Routes">General / All Routes</option>',
      '<option key={route.id} value={route.id}>',
      '{formatRouteLabel(route.name)}',
    ]);

    assert.equal(tableSource.includes('<input name="vehicleType"'), false);
    assert.equal(tableSource.includes('<input name="routeOrServiceArea"'), false);
    assert.equal(tableSource.includes('list="transport-rate-card-routes"'), false);
    assert.equal(tableSource.includes('<datalist id="transport-rate-card-routes">'), false);
  });

  it('lets operators add vehicle type sections inside an existing supplier route card', () => {
    expectSourceContains(tableSource, [
      'type VehicleSectionDraft =',
      'const [activeVehicleSectionCardId, setActiveVehicleSectionCardId] = useState<string | null>(null);',
      'function handleStartAddVehicleSection(rateCard: SupplierRateCard)',
      'function handleSaveVehicleSection(rateCard: SupplierRateCard)',
      '+ Add Vehicle Type',
      'name="vehicleSectionVehicleType"',
      'This vehicle type already exists inside this supplier rate card.',
      'Enter at least one pricing mode rate for this vehicle type.',
      'setPreparedRateCards((currentCards) =>',
      'const rates = [...card.rates, ...newRates];',
      'Save Vehicle Type',
      'function isLocalVehicleSectionRate(rate: VehicleRate)',
    ]);
  });

  it('lets operators duplicate grouped supplier rate cards locally', () => {
    expectSourceContains(tableSource, [
      'type PendingRateCardDuplicate = { rateCard: SupplierRateCard };',
      'type RateCardDuplicateDraft =',
      'const [pendingRateCardDuplicate, setPendingRateCardDuplicate] = useState<PendingRateCardDuplicate | null>(null);',
      'function getRateCardDuplicateKey(data:',
      'async function handleStartDuplicateRateCard(rateCard: SupplierRateCard)',
      'function handleConfirmDuplicateRateCard()',
      'Duplicate',
      'Duplicate Supplier Rate Card',
      'Reuse contract structure',
      'Copies all vehicle type sections, pricing modes, and rates into one grouped supplier route or service-area card.',
      'A supplier rate card already exists for this supplier, route, currency, and validity.',
      'setPreparedRateCards((currentCards) => [duplicatedCard, ...currentCards]);',
      "setSuccessMessage('Rate card duplicated');",
      'Duplicate Rate Card',
    ]);
  });

  it('makes contract import the primary supplier rate-card workflow', () => {
    expectSourceContains(sectionSource, [
      'transport-contract-import-hero',
      'Upload Contract',
      '<TransportContractImportPanel apiBaseUrl={ACTION_API_BASE_URL} />',
      '<SupplierRateCardsSafeLoader',
    ]);

    expectSourceContains(safeLoaderSource, [
      'Click Load Rate Cards to view supplier rates.',
      'Load Rate Cards',
      'Large rate-card lists may take time. Use filters for faster loading.',
      'supplierFilter',
      'serviceCategoryFilter',
      'vehicleTypeFilter',
      'pricingModeFilter',
      'routeFilter',
      'Service Category',
      'All service categories',
      'Pricing Mode',
      'All pricing modes',
      'Daily Full Day',
      'Petra Overnight',
      'Wadi Rum Overnight',
      'Aqaba Overnight',
      'hasRequestedLoad',
      '<VehicleRatesTable',
      'serviceCategory: serviceCategoryFilter',
      'pricingMode: pricingModeFilter',
      'initialListEnabled={hasRequestedLoad}',
      'showToolbar={false}',
    ]);

    expectSourceContains(importPanelSource, [
      'Route transfers',
      'Touring routes',
      'Disposal / Program Services',
      'Daily Full Day services',
      'Half-day services',
      'Add-ons',
      'routeTransfers?: Array<Record<string, unknown>>;',
      'touringRoutes?: Array<Record<string, unknown>>;',
      'serviceBasedTransport?: Array<Record<string, unknown>>;',
      'fullDay?: Array<Record<string, unknown>>;',
      'halfDay?: Array<Record<string, unknown>>;',
      'addOns?: Array<Record<string, unknown>>;',
      'function getSafeRows',
      'PREVIEW_SERVICE_CATEGORY_FILTER_OPTIONS',
      'PREVIEW_PRICING_MODE_FILTER_OPTIONS',
      "getPreviewGroup(row) === 'touringRoutes'",
      'filterPreviewRows',
      "getPreviewGroup(row) === 'serviceBasedTransport'",
      'previewServiceCategoryFilter',
      'previewPricingModeFilter',
      'transport-import-preview-filters',
      'Daily Full Day',
      'Petra Overnight',
      'Wadi Rum Overnight',
      'Aqaba Overnight',
      'group.rows?.length',
      'Confirm import',
      'controlled supplier rate-card category',
      'window.location.href = \'/transport?tab=rates&imported=1\'',
    ]);
  });

  it('exposes touring routes as separate transport inventory', () => {
    expectSourceContains(pageSource, [
      "{ id: 'touring-routes', label: 'Touring Routes' }",
      "<TouringRoutesSection view={resolvedSearchParams?.touringRoutesView === 'all' ? 'all' : 'golden'} />",
      'Touring Routes',
      'summary.touringRoutes',
    ]);

    expectSourceContains(touringRoutesSectionSource, [
      '<TouringRouteWorkbookImportPanel />',
      '/touring-routes?limit=200',
      'Reusable touring routes',
      'not stored as fake transfer routes',
      'Create Touring Route',
      'href="/transport/touring-routes/new"',
      "view === 'all' ? touringRoutes : touringRoutes.filter(isGoldenTouringRoute)",
      "route.code?.startsWith('JOR-TR-')",
      'Golden only',
      'Show all',
      'touringRoutesView=all',
      'includedKm',
      'includedHours',
      'estimatedDistanceKm',
      'estimatedDriveHours',
      'sicPossible',
      'overnightRisk',
      '<th>Operations</th>',
      'formatOperations(route)',
      'pricingBasis',
      '<th>Actions</th>',
      'Open',
      'Edit',
      '<TouringRouteDuplicateButton',
      '<TouringRouteArchiveButton',
    ]);
  });

  it('adds a dedicated touring route create workspace with operational fields and stop editor', () => {
    expectSourceContains(touringRouteCreatePageSource, [
      'Create Touring Route',
      'Transfer Routes remain point-to-point movement only.',
      '<TouringRouteCreateForm />',
      'Back to Touring Routes',
    ]);

    expectSourceContains(touringRouteCreateFormSource, [
      "'use client';",
      'Route code',
      'Route name',
      'Origin / start place',
      'Main destination',
      'Duration hours',
      'Duration minutes',
      'Distance km',
      'Pickup recommendation',
      'Operational notes',
      'Status',
      'Ordered stops',
      'Stop order',
      'Overnight',
      'Pricing matrix',
      'Pricing matrix setup will be added in the next workflow step.',
      "fetch('/api/touring-routes'",
      "method: 'POST'",
      'router.push(`/transport/touring-routes/${encodeURIComponent(created.id)}?mode=edit#edit`)',
    ]);
  });

  it('lets operators open edit duplicate and archive imported touring routes', () => {
    expectSourceContains(touringRoutesSectionSource, [
      'href={`/transport/touring-routes/${encodeURIComponent(route.id)}`}',
      'href={`/transport/touring-routes/${encodeURIComponent(route.id)}?mode=edit`}',
      '<TouringRouteDuplicateButton routeId={route.id} routeName={route.name} />',
      '<TouringRouteArchiveButton routeId={route.id}',
    ]);

    expectSourceContains(touringRouteDuplicateButtonSource, [
      "'use client';",
      'Duplicate "${routeName}" as an inactive draft route?',
      "`/api/touring-routes/${encodeURIComponent(routeId)}/duplicate`",
      "method: 'POST'",
      'router.push(`/transport/touring-routes/${encodeURIComponent(copy.id)}?mode=edit#edit`)',
      'router.refresh()',
      'Duplicate',
    ]);

    expectSourceContains(touringRouteDuplicateProxySource, [
      "params: Promise<{ id: string }>",
      "`${API_BASE_URL}/touring-routes/${encodeURIComponent(id)}/duplicate`",
      "'POST'",
    ]);

    expectSourceContains(touringRouteArchiveButtonSource, [
      "'use client';",
      'Archive this touring route?',
      "method: 'PATCH'",
      'body: JSON.stringify({ active: false })',
      'router.refresh()',
      'Delete',
    ]);

    expectSourceContains(touringRouteDetailPageSource, [
      'Touring route detail',
      'Operational circuit inventory',
      'Route detail',
      'origin',
      'Main destinations',
      'Vehicle pricing',
      'Edit pricing matrix',
      '/api/suppliers?type=transport&active=true',
      'Supplier mapping pending',
      'Operational warnings',
      '?mode=edit#edit',
      '<TouringRouteDuplicateButton routeId={route.id} routeName={route.name} navigateToCopy />',
      '<TouringRouteEditor route={route} catalogs={catalogs} />',
    ]);

    expectSourceContains(touringRouteEditorSource, [
      "'use client';",
      'Route code',
      'setCode',
      'Save changes',
      'Pickup recommendation',
      'Operational notes',
      'Duration hours',
      'Duration minutes',
      'Distance km',
      'Add stop',
      'Overnight',
      'Pricing matrix',
      'Add pricing row',
      'activeTransportSuppliers',
      'filterCanonicalFleetVehicles(catalogs.vehicles)',
      'id: pricing.id || null',
      'minPax: Number(pricing.minPax || 1)',
      'maxPax: Number(pricing.maxPax || pricing.minPax || 1)',
      'supplierId',
      'vehicleId',
      'transportServiceTypeId',
      'validFrom',
      'validTo',
      'Deactivate',
      'Delete row',
      'await saveRoute(false)',
      "fetch(`/api/touring-routes/${encodeURIComponent(route.id)}`",
      "method: 'PATCH'",
    ]);
  });

  it('adds a safe touring route workbook upload preview and import workflow', () => {
    expectSourceContains(touringRouteWorkbookImportPanelSource, [
      'Upload Touring Workbook',
      'TOURING_ROUTES',
      'TOURING_ROUTE_STOPS',
      'TOURING_ROUTE_RATES',
      'VEHICLE_TYPES',
      'Legacy Matrix Mode',
      'Normalized Workbook Mode',
      '/api/touring-routes/workbook/preview',
      '/api/touring-routes/workbook/import',
      'Touring routes preview',
      'Vehicle pricing preview',
      'selectedFileName',
      'fileInputRef',
      'Selected file ready for preview',
      'canPreviewWorkbook',
      'disabled={!canPreviewWorkbook}',
      'canImportWorkbook',
      'disabled={!canImportWorkbook}',
      'NEW',
      'UPDATED',
      'UNCHANGED',
      'OVERLAP',
      'Import safely',
    ]);
  });

  it('warns before split transport contract imports and lets operators merge names', () => {
    expectSourceContains(importPanelSource, [
      'contractWarnings?: Array<{',
      'Multiple contract names detected for the same supplier and validity period. This will create separate rate cards.',
      'Keep separate contracts',
      'Merge into one contract name',
      'Contract name for merged rows',
      "formData.set('contractMergeMode', options.contractMergeMode);",
      "formData.set('contractNameOverride', options.contractNameOverride);",
      '<th>Service Category</th>',
      '<th>Pricing Mode</th>',
    ]);
  });
});

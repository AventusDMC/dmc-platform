import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const pageSource = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
const sectionSource = readFileSync(new URL('./VehicleRatesSection.tsx', import.meta.url), 'utf8');
const tableSource = readFileSync(new URL('./VehicleRatesTable.tsx', import.meta.url), 'utf8');
const safeLoaderSource = readFileSync(new URL('./SupplierRateCardsSafeLoader.tsx', import.meta.url), 'utf8');
const importPanelSource = readFileSync(new URL('./TransportContractImportPanel.tsx', import.meta.url), 'utf8');
const vehicleRatesFormSource = readFileSync(new URL('../vehicle-rates/VehicleRatesForm.tsx', import.meta.url), 'utf8');
const routeComboboxSource = readFileSync(new URL('../components/RouteCombobox.tsx', import.meta.url), 'utf8');
const pricingRuleFormSource = readFileSync(new URL('../transport-pricing/TransportPricingRuleForm.tsx', import.meta.url), 'utf8');

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
      '{rateCard.rates.length} rate lines',
      'transport-contract-divider',
      'aria-label={`Rate lines for ${rateCard.name}`}',
      'Supplier Rate Card',
      'Effective from',
      'ServiceCategory',
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
      "onClick={() => setActiveForm({ mode: 'edit-line', rate })}",
      "<DuplicateVehicleRateButton onDuplicate={() => setActiveForm({ mode: 'duplicate-line', rate })} />",
      'onClick={() => handleDelete(rate)}',
      '<VehicleRatesForm',
      "rateId={activeForm.mode === 'edit-line' ? activeForm.rate.id : undefined}",
      "submitLabel={activeForm.mode === 'duplicate-line' ? 'Save duplicate rate line' : 'Save rate line'}",
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
      'Copies all vehicle type sections, pricing modes, and rates into one grouped supplier and route card.',
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
      'vehicleTypeFilter',
      'routeFilter',
      'hasRequestedLoad',
      '<VehicleRatesTable',
      'initialListEnabled={hasRequestedLoad}',
      'showToolbar={false}',
    ]);

    expectSourceContains(importPanelSource, [
      'Route transfers',
      'Full-day services',
      'Add-ons',
      'routeTransfers?: Array<Record<string, unknown>>;',
      'fullDay?: Array<Record<string, unknown>>;',
      'addOns?: Array<Record<string, unknown>>;',
      'function getSafeRows',
      'group.rows?.length',
      'Confirm import',
      'controlled supplier rate-card category',
      'window.location.href = \'/transport?tab=rates&imported=1\'',
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

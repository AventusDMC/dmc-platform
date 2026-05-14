import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const listPageSource = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
const detailPageSource = readFileSync(new URL('./[id]/page.tsx', import.meta.url), 'utf8');
const newPageSource = readFileSync(new URL('./new/page.tsx', import.meta.url), 'utf8');
const formSource = readFileSync(new URL('./ActivityForm.tsx', import.meta.url), 'utf8');
const typesSource = readFileSync(new URL('./types.ts', import.meta.url), 'utf8');
const activitiesProxySource = readFileSync(new URL('../api/activities/route.ts', import.meta.url), 'utf8');
const activityProxySource = readFileSync(new URL('../api/activities/[id]/route.ts', import.meta.url), 'utf8');
const activityDuplicateProxySource = readFileSync(new URL('../api/activities/[id]/duplicate/route.ts', import.meta.url), 'utf8');
const petraHikingEnsureProxySource = readFileSync(new URL('../api/activities/petra-hiking/ensure/route.ts', import.meta.url), 'utf8');
const duplicateButtonSource = readFileSync(new URL('./ActivityDuplicateButton.tsx', import.meta.url), 'utf8');
const petraHikingButtonSource = readFileSync(new URL('./CreatePetraHikingButton.tsx', import.meta.url), 'utf8');

function expectSourceContains(source: string, fragments: string[]) {
  for (const fragment of fragments) {
    assert.ok(source.includes(fragment), `Expected source to contain: ${fragment}`);
  }
}

describe('activities catalog admin UI regression', () => {
  it('renders activity list rows with supplier location pricing sell price and active status', () => {
    expectSourceContains(listPageSource, [
      'title="Activities"',
      '<th>Name</th>',
      '<th>Code</th>',
      '<th>Category</th>',
      '<th>City</th>',
      '<th>Region</th>',
      '<th>Supplier location</th>',
      '<th>Supplier company</th>',
      '<th>Pricing basis</th>',
      '<th>Sell price</th>',
      '<th>Status</th>',
      '<strong>{activity.name}</strong>',
      "activity.code || 'No code'",
      "activity.category || 'Category pending'",
      "activity.city || 'City pending'",
      "activity.region || 'Region pending'",
      'activity.description',
      'activity.supplierCompany?.name || activity.supplierCompanyId',
      'formatActivityPricingBasis(activity.pricingBasis)',
      'formatActivityMoney(activity.sellPrice)',
      "activity.active ? 'Active' : 'Inactive'",
    ]);
  });

  it('surfaces Petra Hiking Experiences ensure action and Activity Master governance fields', () => {
    expectSourceContains(listPageSource, [
      "const petraHiking = activities.find((activity) => activity.code === 'PETRA_HIKING_EXPERIENCES');",
      "label: 'Petra Hiking'",
      "value: petraHiking ? 'Available' : 'Missing'",
      '<CreatePetraHikingButton exists={Boolean(petraHiking)} />',
    ]);
    expectSourceContains(petraHikingButtonSource, [
      "fetch('/api/activities/petra-hiking/ensure'",
      "exists ? 'Refresh Petra Hiking Experiences' : 'Create Petra Hiking Experiences'",
      'router.refresh();',
    ]);
    expectSourceContains(petraHikingEnsureProxySource, [
      '`${API_BASE_URL}/activities/petra-hiking/ensure`',
      "'POST'",
    ]);
  });

  it('renders read-only activity variant operational metadata on detail pages', () => {
    expectSourceContains(detailPageSource, [
      'Operational metadata',
      "activity.code || 'No code'",
      "activity.category || 'Category pending'",
      "activity.city || 'City pending'",
      "activity.region || 'Region pending'",
      'Operational trail options',
      'variant.difficulty',
      'formatGuideRequirement(variant.guideRequirement)',
      'formatDuration(variant.durationMinutes)',
      'variant.startPoint',
      'variant.endPoint',
      'variant.suitability',
      'variant.fitnessNotes',
      'variant.waterNotes',
      'variant.seasonalNotes',
      'variant.inclusions',
      'variant.exclusions',
    ]);
    expectSourceContains(typesSource, [
      'code?: string | null;',
      'category?: string | null;',
      'city?: string | null;',
      'region?: string | null;',
      'difficulty?: string | null;',
      'guideRequirement?: string | null;',
      'startPoint?: string | null;',
      'seasonalNotes?: string | null;',
    ]);
  });

  it('submits only fields supported by the lightweight Activity catalog model', () => {
    expectSourceContains(formSource, [
      'const [name, setName]',
      'const [description, setDescription]',
      'const [supplierCompanyId, setSupplierCompanyId]',
      'const [pricingBasis, setPricingBasis]',
      'const [costPrice, setCostPrice]',
      'const [sellPrice, setSellPrice]',
      'const [durationMinutes, setDurationMinutes]',
      'const [active, setActive]',
      'name: name.trim()',
      'description: description.trim() || null',
      'supplierCompanyId',
      'pricingBasis',
      'costPrice: normalizedCostPrice',
      'sellPrice: normalizedSellPrice',
      'durationMinutes: durationMinutes.trim() ? Number(durationMinutes) : null',
      'active',
    ]);

    assert.doesNotMatch(formSource, /\bcountry:|setCountry|defaultStartTime|operationNotes/);
    assert.doesNotMatch(typesSource, /defaultStartTime|operationNotes/);
  });

  it('loads existing activity detail and wires edit form to PATCH updates', () => {
    expectSourceContains(detailPageSource, [
      'getActivity(id)',
      'getCompanies()',
      'getActor()',
      'initialValues={activity}',
      'activityId={activity.id}',
      'submitLabel="Save activity"',
      "title={activity.active ? 'Edit activity' : 'Edit inactive activity'}",
    ]);
    expectSourceContains(formSource, [
      "method: activityId ? 'PATCH' : 'POST'",
      "fetch(`${apiBaseUrl}/activities${activityId ? `/${activityId}` : ''}`,",
      'router.refresh();',
    ]);
  });

  it('allows selecting supplier companies independently from the actor company', () => {
    expectSourceContains(newPageSource, [
      'getCompanies()',
      'Supplier company selection is intentionally independent from the signed-in actor company for DMC workflows.',
      'companies={companies}',
    ]);
    expectSourceContains(formSource, [
      '{companies.map((company) => (',
      '<option key={company.id} value={company.id}>',
      '{company.name}',
    ]);

    assert.doesNotMatch(formSource, /actor\.companyId|user\.companyId|companyId ===/);
  });

  it('uses activities API list/detail without actor-company filters in admin UI', () => {
    expectSourceContains(listPageSource, [
      "adminPageFetchJson<Activity[]>('/api/activities', 'Activities list'",
      "cache: 'no-store'",
    ]);
    expectSourceContains(detailPageSource, [
      "adminPageFetchJson<Activity | null>(`/api/activities/${id}`, 'Activity detail'",
      'allow404: true',
    ]);
    expectSourceContains(activitiesProxySource, [
      '`${getApiBaseUrl()}/activities${request.nextUrl.search}`',
      "proxyRequest(request, `${getApiBaseUrl()}/activities`, 'POST')",
    ]);
    expectSourceContains(activityProxySource, [
      '`${API_BASE_URL}/activities/${encodeURIComponent(id)}`',
      "'PATCH'",
    ]);

    assert.doesNotMatch(listPageSource, /actor\.companyId|user\.companyId|companyId:/);
  });

  it('keeps inactive activities visible and clearly marked in catalog UI', () => {
    expectSourceContains(listPageSource, [
      "const inactiveCount = activities.length - activeCount;",
      "helper: 'Visible for existing references'",
      "className={!activity.active ? 'muted-row' : undefined}",
      "activity.active ? 'Active' : 'Inactive'",
    ]);
    expectSourceContains(detailPageSource, [
      "activity.active ? 'Available for new quotes' : 'Existing references remain visible'",
      'Inactive activity: keep visible for historical quotes and bookings.',
    ]);
  });

  it('keeps create and edit actions behind allowed admin or operations roles', () => {
    expectSourceContains(typesSource, [
      "return actor?.role === 'admin' || actor?.role === 'operations';",
    ]);
    expectSourceContains(listPageSource, [
      'const canCreateOrEdit = canManageActivities(actor);',
      'canCreateOrEdit ? (',
      '<Link href="/activities/new" className="dashboard-toolbar-link">',
      '<Link href={`/activities/${activity.id}`} className="secondary-button">',
    ]);
    expectSourceContains(newPageSource, [
      'if (!canManageActivities(actor)) {',
      'notFound();',
    ]);
    expectSourceContains(detailPageSource, [
      'const canCreateOrEdit = canManageActivities(actor);',
      'canCreateOrEdit ? (',
      'your role cannot edit catalog records',
    ]);
  });

  it('supports operational activity and variant duplication lifecycle controls', () => {
    expectSourceContains(listPageSource, [
      '<ActivityDuplicateButton activityId={activity.id} />',
    ]);
    expectSourceContains(duplicateButtonSource, [
      "fetch(`/api/activities/${activityId}/duplicate`",
      "method: 'POST'",
      'router.push(`/activities/${duplicatedActivity.id}`)',
    ]);
    expectSourceContains(activityDuplicateProxySource, [
      "`${API_BASE_URL}/activities/${encodeURIComponent(id)}/duplicate`",
      "'POST'",
    ]);
    expectSourceContains(formSource, [
      'function duplicateVariant(index: number)',
      'function moveVariant(index: number, direction: -1 | 1)',
      'Activity changes saved.',
      "{variant.active ? 'Active' : 'Inactive'}",
      '<CurrencySelect',
      'currency: variant.currency',
      'supplierCompanyId: variant.supplierCompanyId || null',
      'minPax: variantMinPax',
      'maxPax: variantMaxPax',
      'capacityPricing: variant.capacityPricing',
      'meetingPoint: variant.meetingPoint.trim() || null',
      'operationalNotes: variant.operationalNotes.trim() || null',
      'Legacy fallback pricing',
      'Move up',
      'Move down',
      'Duplicate',
      "{variant.id ? 'Archive' : 'Remove'}",
    ]);
  });

  it('validates common activity form errors before calling the API', () => {
    expectSourceContains(formSource, [
      "setError('Activity name is required.');",
      "setError('Supplier company is required.');",
      "setError('Cost price and sell price must be zero or greater.');",
      'if (!response.ok) {',
      'setValidationErrors(apiError.errors);',
      'required',
      'type="number" min="0" step="0.01" required',
    ]);
  });

  it('uses responsive workspace and table patterns for mobile-friendly activity cards/lists', () => {
    expectSourceContains(listPageSource, [
      'className="page"',
      'className="panel workspace-panel"',
      '<WorkspaceShell',
      '<SummaryStrip',
      '<TableSectionShell',
      '<div className="table-scroll">',
    ]);
    expectSourceContains(detailPageSource, [
      'className="page"',
      'className="panel workspace-panel"',
      '<WorkspaceShell',
      '<SummaryStrip',
      '<section className="workspace-section">',
    ]);
    expectSourceContains(formSource, [
      'className="entity-form"',
      'className="form-row"',
      'className="checkbox-row"',
    ]);
  });
});

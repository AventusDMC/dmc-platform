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

function expectSourceContains(source: string, fragments: string[]) {
  for (const fragment of fragments) {
    assert.ok(source.includes(fragment), `Expected source to contain: ${fragment}`);
  }
}

describe('activities catalog admin UI regression', () => {
  it('renders activity list rows with location supplier pricing sell price and active status', () => {
    expectSourceContains(listPageSource, [
      'title="Activities"',
      '<th>Name</th>',
      '<th>City / Country</th>',
      '<th>Supplier company</th>',
      '<th>Pricing basis</th>',
      '<th>Sell price</th>',
      '<th>Status</th>',
      '<strong>{activity.name}</strong>',
      'activity.description',
      'activity.supplierCompany?.name || activity.supplierCompanyId',
      'formatActivityPricingBasis(activity.pricingBasis)',
      'formatActivityMoney(activity.sellPrice, activity.currency)',
      "activity.active ? 'Active' : 'Inactive'",
    ]);
  });

  it('supports all first-class activity create form fields', () => {
    expectSourceContains(formSource, [
      'const [name, setName]',
      'const [description, setDescription]',
      'const [country, setCountry]',
      'const [city, setCity]',
      'const [supplierCompanyId, setSupplierCompanyId]',
      'const [pricingBasis, setPricingBasis]',
      'const [costPrice, setCostPrice]',
      'const [sellPrice, setSellPrice]',
      'const [currency, setCurrency]',
      'const [durationMinutes, setDurationMinutes]',
      'const [defaultStartTime, setDefaultStartTime]',
      'const [operationNotes, setOperationNotes]',
      'const [active, setActive]',
      'name: name.trim()',
      'description: description.trim() || null',
      'country: country.trim() || null',
      'city: city.trim() || null',
      'supplierCompanyId',
      'pricingBasis',
      'costPrice: normalizedCostPrice',
      'sellPrice: normalizedSellPrice',
      'currency',
      'durationMinutes: durationMinutes.trim() ? Number(durationMinutes) : null',
      'defaultStartTime: defaultStartTime.trim() || null',
      'operationNotes: operationNotes.trim() || null',
      'active',
    ]);
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
      '`${API_BASE_URL}/activities${request.nextUrl.search}`',
      "proxyRequest(request, `${API_BASE_URL}/activities`, 'POST')",
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

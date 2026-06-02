import Link from 'next/link';
import { CollapsibleCreatePanel } from '../components/CollapsibleCreatePanel';
import { ModuleSwitcher } from '../components/ModuleSwitcher';
import { SummaryStrip } from '../components/SummaryStrip';
import { TableSectionShell } from '../components/TableSectionShell';
import { WorkspaceShell } from '../components/WorkspaceShell';
import { adminPageFetchJson, isNextRedirectError } from '../lib/admin-server';
import { collectPackageTemplateComponents, PACKAGE_CATALOG_MODULES, resolvePackageTemplateDays } from './package-template-display';
import { PackageTemplateForm } from './PackageTemplateForm';
import { PackageTemplateDuplicateButton } from './PackageTemplateDuplicateButton';
import type { PackageTemplate } from './types';

export const dynamic = 'force-dynamic';

async function getPackageTemplates() {
  return adminPageFetchJson<PackageTemplate[]>('/api/package-templates', 'Package templates', {
    cache: 'no-store',
  });
}

type PackageTemplatesPageProps = {
  searchParams: Promise<{ q?: string; market?: string; season?: string; status?: string }>;
};

export default async function PackageTemplatesPage({ searchParams }: PackageTemplatesPageProps) {
  const { q = '', market = '', season = '', status = '' } = await searchParams;
  let packages: PackageTemplate[] = [];
  let loadError = false;

  try {
    packages = await getPackageTemplates();
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    console.error('[packages] package templates unavailable', error);
    loadError = true;
  }

  const query = q.trim().toLowerCase();
  const marketOptions = [...new Set(packages.map((template) => template.targetMarket).filter((value): value is string => Boolean(value)))].sort();
  const seasonOptions = [...new Set(packages.map((template) => template.season).filter((value): value is string => Boolean(value)))].sort();
  const hasFilters = Boolean(query || market || season || status);

  const filteredPackages = packages.filter((template) => {
    if (query && !`${template.name} ${template.code || ''} ${template.summary || ''} ${template.destination || ''}`.toLowerCase().includes(query)) {
      return false;
    }
    if (market && template.targetMarket !== market) {
      return false;
    }
    if (season && template.season !== season) {
      return false;
    }
    if (status === 'active' && !template.active) {
      return false;
    }
    if (status === 'inactive' && template.active) {
      return false;
    }
    return true;
  });

  const filteredIds = new Set(filteredPackages.map((template) => template.id));
  const activeCount = packages.filter((template) => template.active).length;
  const packageRows = packages.map((template) => {
    const days = resolvePackageTemplateDays(template.days, template.components || [], template.durationDays);
    const components = collectPackageTemplateComponents(days, template.components || []);
    const durationDays = Math.max(template.durationDays, days.length, ...days.map((day) => day.dayNumber));
    return { template, days, components, durationDays };
  });
  const filteredRows = packageRows.filter((row) => filteredIds.has(row.template.id));
  const componentCount = packageRows.reduce((sum, row) => sum + row.components.length, 0);
  const totalDays = packageRows.reduce((sum, row) => sum + row.durationDays, 0);

  return (
    <main className="page">
      <section className="panel workspace-panel workspace-panel-wide">
        <WorkspaceShell
          eyebrow="Product Catalog"
          title="Package Templates"
          description="Reusable commercial package structures that reference operational inventory instead of duplicating product rows."
          switcher={<ModuleSwitcher ariaLabel="Catalog modules" activeId="packages" items={PACKAGE_CATALOG_MODULES} />}
          summary={
            <SummaryStrip
              items={[
                { id: 'templates', label: 'Templates', value: String(packages.length), helper: 'Commercial package shells' },
                { id: 'active', label: 'Active', value: String(activeCount), helper: 'Available for sales planning' },
                { id: 'components', label: 'Linked components', value: String(componentCount), helper: 'Operational inventory references' },
                { id: 'days', label: 'Itinerary days', value: String(totalDays), helper: 'Default day structures' },
              ]}
            />
          }
        >
          <section className="section-stack">
            <TableSectionShell
              title="Package templates"
              description="Phase 1 stores package structure and operational links only. Pricing, proposals, and bookings remain outside this layer."
              context={
                <form method="get" className="filter-bar table-action-group">
                  <input type="search" name="q" defaultValue={q} placeholder="Search name, code, destination" aria-label="Search package templates" />
                  <select name="market" defaultValue={market} aria-label="Filter by market">
                    <option value="">All markets</option>
                    {marketOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <select name="season" defaultValue={season} aria-label="Filter by season">
                    <option value="">All seasons</option>
                    {seasonOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <select name="status" defaultValue={status} aria-label="Filter by status">
                    <option value="">All statuses</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                  <button type="submit" className="secondary-button">
                    Apply
                  </button>
                  {hasFilters ? (
                    <Link href="/packages" className="secondary-button">
                      Clear
                    </Link>
                  ) : null}
                  <span className="table-cell-copy">
                    {filteredPackages.length} of {packages.length} templates
                  </span>
                </form>
              }
              createPanel={
                <CollapsibleCreatePanel
                  title="Create package template"
                  description="Start with the commercial shell, then add linked operational components from the detail page."
                  triggerLabelOpen="Add package"
                >
                  <PackageTemplateForm apiBaseUrl="/api" />
                </CollapsibleCreatePanel>
              }
              emptyState={
                filteredRows.length === 0 ? (
                  <div className="empty-state ui-empty-state">
                    <strong>
                      {loadError
                        ? 'Package templates are temporarily unavailable.'
                        : packages.length === 0
                          ? 'No package templates yet.'
                          : 'No templates match your filters.'}
                    </strong>
                    <p>
                      {loadError
                        ? 'The package template API route is available, but the list could not be loaded right now.'
                        : packages.length === 0
                          ? 'Create the first template to define duration, market, season, and reusable operational links.'
                          : 'Adjust or clear the filters to see more package templates.'}
                    </p>
                  </div>
                ) : undefined
              }
            >
              {filteredRows.length > 0 ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Duration</th>
                        <th>Market</th>
                        <th>Season</th>
                        <th>Components</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map(({ template, components, durationDays }) => (
                        <tr key={template.id} className={!template.active ? 'muted-row' : undefined}>
                          <td>
                            <strong>{template.name}</strong>
                            {template.summary ? <p className="table-cell-copy">{template.summary}</p> : null}
                            {template.operationalNotes ? <p className="table-cell-copy">{template.operationalNotes}</p> : null}
                          </td>
                          <td>{durationDays} days</td>
                          <td>{template.targetMarket || 'Not set'}</td>
                          <td>{template.season || 'Not set'}</td>
                          <td>{components.length}</td>
                          <td>
                            <span className={template.active ? 'status-pill status-pill-success' : 'status-pill status-pill-muted'}>
                              {template.active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td>
                            <span className="table-action-group">
                              <Link href={`/packages/${template.id}`} className="secondary-button">
                                Open
                              </Link>
                              <PackageTemplateDuplicateButton apiBaseUrl="/api" packageTemplateId={template.id} packageName={template.name} />
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </TableSectionShell>
          </section>
        </WorkspaceShell>
      </section>
    </main>
  );
}

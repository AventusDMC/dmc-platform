import Link from 'next/link';
import { CollapsibleCreatePanel } from '../components/CollapsibleCreatePanel';
import { ModuleSwitcher } from '../components/ModuleSwitcher';
import { SummaryStrip } from '../components/SummaryStrip';
import { TableSectionShell } from '../components/TableSectionShell';
import { WorkspaceShell } from '../components/WorkspaceShell';
import { adminPageFetchJson, isNextRedirectError } from '../lib/admin-server';
import { PACKAGE_CATALOG_MODULES } from './package-template-display';
import { PackageTemplateForm } from './PackageTemplateForm';
import type { PackageTemplate } from './types';

export const dynamic = 'force-dynamic';

async function getPackageTemplates() {
  return adminPageFetchJson<PackageTemplate[]>('/api/package-templates', 'Package templates', {
    cache: 'no-store',
  });
}

export default async function PackageTemplatesPage() {
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

  const activeCount = packages.filter((template) => template.active).length;
  const componentCount = packages.reduce((sum, template) => sum + (template.components?.length || 0), 0);
  const totalDays = packages.reduce((sum, template) => sum + template.durationDays, 0);

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
              context={<p>{packages.length} templates in scope</p>}
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
                packages.length === 0 ? (
                  <div className="empty-state ui-empty-state">
                    <strong>{loadError ? 'Package templates are temporarily unavailable.' : 'No package templates yet.'}</strong>
                    <p>
                      {loadError
                        ? 'The package template API route is available, but the list could not be loaded right now.'
                        : 'Create the first template to define duration, market, season, and reusable operational links.'}
                    </p>
                  </div>
                ) : undefined
              }
            >
              {packages.length > 0 ? (
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
                      {packages.map((template) => (
                        <tr key={template.id} className={!template.active ? 'muted-row' : undefined}>
                          <td>
                            <strong>{template.name}</strong>
                            {template.operationalNotes ? <p className="table-cell-copy">{template.operationalNotes}</p> : null}
                          </td>
                          <td>{template.durationDays} days</td>
                          <td>{template.targetMarket || 'Not set'}</td>
                          <td>{template.season || 'Not set'}</td>
                          <td>{template.components?.length || 0}</td>
                          <td>
                            <span className={template.active ? 'status-pill status-pill-success' : 'status-pill status-pill-muted'}>
                              {template.active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td>
                            <Link href={`/packages/${template.id}`} className="secondary-button">
                              Open
                            </Link>
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

import Link from 'next/link';
import { ModuleSwitcher } from '../components/ModuleSwitcher';
import { SummaryStrip } from '../components/SummaryStrip';
import { TableSectionShell } from '../components/TableSectionShell';
import { WorkspaceShell } from '../components/WorkspaceShell';
import { WorkspaceSubheader } from '../components/WorkspaceSubheader';
import { adminPageFetchJson, isNextRedirectError } from '../lib/admin-server';
import { CreatePetraFullDayButton } from './CreatePetraFullDayButton';
import { ExcursionTemplate } from './types';

export const dynamic = 'force-dynamic';

async function getExcursionTemplates() {
  return adminPageFetchJson<ExcursionTemplate[]>('/api/excursion-templates', 'Excursion templates', {
    cache: 'no-store',
  });
}

export default async function ExcursionTemplatesPage() {
  let templates: ExcursionTemplate[] = [];
  let loadError = false;

  try {
    templates = await getExcursionTemplates();
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    console.error('[excursion-templates] list unavailable', error);
    loadError = true;
  }

  const activeCount = templates.filter((template) => template.active).length;
  const petraFullDay = templates.find((template) => template.code === 'PETRA_FULL_DAY');

  return (
    <main className="page">
      <section className="panel workspace-panel">
        <WorkspaceShell
          eyebrow="Product Catalog"
          title="Excursion Templates"
          description="Reusable operational itineraries assembled from transport, ticketing, activities, guides, and dining components."
          switcher={
            <ModuleSwitcher
              ariaLabel="Catalog modules"
              activeId="excursion-templates"
              items={[
                { id: 'activities', label: 'Activities', href: '/activities', helper: 'Flat experiences' },
                { id: 'excursion-templates', label: 'Excursion Templates', href: '/excursion-templates', helper: 'Composite operations' },
                { id: 'services', label: 'Services', href: '/catalog?tab=services', helper: 'Legacy service records' },
              ]}
            />
          }
          summary={
            <SummaryStrip
              items={[
                { id: 'total', label: 'Templates', value: String(templates.length), helper: 'Operational templates' },
                { id: 'active', label: 'Active', value: String(activeCount), helper: 'Available for operations' },
                {
                  id: 'petra',
                  label: 'Petra Full Day',
                  value: petraFullDay ? 'Available' : 'Missing',
                  helper: 'First composite proof',
                },
              ]}
            />
          }
        >
          <section className="section-stack">
            <WorkspaceSubheader
              eyebrow="Composite Catalog"
              title="Operational excursion templates"
              description="Read-only phase one view for reusable composite itineraries. Templates preserve links to source modules."
              actions={
                <div className="table-action-group">
                  <CreatePetraFullDayButton exists={Boolean(petraFullDay)} />
                  {petraFullDay ? (
                    <Link href="/excursion-templates/petra-full-day" className="dashboard-toolbar-link">
                      Open Petra Full Day
                    </Link>
                  ) : null}
                </div>
              }
            />

            <TableSectionShell
              title="Templates"
              description="Each template is an ordered operational sequence, not a flat quote activity."
              context={<p>{templates.length} templates in scope</p>}
              emptyState={
                templates.length === 0 ? (
                  <div className="empty-state ui-empty-state">
                    <strong>{loadError ? 'Excursion templates are temporarily unavailable.' : 'No templates yet.'}</strong>
                    <p>
                      {loadError
                        ? 'The excursion template API route is available, but the template list could not be loaded right now.'
                        : 'Create the Petra Full Day template through the API seed endpoint to populate this first operational view.'}
                    </p>
                  </div>
                ) : undefined
              }
            >
              {templates.length > 0 ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Code</th>
                        <th>Departure</th>
                        <th>Duration</th>
                        <th>Components</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {templates.map((template) => (
                        <tr key={template.id} className={!template.active ? 'muted-row' : undefined}>
                          <td>
                            <strong>{template.name}</strong>
                            {template.description ? <p className="table-cell-copy">{template.description}</p> : null}
                          </td>
                          <td>{template.code || 'No code'}</td>
                          <td>{template.defaultDepartureCity || 'Pending'}</td>
                          <td>{template.durationMinutes ? `${Math.round(template.durationMinutes / 60)} hr` : 'Pending'}</td>
                          <td>{template.components?.length || 0}</td>
                          <td>
                            <span className={template.active ? 'status-pill status-pill-success' : 'status-pill status-pill-muted'}>
                              {template.active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td>
                            <Link href={`/excursion-templates/${template.id}`} className="secondary-button">
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

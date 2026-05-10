import { notFound } from 'next/navigation';
import { AdminBackButton } from '../../components/AdminBackButton';
import { AdminBreadcrumbs } from '../../components/AdminBreadcrumbs';
import { AdminHeaderActions } from '../../components/AdminHeaderActions';
import { ModuleSwitcher } from '../../components/ModuleSwitcher';
import { SummaryStrip } from '../../components/SummaryStrip';
import { WorkspaceShell } from '../../components/WorkspaceShell';
import { WorkspaceSubheader } from '../../components/WorkspaceSubheader';
import { adminPageFetchJson } from '../../lib/admin-server';
import { Activity, ActivityActor, ActivityCompany, canManageActivities, formatActivityMoney, formatActivityPricingBasis } from '../types';
import { ActivityForm } from '../ActivityForm';

export const dynamic = 'force-dynamic';

const ACTION_API_BASE_URL = '/api';

type ActivityDetailPageProps = {
  params: Promise<{ id: string }>;
};

async function getActivity(id: string) {
  return adminPageFetchJson<Activity | null>(`/api/activities/${id}`, 'Activity detail', {
    cache: 'no-store',
    allow404: true,
  });
}

async function getCompanies() {
  return adminPageFetchJson<ActivityCompany[]>('/api/companies', 'Supplier company selector', {
    cache: 'no-store',
  });
}

async function getActor() {
  return adminPageFetchJson<ActivityActor>('/api/auth/me', 'Current user', {
    cache: 'no-store',
  });
}

function formatDuration(minutes: number | null | undefined) {
  if (!minutes) return 'Pending';
  if (minutes % 60 === 0) return `${minutes / 60} hr`;
  return `${minutes} min`;
}

function formatGuideRequirement(value: string | null | undefined) {
  return value ? value.replace(/_/g, ' ') : 'Pending';
}

export default async function ActivityDetailPage({ params }: ActivityDetailPageProps) {
  const { id } = await params;
  const [activity, companies, actor] = await Promise.all([getActivity(id), getCompanies(), getActor()]);

  if (!activity) {
    notFound();
  }

  const canCreateOrEdit = canManageActivities(actor);

  return (
    <main className="page">
      <section className="panel workspace-panel">
        <AdminBreadcrumbs
          items={[
            { label: 'Dashboard', href: '/admin/dashboard' },
            { label: 'Activities', href: '/activities' },
            { label: activity.name },
          ]}
        />
        <WorkspaceShell
          eyebrow="Catalog"
          title={activity.name}
          description="Review and maintain first-class activity details used across quotes and bookings."
          switcher={
            <ModuleSwitcher
              ariaLabel="Catalog modules"
              activeId="activities"
              items={[
                { id: 'activities', label: 'Activities', href: '/activities', helper: 'Experiences catalog' },
                { id: 'services', label: 'Services', href: '/catalog?tab=services', helper: 'Legacy service records' },
              ]}
            />
          }
          summary={
            <SummaryStrip
              items={[
                { id: 'basis', label: 'Pricing basis', value: formatActivityPricingBasis(activity.pricingBasis), helper: 'Quote calculation mode' },
                { id: 'sell', label: 'Sell price', value: formatActivityMoney(activity.sellPrice), helper: 'Visible sales price' },
                { id: 'supplier', label: 'Supplier', value: activity.supplierCompany?.name || activity.supplierCompanyId, helper: 'Internal supplier company' },
                { id: 'status', label: 'Status', value: activity.active ? 'Active' : 'Inactive', helper: activity.active ? 'Available for new quotes' : 'Existing references remain visible' },
              ]}
            />
          }
        >
          <section className="section-stack">
            <WorkspaceSubheader
              eyebrow="Activities Catalog"
              title={activity.active ? 'Edit activity' : 'Edit inactive activity'}
              description="Inactive activities stay visible for existing quote and booking references, but are clearly marked in catalog management."
              actions={
                <AdminHeaderActions>
                  <AdminBackButton fallbackHref="/activities" label="Back to Activities" className="dashboard-toolbar-link admin-back-button" />
                </AdminHeaderActions>
              }
            />

            {!activity.active ? <p className="form-helper">Inactive activity: keep visible for historical quotes and bookings.</p> : null}

            <section className="workspace-section">
              <div className="section-heading-row">
                <div>
                  <p className="section-eyebrow">Activity Master</p>
                  <h2>Operational metadata</h2>
                </div>
              </div>
              <div className="summary-grid">
                <div className="summary-card">
                  <span>Code</span>
                  <strong>{activity.code || 'No code'}</strong>
                </div>
                <div className="summary-card">
                  <span>Category</span>
                  <strong>{activity.category || 'Category pending'}</strong>
                </div>
                <div className="summary-card">
                  <span>City</span>
                  <strong>{activity.city || 'City pending'}</strong>
                </div>
                <div className="summary-card">
                  <span>Region</span>
                  <strong>{activity.region || 'Region pending'}</strong>
                </div>
              </div>
            </section>

            <section className="workspace-section">
              <div className="section-heading-row">
                <div>
                  <p className="section-eyebrow">Variants</p>
                  <h2>Operational trail options</h2>
                </div>
              </div>
              {activity.rateVariants?.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Variant</th>
                        <th>Difficulty</th>
                        <th>Guide requirement</th>
                        <th>Duration</th>
                        <th>Start / End</th>
                        <th>Operational metadata</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activity.rateVariants.map((variant) => (
                        <tr key={variant.id || variant.name} className={!variant.active ? 'muted-row' : undefined}>
                          <td>
                            <strong>{variant.name}</strong>
                            {variant.notes ? <p className="table-cell-copy">{variant.notes}</p> : null}
                          </td>
                          <td>{variant.difficulty || 'Pending'}</td>
                          <td>
                            <span className="status-pill status-pill-muted">{formatGuideRequirement(variant.guideRequirement)}</span>
                            <p className="table-cell-copy">{variant.guideRequired ? 'Guide required' : 'Guide requirement pending'}</p>
                          </td>
                          <td>{formatDuration(variant.durationMinutes)}</td>
                          <td>
                            <strong>{variant.startPoint || 'Start pending'}</strong>
                            <p className="table-cell-copy">{variant.endPoint || 'End pending'}</p>
                          </td>
                          <td>
                            {variant.suitability ? <p className="table-cell-copy">Suitability: {variant.suitability}</p> : null}
                            {variant.fitnessNotes ? <p className="table-cell-copy">Fitness: {variant.fitnessNotes}</p> : null}
                            {variant.waterNotes ? <p className="table-cell-copy">Water: {variant.waterNotes}</p> : null}
                            {variant.seasonalNotes ? <p className="table-cell-copy">Seasonal: {variant.seasonalNotes}</p> : null}
                            {variant.inclusions ? <p className="table-cell-copy">Inclusions: {variant.inclusions}</p> : null}
                            {variant.exclusions ? <p className="table-cell-copy">Exclusions: {variant.exclusions}</p> : null}
                          </td>
                          <td>
                            <span className={variant.active ? 'status-pill status-pill-success' : 'status-pill status-pill-muted'}>
                              {variant.active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="detail-copy">No variants have been added to this activity yet.</p>
              )}
            </section>

            {canCreateOrEdit ? (
              <section className="workspace-section">
                <ActivityForm
                  apiBaseUrl={ACTION_API_BASE_URL}
                  activityId={activity.id}
                  companies={companies}
                  initialValues={activity}
                  submitLabel="Save activity"
                />
              </section>
            ) : (
              <section className="workspace-section">
                <p className="detail-copy">You can view this activity, but your role cannot edit catalog records.</p>
              </section>
            )}
          </section>
        </WorkspaceShell>
      </section>
    </main>
  );
}

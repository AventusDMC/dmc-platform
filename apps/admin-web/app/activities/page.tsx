import Link from 'next/link';
import { ModuleSwitcher } from '../components/ModuleSwitcher';
import { SummaryStrip } from '../components/SummaryStrip';
import { TableSectionShell } from '../components/TableSectionShell';
import { WorkspaceShell } from '../components/WorkspaceShell';
import { WorkspaceSubheader } from '../components/WorkspaceSubheader';
import { adminPageFetchJson, isNextRedirectError } from '../lib/admin-server';
import { Activity, ActivityActor, canManageActivities, formatActivityMoney, formatActivityPricingBasis } from './types';

export const dynamic = 'force-dynamic';

async function getActivities() {
  return adminPageFetchJson<Activity[]>('/api/activities', 'Activities list', {
    cache: 'no-store',
  });
}

async function getActor() {
  return adminPageFetchJson<ActivityActor>('/api/auth/me', 'Current user', {
    cache: 'no-store',
  });
}

export default async function ActivitiesPage() {
  let activities: Activity[] = [];
  let actor: ActivityActor | null = null;
  let loadError = false;

  try {
    [activities, actor] = await Promise.all([getActivities(), getActor()]);
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    console.error('[activities] catalog unavailable', error);
    loadError = true;
  }

  const activeCount = activities.filter((activity) => activity.active).length;
  const inactiveCount = activities.length - activeCount;
  const canCreateOrEdit = canManageActivities(actor);

  return (
    <main className="page">
      <section className="panel workspace-panel">
        <WorkspaceShell
          eyebrow="Catalog"
          title="Activities"
          description="Manage first-class activity products for quote building, booking operations, and supplier vouchers."
          switcher={
            <ModuleSwitcher
              ariaLabel="Catalog modules"
              activeId="activities"
              items={[
                { id: 'activities', label: 'Activities', href: '/activities', helper: 'Experiences catalog' },
                { id: 'services', label: 'Services', href: '/catalog?tab=services', helper: 'Legacy service records' },
                { id: 'suppliers', label: 'Suppliers', href: '/suppliers', helper: 'Supplier companies' },
              ]}
            />
          }
          summary={
            <SummaryStrip
              items={[
                { id: 'total', label: 'Activities', value: String(activities.length), helper: 'Catalog rows' },
                { id: 'active', label: 'Active', value: String(activeCount), helper: 'Available for new quotes' },
                { id: 'inactive', label: 'Inactive', value: String(inactiveCount), helper: 'Visible for existing references' },
              ]}
            />
          }
        >
          <section className="section-stack">
            <WorkspaceSubheader
              eyebrow="Activities Catalog"
              title="Manage reusable experiences"
              description="Activities stay separate from hotels and transport while remaining available to mixed DMC quotes."
              actions={
                canCreateOrEdit ? (
                  <Link href="/activities/new" className="dashboard-toolbar-link">
                    Add activity
                  </Link>
                ) : null
              }
            />

            <TableSectionShell
              title="Activity catalog"
              description="List-first activity management with supplier, pricing, location, and active status visible."
              context={<p>{activities.length} activities in scope</p>}
              emptyState={
                activities.length === 0 ? (
                  <div className="empty-state ui-empty-state">
                    <strong>{loadError ? 'Activities are temporarily unavailable.' : 'No activities yet.'}</strong>
                    <p>
                      {loadError
                        ? 'The activity catalog route is available, but the activity list could not be loaded right now.'
                        : 'Create your first reusable activity so quote builders and operations teams can select it consistently.'}
                    </p>
                    {!loadError && canCreateOrEdit ? (
                      <Link href="/activities/new" className="primary-button">
                        Add activity
                      </Link>
                    ) : null}
                  </div>
                ) : undefined
              }
            >
              {activities.length > 0 ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>City / Country</th>
                        <th>Supplier company</th>
                        <th>Pricing basis</th>
                        <th>Sell price</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activities.map((activity) => (
                        <tr key={activity.id} className={!activity.active ? 'muted-row' : undefined}>
                          <td>
                            <strong>{activity.name}</strong>
                            {activity.description ? <p className="table-cell-copy">{activity.description}</p> : null}
                          </td>
                          <td>
                            {[activity.city || activity.supplierCompany?.city, activity.country || activity.supplierCompany?.country]
                              .filter(Boolean)
                              .join(', ') || 'Location pending'}
                          </td>
                          <td>{activity.supplierCompany?.name || activity.supplierCompanyId}</td>
                          <td>{formatActivityPricingBasis(activity.pricingBasis)}</td>
                          <td>{formatActivityMoney(activity.sellPrice, activity.currency)}</td>
                          <td>
                            <span className={activity.active ? 'status-pill status-pill-success' : 'status-pill status-pill-muted'}>
                              {activity.active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td>
                            {canCreateOrEdit ? (
                              <Link href={`/activities/${activity.id}`} className="secondary-button">
                                Edit
                              </Link>
                            ) : (
                              <Link href={`/activities/${activity.id}`} className="secondary-button">
                                View
                              </Link>
                            )}
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

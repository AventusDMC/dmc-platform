import Link from 'next/link';
import { ModuleSwitcher } from '../components/ModuleSwitcher';
import { SummaryStrip } from '../components/SummaryStrip';
import { TableSectionShell } from '../components/TableSectionShell';
import { WorkspaceShell } from '../components/WorkspaceShell';
import { WorkspaceSubheader } from '../components/WorkspaceSubheader';
import { ADMIN_API_BASE_URL, adminPageFetchJson } from '../lib/admin-server';
import { Activity, ActivityActor, canManageActivities, formatActivityMoney, formatActivityPricingBasis } from './types';

export const dynamic = 'force-dynamic';

const API_BASE_URL = ADMIN_API_BASE_URL;

async function getActivities() {
  return adminPageFetchJson<Activity[]>(`${API_BASE_URL}/activities`, 'Activities list', {
    cache: 'no-store',
  });
}

async function getActor() {
  return adminPageFetchJson<ActivityActor>(`${API_BASE_URL}/auth/me`, 'Current user', {
    cache: 'no-store',
  });
}

export default async function ActivitiesPage() {
  const [activities, actor] = await Promise.all([getActivities(), getActor()]);
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
              emptyState={activities.length === 0 ? <p className="empty-state">No activities yet.</p> : undefined}
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

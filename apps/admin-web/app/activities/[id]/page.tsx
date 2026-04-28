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
                { id: 'sell', label: 'Sell price', value: formatActivityMoney(activity.sellPrice, activity.currency), helper: 'Visible sales price' },
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

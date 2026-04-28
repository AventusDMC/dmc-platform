import { notFound } from 'next/navigation';
import { AdminBackButton } from '../../components/AdminBackButton';
import { AdminBreadcrumbs } from '../../components/AdminBreadcrumbs';
import { AdminHeaderActions } from '../../components/AdminHeaderActions';
import { ModuleSwitcher } from '../../components/ModuleSwitcher';
import { WorkspaceShell } from '../../components/WorkspaceShell';
import { WorkspaceSubheader } from '../../components/WorkspaceSubheader';
import { adminPageFetchJson } from '../../lib/admin-server';
import { ActivityActor, ActivityCompany, canManageActivities } from '../types';
import { ActivityForm } from '../ActivityForm';

export const dynamic = 'force-dynamic';

const ACTION_API_BASE_URL = '/api';

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

export default async function NewActivityPage() {
  const [companies, actor] = await Promise.all([getCompanies(), getActor()]);

  if (!canManageActivities(actor)) {
    notFound();
  }

  return (
    <main className="page">
      <section className="panel workspace-panel">
        <AdminBreadcrumbs
          items={[
            { label: 'Dashboard', href: '/admin/dashboard' },
            { label: 'Activities', href: '/activities' },
            { label: 'New Activity' },
          ]}
        />
        <WorkspaceShell
          eyebrow="Catalog"
          title="New activity"
          description="Create a reusable activity with supplier ownership and quote-ready pricing."
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
        >
          <section className="section-stack">
            <WorkspaceSubheader
              eyebrow="Activities Catalog"
              title="Create activity"
              description="Supplier company selection is intentionally independent from the signed-in actor company for DMC workflows."
              actions={
                <AdminHeaderActions>
                  <AdminBackButton fallbackHref="/activities" label="Back to Activities" className="dashboard-toolbar-link admin-back-button" />
                </AdminHeaderActions>
              }
            />

            <section className="workspace-section">
              <ActivityForm apiBaseUrl={ACTION_API_BASE_URL} companies={companies} />
            </section>
          </section>
        </WorkspaceShell>
      </section>
    </main>
  );
}

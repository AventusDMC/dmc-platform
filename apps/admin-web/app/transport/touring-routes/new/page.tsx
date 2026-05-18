import Link from 'next/link';
import { ModuleSwitcher } from '../../../components/ModuleSwitcher';
import { WorkspaceShell } from '../../../components/WorkspaceShell';
import { TouringRouteCreateForm } from '../TouringRouteCreateForm';

export const dynamic = 'force-dynamic';

export default function NewTouringRoutePage() {
  return (
    <main className="page">
      <section className="panel workspace-panel workspace-panel-wide">
        <WorkspaceShell
          eyebrow="Touring Routes"
          title="Create Touring Route"
          description="Create operational sightseeing and overnight route inventory. Transfer Routes remain point-to-point movement only."
          switcher={
            <ModuleSwitcher
              ariaLabel="Transport modules"
              activeId="touring-routes"
              items={[
                { id: 'routes', label: 'Transfer Routes', href: '/transport?tab=routes', helper: 'Transfer route library' },
                { id: 'touring-routes', label: 'Touring Routes', href: '/transport?tab=touring-routes', helper: 'Operational tours' },
                { id: 'rates', label: 'Supplier Rate Cards', href: '/transport?tab=rates', helper: 'Supplier contracts' },
              ]}
            />
          }
        >
          <section className="section-stack">
            <div className="button-row">
              <Link className="secondary-button" href="/transport?tab=touring-routes">
                Back to Touring Routes
              </Link>
            </div>
            <TouringRouteCreateForm />
          </section>
        </WorkspaceShell>
      </section>
    </main>
  );
}

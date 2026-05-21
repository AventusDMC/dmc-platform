import Link from 'next/link';
import { AdminBreadcrumbs } from '../../components/AdminBreadcrumbs';
import { TouringRouteAuditPreview } from './TouringRouteAuditPreview';

export const dynamic = 'force-dynamic';

export default function TouringRouteAuditPage() {
  return (
    <main className="page touring-audit-page">
      <section className="panel workspace-panel workspace-panel-wide">
        <AdminBreadcrumbs
          items={[
            { label: 'Transport', href: '/transport?tab=touring-routes' },
            { label: 'Touring Route Audit' },
          ]}
        />

        <div className="page-header">
          <div>
            <p className="eyebrow">Touring Routes</p>
            <h1>Operational Audit</h1>
            <p className="detail-copy">
              Read-only preview for separating operational touring route skeletons from activity, excursion template, and transfer candidates.
            </p>
          </div>
          <Link href="/transport?tab=touring-routes" className="secondary-button touring-audit-nav-link">
            Touring Routes
          </Link>
        </div>

        <TouringRouteAuditPreview />
      </section>
    </main>
  );
}

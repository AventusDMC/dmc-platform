import Link from 'next/link';
import { AdminBreadcrumbs } from '../../../components/AdminBreadcrumbs';
import { TouringRouteAuditDetail } from './TouringRouteAuditDetail';

export const dynamic = 'force-dynamic';

type TouringRouteAuditDetailPageProps = {
  params: Promise<{ routeId: string }>;
};

export default async function TouringRouteAuditDetailPage({ params }: TouringRouteAuditDetailPageProps) {
  const { routeId } = await params;

  return (
    <main className="page touring-audit-page">
      <section className="panel workspace-panel workspace-panel-wide">
        <AdminBreadcrumbs
          items={[
            { label: 'Transport', href: '/transport?tab=touring-routes' },
            { label: 'Touring Route Audit', href: '/touring-routes/audit' },
            { label: 'Review' },
          ]}
        />

        <div className="page-header">
          <div>
            <p className="eyebrow">Touring Route Audit</p>
            <h1>Route Review</h1>
            <p className="detail-copy">Dry-run, conflict, reference, and rollback previews for one touring route row.</p>
          </div>
          <Link href="/touring-routes/audit" className="secondary-button touring-audit-nav-link">
            Audit List
          </Link>
        </div>

        <TouringRouteAuditDetail routeId={decodeURIComponent(routeId)} />
      </section>
    </main>
  );
}

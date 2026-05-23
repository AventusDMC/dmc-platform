import { TouringRouteAuditPreview } from './TouringRouteAuditPreview';

export const dynamic = 'force-dynamic';

export default function TouringRouteAuditPage() {
  return (
    <main className="page touring-audit-page">
      <section className="panel workspace-panel workspace-panel-wide">
        <div className="breadcrumb-list" aria-label="Breadcrumb">
          <span>Transport</span>
          <span>Touring Route Audit</span>
        </div>

        <div className="page-header">
          <div>
            <p className="eyebrow">Touring Routes</p>
            <h1>Operational Audit</h1>
            <p className="detail-copy">
              Read-only preview for separating operational touring route skeletons from activity, excursion template, and transfer candidates.
            </p>
          </div>
        </div>

        <TouringRouteAuditPreview />
      </section>
    </main>
  );
}

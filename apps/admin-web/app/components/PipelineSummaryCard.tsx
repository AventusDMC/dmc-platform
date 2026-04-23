import Link from 'next/link';
import { DashboardSectionCard } from './DashboardSectionCard';

export type DashboardPipelineRow = {
  id: string;
  label: string;
  value: string;
  helper?: string;
};

type PipelineSummaryCardProps = {
  salesRows: DashboardPipelineRow[];
  deliveryRows: DashboardPipelineRow[];
};

function PipelineGroup({ title, rows }: { title: string; rows: DashboardPipelineRow[] }) {
  return (
    <div className="executive-dashboard-metric-group">
      <h3>{title}</h3>
      <div className="executive-dashboard-metric-list">
        {rows.map((row) => (
          <div key={row.id}>
            <span>{row.label}</span>
            <strong>{row.value}</strong>
            {row.helper ? <p>{row.helper}</p> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export function PipelineSummaryCard({ salesRows, deliveryRows }: PipelineSummaryCardProps) {
  return (
    <DashboardSectionCard
      eyebrow="Load"
      title="Pipeline Summary"
      description="A compact view of commercial flow and delivery workload."
      action={
        <Link href="/quotes" className="dashboard-toolbar-link">
          Open pipeline
        </Link>
      }
    >
      <div className="executive-dashboard-metric-stack">
        <PipelineGroup title="Sales" rows={salesRows} />
        <PipelineGroup title="Delivery" rows={deliveryRows} />
      </div>
    </DashboardSectionCard>
  );
}

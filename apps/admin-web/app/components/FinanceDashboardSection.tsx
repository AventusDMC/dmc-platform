import Link from 'next/link';
import { DashboardEmptyState } from './DashboardEmptyState';
import { DashboardSectionCard } from './DashboardSectionCard';

type FinanceTrend = {
  direction: 'up' | 'down' | 'flat';
  delta: number;
  changePercent: number;
  unit: 'percent' | 'pp';
};

type FinanceDashboardSummary = {
  totalRevenue: number;
  totalCollected: number;
  totalOutstanding: number;
  totalOverdue: number;
  supplierPayable: number;
  profit: number;
  margin: number;
  trendLabel?: string;
  trends?: Partial<{
    revenue: FinanceTrend;
    collected: FinanceTrend;
    outstanding: FinanceTrend;
    overdue: FinanceTrend;
    supplierPayable: FinanceTrend;
    profit: FinanceTrend;
    margin: FinanceTrend;
  }>;
  sparklineSeries?: Partial<{
    revenue: number[];
    collected: number[];
    outstanding: number[];
    overdue: number[];
  }>;
  monthlySeries?: Array<{
    label: string;
    revenue: number;
    collected: number;
  }>;
  overdueBreakdown: {
    client: {
      count: number;
      amount: number;
    };
    supplier: {
      count: number;
      amount: number;
    };
  };
  recentPayments: Array<{
    id: string;
    bookingId: string;
    bookingRef: string;
    bookingTitle: string;
    clientName: string;
    type: 'CLIENT' | 'SUPPLIER';
    amount: number;
    currency: string;
    status: 'PENDING' | 'PAID';
    dueDate: string | null;
    paidAt: string | null;
    overdue: boolean;
    overdueDays: number | null;
  }>;
};

type FinanceDashboardSectionProps = {
  summary: FinanceDashboardSummary;
};

function formatMoney(amount: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatDate(value: string | null) {
  if (!value) {
    return 'Date pending';
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
  }).format(new Date(value));
}

function getTrendArrow(direction: FinanceTrend['direction']) {
  if (direction === 'up') {
    return '↑';
  }

  if (direction === 'down') {
    return '↓';
  }

  return '→';
}

function formatTrend(trend: FinanceTrend) {
  if (trend.unit === 'pp') {
    const delta = Number.isInteger(Math.abs(trend.delta)) ? Math.abs(trend.delta).toFixed(0) : Math.abs(trend.delta).toFixed(1);
    return `${getTrendArrow(trend.direction)} ${delta}pp`;
  }

  const percent = Number.isInteger(trend.changePercent) ? trend.changePercent.toFixed(0) : trend.changePercent.toFixed(1);
  return `${getTrendArrow(trend.direction)} ${percent}%`;
}

function buildSparklinePath(values: number[], width: number, height: number) {
  if (values.length === 0) {
    return '';
  }

  const maxValue = Math.max(...values, 1);
  return values
    .map((value, index) => {
      const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
      const y = height - (value / maxValue) * height;
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}

const DEFAULT_TREND: FinanceTrend = {
  direction: 'flat',
  delta: 0,
  changePercent: 0,
  unit: 'percent',
};

function FinanceMetricCard({
  label,
  value,
  helper,
  trend,
  trendLabel,
  href,
  tone = 'default',
  emphasis = 'secondary',
  attentionLabel,
  sparkline,
}: {
  label: string;
  value: string;
  helper: string;
  trend: FinanceTrend;
  trendLabel: string;
  href?: string;
  tone?: 'default' | 'warning' | 'danger';
  emphasis?: 'primary' | 'secondary';
  attentionLabel?: string;
  sparkline?: number[];
}) {
  const sparklineValues = sparkline && sparkline.length > 0 ? sparkline : [0];
  const sparklinePath = buildSparklinePath(sparklineValues, 120, 28);
  const content = (
    <>
      <div className="executive-dashboard-finance-card-head">
        <div>
          <span>{label}</span>
          {attentionLabel ? <small>{attentionLabel}</small> : null}
        </div>
      </div>
      <div className="executive-dashboard-finance-value-block">
        <b>{value}</b>
        <div className="executive-dashboard-finance-trend-row">
          <strong className={`executive-dashboard-finance-trend executive-dashboard-finance-trend-${trend.direction}`}>
            {formatTrend(trend)}
          </strong>
          <em className="executive-dashboard-finance-trend-label">{trendLabel}</em>
        </div>
      </div>
      <div className="executive-dashboard-finance-sparkline" aria-hidden="true">
        <svg viewBox="0 0 120 32" role="img">
          <path className="executive-dashboard-finance-sparkline-track" d="M 0 31 L 120 31" />
          {sparklinePath ? <path className="executive-dashboard-finance-sparkline-line" d={sparklinePath} /> : null}
        </svg>
      </div>
      <p>{helper}</p>
    </>
  );

  const className = `executive-dashboard-finance-card executive-dashboard-finance-card-${emphasis} executive-dashboard-finance-card-${tone}`;
  return href ? (
    <Link href={href} className={className}>
      {content}
    </Link>
  ) : (
    <article className={className}>{content}</article>
  );
}

export function FinanceDashboardSection({ summary }: FinanceDashboardSectionProps) {
  const trends = summary.trends ?? {};
  const sparklineSeries = summary.sparklineSeries ?? {};
  const monthlySeries = summary.monthlySeries ?? [];
  const trendLabel = summary.trendLabel ?? 'vs last 30 days';
  const monthlyWidth = 520;
  const monthlyHeight = 170;
  const monthlyRevenuePath = buildSparklinePath(
    monthlySeries.map((point) => point.revenue),
    monthlyWidth,
    monthlyHeight,
  );
  const monthlyCollectedPath = buildSparklinePath(
    monthlySeries.map((point) => point.collected),
    monthlyWidth,
    monthlyHeight,
  );

  return (
    <DashboardSectionCard
      eyebrow="Finance"
      title="Financial Overview"
      description="Executive view of revenue, collections, exposure, and the finance actions that need attention."
      action={
        <Link href="/finance" className="dashboard-toolbar-link">
          Open finance
        </Link>
      }
      className="executive-dashboard-finance-section"
    >
      <div className="executive-dashboard-finance-tier-grid executive-dashboard-finance-tier-grid-primary">
        <FinanceMetricCard
          label="Revenue"
          value={formatMoney(summary.totalRevenue)}
          helper="Booked revenue across live bookings"
          trend={trends.revenue ?? DEFAULT_TREND}
          sparkline={sparklineSeries.revenue}
          trendLabel={trendLabel}
          tone="default"
          emphasis="primary"
        />
        <FinanceMetricCard
          label="Collected"
          value={formatMoney(summary.totalCollected)}
          helper="Client cash received and settled"
          trend={trends.collected ?? DEFAULT_TREND}
          sparkline={sparklineSeries.collected}
          trendLabel={trendLabel}
          tone="default"
          emphasis="primary"
        />
        <FinanceMetricCard
          label="Outstanding"
          value={formatMoney(summary.totalOutstanding)}
          helper="Open receivables still due from clients"
          trend={trends.outstanding ?? DEFAULT_TREND}
          sparkline={sparklineSeries.outstanding}
          trendLabel={trendLabel}
          tone={summary.totalOutstanding > 0 ? 'warning' : 'default'}
          emphasis="primary"
          href="/finance?report=unpaid-clients"
        />
        <FinanceMetricCard
          label="Overdue"
          value={formatMoney(summary.totalOverdue)}
          helper="Late receivables and payables requiring intervention"
          trend={trends.overdue ?? DEFAULT_TREND}
          sparkline={sparklineSeries.overdue}
          trendLabel={trendLabel}
          tone="danger"
          emphasis="primary"
          attentionLabel="⚠ Needs attention"
          href="/finance"
        />
      </div>

      <div className="executive-dashboard-finance-tier-grid executive-dashboard-finance-tier-grid-secondary">
        <FinanceMetricCard
          label="Profit"
          value={formatMoney(summary.profit)}
          helper="Revenue less current delivery cost"
          trend={trends.profit ?? DEFAULT_TREND}
          trendLabel={trendLabel}
          tone={summary.profit < 0 ? 'danger' : 'default'}
        />
        <FinanceMetricCard
          label="Margin"
          value={formatPercent(summary.margin)}
          helper="Gross margin across the active book"
          trend={trends.margin ?? { ...DEFAULT_TREND, unit: 'pp' }}
          trendLabel={trendLabel}
        />
        <FinanceMetricCard
          label="Supplier Payable"
          value={formatMoney(summary.supplierPayable)}
          helper="Supplier balances still waiting on settlement"
          trend={trends.supplierPayable ?? DEFAULT_TREND}
          trendLabel={trendLabel}
          tone={summary.supplierPayable > 0 ? 'warning' : 'default'}
          href="/finance?report=unpaid-suppliers"
        />
      </div>

      <div className="executive-dashboard-finance-chart-card">
        <div className="executive-dashboard-finance-block-head">
          <div>
            <span>Trend</span>
            <h3>Revenue vs Collected</h3>
          </div>
        </div>
        <div className="executive-dashboard-finance-chart" aria-hidden="true">
          <svg viewBox={`0 0 ${monthlyWidth} ${monthlyHeight + 26}`} role="img">
            {monthlySeries.map((point, index) => (
              <text
                key={point.label}
                x={monthlySeries.length === 1 ? monthlyWidth / 2 : (index / Math.max(monthlySeries.length - 1, 1)) * monthlyWidth}
                y={monthlyHeight + 18}
                textAnchor="middle"
              >
                {point.label}
              </text>
            ))}
            {monthlyRevenuePath ? <path className="executive-dashboard-finance-chart-line" d={monthlyRevenuePath} /> : null}
            {monthlyCollectedPath ? <path className="executive-dashboard-finance-chart-line executive-dashboard-finance-chart-line-secondary" d={monthlyCollectedPath} /> : null}
          </svg>
        </div>
        <div className="executive-dashboard-finance-chart-legend">
          <span><i className="executive-dashboard-finance-chart-dot" />Revenue</span>
          <span><i className="executive-dashboard-finance-chart-dot executive-dashboard-finance-chart-dot-secondary" />Collected</span>
        </div>
      </div>

      <div className="executive-dashboard-finance-grid">
        <div className="executive-dashboard-finance-column">
          <div className="executive-dashboard-finance-block">
            <div className="executive-dashboard-finance-block-head">
              <div>
                <span>Breakdown</span>
                <h3>Overdue exposure</h3>
              </div>
            </div>
            <div className="executive-dashboard-list">
              <Link href="/finance?report=overdue-clients" className="executive-dashboard-list-row executive-dashboard-finance-row">
                <div className="executive-dashboard-list-row-copy">
                  <strong>{summary.overdueBreakdown.client.count} overdue client payment{summary.overdueBreakdown.client.count === 1 ? '' : 's'}</strong>
                  <p>{formatMoney(summary.overdueBreakdown.client.amount)} in late receivables requiring follow-up.</p>
                </div>
                <div className="executive-dashboard-list-row-aside">
                  <span className="executive-dashboard-row-value">{formatMoney(summary.overdueBreakdown.client.amount)}</span>
                  <span className="executive-dashboard-finance-action-link">View receivables</span>
                </div>
              </Link>
              <Link href="/finance?report=overdue-suppliers" className="executive-dashboard-list-row executive-dashboard-finance-row">
                <div className="executive-dashboard-list-row-copy">
                  <strong>{summary.overdueBreakdown.supplier.count} overdue supplier payment{summary.overdueBreakdown.supplier.count === 1 ? '' : 's'}</strong>
                  <p>{formatMoney(summary.overdueBreakdown.supplier.amount)} in late payables needing settlement review.</p>
                </div>
                <div className="executive-dashboard-list-row-aside">
                  <span className="executive-dashboard-row-value">{formatMoney(summary.overdueBreakdown.supplier.amount)}</span>
                  <span className="executive-dashboard-finance-action-link">View payables</span>
                </div>
              </Link>
            </div>
          </div>
        </div>

        <div className="executive-dashboard-finance-column">
          <div className="executive-dashboard-finance-block">
            <div className="executive-dashboard-finance-block-head">
              <div>
                <span>Activity</span>
                <h3>Recent Payments</h3>
              </div>
            </div>
            {summary.recentPayments.length === 0 ? (
              <DashboardEmptyState title="No payments yet" description="Persisted payment activity will appear here once finance activity starts." />
            ) : (
              <div className="executive-dashboard-list">
                {summary.recentPayments.map((payment) => (
                  <Link
                    key={payment.id}
                    href={`/bookings/${payment.bookingId}?tab=financials#${payment.type === 'CLIENT' ? 'client-payments' : 'supplier-payments'}`}
                    className={`executive-dashboard-list-row executive-dashboard-finance-row${payment.overdue ? ' executive-dashboard-finance-row-overdue' : ''}`}
                  >
                    <div className="executive-dashboard-list-row-copy">
                      <strong>{payment.bookingTitle}</strong>
                      <p>{payment.clientName}</p>
                      <p>
                        {payment.bookingRef} | {payment.type === 'CLIENT' ? 'Client payment' : 'Supplier payment'} |{' '}
                        {payment.status === 'PAID' ? `Paid ${formatDate(payment.paidAt)}` : `Due ${formatDate(payment.dueDate)}`}
                        {payment.overdue && payment.overdueDays ? ` | ${payment.overdueDays} day${payment.overdueDays === 1 ? '' : 's'} overdue` : ''}
                      </p>
                    </div>
                    <div className="executive-dashboard-list-row-aside">
                      {payment.overdue ? <span className="executive-dashboard-inline-pill executive-dashboard-finance-pill-overdue">Overdue</span> : null}
                      <span className="executive-dashboard-row-value">{formatMoney(payment.amount, payment.currency)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardSectionCard>
  );
}

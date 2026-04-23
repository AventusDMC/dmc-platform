import { DashboardSectionCard } from './DashboardSectionCard';

export type DashboardTrendPoint = {
  id: string;
  label: string;
  revenue: number;
  bookings: number;
};

type RevenueTrendCardProps = {
  points: DashboardTrendPoint[];
  revenueLabel: string;
  bookingsLabel: string;
};

function buildChartPath(values: number[], width: number, height: number) {
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

export function RevenueTrendCard({ points, revenueLabel, bookingsLabel }: RevenueTrendCardProps) {
  const width = 480;
  const height = 176;
  const maxRevenue = Math.max(...points.map((point) => point.revenue), 1);
  const bookingsPath = buildChartPath(
    points.map((point) => point.bookings),
    width,
    height,
  );

  return (
    <DashboardSectionCard
      eyebrow="Performance"
      title="Revenue And Booking Trend"
      description="Trailing six-month view using invoice volume and booking creation velocity."
    >
      <div className="executive-dashboard-trend-metrics">
        <div>
          <span>Revenue</span>
          <strong>{revenueLabel}</strong>
        </div>
        <div>
          <span>Bookings</span>
          <strong>{bookingsLabel}</strong>
        </div>
      </div>

      <div className="executive-dashboard-trend-chart" aria-hidden="true">
        <svg viewBox={`0 0 ${width} ${height + 22}`} role="img">
          {points.map((point, index) => {
            const barWidth = width / Math.max(points.length, 1) - 16;
            const x = index * (width / Math.max(points.length, 1)) + 8;
            const barHeight = (point.revenue / maxRevenue) * height;
            const y = height - barHeight;
            return (
              <g key={point.id}>
                <rect
                  className="executive-dashboard-trend-bar"
                  x={x}
                  y={y}
                  width={Math.max(barWidth, 18)}
                  height={Math.max(barHeight, 4)}
                  rx="10"
                />
                <text x={x + Math.max(barWidth, 18) / 2} y={height + 18} textAnchor="middle">
                  {point.label}
                </text>
              </g>
            );
          })}
          {bookingsPath ? <path className="executive-dashboard-trend-line" d={bookingsPath} /> : null}
        </svg>
      </div>
    </DashboardSectionCard>
  );
}

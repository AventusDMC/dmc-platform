type PerformanceWindowSummary = {
  confirmedCount: number;
  confirmedAmount: number;
  remindersSent: number;
  avgProcessingTime: number | null;
};

type PerformancePoint = {
  label: string;
  confirmedCount: number;
  confirmedAmount: number;
  remindersSent: number;
  avgProcessingTime: number | null;
};

type PerformanceTrend = {
  direction: 'up' | 'down' | 'flat';
  delta: number;
  changePercent: number;
  unit: 'percent' | 'pp';
};

type ReconciliationPerformanceSummary = {
  weekly: PerformanceWindowSummary;
  previousWeekly: PerformanceWindowSummary;
  monthly: PerformanceWindowSummary;
  previousMonthly: PerformanceWindowSummary;
  trends: {
    weekly: {
      confirmedAmount: PerformanceTrend;
      avgProcessingTime: PerformanceTrend;
      remindersSent: PerformanceTrend;
    };
    monthly: {
      confirmedAmount: PerformanceTrend;
      avgProcessingTime: PerformanceTrend;
      remindersSent: PerformanceTrend;
    };
  };
  insights: Array<{
    direction: 'up' | 'down' | 'flat';
    text: string;
  }>;
  series7: PerformancePoint[];
  series30: PerformancePoint[];
};

type ReconciliationPerformanceSectionProps = {
  summary: ReconciliationPerformanceSummary;
};

function formatMoney(amount: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function buildLinePath(values: number[], width: number, height: number) {
  if (values.length === 0) {
    return '';
  }

  const maxValue = Math.max(...values, 1);
  return values
    .map((value, index) => {
      const x = values.length === 1 ? width / 2 : (index / Math.max(values.length - 1, 1)) * width;
      const y = height - (value / maxValue) * height;
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}

function getInsightArrow(direction: 'up' | 'down' | 'flat') {
  if (direction === 'up') {
    return '▲';
  }

  if (direction === 'down') {
    return '▼';
  }

  return '•';
}

export function ReconciliationPerformanceSection({ summary }: ReconciliationPerformanceSectionProps) {
  const width = 620;
  const height = 180;
  const amountPath = buildLinePath(summary.series30.map((point) => point.confirmedAmount), width, height);
  const reminderPath = buildLinePath(summary.series30.map((point) => point.remindersSent), width, height);

  return (
    <section className="table-section-shell">
      <div className="section-header">
        <div className="section-header-copy">
          <p className="eyebrow">Performance</p>
          <h2>Finance team performance</h2>
          <p>Simple view of confirmation output, reminder activity, and processing speed over the last week and month.</p>
        </div>
      </div>

      <div className="table-section-body reconciliation-performance-section">
        {summary.insights.length > 0 ? (
          <div className="reconciliation-performance-insights">
            {summary.insights.map((insight, index) => (
              <article
                key={`${insight.text}-${index}`}
                className={`detail-card reconciliation-performance-insight reconciliation-performance-insight-${index === 0 ? 'primary' : 'secondary'}`}
              >
                <strong className={`reconciliation-performance-insight-icon reconciliation-performance-insight-icon-${insight.direction}`}>
                  {getInsightArrow(insight.direction)}
                </strong>
                <p>{insight.text}</p>
              </article>
            ))}
          </div>
        ) : null}

        <div className="reconciliation-performance-grid">
          <article className="detail-card reconciliation-performance-card">
            <span>Weekly confirmed</span>
            <strong>{String(summary.weekly.confirmedCount)}</strong>
            <p>{formatMoney(summary.weekly.confirmedAmount)}</p>
          </article>
          <article className="detail-card reconciliation-performance-card">
            <span>Monthly confirmed</span>
            <strong>{String(summary.monthly.confirmedCount)}</strong>
            <p>{formatMoney(summary.monthly.confirmedAmount)}</p>
          </article>
          <article className="detail-card reconciliation-performance-card">
            <span>Weekly reminders</span>
            <strong>{String(summary.weekly.remindersSent)}</strong>
            <p>Avg speed {summary.weekly.avgProcessingTime !== null ? `${summary.weekly.avgProcessingTime}m` : '-'}</p>
          </article>
          <article className="detail-card reconciliation-performance-card">
            <span>Monthly reminders</span>
            <strong>{String(summary.monthly.remindersSent)}</strong>
            <p>Avg speed {summary.monthly.avgProcessingTime !== null ? `${summary.monthly.avgProcessingTime}m` : '-'}</p>
          </article>
        </div>

        <article className="detail-card reconciliation-performance-chart-card">
          <div className="reconciliation-performance-chart-head">
            <div>
              <span>Trend</span>
              <h3>Last 30 days</h3>
            </div>
            <p>
              Average monthly speed {summary.monthly.avgProcessingTime !== null ? `${summary.monthly.avgProcessingTime}m` : 'not enough data'}
            </p>
          </div>
          <div className="reconciliation-performance-chart" aria-hidden="true">
            <svg viewBox={`0 0 ${width} ${height + 24}`} role="img">
              {summary.series30.map((point, index) => (
                <text
                  key={point.label}
                  x={summary.series30.length === 1 ? width / 2 : (index / Math.max(summary.series30.length - 1, 1)) * width}
                  y={height + 18}
                  textAnchor="middle"
                >
                  {index % 4 === 0 || index === summary.series30.length - 1 ? point.label : ''}
                </text>
              ))}
              {amountPath ? <path className="reconciliation-performance-line" d={amountPath} /> : null}
              {reminderPath ? <path className="reconciliation-performance-line reconciliation-performance-line-secondary" d={reminderPath} /> : null}
            </svg>
          </div>
          <div className="reconciliation-performance-legend">
            <span><i className="reconciliation-performance-dot" />Confirmed amount</span>
            <span><i className="reconciliation-performance-dot reconciliation-performance-dot-secondary" />Reminders sent</span>
          </div>
        </article>
      </div>
    </section>
  );
}

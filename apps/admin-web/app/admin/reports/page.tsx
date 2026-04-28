import Link from 'next/link';
import type { ReactNode } from 'react';
import { AdminBreadcrumbs } from '../../components/AdminBreadcrumbs';
import { AdminHeaderActions } from '../../components/AdminHeaderActions';
import { adminPageFetchJson } from '../../lib/admin-server';
import { OverdueReminderButton } from './OverdueReminderButton';

type ReportsPageProps = {
  searchParams?: Promise<{
    startDate?: string;
    endDate?: string;
    supplierSort?: string;
  }>;
};

type BookingSummaryRow = {
  id: string;
  bookingRef: string;
  clientName: string;
  startDate: string | null;
  totalSell: number;
  totalCost: number;
  totalProfit: number;
  marginPercent: number;
};

type BookingSummary = {
  startDate: string | null;
  endDate: string | null;
  totalBookings: number;
  totalSell: number;
  totalCost: number;
  totalProfit: number;
  avgMargin: number;
  cancelledBookings: number;
  topBookings: BookingSummaryRow[];
  lowMarginBookings: BookingSummaryRow[];
};

type MonthlyTrendRow = {
  month: string;
  totalBookings: number;
  totalSell: number;
  totalCost: number;
  totalProfit: number;
  avgMargin: number;
};

type MonthlyTrends = {
  startDate: string | null;
  endDate: string | null;
  dateField: 'startDate';
  months: MonthlyTrendRow[];
};

type SupplierPerformanceRow = {
  supplierId: string | null;
  supplierName: string;
  serviceCount: number;
  totalCost: number;
  totalSell: number;
  totalProfit: number;
  avgMargin: number;
};

type SupplierPerformance = {
  startDate: string | null;
  endDate: string | null;
  dateField: 'startDate';
  suppliers: SupplierPerformanceRow[];
};

type FinanceSummary = {
  totalInvoiced: number;
  totalPaid: number;
  outstandingReceivables: number;
  overdueReceivables: number;
  supplierPayables: number;
  supplierPaid: number;
  outstandingSupplierPayables: number;
  netCashPosition: number;
  overdueInvoices: Array<{
    invoiceId: string;
    invoiceNumber: string;
    clientCompanyName: string;
    dueDate: string | null;
    totalAmount: number;
    paidAmount: number;
    balanceDue: number;
  }>;
  unpaidSupplierPayables: Array<{
    supplierName: string;
    bookingRef: string;
    serviceName: string;
    amount: number;
    paidAmount: number;
    balanceDue: number;
  }>;
};

type AlertsSummary = {
  overdueReceivables: Array<{
    invoiceId: string;
    invoiceNumber: string;
    clientCompanyName: string;
    dueDate: string | null;
    balanceDue: number;
    daysOverdue: number;
  }>;
  lowMarginBookings: Array<{
    bookingId: string;
    bookingRef: string;
    clientCompanyName: string;
    totalSell: number;
    totalCost: number;
    totalProfit: number;
    marginPercent: number;
  }>;
  highCostServices: Array<{
    bookingId: string;
    bookingRef: string;
    serviceId: string | null;
    serviceName: string;
    supplierName: string;
    supplierCost: number;
    sellPrice: number;
    marginPercent: number;
  }>;
  unpaidSupplierPayables: Array<{
    supplierName: string;
    bookingRef: string;
    serviceName: string;
    balanceDue: number;
  }>;
};

async function getBookingSummary(startDate?: string, endDate?: string) {
  const params = new URLSearchParams();
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  const query = params.toString();

  return adminPageFetchJson<BookingSummary>(
    `/api/reports/booking-summary${query ? `?${query}` : ''}`,
    'Booking summary report',
    { cache: 'no-store' },
  );
}

async function getMonthlyTrends(startDate?: string, endDate?: string) {
  const params = new URLSearchParams();
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  const query = params.toString();

  return adminPageFetchJson<MonthlyTrends>(
    `/api/reports/monthly-trends${query ? `?${query}` : ''}`,
    'Monthly trends report',
    { cache: 'no-store' },
  );
}

async function getSupplierPerformance(startDate?: string, endDate?: string) {
  const params = new URLSearchParams();
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  const query = params.toString();

  return adminPageFetchJson<SupplierPerformance>(
    `/api/reports/supplier-performance${query ? `?${query}` : ''}`,
    'Supplier performance report',
    { cache: 'no-store' },
  );
}

async function getFinanceSummary() {
  return adminPageFetchJson<FinanceSummary>(
    '/api/reports/finance-summary',
    'Finance summary report',
    { cache: 'no-store' },
  );
}

async function getAlerts() {
  return adminPageFetchJson<AlertsSummary>(
    '/api/reports/alerts',
    'Alerts report',
    { cache: 'no-store' },
  );
}

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const [summary, monthlyTrends, supplierPerformance, financeSummary, alerts] = await Promise.all([
    getBookingSummary(resolvedSearchParams.startDate, resolvedSearchParams.endDate),
    getMonthlyTrends(resolvedSearchParams.startDate, resolvedSearchParams.endDate),
    getSupplierPerformance(resolvedSearchParams.startDate, resolvedSearchParams.endDate),
    getFinanceSummary(),
    getAlerts(),
  ]);
  const supplierSort = normalizeSupplierSort(resolvedSearchParams.supplierSort);
  const sortedSuppliers = sortSuppliers(supplierPerformance.suppliers, supplierSort);
  const topSuppliersByCost = [...supplierPerformance.suppliers]
    .sort((left, right) => right.totalCost - left.totalCost)
    .slice(0, 5);
  const lowestMarginSuppliers = [...supplierPerformance.suppliers]
    .filter((supplier) => supplier.totalSell > 0)
    .sort((left, right) => left.avgMargin - right.avgMargin || right.totalCost - left.totalCost)
    .slice(0, 5);
  const maxMonthlyRevenue = Math.max(...monthlyTrends.months.map((month) => month.totalSell), 0);

  return (
    <main className="page">
      <section className="panel reports-dashboard">
        <AdminBreadcrumbs
          items={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Reports' },
          ]}
        />

        <div className="page-header">
          <div>
            <p className="eyebrow">Reports</p>
            <h1>Reporting Dashboard</h1>
            <p className="detail-copy">Internal/admin only. Cost, profit, and supplier margin data must not be reused in customer-facing documents.</p>
          </div>
          <AdminHeaderActions>
            <Link href="/dashboard" className="secondary-button">
              Dashboard
            </Link>
            <OverdueReminderButton />
          </AdminHeaderActions>
        </div>

        <form className="reports-filter-bar" action="/admin/reports">
          <label>
            Start date
            <input type="date" name="startDate" defaultValue={resolvedSearchParams.startDate || ''} />
          </label>
          <label>
            End date
            <input type="date" name="endDate" defaultValue={resolvedSearchParams.endDate || ''} />
          </label>
          <button type="submit" className="primary-button">
            Apply
          </button>
          {(resolvedSearchParams.startDate || resolvedSearchParams.endDate) ? (
            <Link href="/admin/reports" className="secondary-button">
              Clear
            </Link>
          ) : null}
        </form>

        <section className="workspace-section">
          <div className="workspace-section-head">
            <div>
              <p className="eyebrow">Internal/Admin only</p>
              <h2>Accounting Export</h2>
              <p className="detail-copy">CSV exports for invoices, client payments, and supplier payables.</p>
            </div>
          </div>
          <div className="button-row">
            <Link href={buildExportHref('/api/exports/invoices.csv', resolvedSearchParams)} className="secondary-button">
              Export Invoices CSV
            </Link>
            <Link href={buildExportHref('/api/exports/payments.csv', resolvedSearchParams)} className="secondary-button">
              Export Payments CSV
            </Link>
            <Link href={buildExportHref('/api/exports/supplier-payables.csv', resolvedSearchParams)} className="secondary-button">
              Export Supplier Payables CSV
            </Link>
          </div>
        </section>

        <section className="dashboard-grid">
          <ReportMetric label="Total Invoiced" value={formatMoney(financeSummary.totalInvoiced)} helper="Active client invoices" />
          <ReportMetric label="Total Paid" value={formatMoney(financeSummary.totalPaid)} helper="Received client payments" />
          <ReportMetric label="Outstanding Receivables" value={formatMoney(financeSummary.outstandingReceivables)} helper="Client balances due" />
          <ReportMetric label="Overdue Receivables" value={formatMoney(financeSummary.overdueReceivables)} helper="Past due open balances" />
          <ReportMetric label="Supplier Payables" value={formatMoney(financeSummary.supplierPayables)} helper="Internal/Admin only" />
          <ReportMetric label="Outstanding Supplier Payables" value={formatMoney(financeSummary.outstandingSupplierPayables)} helper="Unpaid supplier obligations" />
          <ReportMetric label="Net Cash Position" value={formatMoney(financeSummary.netCashPosition)} helper="Client paid minus supplier paid" />
        </section>

        <section className="reports-list-grid">
          <AlertsCard
            title="Overdue Receivables"
            tone="danger"
            count={alerts.overdueReceivables.length}
            emptyText="No overdue receivables right now."
          >
            {alerts.overdueReceivables.map((alert) => (
              <AlertRow
                key={alert.invoiceId}
                href={`/invoices/${alert.invoiceId}`}
                title={`${alert.invoiceNumber} | ${alert.clientCompanyName}`}
                meta={`${formatMoney(alert.balanceDue)} overdue by ${formatNumber(alert.daysOverdue)} days | Due ${formatDate(alert.dueDate)}`}
              />
            ))}
          </AlertsCard>
          <AlertsCard
            title="Low Margin Bookings"
            tone="warning"
            count={alerts.lowMarginBookings.length}
            emptyText="No low-margin bookings right now."
          >
            {alerts.lowMarginBookings.map((alert) => (
              <AlertRow
                key={alert.bookingId}
                href={`/bookings/${alert.bookingId}`}
                title={`${alert.bookingRef} | ${alert.clientCompanyName}`}
                meta={`Margin ${formatPercent(alert.marginPercent)} | Profit ${formatMoney(alert.totalProfit)} | Sell ${formatMoney(alert.totalSell)} | Cost ${formatMoney(alert.totalCost)}`}
              />
            ))}
          </AlertsCard>
          <AlertsCard
            title="High Cost Services"
            tone="danger"
            count={alerts.highCostServices.length}
            emptyText="No high-cost service risks right now."
          >
            {alerts.highCostServices.map((alert) => (
              <AlertRow
                key={`${alert.bookingId}-${alert.serviceId || alert.serviceName}`}
                href={`/bookings/${alert.bookingId}?tab=services`}
                title={`${alert.bookingRef} | ${alert.serviceName}`}
                meta={`${alert.supplierName} | Cost ${formatMoney(alert.supplierCost)} | Sell ${formatMoney(alert.sellPrice)} | Margin ${formatPercent(alert.marginPercent)}`}
              />
            ))}
          </AlertsCard>
          <AlertsCard
            title="Unpaid Supplier Payables"
            tone="warning"
            count={alerts.unpaidSupplierPayables.length}
            emptyText="No unpaid supplier payables right now."
          >
            {alerts.unpaidSupplierPayables.map((alert) => (
              <AlertRow
                key={`${alert.bookingRef}-${alert.supplierName}-${alert.serviceName}`}
                href={`/bookings?search=${encodeURIComponent(alert.bookingRef)}`}
                title={`${alert.supplierName} | ${alert.bookingRef}`}
                meta={`${alert.serviceName} | Balance ${formatMoney(alert.balanceDue)}`}
              />
            ))}
          </AlertsCard>
        </section>

        {getAlertCount(alerts) === 0 ? (
          <section className="workspace-section">
            <p className="eyebrow">Alerts</p>
            <h2>No alerts right now.</h2>
            <p className="detail-copy">Internal/Admin only controls are clear across receivables, margins, service costs, and supplier payables.</p>
          </section>
        ) : null}

        <section className="reports-list-grid">
          <FinanceOverdueInvoices invoices={financeSummary.overdueInvoices} />
          <FinanceSupplierPayables payables={financeSummary.unpaidSupplierPayables} />
        </section>

        <section className="dashboard-grid">
          <ReportMetric label="Total Revenue" value={formatMoney(summary.totalSell)} helper="Active latest bookings" />
          <ReportMetric label="Total Cost" value={formatMoney(summary.totalCost)} helper="Internal/Admin only" />
          <ReportMetric label="Total Profit" value={formatMoney(summary.totalProfit)} helper="Revenue minus cost" />
          <ReportMetric label="Avg Margin" value={formatPercent(summary.avgMargin)} helper="Total profit / revenue" />
          <ReportMetric label="Total Bookings" value={formatNumber(summary.totalBookings)} helper="Cancelled excluded" />
          <ReportMetric label="Cancelled Bookings" value={formatNumber(summary.cancelledBookings || 0)} helper="Tracked outside totals" />
        </section>

        <section className="workspace-section">
          <div className="workspace-section-head">
            <div>
              <p className="eyebrow">Monthly trends</p>
              <h2>Booking performance by month</h2>
            </div>
          </div>
          {monthlyTrends.months.length > 0 ? (
            <div className="table-wrap">
              <table className="reports-visual-table">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Revenue</th>
                    <th>Profit</th>
                    <th>Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyTrends.months.map((month) => (
                    <tr key={month.month}>
                      <td>
                        <strong>{month.month}</strong>
                        <div className="table-subcopy">{formatNumber(month.totalBookings)} bookings</div>
                      </td>
                      <td>
                        <div className="reports-bar-cell">
                          <span>{formatMoney(month.totalSell)}</span>
                          <div className="reports-mini-bar" aria-hidden="true">
                            <span style={{ width: `${getBarWidth(month.totalSell, maxMonthlyRevenue)}%` }} />
                          </div>
                        </div>
                      </td>
                      <td>{formatMoney(month.totalProfit)}</td>
                      <td>{formatPercent(month.avgMargin)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="detail-copy">No monthly booking trends in this range.</p>
          )}
        </section>

        <section className="workspace-section">
          <div className="workspace-section-head">
            <div>
              <p className="eyebrow">Supplier Performance</p>
              <h2>Supplier cost and margin</h2>
            </div>
            <div className="reports-sort-links" aria-label="Supplier sort options">
              <SortLink label="Cost" sort="cost" currentSort={supplierSort} searchParams={resolvedSearchParams} />
              <SortLink label="Revenue" sort="revenue" currentSort={supplierSort} searchParams={resolvedSearchParams} />
              <SortLink label="Profit" sort="profit" currentSort={supplierSort} searchParams={resolvedSearchParams} />
              <SortLink label="Margin" sort="margin" currentSort={supplierSort} searchParams={resolvedSearchParams} />
            </div>
          </div>
          {sortedSuppliers.length > 0 ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Supplier</th>
                    <th>Services</th>
                    <th>Cost</th>
                    <th>Revenue</th>
                    <th>Profit</th>
                    <th>Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedSuppliers.map((supplier) => (
                    <tr key={supplier.supplierId || supplier.supplierName}>
                      <td>{supplier.supplierName}</td>
                      <td>{formatNumber(supplier.serviceCount)}</td>
                      <td>{formatMoney(supplier.totalCost)}</td>
                      <td>{formatMoney(supplier.totalSell)}</td>
                      <td>{formatMoney(supplier.totalProfit)}</td>
                      <td>{formatPercent(supplier.avgMargin)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="detail-copy">No supplier-assigned services in this range.</p>
          )}
        </section>

        <section className="reports-list-grid">
          <BookingReportList title="Top Profit Bookings" bookings={summary.topBookings} emptyText="No profitable bookings in this range." />
          <BookingReportList title="Low Margin Bookings" bookings={summary.lowMarginBookings} emptyText="No margin data in this range." />
          <SupplierReportList title="Top Suppliers by Cost" suppliers={topSuppliersByCost} emptyText="No supplier cost data in this range." />
          <SupplierReportList title="Lowest Margin Suppliers" suppliers={lowestMarginSuppliers} emptyText="No supplier margin warnings in this range." />
        </section>
      </section>
    </main>
  );
}

function AlertsCard({
  title,
  tone,
  count,
  emptyText,
  children,
}: {
  title: string;
  tone: 'danger' | 'warning';
  count: number;
  emptyText: string;
  children: ReactNode;
}) {
  return (
    <article className={`workspace-section reports-alert-card reports-alert-card-${tone}`}>
      <div className="workspace-section-head">
        <div>
          <p className="eyebrow">Internal/Admin only</p>
          <h2>{title}</h2>
        </div>
        <span className="workspace-status">{formatNumber(count)}</span>
      </div>
      {count > 0 ? <div className="reports-alert-list">{children}</div> : <p className="detail-copy">{emptyText}</p>}
    </article>
  );
}

function AlertRow({ href, title, meta }: { href: string; title: string; meta: string }) {
  return (
    <Link href={href} className="reports-alert-row">
      <strong>{title}</strong>
      <span>{meta}</span>
    </Link>
  );
}

function FinanceOverdueInvoices({ invoices }: { invoices: FinanceSummary['overdueInvoices'] }) {
  return (
    <article className="workspace-section">
      <div className="workspace-section-head">
        <div>
          <p className="eyebrow">Finance Dashboard</p>
          <h2>Overdue Invoices</h2>
        </div>
      </div>
      {invoices.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Client</th>
                <th>Due</th>
                <th>Total</th>
                <th>Paid</th>
                <th>Balance</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.invoiceId}>
                  <td>
                    <Link href={`/invoices/${invoice.invoiceId}`}>{invoice.invoiceNumber}</Link>
                  </td>
                  <td>{invoice.clientCompanyName}</td>
                  <td>{formatDate(invoice.dueDate)}</td>
                  <td>{formatMoney(invoice.totalAmount)}</td>
                  <td>{formatMoney(invoice.paidAmount)}</td>
                  <td>{formatMoney(invoice.balanceDue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="detail-copy">No overdue invoices.</p>
      )}
    </article>
  );
}

function FinanceSupplierPayables({ payables }: { payables: FinanceSummary['unpaidSupplierPayables'] }) {
  return (
    <article className="workspace-section">
      <div className="workspace-section-head">
        <div>
          <p className="eyebrow">Internal/Admin only</p>
          <h2>Unpaid Supplier Payables</h2>
        </div>
      </div>
      {payables.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Supplier</th>
                <th>Booking</th>
                <th>Service</th>
                <th>Amount</th>
                <th>Paid</th>
                <th>Balance</th>
              </tr>
            </thead>
            <tbody>
              {payables.map((payable) => (
                <tr key={`${payable.bookingRef}-${payable.supplierName}-${payable.serviceName}`}>
                  <td>{payable.supplierName}</td>
                  <td>{payable.bookingRef}</td>
                  <td>{payable.serviceName}</td>
                  <td>{formatMoney(payable.amount)}</td>
                  <td>{formatMoney(payable.paidAmount)}</td>
                  <td>{formatMoney(payable.balanceDue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="detail-copy">No unpaid supplier payables.</p>
      )}
    </article>
  );
}

function ReportMetric({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <article className="dashboard-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{helper}</p>
    </article>
  );
}

function BookingReportList({ title, bookings, emptyText }: { title: string; bookings: BookingSummaryRow[]; emptyText: string }) {
  return (
    <article className="workspace-section">
      <div className="workspace-section-head">
        <div>
          <p className="eyebrow">Booking summary</p>
          <h2>{title}</h2>
        </div>
      </div>
      {bookings.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Booking</th>
                <th>Client</th>
                <th>Sell</th>
                <th>Cost</th>
                <th>Profit</th>
                <th>Margin</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((booking) => (
                <tr key={booking.id}>
                  <td>
                    <Link href={`/bookings/${booking.id}`}>{booking.bookingRef}</Link>
                  </td>
                  <td>{booking.clientName}</td>
                  <td>{formatMoney(booking.totalSell)}</td>
                  <td>{formatMoney(booking.totalCost)}</td>
                  <td>{formatMoney(booking.totalProfit)}</td>
                  <td>{formatPercent(booking.marginPercent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="detail-copy">{emptyText}</p>
      )}
    </article>
  );
}

function SupplierReportList({ title, suppliers, emptyText }: { title: string; suppliers: SupplierPerformanceRow[]; emptyText: string }) {
  return (
    <article className="workspace-section">
      <div className="workspace-section-head">
        <div>
          <p className="eyebrow">Supplier warnings</p>
          <h2>{title}</h2>
        </div>
      </div>
      {suppliers.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Supplier</th>
                <th>Cost</th>
                <th>Revenue</th>
                <th>Profit</th>
                <th>Margin</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((supplier) => (
                <tr key={supplier.supplierId || supplier.supplierName}>
                  <td>{supplier.supplierName}</td>
                  <td>{formatMoney(supplier.totalCost)}</td>
                  <td>{formatMoney(supplier.totalSell)}</td>
                  <td>{formatMoney(supplier.totalProfit)}</td>
                  <td>{formatPercent(supplier.avgMargin)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="detail-copy">{emptyText}</p>
      )}
    </article>
  );
}

function SortLink({
  label,
  sort,
  currentSort,
  searchParams,
}: {
  label: string;
  sort: SupplierSort;
  currentSort: SupplierSort;
  searchParams: { startDate?: string; endDate?: string };
}) {
  const params = new URLSearchParams();
  if (searchParams.startDate) params.set('startDate', searchParams.startDate);
  if (searchParams.endDate) params.set('endDate', searchParams.endDate);
  params.set('supplierSort', sort);

  return (
    <Link href={`/admin/reports?${params.toString()}`} className={currentSort === sort ? 'secondary-button active' : 'secondary-button'}>
      {label}
    </Link>
  );
}

function buildExportHref(path: string, searchParams: { startDate?: string; endDate?: string }) {
  const params = new URLSearchParams();
  if (searchParams.startDate) params.set('startDate', searchParams.startDate);
  if (searchParams.endDate) params.set('endDate', searchParams.endDate);
  const query = params.toString();
  return `${path}${query ? `?${query}` : ''}`;
}

type SupplierSort = 'cost' | 'revenue' | 'profit' | 'margin';

function normalizeSupplierSort(value?: string): SupplierSort {
  return value === 'revenue' || value === 'profit' || value === 'margin' ? value : 'cost';
}

function sortSuppliers(suppliers: SupplierPerformanceRow[], sort: SupplierSort) {
  const sorted = [...suppliers];
  if (sort === 'revenue') {
    return sorted.sort((left, right) => right.totalSell - left.totalSell || left.supplierName.localeCompare(right.supplierName));
  }
  if (sort === 'profit') {
    return sorted.sort((left, right) => right.totalProfit - left.totalProfit || left.supplierName.localeCompare(right.supplierName));
  }
  if (sort === 'margin') {
    return sorted.sort((left, right) => right.avgMargin - left.avgMargin || left.supplierName.localeCompare(right.supplierName));
  }
  return sorted.sort((left, right) => right.totalCost - left.totalCost || left.supplierName.localeCompare(right.supplierName));
}

function getBarWidth(value: number, maxValue: number) {
  if (!maxValue || value <= 0) {
    return 0;
  }

  return Math.max(8, Math.round((value / maxValue) * 100));
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function formatPercent(value: number) {
  return `${new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
  }).format(value || 0)}%`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value || 0);
}

function formatDate(value: string | null) {
  if (!value) {
    return 'Not set';
  }

  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(value));
}

function getAlertCount(alerts: AlertsSummary) {
  return (
    alerts.overdueReceivables.length +
    alerts.lowMarginBookings.length +
    alerts.highCostServices.length +
    alerts.unpaidSupplierPayables.length
  );
}

import Link from 'next/link';
import { AdminBackButton } from '../../components/AdminBackButton';
import { AdminBreadcrumbs } from '../../components/AdminBreadcrumbs';
import { ADMIN_API_BASE_URL, adminPageFetchJson } from '../../lib/admin-server';

export const dynamic = 'force-dynamic';

type Company = {
  id: string;
  name: string;
  type: string | null;
  website: string | null;
  country: string | null;
  city: string | null;
  _count: {
    contacts: number;
    leads?: number;
    clientQuotes?: number;
  };
};

type CompanyPerformance = {
  companyId: string;
  totalQuotes: number;
  sentQuotes: number;
  confirmedQuotes: number;
  cancelledQuotes: number;
  totalBookings: number;
  cancelledBookings: number;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  avgMargin: number;
  conversionRate: number;
  lastQuoteDate: string | null;
  lastBookingDate: string | null;
};

type CompanyDetailPageProps = {
  params: Promise<{
    companyId: string;
  }>;
};

async function getCompany(companyId: string) {
  return adminPageFetchJson<Company>(`${ADMIN_API_BASE_URL}/companies/${companyId}`, 'Company detail', {
    cache: 'no-store',
  });
}

async function getCompanyPerformance(companyId: string) {
  return adminPageFetchJson<CompanyPerformance>(
    `${ADMIN_API_BASE_URL}/companies/${companyId}/performance`,
    'Company performance',
    { cache: 'no-store' },
  );
}

export default async function CompanyDetailPage({ params }: CompanyDetailPageProps) {
  const { companyId } = await params;
  const [company, performance] = await Promise.all([getCompany(companyId), getCompanyPerformance(companyId)]);

  return (
    <main className="page">
      <section className="panel workspace-panel">
        <div className="workspace-shell">
          <div className="workspace-hero">
            <div>
              <AdminBreadcrumbs
                items={[
                  { label: 'Dashboard', href: '/admin/dashboard' },
                  { label: 'Companies', href: '/companies' },
                  { label: company.name },
                ]}
              />
              <AdminBackButton fallbackHref="/companies" label="Back to Companies" />
              <p className="eyebrow">Company Performance</p>
              <h1>{company.name}</h1>
              <p>
                {[company.type || 'Company', company.city, company.country].filter(Boolean).join(' | ')}
              </p>
            </div>
            <div className="admin-header-actions">
              <Link href="/admin/dashboard" className="dashboard-toolbar-link">
                Dashboard
              </Link>
              <Link href="/companies" className="secondary-button">
                Companies
              </Link>
            </div>
          </div>

          <section className="section-stack">
            <section className="workspace-section">
              <div className="section-heading-row">
                <div>
                  <p className="eyebrow">Agent Performance</p>
                  <h2>Business generated</h2>
                </div>
                <p className="section-helper">Admin/internal view. Supplier costs are shown only in this reporting context.</p>
              </div>

              <div className="dashboard-kpi-grid">
                <PerformanceCard label="Total Quotes" value={formatNumber(performance.totalQuotes)} helper={`${performance.sentQuotes} sent | ${performance.cancelledQuotes} cancelled`} />
                <PerformanceCard label="Confirmed Bookings" value={formatNumber(performance.totalBookings)} helper={`${performance.cancelledBookings} cancelled excluded from revenue`} />
                <PerformanceCard label="Conversion Rate" value={`${formatNumber(performance.conversionRate)}%`} helper="Active latest bookings / active latest quotes" />
                <PerformanceCard label="Revenue" value={formatMoney(performance.totalRevenue)} helper="Cancelled bookings excluded" />
                <PerformanceCard label="Profit" value={formatMoney(performance.totalProfit)} helper={`Cost ${formatMoney(performance.totalCost)}`} />
                <PerformanceCard label="Avg Margin" value={`${formatNumber(performance.avgMargin)}%`} helper="Total profit / total revenue" />
                <PerformanceCard label="Last Quote" value={formatDate(performance.lastQuoteDate)} helper="Latest quote revision date" />
                <PerformanceCard label="Last Booking" value={formatDate(performance.lastBookingDate)} helper="Latest active booking start date" />
              </div>
            </section>
          </section>
        </div>
      </section>
    </main>
  );
}

function PerformanceCard({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <article className="dashboard-kpi-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{helper}</p>
    </article>
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatDate(value: string | null) {
  if (!value) {
    return 'None';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

import Link from 'next/link';
import { AdminBreadcrumbs } from '../../components/AdminBreadcrumbs';
import { ADMIN_API_BASE_URL, adminPageFetchJson } from '../../lib/admin-server';
import { OPERATIONS_TIME_ZONE } from '../../lib/operations-timezone';

type Severity = 'INFO' | 'ACTION REQUIRED' | 'CRITICAL';

type DispatchRow = {
  bookingId: string;
  bookingRef: string | null;
  bookingTitle: string;
  clientName: string | null;
  serviceId: string;
  serviceType: string | null;
  operationType: string | null;
  description: string | null;
  date: string | null;
  time: string | null;
  dayNumber: number | null;
  dayTitle: string | null;
  supplierId: string | null;
  supplierName: string | null;
  supplierPhone: string | null;
  assignmentStatus: string;
  confirmationStatus: string;
  operationStatus: string;
  voucherStatus: string;
  voucherId: string | null;
  voucherGeneratedAt: string | null;
  driverName: string | null;
  vehicleName: string | null;
  vehicleType: string | null;
  guideName: string | null;
  guidePhone: string | null;
  guideLanguages: string[];
  guideReportingTime: string | null;
  pickupLocation: string | null;
  dropoffLocation: string | null;
  meetingPoint: string | null;
  confirmationReference: string | null;
  routeName: string | null;
  severity: Severity;
  reasons: string[];
};

type Section = {
  label: string;
  severity: Severity;
  count: number;
  rows: DispatchRow[];
};

type DispatchResponse = {
  range: { label: string; from: string; to: string };
  filters: { serviceType: string | null; supplier: string | null };
  counters: {
    operationsReadyPct: number;
    vouchersGeneratedPct: number;
    confirmationsCompletePct: number;
    roomingCompletePct: number;
    manifestCompletePct: number;
    totalRows: number;
    operationallyReadyCount: number;
    vouchersGeneratedCount: number;
    confirmationsCompleteCount: number;
    hotelRoomingCompleteCount: number;
    hotelTotalCount: number;
    manifestCompleteCount: number;
    manifestTotalCount: number;
  };
  sections: {
    arrivals: Section;
    departures: Section;
    transportDispatch: Section;
    guideDispatch: Section;
    hotelOperations: Section;
    criticalIssues: Section;
  };
};

type PageProps = {
  searchParams?: Promise<{
    range?: string;
    serviceType?: string;
    supplier?: string;
  }>;
};

function severityClass(severity: Severity) {
  return `severity-${severity.toLowerCase().replace(/\s+/g, '-')}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      timeZone: OPERATIONS_TIME_ZONE,
    });
  } catch {
    return value;
  }
}

const RANGE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'next-7-days', label: 'Next 7 days' },
];

function buildRangeHref(range: string, current: { serviceType?: string; supplier?: string }) {
  const params = new URLSearchParams();
  params.set('range', range);
  if (current.serviceType) params.set('serviceType', current.serviceType);
  if (current.supplier) params.set('supplier', current.supplier);
  return `/operations/dispatch?${params.toString()}`;
}

function RowCard({ row }: { row: DispatchRow }) {
  return (
    <article
      className={`admin-card dispatch-row-card ${severityClass(row.severity)}`}
      style={{ padding: '0.75rem 0.9rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
          <strong>{row.description || row.serviceType || 'Service'}</strong>
          <span style={{ color: '#667085', fontSize: '0.85rem' }}>
            {[row.bookingRef, row.clientName, row.dayTitle ? `Day ${row.dayNumber ?? '-'} · ${row.dayTitle}` : null]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </div>
        <span className={`status-pill ${severityClass(row.severity)}`} style={{ alignSelf: 'flex-start' }}>
          {row.severity}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.35rem', fontSize: '0.85rem' }}>
        <div>
          <span style={{ color: '#667085' }}>Date</span>{' '}
          <strong>{formatDate(row.date)}{row.time ? ` · ${row.time}` : ''}</strong>
        </div>
        <div>
          <span style={{ color: '#667085' }}>Supplier</span>{' '}
          <strong>{row.supplierName || 'Unassigned'}</strong>
        </div>
        <div>
          <span style={{ color: '#667085' }}>Confirmation</span>{' '}
          <strong>{row.confirmationStatus}</strong>
        </div>
        <div>
          <span style={{ color: '#667085' }}>Voucher</span>{' '}
          <strong>{row.voucherStatus}</strong>
        </div>
        {row.driverName || row.vehicleName ? (
          <div>
            <span style={{ color: '#667085' }}>Vehicle/Driver</span>{' '}
            <strong>{[row.vehicleName, row.driverName].filter(Boolean).join(' · ') || '-'}</strong>
          </div>
        ) : null}
        {row.guideName ? (
          <div>
            <span style={{ color: '#667085' }}>Guide</span>{' '}
            <strong>{row.guideName}{row.guideReportingTime ? ` · ${row.guideReportingTime}` : ''}</strong>
          </div>
        ) : null}
        {row.pickupLocation ? (
          <div>
            <span style={{ color: '#667085' }}>Pickup</span> <strong>{row.pickupLocation}</strong>
          </div>
        ) : null}
        {row.meetingPoint ? (
          <div>
            <span style={{ color: '#667085' }}>Meeting</span> <strong>{row.meetingPoint}</strong>
          </div>
        ) : null}
      </div>

      {row.reasons.length > 0 ? (
        <ul style={{ margin: 0, paddingLeft: '1.25rem', color: '#b54708', fontSize: '0.85rem' }}>
          {row.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
        <Link className="button button-tertiary" href={`/bookings/${row.bookingId}`}>
          Open booking
        </Link>
        <Link className="button button-tertiary" href={`/bookings/${row.bookingId}/operations`}>
          Open operations
        </Link>
        {row.voucherId ? (
          <Link className="button button-tertiary" href={`/bookings/${row.bookingId}/operations/${row.serviceId}/voucher`}>
            Open voucher
          </Link>
        ) : null}
      </div>
    </article>
  );
}

function SectionBlock({ section }: { section: Section }) {
  return (
    <section className="admin-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem' }}>
        <div>
          <p className="eyebrow">{section.severity}</p>
          <h2 style={{ margin: 0 }}>{section.label}</h2>
        </div>
        <strong style={{ fontSize: '1.5rem' }}>{section.count}</strong>
      </div>
      {section.rows.length === 0 ? (
        <p style={{ color: '#667085', margin: 0 }}>Nothing in this section for the selected range.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {section.rows.map((row) => (
            <RowCard key={`${section.label}-${row.serviceId}`} row={row} />
          ))}
        </div>
      )}
    </section>
  );
}

function CounterCard({ label, pct, sub }: { label: string; pct: number; sub: string }) {
  return (
    <div className="admin-card" style={{ padding: '0.75rem 0.9rem' }}>
      <p className="eyebrow" style={{ marginBottom: '0.25rem' }}>{label}</p>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem' }}>
        <strong style={{ fontSize: '1.75rem' }}>{pct}%</strong>
        <span style={{ color: '#667085', fontSize: '0.85rem' }}>{sub}</span>
      </div>
    </div>
  );
}

export default async function DispatchPage({ searchParams }: PageProps) {
  const resolved = searchParams ? await searchParams : undefined;
  const range = resolved?.range || 'today';
  const serviceType = resolved?.serviceType || '';
  const supplier = resolved?.supplier || '';

  const query = new URLSearchParams();
  query.set('range', range);
  if (serviceType) query.set('serviceType', serviceType);
  if (supplier) query.set('supplier', supplier);

  let data: DispatchResponse | null = null;
  let fetchError: string | null = null;
  try {
    data = await adminPageFetchJson<DispatchResponse>(
      `${ADMIN_API_BASE_URL}/operations/dispatch?${query.toString()}`,
      'Operations dispatch',
      { cache: 'no-store' },
    );
  } catch (error) {
    fetchError = error instanceof Error ? error.message : String(error);
  }

  if (!data) {
    return (
      <main className="admin-page-shell">
        <div className="admin-page-heading">
          <AdminBreadcrumbs
            items={[
              { label: 'Operations', href: '/operations' },
              { label: 'Dispatch' },
            ]}
          />
          <h1>Operations Dispatch</h1>
        </div>
        <section className="warning-banner" aria-label="Dispatch fetch error">
          <p className="form-error">
            <strong>Could not load dispatch data.</strong>
          </p>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem', background: '#fbfcfd', padding: '0.75rem', border: '1px solid #d8e0eb', borderRadius: 6 }}>
            {fetchError || 'Unknown error'}
          </pre>
        </section>
      </main>
    );
  }

  const c = data.counters;

  return (
    <main className="admin-page-shell">
      <div className="admin-page-heading">
        <AdminBreadcrumbs
          items={[
            { label: 'Operations', href: '/operations' },
            { label: 'Dispatch' },
          ]}
        />
        <div className="admin-heading-row">
          <div>
            <h1>Operations Dispatch</h1>
            <p className="admin-muted-copy">
              {data.range.label} · {data.range.from}
              {data.range.from !== data.range.to ? ` → ${data.range.to}` : ''} · {c.totalRows} service rows in window
            </p>
          </div>
          <div className="admin-heading-actions" style={{ display: 'flex', gap: '0.5rem' }}>
            {RANGE_OPTIONS.map((opt) => (
              <Link
                key={opt.value}
                className={`button ${range === opt.value ? 'button-primary' : 'button-secondary'}`}
                href={buildRangeHref(opt.value, { serviceType, supplier })}
              >
                {opt.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <section
        className="admin-card"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.5rem' }}
      >
        <CounterCard label="Operations ready" pct={c.operationsReadyPct} sub={`${c.operationallyReadyCount} of ${c.totalRows}`} />
        <CounterCard label="Vouchers generated" pct={c.vouchersGeneratedPct} sub={`${c.vouchersGeneratedCount} of ${c.totalRows}`} />
        <CounterCard label="Confirmations complete" pct={c.confirmationsCompletePct} sub={`${c.confirmationsCompleteCount} of ${c.totalRows}`} />
        <CounterCard label="Rooming complete" pct={c.roomingCompletePct} sub={`${c.hotelRoomingCompleteCount} of ${c.hotelTotalCount} hotel rows`} />
        <CounterCard label="Manifest complete" pct={c.manifestCompletePct} sub={`${c.manifestCompleteCount} of ${c.manifestTotalCount} bookings`} />
      </section>

      <SectionBlock section={data.sections.criticalIssues} />
      <SectionBlock section={data.sections.arrivals} />
      <SectionBlock section={data.sections.departures} />
      <SectionBlock section={data.sections.transportDispatch} />
      <SectionBlock section={data.sections.guideDispatch} />
      <SectionBlock section={data.sections.hotelOperations} />
    </main>
  );
}

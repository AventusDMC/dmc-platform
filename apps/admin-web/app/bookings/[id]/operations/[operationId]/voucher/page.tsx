import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AdminBackButton } from '../../../../../components/AdminBackButton';
import { AdminBreadcrumbs } from '../../../../../components/AdminBreadcrumbs';
import { adminPageFetchJson } from '../../../../../lib/admin-server';
import { OPERATIONS_TIME_ZONE } from '../../../../../lib/operations-timezone';

type VoucherSnapshot = {
  voucherVersion?: number;
  generatedAt?: string | null;
  bookingRef?: string | null;
  client?: { name?: string | null; companyName?: string | null } | null;
  serviceType?: string | null;
  serviceName?: string | null;
  operationType?: string | null;
  voucherType?: string | null;
  date?: string | null;
  time?: string | null;
  pickup?: { location?: string | null; time?: string | null } | null;
  meetingPoint?: string | null;
  dropoff?: string | null;
  supplier?: { id?: string | null; name?: string | null } | null;
  paxCount?: number | null;
  passengerManifest?: { total?: number; expected?: number; namesPending?: number; complete?: boolean } | null;
  rooming?: { roomCount?: number; assignedPax?: number } | null;
  operationalNotes?: string | null;
  confirmationReference?: string | null;
  warnings?: string[] | null;
};

type VoucherResponse = {
  id: string;
  bookingId: string;
  bookingServiceId: string;
  type: string;
  status: string;
  generatedAt: string | null;
  generatedBy: string | null;
  sentAt: string | null;
  snapshotJson: VoucherSnapshot | null;
  notes: string | null;
  supplier?: { id: string; name: string } | null;
};

type PageProps = {
  params: Promise<{ id: string; operationId: string }>;
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: OPERATIONS_TIME_ZONE,
    });
  } catch {
    return value;
  }
}

function Detail({ label, children, hideIfEmpty = false }: { label: string; children: React.ReactNode; hideIfEmpty?: boolean }) {
  const isEmpty = children === null || children === undefined || children === '';
  if (hideIfEmpty && isEmpty) return null;
  // Inline label / value rendering — no .voucher-detail-row CSS exists in
  // globals.css, so without an explicit separator the <span> and <strong>
  // rendered inline with no space, producing "Booking refBK-2026-0004".
  return (
    <div className="voucher-detail-row" style={{ display: 'flex', gap: '0.75rem', alignItems: 'baseline', padding: '0.35rem 0', borderBottom: '1px solid #eef0f3' }}>
      <span style={{ color: '#667085', minWidth: '11rem', flexShrink: 0 }}>{label}</span>
      <strong>{isEmpty ? '-' : children}</strong>
    </div>
  );
}

export default async function OperationalVoucherPage({ params }: PageProps) {
  const { id, operationId } = await params;
  const voucher = await adminPageFetchJson<VoucherResponse | null>(
    `/api/bookings/${id}/operations/${operationId}/voucher`,
    'Operational voucher detail',
    { cache: 'no-store', allow404: true },
  );

  if (!voucher) {
    notFound();
  }

  const snapshot = voucher.snapshotJson || {};
  const warnings = Array.isArray(snapshot.warnings) ? snapshot.warnings : [];

  return (
    <main className="admin-page-shell">
      <div className="admin-page-heading">
        <AdminBreadcrumbs
          items={[
            { label: 'Bookings', href: '/bookings' },
            { label: snapshot.bookingRef || 'Booking', href: `/bookings/${id}` },
            { label: 'Operations', href: `/bookings/${id}/operations` },
            { label: 'Voucher' },
          ]}
        />
        <div className="admin-heading-row">
          <div>
            <h1>{snapshot.serviceName || 'Operational voucher'}</h1>
            <p className="admin-muted-copy">
              {voucher.type} voucher · Status {voucher.status}
              {voucher.generatedAt ? ` · Generated ${formatDateTime(voucher.generatedAt)}` : ''}
            </p>
          </div>
          <div className="admin-heading-actions">
            <AdminBackButton fallbackHref={`/bookings/${id}/operations`} label="Back to operations" />
            <Link className="button button-secondary" href={`/bookings/${id}`}>Booking</Link>
          </div>
        </div>
      </div>

      {warnings.length > 0 ? (
        <section className="warning-banner" aria-label="Voucher warnings">
          <p className="form-error">
            <strong>This voucher was generated with warnings:</strong>
          </p>
          <ul>
            {warnings.map((warning) => (
              <li key={warning} className="form-error">{warning}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="admin-card">
        <p className="eyebrow">Booking</p>
        <h2>Reference & client</h2>
        <div className="voucher-detail-grid">
          <Detail label="Booking ref">{snapshot.bookingRef}</Detail>
          <Detail label="Client name">{snapshot.client?.name}</Detail>
          <Detail label="Client company" hideIfEmpty>{snapshot.client?.companyName}</Detail>
          <Detail label="Pax count">{snapshot.paxCount}</Detail>
        </div>
      </section>

      <section className="admin-card">
        <p className="eyebrow">Service</p>
        <h2>{snapshot.serviceName || 'Service'}</h2>
        <div className="voucher-detail-grid">
          <Detail label="Service type">{snapshot.serviceType}</Detail>
          <Detail label="Operation type">{snapshot.operationType}</Detail>
          <Detail label="Voucher type">{snapshot.voucherType}</Detail>
          <Detail label="Date">{snapshot.date}</Detail>
          <Detail label="Time">{snapshot.time}</Detail>
          <Detail label="Pickup location" hideIfEmpty>{snapshot.pickup?.location}</Detail>
          <Detail label="Pickup time" hideIfEmpty>{snapshot.pickup?.time}</Detail>
          <Detail label="Meeting point" hideIfEmpty>{snapshot.meetingPoint}</Detail>
          <Detail label="Dropoff" hideIfEmpty>{snapshot.dropoff}</Detail>
        </div>
      </section>

      <section className="admin-card">
        <p className="eyebrow">Supplier</p>
        <h2>{snapshot.supplier?.name || voucher.supplier?.name || 'Unassigned'}</h2>
        <div className="voucher-detail-grid">
          <Detail label="Supplier id">{snapshot.supplier?.id || voucher.supplier?.id}</Detail>
          <Detail label="Confirmation reference" hideIfEmpty>{snapshot.confirmationReference}</Detail>
        </div>
      </section>

      <section className="admin-card">
        <p className="eyebrow">Passengers & rooming</p>
        <h2>Manifest status</h2>
        <div className="voucher-detail-grid">
          <Detail label="Passenger records">
            {snapshot.passengerManifest?.total ?? 0}
            {snapshot.passengerManifest?.expected ? ` of ${snapshot.passengerManifest.expected} expected` : ''}
          </Detail>
          <Detail label="Names pending">{snapshot.passengerManifest?.namesPending}</Detail>
          <Detail label="Manifest complete">{snapshot.passengerManifest?.complete ? 'Yes' : 'No'}</Detail>
          {snapshot.rooming ? (
            <>
              <Detail label="Room count">{snapshot.rooming.roomCount}</Detail>
              <Detail label="Assigned pax">{snapshot.rooming.assignedPax}</Detail>
            </>
          ) : null}
        </div>
      </section>

      <section className="admin-card">
        <p className="eyebrow">Notes</p>
        <h2>Operational notes</h2>
        <p>{snapshot.operationalNotes || voucher.notes || 'No notes.'}</p>
      </section>
    </main>
  );
}

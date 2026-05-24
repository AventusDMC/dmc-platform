import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AdminBackButton } from '../../../../../components/AdminBackButton';
import { AdminBreadcrumbs } from '../../../../../components/AdminBreadcrumbs';
import { adminPageFetchJson } from '../../../../../lib/admin-server';
import { OPERATIONS_TIME_ZONE } from '../../../../../lib/operations-timezone';
import { PrintVoucherButton } from './PrintVoucherButton';

type SupplierContact = { email?: string | null; phone?: string | null } | null;

type TransportSnapshot = {
  routeName?: string | null;
  routeCode?: string | null;
  vehicleType?: string | null;
  vehicleName?: string | null;
  driverName?: string | null;
  driverPhone?: string | null;
  emergencyContact?: SupplierContact;
  operationalRemarks?: string | null;
} | null;

type RoomSnapshot = {
  roomNumber?: number;
  roomType?: string | null;
  occupancy?: string | null;
  paxCount?: number;
  passengers?: Array<{
    title?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    fullName?: string | null;
  }>;
  notes?: string | null;
};

type HotelSnapshot = {
  confirmationNumber?: string | null;
  checkIn?: string | null;
  checkOut?: string | null;
  nights?: number | null;
  mealPlan?: string | null;
  roomCount?: number | null;
  assignedPax?: number | null;
  occupancy?: RoomSnapshot[] | null;
  specialRequests?: string | null;
  emergencyContact?: SupplierContact;
} | null;

type ActivitySnapshot = {
  meetingPoint?: string | null;
  startTime?: string | null;
  participants?: { total?: number | null; adults?: number | null; children?: number | null } | null;
  inclusions?: string[] | null;
  exclusions?: string[] | null;
  assignedGuide?: string | null;
  assignedGuidePhone?: string | null;
  operationalNotes?: string | null;
} | null;

type GuideSnapshot = {
  guideName?: string | null;
  guideLanguages?: string[] | null;
  reportingTime?: string | null;
  workingHours?: string | null;
  phone?: string | null;
  email?: string | null;
} | null;

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
  // v2 per-type sub-blocks. Older v1 snapshots have these missing — the
  // detail page renders them only when present, so v1 vouchers keep
  // working with just the generic fields above.
  transport?: TransportSnapshot;
  hotel?: HotelSnapshot;
  activity?: ActivitySnapshot;
  guide?: GuideSnapshot;
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

// BookingRoomOccupancy enum → hotel-industry abbreviation. "unknown" is the
// schema default when no specific occupancy was set; treat it as no data so
// the inline room meta doesn't read "unknown · HB" (which looks like a real
// occupancy label instead of "we don't know yet").
const ROOM_OCCUPANCY_LABELS: Record<string, string> = {
  single: 'SGL',
  double: 'DBL',
  twin: 'TWN',
  triple: 'TPL',
  quad: 'QUAD',
};

function formatRoomOccupancy(value: string | null | undefined): string | null {
  if (!value) return null;
  const key = String(value).trim().toLowerCase();
  if (!key || key === 'unknown') return null;
  return ROOM_OCCUPANCY_LABELS[key] || value.toUpperCase();
}

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
    <main className="admin-page-shell operational-voucher-page">
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
            <PrintVoucherButton />
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

      {/* v2 per-type sub-blocks. Each section only renders when the
          matching snapshot block is present, so v1 vouchers continue to
          render with just the generic sections above. */}
      {snapshot.transport ? (
        <section className="admin-card">
          <p className="eyebrow">Transport</p>
          <h2>Route & vehicle</h2>
          <div className="voucher-detail-grid">
            <Detail label="Route name" hideIfEmpty>{snapshot.transport.routeName}</Detail>
            <Detail label="Route code" hideIfEmpty>{snapshot.transport.routeCode}</Detail>
            <Detail label="Vehicle type" hideIfEmpty>{snapshot.transport.vehicleType}</Detail>
            <Detail label="Vehicle name" hideIfEmpty>{snapshot.transport.vehicleName}</Detail>
            <Detail label="Driver" hideIfEmpty>{snapshot.transport.driverName}</Detail>
            <Detail label="Driver phone" hideIfEmpty>{snapshot.transport.driverPhone}</Detail>
            <Detail label="Emergency contact" hideIfEmpty>
              {[snapshot.transport.emergencyContact?.phone, snapshot.transport.emergencyContact?.email].filter(Boolean).join(' · ') || null}
            </Detail>
            <Detail label="Operational remarks" hideIfEmpty>{snapshot.transport.operationalRemarks}</Detail>
          </div>
        </section>
      ) : null}

      {snapshot.hotel ? (
        <section className="admin-card">
          <p className="eyebrow">Hotel</p>
          <h2>Stay details</h2>
          <div className="voucher-detail-grid">
            <Detail label="Hotel confirmation" hideIfEmpty>{snapshot.hotel.confirmationNumber}</Detail>
            <Detail label="Check-in" hideIfEmpty>{snapshot.hotel.checkIn}</Detail>
            <Detail label="Check-out" hideIfEmpty>{snapshot.hotel.checkOut}</Detail>
            <Detail label="Nights" hideIfEmpty>{snapshot.hotel.nights}</Detail>
            <Detail label="Meal plan" hideIfEmpty>{snapshot.hotel.mealPlan}</Detail>
            <Detail label="Rooms" hideIfEmpty>{snapshot.hotel.roomCount}</Detail>
            <Detail label="Assigned pax" hideIfEmpty>{snapshot.hotel.assignedPax}</Detail>
            <Detail label="Special requests" hideIfEmpty>{snapshot.hotel.specialRequests}</Detail>
            <Detail label="Emergency contact" hideIfEmpty>
              {[snapshot.hotel.emergencyContact?.phone, snapshot.hotel.emergencyContact?.email].filter(Boolean).join(' · ') || null}
            </Detail>
          </div>
        </section>
      ) : null}

      {/* Dispatch-grade rooming card: each room as its own block with guest
          names, room type, occupancy, meal plan inline. Hotel front desk uses
          this to find guests at check-in. */}
      {snapshot.hotel?.occupancy && snapshot.hotel.occupancy.length > 0 ? (
        <section className="admin-card">
          <p className="eyebrow">Rooming</p>
          <h2>Guest assignments</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {snapshot.hotel.occupancy.map((room, idx) => {
              const label = `Room ${room.roomNumber ?? idx + 1}`;
              const inlineMeta = [
                room.roomType,
                formatRoomOccupancy(room.occupancy),
                snapshot.hotel?.mealPlan,
              ]
                .filter(Boolean)
                .join(' · ');
              const passengers = Array.isArray(room.passengers) ? room.passengers : [];
              return (
                <div
                  key={idx}
                  style={{
                    border: '1px solid #d8e0eb',
                    borderRadius: 8,
                    padding: '0.75rem 0.9rem',
                    background: '#fbfcfd',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem' }}>
                    <strong>{label}</strong>
                    {inlineMeta ? <span style={{ color: '#667085', fontSize: '0.85rem' }}>{inlineMeta}</span> : null}
                  </div>
                  {passengers.length > 0 ? (
                    <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.25rem' }}>
                      {passengers.map((p, pidx) => (
                        <li key={pidx}>
                          {[p.title, p.fullName || [p.firstName, p.lastName].filter(Boolean).join(' ')]
                            .filter(Boolean)
                            .join(' ') || 'Guest name pending'}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p style={{ margin: '0.4rem 0 0', color: '#b54708' }}>No guests assigned to this room yet.</p>
                  )}
                  {room.notes ? (
                    <p style={{ margin: '0.4rem 0 0', color: '#667085', fontSize: '0.85rem' }}>{room.notes}</p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {snapshot.activity ? (
        <section className="admin-card">
          <p className="eyebrow">Activity</p>
          <h2>Activity details</h2>
          <div className="voucher-detail-grid">
            <Detail label="Meeting point" hideIfEmpty>{snapshot.activity.meetingPoint}</Detail>
            <Detail label="Start time" hideIfEmpty>{snapshot.activity.startTime}</Detail>
            <Detail label="Total participants" hideIfEmpty>{snapshot.activity.participants?.total}</Detail>
            <Detail label="Adults" hideIfEmpty>{snapshot.activity.participants?.adults}</Detail>
            <Detail label="Children" hideIfEmpty>{snapshot.activity.participants?.children}</Detail>
            <Detail label="Assigned guide" hideIfEmpty>{snapshot.activity.assignedGuide}</Detail>
            <Detail label="Guide phone" hideIfEmpty>{snapshot.activity.assignedGuidePhone}</Detail>
          </div>
          {snapshot.activity.inclusions && snapshot.activity.inclusions.length > 0 ? (
            <div style={{ marginTop: '0.75rem' }}>
              <p className="eyebrow" style={{ fontSize: '0.75rem' }}>Inclusions</p>
              <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                {snapshot.activity.inclusions.map((item, idx) => <li key={idx}>{item}</li>)}
              </ul>
            </div>
          ) : null}
          {snapshot.activity.exclusions && snapshot.activity.exclusions.length > 0 ? (
            <div style={{ marginTop: '0.75rem' }}>
              <p className="eyebrow" style={{ fontSize: '0.75rem' }}>Exclusions</p>
              <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                {snapshot.activity.exclusions.map((item, idx) => <li key={idx}>{item}</li>)}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {snapshot.guide ? (
        <section className="admin-card">
          <p className="eyebrow">Guide</p>
          <h2>{snapshot.guide.guideName || 'Guide'}</h2>
          <div className="voucher-detail-grid">
            <Detail label="Languages" hideIfEmpty>
              {Array.isArray(snapshot.guide.guideLanguages) && snapshot.guide.guideLanguages.length > 0
                ? snapshot.guide.guideLanguages.join(', ')
                : null}
            </Detail>
            <Detail label="Reporting time" hideIfEmpty>{snapshot.guide.reportingTime}</Detail>
            <Detail label="Working hours" hideIfEmpty>{snapshot.guide.workingHours}</Detail>
            <Detail label="Phone" hideIfEmpty>{snapshot.guide.phone}</Detail>
            <Detail label="Email" hideIfEmpty>{snapshot.guide.email}</Detail>
          </div>
        </section>
      ) : null}

      <section className="admin-card">
        <p className="eyebrow">Manifest</p>
        <h2>Passenger records</h2>
        <div className="voucher-detail-grid">
          <Detail label="Records">
            {snapshot.passengerManifest?.total ?? 0}
            {snapshot.passengerManifest?.expected ? ` of ${snapshot.passengerManifest.expected} expected` : ''}
          </Detail>
          <Detail label="Names pending">{snapshot.passengerManifest?.namesPending}</Detail>
          <Detail label="Complete">{snapshot.passengerManifest?.complete ? 'Yes' : 'No'}</Detail>
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

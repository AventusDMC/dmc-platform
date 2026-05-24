'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type RecoveryRow = {
  bookingId: string;
  serviceId: string;
  operationType: string | null;
  serviceType: string | null;
  supplierName: string | null;
};

// Returns the type-aware recovery action set per the spec:
//   Transport: Reassign Driver / Reassign Vehicle / Replace Supplier / Delay Pickup / Cancel
//   Guide:     Replace Guide / Delay Tour / Escalate
//   Hotel:     Move Hotel / Reassign Rooming / Escalate Overbooking
//   Activity:  Delay Activity / Replace Supplier / Reschedule
function actionsFor(row: RecoveryRow) {
  const type = String(row.operationType || row.serviceType || '').toUpperCase();
  const isTransport = type === 'TRANSPORT' || /TRANSFER|TRANSPORT/.test(type);
  const isHotel = type === 'HOTEL' || /ACCOMMODATION|LODGING/.test(type);
  const isGuide = type === 'GUIDE' || /GUIDE/.test(type);
  const isActivity = ['ACTIVITY', 'EXCURSION', 'TICKET'].includes(type) || /ACTIVITY|EXCURSION|TICKET/.test(type);
  if (isTransport) return ['reassign-driver', 'reassign-vehicle', 'replace-supplier', 'delay-pickup', 'cancel-transfer'] as const;
  if (isHotel) return ['move-hotel', 'reassign-rooming', 'escalate-overbooking'] as const;
  if (isGuide) return ['replace-guide', 'delay-tour', 'escalate-language'] as const;
  if (isActivity) return ['delay-activity', 'replace-supplier', 'reschedule'] as const;
  return ['replace-supplier', 'delay-pickup'] as const;
}

const ACTION_META: Record<string, { label: string; tone: 'primary' | 'warning' | 'danger'; description: string }> = {
  'reassign-driver': { label: 'Reassign driver', tone: 'primary', description: 'Pick a new driver via the operations grid' },
  'reassign-vehicle': { label: 'Reassign vehicle', tone: 'primary', description: 'Pick a new vehicle via the operations grid' },
  'replace-supplier': { label: 'Replace supplier', tone: 'warning', description: 'Open the operations grid to assign a new supplier' },
  'delay-pickup': { label: 'Delay pickup', tone: 'warning', description: 'Push the pickup time by N minutes' },
  'cancel-transfer': { label: 'Cancel transfer', tone: 'danger', description: 'Mark this row CANCELLED in the execution lifecycle' },
  'move-hotel': { label: 'Move hotel (manual)', tone: 'warning', description: 'Open the booking to coordinate a manual hotel swap' },
  'reassign-rooming': { label: 'Reassign rooming', tone: 'warning', description: 'Open the rooming editor for this booking' },
  'escalate-overbooking': { label: 'Escalate', tone: 'danger', description: 'Bump severity to CRITICAL — needs management attention' },
  'replace-guide': { label: 'Replace guide', tone: 'primary', description: 'Pick a new guide via the operations grid' },
  'delay-tour': { label: 'Delay tour', tone: 'warning', description: 'Push the activity start by N minutes' },
  'escalate-language': { label: 'Escalate', tone: 'danger', description: 'Bump severity to HIGH — language mismatch flagged' },
  'delay-activity': { label: 'Delay activity', tone: 'warning', description: 'Push the activity start by N minutes' },
  reschedule: { label: 'Reschedule (manual)', tone: 'warning', description: 'Open the booking to reschedule manually' },
};

const TONE_COLOR: Record<'primary' | 'warning' | 'danger', { bg: string; text: string; border: string }> = {
  primary: { bg: '#175cd3', text: '#ffffff', border: '#175cd3' },
  warning: { bg: '#b54708', text: '#ffffff', border: '#b54708' },
  danger: { bg: '#b42318', text: '#ffffff', border: '#b42318' },
};

export function RecoveryActions({ row }: { row: RecoveryRow }) {
  const actions = actionsFor(row);
  const opsGridHref = `/bookings/${row.bookingId}/operations`;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
        {actions.map((action) => (
          <ActionControl key={action} action={action} row={row} opsGridHref={opsGridHref} />
        ))}
      </div>
      <details style={{ fontSize: '0.82rem' }}>
        <summary style={{ cursor: 'pointer', color: '#175cd3', fontWeight: 600 }}>
          Replacement suggestions & cascading impact
        </summary>
        <PanelSuggestions serviceId={row.serviceId} />
        <PanelImpact serviceId={row.serviceId} />
      </details>
    </div>
  );
}

function ActionControl({
  action,
  row,
  opsGridHref,
}: {
  action: string;
  row: RecoveryRow;
  opsGridHref: string;
}) {
  const meta = ACTION_META[action] || { label: action, tone: 'primary' as const, description: '' };
  const t = TONE_COLOR[meta.tone];
  // Actions that route to existing tooling — most reassignments live in the
  // operations grid; rooming has its own editor. These render as Link buttons.
  if (['reassign-driver', 'reassign-vehicle', 'replace-supplier', 'replace-guide', 'move-hotel', 'reassign-rooming', 'reschedule'].includes(action)) {
    const href = action === 'reassign-rooming' ? `/bookings/${row.bookingId}?tab=rooming` : opsGridHref;
    return (
      <Link
        href={href}
        title={meta.description}
        style={{
          background: t.bg,
          color: t.text,
          border: `1px solid ${t.border}`,
          padding: '0.45rem 0.8rem',
          borderRadius: 8,
          fontWeight: 700,
          fontSize: '0.82rem',
          textDecoration: 'none',
        }}
      >
        {meta.label}
      </Link>
    );
  }
  // Actions that POST to a recovery endpoint.
  if (action === 'delay-pickup' || action === 'delay-tour' || action === 'delay-activity') {
    return (
      <form method="POST" action={`/api/bookings/services/${row.serviceId}/recovery/delay`} style={{ margin: 0, display: 'inline-flex', gap: '0.25rem', alignItems: 'center' }}>
        <input type="hidden" name="reason" value={`Operator-initiated ${meta.label}`} />
        <input
          type="number"
          name="minutes"
          defaultValue={action === 'delay-tour' ? 30 : 15}
          min={1}
          max={480}
          step={1}
          style={{ width: '4rem', padding: '0.3rem 0.4rem', border: '1px solid #d0d5dd', borderRadius: 4, fontSize: '0.85rem' }}
          aria-label={`${meta.label} minutes`}
          title="Minutes to delay"
        />
        <button
          type="submit"
          title={meta.description}
          style={{
            background: t.bg,
            color: t.text,
            border: `1px solid ${t.border}`,
            padding: '0.45rem 0.8rem',
            borderRadius: 8,
            fontWeight: 700,
            fontSize: '0.82rem',
            cursor: 'pointer',
          }}
        >
          {meta.label}
        </button>
      </form>
    );
  }
  if (action === 'escalate-overbooking' || action === 'escalate-language') {
    const severity = action === 'escalate-overbooking' ? 'CRITICAL' : 'HIGH';
    return (
      <form method="POST" action={`/api/bookings/services/${row.serviceId}/recovery/escalate`} style={{ margin: 0, display: 'inline' }}>
        <input type="hidden" name="severity" value={severity} />
        <input type="hidden" name="notes" value={meta.label} />
        <button
          type="submit"
          title={meta.description}
          style={{
            background: t.bg,
            color: t.text,
            border: `1px solid ${t.border}`,
            padding: '0.45rem 0.8rem',
            borderRadius: 8,
            fontWeight: 700,
            fontSize: '0.82rem',
            cursor: 'pointer',
          }}
        >
          {meta.label}
        </button>
      </form>
    );
  }
  if (action === 'cancel-transfer') {
    // Reuses the existing execution proxy with action=cancel.
    return (
      <form method="POST" action={`/api/bookings/services/${row.serviceId}/execution`} style={{ margin: 0, display: 'inline' }}>
        <input type="hidden" name="action" value="cancel" />
        <input type="hidden" name="returnTo" value="/operations/recovery" />
        <button
          type="submit"
          title={meta.description}
          style={{
            background: t.bg,
            color: t.text,
            border: `1px solid ${t.border}`,
            padding: '0.45rem 0.8rem',
            borderRadius: 8,
            fontWeight: 700,
            fontSize: '0.82rem',
            cursor: 'pointer',
          }}
        >
          {meta.label}
        </button>
      </form>
    );
  }
  return null;
}

// Server-rendered fetch inside a client component would normally need
// useEffect — but for v1 these collapsible panels do their own fetch on
// expand via the browser. Simpler: render placeholder + load on open.
function PanelSuggestions({ serviceId }: { serviceId: string }) {
  return (
    <div style={{ marginTop: '0.5rem' }}>
      <p style={{ margin: 0, color: '#475467', fontSize: '0.78rem' }}>
        <strong>Suggestions</strong> · alternative suppliers / drivers / vehicles for this row
      </p>
      <SuggestionsFetcher serviceId={serviceId} />
    </div>
  );
}

function PanelImpact({ serviceId }: { serviceId: string }) {
  return (
    <div style={{ marginTop: '0.75rem' }}>
      <p style={{ margin: 0, color: '#475467', fontSize: '0.78rem' }}>
        <strong>Cascading impact</strong> · downstream operations affected by this incident
      </p>
      <ImpactFetcher serviceId={serviceId} />
    </div>
  );
}

// Client-side fetchers — load on first reveal.
function SuggestionsFetcher({ serviceId }: { serviceId: string }) {
  return (
    <ClientFetch
      url={`/api/bookings/services/${serviceId}/recovery/suggestions`}
      render={(data: any) => {
        if (!data) return <p style={{ color: '#98a2b3', fontSize: '0.8rem' }}>Loading suggestions…</p>;
        const suppliers = data.suppliers || [];
        const drivers = data.drivers || [];
        const vehicles = data.vehicles || [];
        const guides = data.guides || [];
        if (suppliers.length === 0 && drivers.length === 0 && vehicles.length === 0 && guides.length === 0) {
          return <p style={{ color: '#667085', fontSize: '0.82rem' }}>No alternative resources found in the system.</p>;
        }
        return (
          <ul style={{ margin: '0.4rem 0 0', padding: '0 0 0 1.1rem', color: '#475467', fontSize: '0.82rem', lineHeight: 1.6 }}>
            {suppliers.length > 0 ? (
              <li>
                <strong>Suppliers ({suppliers.length}):</strong>{' '}
                {suppliers
                  .slice(0, 5)
                  .map((s: any) => s.name)
                  .join(' · ')}
                {suppliers.length > 5 ? ` + ${suppliers.length - 5} more` : ''}
              </li>
            ) : null}
            {drivers.length > 0 ? (
              <li>
                <strong>Drivers ({drivers.length}):</strong>{' '}
                {drivers
                  .slice(0, 5)
                  .map((d: any) => `${d.fullName}${d.phone ? ` (${d.phone})` : ''}`)
                  .join(' · ')}
                {drivers.length > 5 ? ` + ${drivers.length - 5} more` : ''}
              </li>
            ) : null}
            {vehicles.length > 0 ? (
              <li>
                <strong>Vehicles ({vehicles.length}):</strong>{' '}
                {vehicles
                  .slice(0, 5)
                  .map((v: any) => `${v.name}${v.plateNumber ? ` (${v.plateNumber})` : ''}`)
                  .join(' · ')}
                {vehicles.length > 5 ? ` + ${vehicles.length - 5} more` : ''}
              </li>
            ) : null}
            {guides.length > 0 ? (
              <li>
                <strong>Guides ({guides.length}):</strong>{' '}
                {guides
                  .slice(0, 5)
                  .map((g: any) => g.fullName)
                  .join(' · ')}
                {guides.length > 5 ? ` + ${guides.length - 5} more` : ''}
              </li>
            ) : null}
          </ul>
        );
      }}
    />
  );
}

function ImpactFetcher({ serviceId }: { serviceId: string }) {
  return (
    <ClientFetch
      url={`/api/bookings/services/${serviceId}/recovery/impact`}
      render={(data: any) => {
        if (!data) return <p style={{ color: '#98a2b3', fontSize: '0.8rem' }}>Loading impact…</p>;
        const sameDay = data.affectedSameDay || [];
        const summary = (
          <ul style={{ margin: '0.4rem 0 0', padding: '0 0 0 1.1rem', color: '#475467', fontSize: '0.82rem', lineHeight: 1.6 }}>
            <li>
              <strong>Downstream services:</strong> {data.affectedDownstream || 0} total · {sameDay.length} same-day
            </li>
            <li>
              <strong>Passengers:</strong> {data.affectedPassengers || 0}
            </li>
            <li>
              <strong>Rooming groups:</strong> {data.affectedRoomingGroups || 0}
            </li>
            <li>
              <strong>Vouchers pending:</strong> {data.affectedVouchersPending || 0}
            </li>
          </ul>
        );
        return (
          <>
            {summary}
            {sameDay.length > 0 ? (
              <ul style={{ margin: '0.5rem 0 0', padding: '0 0 0 1.1rem', color: '#475467', fontSize: '0.78rem' }}>
                {sameDay.slice(0, 5).map((d: any) => (
                  <li key={d.id}>
                    {d.time || '—'} · {d.description}
                    {d.operationType ? ` (${d.operationType})` : ''}
                    {d.executionStatus && d.executionStatus !== 'READY' ? ` · ${d.executionStatus}` : ''}
                  </li>
                ))}
                {sameDay.length > 5 ? <li>+ {sameDay.length - 5} more</li> : null}
              </ul>
            ) : null}
          </>
        );
      }}
    />
  );
}

// Tiny client-side fetcher — loads on mount, renders via render-prop.
function ClientFetch<T>({ url, render }: { url: string; render: (data: T | null) => any }) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(url, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e.message || e));
      });
    return () => {
      cancelled = true;
    };
  }, [url]);
  if (error) return <p style={{ color: '#b42318', fontSize: '0.8rem' }}>Could not load: {error}</p>;
  return render(data);
}

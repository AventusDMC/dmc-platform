'use client';

import { useState } from 'react';
import type { VoucherPreviewVM } from '../../../app/operations/v2/ops-voucher-preview-vm';

/**
 * Booking Operations V2 — Phase 2D voucher preview control.
 *
 * READ-ONLY. Opens an inline panel that fetches the sanitized preview VM (GET
 * only, server-sanitized) and renders safe operational details. It never sends,
 * downloads, prints, exports, embeds a PDF, or mutates anything — the panel has
 * a Close only. On error it shows an inline message + "Open in Classic".
 *
 * Allowlisted by the read-only invariant as a preview surface (GET only).
 */

export function voucherPreviewPath(bookingId: string, operationId: string): string {
  return `/api/operations/v2/${bookingId}/${operationId}/voucher-preview`;
}

function Line({ label, value }: { label: string; value: string | number | null }) {
  if (value === null || value === '') return null;
  return (
    <div className="flex justify-between gap-3 py-0.5">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="text-[11px] font-medium text-foreground text-right">{value}</span>
    </div>
  );
}

function PreviewBody({ vm }: { vm: VoucherPreviewVM }) {
  return (
    <div className="mt-2 space-y-0.5">
      <Line label="Voucher" value={vm.voucherType} />
      <Line label="Status" value={vm.status} />
      <Line label="Service" value={vm.serviceName} />
      <Line label="Type" value={vm.serviceType} />
      <Line label="Supplier" value={vm.supplierName} />
      <Line label="Date" value={vm.date} />
      <Line label="Time" value={vm.time} />
      <Line label="Pax" value={vm.paxCount} />
      <Line label="Meeting point" value={vm.meetingPoint} />
      {vm.transport ? (
        <div className="mt-1 border-t border-border pt-1">
          <Line label="Route" value={vm.transport.route} />
          <Line label="Vehicle" value={vm.transport.vehicleType} />
          <Line label="Pickup" value={vm.transport.pickup} />
          <Line label="Pickup time" value={vm.transport.pickupTime} />
          <Line label="Dropoff" value={vm.transport.dropoff} />
        </div>
      ) : null}
      {vm.hotel ? (
        <div className="mt-1 border-t border-border pt-1">
          <Line label="Check-in" value={vm.hotel.checkIn} />
          <Line label="Check-out" value={vm.hotel.checkOut} />
          <Line label="Nights" value={vm.hotel.nights} />
          <Line label="Meal plan" value={vm.hotel.mealPlan} />
          <Line label="Occupancy" value={vm.hotel.occupancy} />
          <Line label="Rooming" value={vm.hotel.roomingSummary} />
        </div>
      ) : null}
      {vm.activity ? (
        <div className="mt-1 border-t border-border pt-1">
          <Line label="Meeting point" value={vm.activity.meetingPoint} />
          <Line label="Start time" value={vm.activity.startTime} />
          <Line label="Inclusions" value={vm.activity.inclusions} />
        </div>
      ) : null}
      {vm.operationalNotes ? (
        <div className="mt-1 border-t border-border pt-1">
          <Line label="Operational notes" value={vm.operationalNotes} />
        </div>
      ) : null}
    </div>
  );
}

export function VoucherPreviewControl({
  bookingId,
  operationId,
  defaultOpen,
}: {
  bookingId: string;
  operationId: string;
  /** Test-only: render with the panel already open (defaults closed in the app). */
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<VoucherPreviewVM | null>(null);

  const classicHref = `/bookings/${bookingId}/operations/${operationId}/voucher`;

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(voucherPreviewPath(bookingId, operationId), { cache: 'no-store' });
      if (!res.ok) {
        setError('Could not load the voucher preview.');
        return;
      }
      const data = (await res.json()) as VoucherPreviewVM;
      setPreview(data);
    } catch {
      setError('Could not load the voucher preview.');
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (!preview && !loading) void load();
  }

  return (
    <div className="relative inline-flex items-center gap-2">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="inline-flex h-7 items-center gap-1 rounded-md border border-input bg-background px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Preview
      </button>

      {open ? (
        <div className="absolute left-0 top-9 z-20 w-80 rounded-lg border border-border bg-card p-3 text-left shadow-md">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-foreground">Voucher preview</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs text-muted-foreground hover:underline"
            >
              Close
            </button>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Preview only. No email is sent and nothing is downloaded.
          </p>

          {loading ? <p className="mt-2 text-[11px] text-muted-foreground">Loading…</p> : null}

          {error ? (
            <div className="mt-2">
              <p className="text-[11px] text-destructive">{error}</p>
              <a href={classicHref} className="text-[11px] text-primary hover:underline">
                Open in Classic
              </a>
            </div>
          ) : null}

          {preview && !error ? <PreviewBody vm={preview} /> : null}
        </div>
      ) : null}
    </div>
  );
}

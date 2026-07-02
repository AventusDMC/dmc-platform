'use client';

import { useState } from 'react';

/**
 * Booking Operations V2 — Phase 2F-A voucher SEND-PREVIEW / readiness control.
 *
 * READ-ONLY. Opens an inline panel that GETs the server-built send-preview and
 * shows WHO a voucher email would go to (the assigned operational supplier), the
 * subject, a body summary, the attachment name, and the send readiness. It never
 * sends, emails, downloads, prints, exports, or mutates anything — a Close only.
 * The actual send does not exist yet. On error it shows an inline message +
 * "Open in Classic". Read-only (GET), so it is NOT a mutation.
 */

export type VoucherSendPreviewVM = {
  bookingId: string;
  operationId: string;
  bookingRef: string | null;
  voucherType: string | null;
  voucherStatus: string | null;
  recipient: {
    recipientSource: 'assignedOperationalSupplier' | 'none';
    supplierId: string | null;
    supplierName: string | null;
    email: string | null;
    emails: string[];
    missingEmail: boolean;
    invalidEmail: boolean;
  };
  subject: string | null;
  bodySummary: string | null;
  attachmentName: string | null;
  readiness: string;
  readinessReason: string;
  blockingReasons: string[];
  note: string;
};

export function voucherSendPreviewPath(bookingId: string, operationId: string): string {
  return `/api/operations/v2/${bookingId}/${operationId}/voucher-send-preview`;
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

function ReadinessBadge({ readiness }: { readiness: string }) {
  const ready = readiness === 'READY';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
        ready ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'
      }`}
    >
      {readiness}
    </span>
  );
}

function Body({ vm }: { vm: VoucherSendPreviewVM }) {
  const emailList = vm.recipient.emails.length ? vm.recipient.emails.join(', ') : null;
  return (
    <div className="mt-2 space-y-0.5">
      <div className="flex items-center justify-between gap-2 py-0.5">
        <span className="text-[11px] text-muted-foreground">Readiness</span>
        <ReadinessBadge readiness={vm.readiness} />
      </div>
      {vm.readiness !== 'READY' ? (
        <p className="text-[11px] text-muted-foreground">{vm.readinessReason}</p>
      ) : null}
      <div className="mt-1 border-t border-border pt-1">
        <Line label="Recipient" value={vm.recipient.supplierName} />
        <Line label="Recipient source" value={vm.recipient.recipientSource} />
        <Line label="Email" value={vm.recipient.email ?? emailList} />
        <Line label="Voucher" value={vm.voucherType} />
        <Line label="Status" value={vm.voucherStatus} />
        <Line label="Subject" value={vm.subject} />
        <Line label="Attachment" value={vm.attachmentName} />
      </div>
      {vm.bodySummary ? (
        <div className="mt-1 border-t border-border pt-1">
          <p className="text-[11px] text-muted-foreground">{vm.bodySummary}</p>
        </div>
      ) : null}
    </div>
  );
}

export function VoucherSendPreviewControl({
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
  const [preview, setPreview] = useState<VoucherSendPreviewVM | null>(null);

  const classicHref = `/bookings/${bookingId}/operations/${operationId}/voucher`;

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(voucherSendPreviewPath(bookingId, operationId), { cache: 'no-store' });
      if (!res.ok) {
        setError('Could not load the send preview.');
        return;
      }
      const data = (await res.json()) as VoucherSendPreviewVM;
      setPreview(data);
    } catch {
      setError('Could not load the send preview.');
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
        Send preview
      </button>

      {open ? (
        <div className="absolute left-0 top-9 z-20 w-80 rounded-lg border border-border bg-card p-3 text-left shadow-md">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-foreground">Voucher send preview</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs text-muted-foreground hover:underline"
            >
              Close
            </button>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">Preview only. No email is sent.</p>

          {loading ? <p className="mt-2 text-[11px] text-muted-foreground">Loading…</p> : null}

          {error ? (
            <div className="mt-2">
              <p className="text-[11px] text-destructive">{error}</p>
              <a href={classicHref} className="text-[11px] text-primary hover:underline">
                Open in Classic
              </a>
            </div>
          ) : null}

          {preview && !error ? <Body vm={preview} /> : null}
        </div>
      ) : null}
    </div>
  );
}

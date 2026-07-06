'use client';

import { useEffect, useState } from 'react';

/**
 * Supplier Voucher Packet V2 — S7 read-only "Send readiness" section.
 *
 * Display-only: shows WHO a packet email would go to and WHETHER it could be sent,
 * with blocker chips. It NEVER sends, previews-by-email, or mutates anything — no
 * Send button, no send-preview email, no transmit. Gated by the dedicated
 * NEXT_PUBLIC_OPS_V2_VOUCHER_PACKET_SEND_PREVIEW flag (default OFF); the backend
 * re-enforces the fail-closed OPS_V2_VOUCHER_PACKET_ENABLED flag.
 */

export type VoucherPacketSendPreviewVM = {
  supplierName: string | null;
  recipientEmail: string | null;
  emails: string[];
  serviceCount: number;
  memberLabels: string[];
  readiness: string;
  readinessReason: string;
  blockingReasons: string[];
  note: string;
};

const FLAG_ON = process.env.NEXT_PUBLIC_OPS_V2_VOUCHER_PACKET_SEND_PREVIEW === 'true';

// Pure presentational view — exported for unit rendering (no fetch, no flag).
export function VoucherPacketSendReadinessView({ preview }: { preview: VoucherPacketSendPreviewVM }) {
  const ready = preview.readiness === 'READY';
  return (
    <section aria-label="Send readiness" className="mt-2 rounded-md border border-border bg-muted/40 p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-foreground">Send readiness — preview only</span>
        <span
          className={
            ready
              ? 'inline-flex items-center rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-success'
              : 'inline-flex items-center rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning'
          }
        >
          {ready ? 'Ready to send' : 'Not ready'}
        </span>
      </div>

      <p className="mt-1 text-[11px] text-muted-foreground">Preview only. No email is sent.</p>

      <p className="mt-1 text-[11px] text-foreground">
        {preview.recipientEmail
          ? `Would send to: ${preview.supplierName ?? 'Assigned supplier'} — ${preview.recipientEmail}`
          : 'No single valid recipient resolved from the assigned supplier.'}
      </p>

      {preview.blockingReasons.length ? (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {preview.blockingReasons.map((reason, i) => (
            <li
              key={`blocker-${i}`}
              className="inline-flex items-center rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[11px] text-warning"
            >
              {reason}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

// Client wrapper — self-gates on the frontend flag, fetches the read-only preview.
export function VoucherPacketSendReadiness({ bookingId, packetId }: { bookingId: string; packetId: string }) {
  const [preview, setPreview] = useState<VoucherPacketSendPreviewVM | null>(null);

  useEffect(() => {
    if (!FLAG_ON) return;
    let alive = true;
    fetch(`/api/bookings/${bookingId}/voucher-packets/${packetId}/send-preview`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive) setPreview(d);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [bookingId, packetId]);

  if (!FLAG_ON || !preview) return null;
  return <VoucherPacketSendReadinessView preview={preview} />;
}

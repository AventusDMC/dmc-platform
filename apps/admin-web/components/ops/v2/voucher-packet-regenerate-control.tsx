'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * Supplier Voucher Packet V2 — S6 regenerate control.
 *
 * A sanctioned mutating control shown ONLY for a STALE, generated packet (its
 * stored contentHash no longer matches the current grouping). It:
 *  - POSTs .../voucher-packets/:packetId/regenerate with NO body,
 *  - rebuilds the packet snapshot/items/contentHash in place (same packetId,
 *    status stays GENERATED) — the mutation lives entirely in the backend,
 *  - never sends, previews, emails, downloads, prints, exports, or changes
 *    packet status; touches no supplier-send / allowlist action,
 *  - on success: router.refresh() so the stale badge clears.
 *
 * The Download PDF affordance (S5) and "Open in Classic" stay independent of
 * this control.
 */
export function VoucherPacketRegenerateControl({
  bookingId,
  packetId,
}: {
  bookingId: string;
  packetId: string;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/voucher-packets/${packetId}/regenerate`, {
        method: 'POST',
        cache: 'no-store',
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        let message = 'Failed to regenerate the packet.';
        if (data?.message) {
          message = String(Array.isArray(data.message) ? data.message.join(', ') : data.message);
        }
        setError(message);
        return;
      }
      router.refresh();
    } catch {
      setError('Failed to regenerate the packet.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={submitting}
        onClick={submit}
        className="inline-flex h-7 items-center rounded-md border border-input bg-background px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {submitting ? 'Regenerating…' : 'Regenerate'}
      </button>
      {error ? <span className="text-[11px] text-destructive">{error}</span> : null}
    </span>
  );
}

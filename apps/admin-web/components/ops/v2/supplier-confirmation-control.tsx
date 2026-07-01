'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  buildSupplierConfirmRequest,
  isSupplierConfirmStatus,
  requiresAssignedSupplier,
  SUPPLIER_CONFIRM_STATUS,
  type SupplierConfirmStatus,
} from '../../../app/operations/v2/ops-supplier-confirm-request';

/**
 * Booking Operations V2 — Phase 2B manual supplier confirmation control.
 *
 * A sanctioned mutating control (allowlisted by the read-only invariant).
 * Strictly RECORDS the supplier confirmation outcome manually:
 *  - status picker limited to Confirmed / Rejected,
 *  - both require an assigned supplier (else disabled + helper),
 *  - PATCH .../confirmation with supplierConfirmationStatus ONLY,
 *  - never sends emails or requests, and touches no voucher, document, finance,
 *    or dispatch action,
 *  - on success: shows "Saved", closes, and router.refresh().
 *
 * "Open in Classic" stays visible at the workspace level regardless of this
 * control — it is never hidden.
 */

type Choice = { value: SupplierConfirmStatus; label: string };

const CHOICES: Choice[] = [
  { value: SUPPLIER_CONFIRM_STATUS.CONFIRMED, label: 'Confirmed' },
  { value: SUPPLIER_CONFIRM_STATUS.REJECTED, label: 'Rejected' },
];

export function SupplierConfirmationControl({
  bookingId,
  operationId,
  currentStatus,
  hasSupplier,
  defaultOpen,
}: {
  bookingId: string;
  operationId: string;
  currentStatus: string | null;
  hasSupplier: boolean;
  /** Test-only: render with the panel already open (defaults closed in the app). */
  defaultOpen?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(Boolean(defaultOpen));
  const initial = isSupplierConfirmStatus(currentStatus) ? currentStatus : '';
  const [selected, setSelected] = useState<string>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function openPanel() {
    setOpen(true);
    setError(null);
    setSaved(false);
    setSelected(isSupplierConfirmStatus(currentStatus) ? currentStatus : '');
  }

  async function submit() {
    if (!isSupplierConfirmStatus(selected)) return;
    const req = buildSupplierConfirmRequest(bookingId, operationId, selected);
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(req.url, {
        method: req.method,
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify(req.body),
      });
      if (!res.ok) {
        let message = 'Failed to record the confirmation status.';
        try {
          const data = await res.json();
          if (data?.message) {
            message = String(Array.isArray(data.message) ? data.message.join(', ') : data.message);
          }
        } catch {
          /* keep the generic message */
        }
        setError(message);
        return;
      }
      setSaved(true);
      setOpen(false);
      router.refresh();
    } catch {
      setError('Failed to record the confirmation status.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openPanel())}
        aria-expanded={open}
        className="inline-flex h-7 items-center gap-1 rounded-md border border-input bg-background px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Record confirmation
      </button>
      {saved ? <span className="text-xs font-medium text-success">Saved</span> : null}

      {open ? (
        <div className="absolute left-0 top-9 z-20 w-72 rounded-lg border border-border bg-card p-3 text-left shadow-md">
          <p className="text-xs font-semibold text-foreground">Record supplier confirmation outcome manually</p>
          <p className="mt-1 text-[11px] text-muted-foreground">Records status only — no email or request is sent.</p>

          <select
            aria-label="Confirmation status"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            disabled={submitting}
            className="mt-2 w-full rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground"
          >
            <option value="" disabled>
              Select status…
            </option>
            {CHOICES.map((c) => (
              <option key={c.value} value={c.value} disabled={requiresAssignedSupplier(c.value) && !hasSupplier}>
                {c.label}
              </option>
            ))}
          </select>

          {!hasSupplier ? (
            <p className="mt-2 text-[11px] text-muted-foreground">Assign a supplier before recording confirmation.</p>
          ) : null}

          {error ? <p className="mt-2 text-[11px] text-destructive">{error}</p> : null}

          <div className="mt-3 flex items-center justify-between gap-2">
            <button
              type="button"
              disabled={submitting || !isSupplierConfirmStatus(selected)}
              onClick={submit}
              className="inline-flex h-7 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-60"
            >
              {submitting ? 'Saving…' : 'Confirm'}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs text-muted-foreground hover:underline"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

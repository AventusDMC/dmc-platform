'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { buildSupplierAssignRequest } from '../../../app/operations/v2/ops-supplier-assign-request';

/**
 * Booking Operations V2 — Phase 2A supplier-assignment control.
 *
 * The ONLY mutating control in the V2 ops surface (allowlisted by the read-only
 * invariant). Strictly supplier assignment:
 *  - lazy-loads suppliers from GET /api/suppliers on first open,
 *  - assigns / changes / unassigns via PATCH .../assign-supplier with
 *    assignmentStatus 'ASSIGNED' | 'UNASSIGNED' ONLY,
 *  - stays strictly within supplier assignment (no confirmation, voucher,
 *    finance, document, or operational-timing calls),
 *  - on success: shows a simple "Saved" state, closes, and router.refresh().
 *
 * "Open in Classic" stays visible at the workspace level regardless of this
 * control — it is never hidden.
 */

type SupplierOption = { id: string; name: string };

export function SupplierAssignmentControl({
  bookingId,
  operationId,
  currentSupplierId,
  currentSupplierLabel,
}: {
  bookingId: string;
  operationId: string;
  currentSupplierId: string | null;
  currentSupplierLabel: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [suppliers, setSuppliers] = useState<SupplierOption[] | null>(null);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);
  const [selected, setSelected] = useState<string>(currentSupplierId ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const hasSupplier = Boolean(currentSupplierId);
  const triggerLabel = hasSupplier ? 'Change supplier' : 'Assign supplier';

  async function openPanel() {
    setOpen(true);
    setError(null);
    setSaved(false);
    setSelected(currentSupplierId ?? '');
    if (suppliers === null && !loadingSuppliers) {
      setLoadingSuppliers(true);
      try {
        const res = await fetch('/api/suppliers', { cache: 'no-store' });
        if (!res.ok) throw new Error('load failed');
        const data = (await res.json()) as SupplierOption[];
        setSuppliers(Array.isArray(data) ? data : []);
      } catch {
        setError('Could not load suppliers. You can continue in Classic.');
      } finally {
        setLoadingSuppliers(false);
      }
    }
  }

  async function submit(assignedSupplierId: string | null) {
    const req = buildSupplierAssignRequest(bookingId, operationId, assignedSupplierId);
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
        let message = 'Failed to update the supplier assignment.';
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
      setError('Failed to update the supplier assignment.');
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
        {triggerLabel}
      </button>
      {saved ? <span className="text-xs font-medium text-success">Saved</span> : null}

      {open ? (
        <div className="absolute left-0 top-9 z-20 w-72 rounded-lg border border-border bg-card p-3 text-left shadow-md">
          <p className="text-xs font-semibold text-foreground">Supplier assignment</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Current: {currentSupplierLabel ?? 'Unassigned'}
          </p>

          {loadingSuppliers ? (
            <p className="mt-2 text-xs text-muted-foreground">Loading suppliers…</p>
          ) : (
            <select
              aria-label="Supplier"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              disabled={submitting}
              className="mt-2 w-full rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground"
            >
              <option value="">Unassigned</option>
              {(suppliers ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}

          {error ? <p className="mt-2 text-[11px] text-destructive">{error}</p> : null}

          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={submitting || loadingSuppliers}
                onClick={() => submit(selected || null)}
                className="inline-flex h-7 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-60"
              >
                {submitting ? 'Saving…' : 'Confirm'}
              </button>
              {hasSupplier ? (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => submit(null)}
                  className="inline-flex h-7 items-center rounded-md border border-input px-3 text-xs font-medium text-muted-foreground disabled:opacity-60"
                >
                  Unassign
                </button>
              ) : null}
            </div>
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

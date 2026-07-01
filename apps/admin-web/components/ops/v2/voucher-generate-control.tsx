'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { buildVoucherGenerateRequest } from '../../../app/operations/v2/ops-voucher-generate-request';

/**
 * Booking Operations V2 — Phase 2C voucher-generate control.
 *
 * A sanctioned mutating control (allowlisted by the read-only invariant).
 * Strictly GENERATES a voucher RECORD:
 *  - shown only for ELIGIBLE rows (operational supplier assigned + confirmation
 *    CONFIRMED + operational date present + no voucher yet); ineligible rows
 *    render disabled with a plain-language reason,
 *  - PATCH .../voucher/generate with an EMPTY body,
 *  - never sends, downloads, previews, prints, exports, or changes voucher
 *    status; touches no finance, document-email, or dispatch action,
 *  - on success: shows "Generated", surfaces any backend warnings inline
 *    (non-blocking), and router.refresh().
 *
 * "Open in Classic" stays visible at the workspace level regardless of this
 * control — it is never hidden.
 */
export function VoucherGenerateControl({
  bookingId,
  operationId,
  canGenerate,
  ineligibleReason,
  defaultOpen,
}: {
  bookingId: string;
  operationId: string;
  canGenerate: boolean;
  ineligibleReason: string | null;
  /** Test-only: render with the panel already open (defaults closed in the app). */
  defaultOpen?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(Boolean(defaultOpen));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [done, setDone] = useState(false);

  // Ineligible rows: disabled affordance + plain-language reason (never a live
  // control, so no voucher record can be generated).
  if (!canGenerate) {
    return (
      <span className="inline-flex items-center gap-2">
        <span
          aria-disabled="true"
          className="inline-flex h-7 cursor-not-allowed items-center rounded-md border border-dashed border-border bg-muted px-2.5 text-xs font-medium text-muted-foreground"
        >
          Generate voucher
        </span>
        {ineligibleReason ? (
          <span className="text-[11px] text-muted-foreground">{ineligibleReason}</span>
        ) : null}
      </span>
    );
  }

  async function submit() {
    const req = buildVoucherGenerateRequest(bookingId, operationId);
    setSubmitting(true);
    setError(null);
    setWarnings([]);
    try {
      const res = await fetch(req.url, {
        method: req.method,
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify(req.body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        let message = 'Failed to generate the voucher.';
        if (data?.message) {
          message = String(Array.isArray(data.message) ? data.message.join(', ') : data.message);
        }
        setError(message);
        return;
      }
      setWarnings(Array.isArray(data?.warnings) ? data.warnings.map(String) : []);
      setDone(true);
      setOpen(false);
      router.refresh();
    } catch {
      setError('Failed to generate the voucher.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() => {
          if (open) {
            setOpen(false);
          } else {
            setError(null);
            setDone(false);
            setOpen(true);
          }
        }}
        aria-expanded={open}
        className="inline-flex h-7 items-center gap-1 rounded-md border border-input bg-background px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Generate voucher
      </button>
      {done && warnings.length === 0 ? <span className="text-xs font-medium text-success">Generated</span> : null}
      {done && warnings.length > 0 ? (
        <span className="text-xs font-medium text-warning" title={warnings.join(' ')}>
          Generated · {warnings.length} warning{warnings.length === 1 ? '' : 's'}
        </span>
      ) : null}

      {open ? (
        <div className="absolute left-0 top-9 z-20 w-72 rounded-lg border border-border bg-card p-3 text-left shadow-md">
          <p className="text-xs font-semibold text-foreground">Generate voucher record</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Generate voucher record only. No email, download, print, or export.
          </p>

          {error ? <p className="mt-2 text-[11px] text-destructive">{error}</p> : null}

          <div className="mt-3 flex items-center justify-between gap-2">
            <button
              type="button"
              disabled={submitting}
              onClick={submit}
              className="inline-flex h-7 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-60"
            >
              {submitting ? 'Generating…' : 'Generate'}
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

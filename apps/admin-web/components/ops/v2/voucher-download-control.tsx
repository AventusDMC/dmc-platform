'use client';

import { useState } from 'react';

/**
 * Booking Operations V2 — Phase 2E voucher PDF download control.
 *
 * The ONE narrowly-allowlisted download surface. It fetches the sanctioned V2
 * voucher-download proxy (GET) and triggers a browser download of the safe
 * operational PDF. It never sends, emails, prints, exports, or changes voucher
 * status — a small confirm panel with "Download PDF" / Cancel only. On error it
 * shows an inline message + "Open in Classic".
 *
 * The blob/createObjectURL/download mechanic is allowed ONLY in this file (see
 * the read-only invariant's VOUCHER_DOWNLOAD_ALLOWLIST). It is a GET (read), not
 * a mutation.
 */

export function voucherDownloadPath(bookingId: string, operationId: string): string {
  return `/api/operations/v2/${bookingId}/${operationId}/voucher-download`;
}

export function VoucherDownloadControl({
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
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const classicHref = `/bookings/${bookingId}/operations/${operationId}/voucher`;

  async function download() {
    setDownloading(true);
    setError(null);
    try {
      const res = await fetch(voucherDownloadPath(bookingId, operationId), { cache: 'no-store' });
      const contentType = (res.headers.get('content-type') || '').toLowerCase();
      if (!res.ok || !contentType.includes('application/pdf')) {
        setError('Could not download the voucher PDF.');
        return;
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `voucher-${operationId}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      setDone(true);
      setOpen(false);
    } catch {
      setError('Could not download the voucher PDF.');
    } finally {
      setDownloading(false);
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
        Download
      </button>
      {done ? <span className="text-xs font-medium text-success">Downloaded</span> : null}

      {open ? (
        <div className="absolute left-0 top-9 z-20 w-72 rounded-lg border border-border bg-card p-3 text-left shadow-md">
          <p className="text-xs font-semibold text-foreground">Download voucher PDF</p>
          <p className="mt-1 text-[11px] text-muted-foreground">Download voucher PDF only. No email is sent.</p>

          {error ? (
            <div className="mt-2">
              <p className="text-[11px] text-destructive">{error}</p>
              <a href={classicHref} className="text-[11px] text-primary hover:underline">
                Open in Classic
              </a>
            </div>
          ) : null}

          <div className="mt-3 flex items-center justify-between gap-2">
            <button
              type="button"
              disabled={downloading}
              onClick={download}
              className="inline-flex h-7 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-60"
            >
              {downloading ? 'Downloading…' : 'Download PDF'}
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

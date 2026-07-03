'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { VoucherSendPreviewVM } from './voucher-send-preview-control';
import { voucherSendPreviewPath } from './voucher-send-preview-control';
import { buildVoucherSendRequest } from '../../../app/operations/v2/ops-voucher-send-request';

/**
 * Booking Operations V2 — Phase 2F-B ACTUAL voucher send control.
 *
 * The sanctioned send mutation. On open it fetches the 2F-A readiness preview (GET)
 * and shows recipient / subject / body summary / attachment name. It sends an email
 * ONLY when readiness is READY AND the operator types SEND to confirm. The send is a
 * POST with an EMPTY body — the server resolves recipient/subject/body/attachment and
 * gates on the backend flag + allowlist + verified sender. It never downloads, prints,
 * exports, changes voucher status, or accepts a client recipient. Allowlisted by the
 * read-only invariant (VOUCHER_SEND_ALLOWLIST); the typed-SEND input is the only input.
 */

type SendResult = { sent?: boolean; blocked?: boolean; blockedReason?: string | null } | null;

function blockedMessage(reason: string | null | undefined): string {
  switch (reason) {
    case 'feature_disabled':
      return 'Sending is not enabled.';
    case 'recipient_allowlist_required':
      return 'Sending is not configured (recipient allowlist missing).';
    case 'transport_not_configured':
      return 'Email transport is not configured.';
    case 'not_ready':
      return 'This voucher is not ready to send.';
    case 'recipient_not_allowed':
      return 'The supplier email is not on the approved recipient list.';
    case 'duplicate_recent':
      return 'A voucher was just sent to this supplier — please try again shortly.';
    case 'pdf_failed':
      return 'The voucher document could not be generated.';
    case 'send_failed':
      return 'The email could not be sent. Please try again or use Classic.';
    default:
      return 'Could not send the voucher email.';
  }
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

export function VoucherSendControl({
  bookingId,
  operationId,
  defaultOpen,
}: {
  bookingId: string;
  operationId: string;
  /** Test-only: render with the panel already open (defaults closed in the app). */
  defaultOpen?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(Boolean(defaultOpen));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<VoucherSendPreviewVM | null>(null);
  const [typed, setTyped] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const classicHref = `/bookings/${bookingId}/operations/${operationId}/voucher`;
  const isReady = preview?.readiness === 'READY';
  const confirmed = typed.trim() === 'SEND';

  async function loadPreview() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(voucherSendPreviewPath(bookingId, operationId), { cache: 'no-store' });
      if (!res.ok) {
        setError('Could not load the send preview.');
        return;
      }
      setPreview((await res.json()) as VoucherSendPreviewVM);
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
    setSent(false);
    setSendError(null);
    setTyped('');
    if (!preview && !loading) void loadPreview();
  }

  async function send() {
    if (!isReady || !confirmed || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const req = buildVoucherSendRequest(bookingId, operationId);
      const res = await fetch(req.url, {
        method: req.method,
        headers: { 'Content-Type': 'application/json' },
        body: req.body,
        cache: 'no-store',
      });
      const result = (await res.json().catch(() => null)) as SendResult;
      if (result && result.sent === true) {
        setSent(true);
        setOpen(false);
        router.refresh();
      } else {
        setSendError(blockedMessage(result?.blockedReason));
      }
    } catch {
      setSendError(blockedMessage('send_failed'));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="relative inline-flex items-center gap-2">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="inline-flex h-7 items-center gap-1 rounded-md border border-input bg-background px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Send
      </button>
      {sent ? <span className="text-xs font-medium text-success">Sent</span> : null}

      {open ? (
        <div className="absolute left-0 top-9 z-20 w-80 rounded-lg border border-border bg-card p-3 text-left shadow-md">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-foreground">Send voucher</p>
            <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted-foreground hover:underline">
              Close
            </button>
          </div>

          {loading ? <p className="mt-2 text-[11px] text-muted-foreground">Loading…</p> : null}

          {error ? (
            <div className="mt-2">
              <p className="text-[11px] text-destructive">{error}</p>
              <a href={classicHref} className="text-[11px] text-primary hover:underline">
                Open in Classic
              </a>
            </div>
          ) : null}

          {preview && !error && !isReady ? (
            <div className="mt-2">
              <p className="text-[11px] text-muted-foreground">Not ready to send: {preview.readinessReason}</p>
              <a href={classicHref} className="text-[11px] text-primary hover:underline">
                Open in Classic
              </a>
            </div>
          ) : null}

          {preview && !error && isReady ? (
            <div className="mt-2 space-y-0.5">
              <p className="text-[11px] font-semibold text-destructive">This will send an email to the supplier.</p>
              <div className="mt-1 border-t border-border pt-1">
                <Line label="Recipient" value={preview.recipient.supplierName} />
                <Line label="Email" value={preview.recipient.email ?? (preview.recipient.emails || []).join(', ')} />
                <Line label="Subject" value={preview.subject} />
                <Line label="Attachment" value={preview.attachmentName} />
              </div>
              {preview.bodySummary ? (
                <p className="mt-1 border-t border-border pt-1 text-[11px] text-muted-foreground">{preview.bodySummary}</p>
              ) : null}

              <label className="mt-2 block text-[11px] text-muted-foreground" htmlFor="voucher-send-confirm">
                Type <span className="font-semibold text-foreground">SEND</span> to confirm
              </label>
              <input
                id="voucher-send-confirm"
                type="text"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                placeholder="SEND"
                className="mt-1 h-7 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />

              {sendError ? (
                <div className="mt-2">
                  <p className="text-[11px] text-destructive">{sendError}</p>
                  <a href={classicHref} className="text-[11px] text-primary hover:underline">
                    Open in Classic
                  </a>
                </div>
              ) : null}

              <div className="mt-3 flex items-center justify-between gap-2">
                <button
                  type="button"
                  disabled={!confirmed || sending}
                  onClick={send}
                  className="inline-flex h-7 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-60"
                >
                  {sending ? 'Sending…' : 'Send email'}
                </button>
                <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted-foreground hover:underline">
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

'use client';

// Phase O.2B-1 — READ-ONLY supplier-confirmation preview. A "Preview confirmation"
// button fetches the draft (recipient/subject/body/safe service lines per supplier)
// from the read-only GET endpoint and shows it in a panel. There is NO "Send"
// action here — this phase never transmits an email and never mutates the booking.

import { useState } from 'react';
import { getErrorMessage } from '../../lib/api';

type PreviewServiceLine = {
  serviceId: string;
  serviceType: string | null;
  description: string;
  serviceDate: string | null;
  timing: string | null;
  nights: number | null;
  mealPlan: string | null;
  pax: number;
  notes: string | null;
  confirmationDeadline: string | null;
};

type RecipientSource = 'assignedSupplierId' | 'supplierId' | 'none';
type ConfirmationReadiness = 'READY' | 'NO_SUPPLIER' | 'MISSING_EMAIL' | 'NO_SERVICES' | 'NOT_APPLICABLE';

type SupplierDraft = {
  supplierId: string | null;
  // O.2B-2G — resolved recipient name (heading). `serviceSupplierName` is the
  // differing free-text service label, display-only (null when it matches/no FK).
  supplierName: string;
  serviceSupplierName: string | null;
  recipientEmail: string | null;
  missingEmail: boolean;
  recipientSource: RecipientSource;
  readiness: ConfirmationReadiness;
  readinessReason: string;
  recipient: { supplierId: string | null; supplierName: string; email: string | null; missingEmail: boolean };
  subject: string;
  body: string;
  services: PreviewServiceLine[];
};

const RECIPIENT_SOURCE_LABEL: Record<RecipientSource, string> = {
  assignedSupplierId: 'Assigned supplier',
  supplierId: 'Linked supplier',
  none: 'No supplier linked',
};

const READINESS_LABEL: Record<ConfirmationReadiness, string> = {
  READY: 'Ready',
  NO_SUPPLIER: 'Assign supplier first',
  MISSING_EMAIL: 'Supplier email missing',
  NO_SERVICES: 'No services',
  // O.2C-1 — neutral, non-error state for entrance/ticket + internal/system lines.
  NOT_APPLICABLE: 'Not applicable',
};

type SupplierConfirmationPreview = {
  bookingRef: string | null;
  travelStartDate: string | null;
  travelEndDate: string | null;
  pax: number;
  suppliers: SupplierDraft[];
};

type Props = {
  apiBaseUrl: string;
  bookingId: string;
};

export function SupplierConfirmationPreview({ apiBaseUrl, bookingId }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<SupplierConfirmationPreview | null>(null);
  // Phase O.2B-2C — gated send. A READY supplier opens a confirm modal; only the
  // modal's Confirm triggers the POST send. No send happens from the card click.
  const [confirmFor, setConfirmFor] = useState<SupplierDraft | null>(null);
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState('');

  async function handlePreview() {
    try {
      setLoading(true);
      setError('');
      setSuccess('');
      // READ-ONLY GET — never sends an email, never mutates the booking.
      const response = await fetch(`${apiBaseUrl}/bookings/${bookingId}/supplier-confirmation/preview`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not load the supplier confirmation preview.'));
      }
      const data = (await response.json()) as SupplierConfirmationPreview;
      setPreview(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load the supplier confirmation preview.');
    } finally {
      setLoading(false);
    }
  }

  // Only the final modal confirmation calls this. Sends scope ONLY (supplierId) —
  // the server resolves the recipient + content; we never post an email address.
  async function handleConfirmSend() {
    if (!confirmFor || !confirmFor.recipient.supplierId) return;
    try {
      setSending(true);
      setError('');
      setSuccess('');
      const response = await fetch(`${apiBaseUrl}/bookings/${bookingId}/supplier-confirmation/send`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplierId: confirmFor.recipient.supplierId }),
      });
      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not send the supplier confirmation.'));
      }
      setSuccess(`Confirmation request sent to ${confirmFor.recipient.email}. Status set to Requested.`);
      setConfirmFor(null);
      await handlePreview(); // refresh readiness/status
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not send the supplier confirmation.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="section-stack supplier-confirmation-preview">
      <button type="button" className="secondary-button" onClick={handlePreview} disabled={loading}>
        {loading ? 'Loading preview…' : 'Preview confirmation'}
      </button>
      <p className="form-help">
        Read-only draft of the confirmation request per supplier. No email is sent and nothing is changed.
      </p>
      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success" role="status">{success}</p> : null}

      {preview ? (
        preview.suppliers.length === 0 ? (
          <p className="form-help">No supplier-assigned services to preview for this booking.</p>
        ) : (
          <div className="supplier-confirmation-preview-list">
            {preview.suppliers.map((supplier) => (
              <section key={supplier.supplierId || supplier.supplierName} className="detail-card supplier-confirmation-preview-card">
                {/* O.2B-2G — heading is the RESOLVED recipient supplier name. */}
                <p className="eyebrow">{supplier.supplierName}</p>
                {/* O.2B-2G — when the service's free-text label differs from the resolved
                    supplier, show it as a display-only source note (never the recipient). */}
                {supplier.serviceSupplierName ? (
                  <p className="form-help" data-role="service-supplier-label">
                    Listed on service as: <em>{supplier.serviceSupplierName}</em>
                  </p>
                ) : null}
                {/* O.2B-2B — recipient source + send-readiness (read-only signal; no send). */}
                <p className="form-help">
                  Recipient source: <strong>{RECIPIENT_SOURCE_LABEL[supplier.recipientSource]}</strong>
                  {' · '}
                  Readiness:{' '}
                  <span
                    className={
                      supplier.readiness === 'READY'
                        ? 'form-success'
                        : supplier.readiness === 'NOT_APPLICABLE'
                          ? 'form-help' /* O.2C-1 — neutral grey, NOT an error */
                          : 'form-error'
                    }
                    role="note"
                    data-readiness={supplier.readiness}
                  >
                    {READINESS_LABEL[supplier.readiness]}
                  </span>
                </p>
                {/* O.2C-1 — for non-confirmable lines show the neutral reason instead of
                    any "fix supplier email / assign supplier" recipient prompt. */}
                {supplier.readiness === 'NOT_APPLICABLE' ? (
                  <p className="form-help" role="note" data-role="not-applicable-reason">
                    {supplier.readinessReason}
                  </p>
                ) : (
                  <p className="form-help">
                    Recipient:{' '}
                    {supplier.recipient.email ? (
                      <strong>{supplier.recipient.email}</strong>
                    ) : (
                      <span className="form-error" role="note">
                        {supplier.recipientSource === 'none'
                          ? 'Assign supplier first before sending.'
                          : 'Supplier email missing — update supplier profile before sending.'}
                      </span>
                    )}
                  </p>
                )}
                <p><strong>Subject:</strong> {supplier.subject}</p>
                <pre className="supplier-confirmation-preview-body">{supplier.body}</pre>
                <p className="form-help">{supplier.services.length} service(s) included.</p>
                {/* O.2B-2C — Send only when READY. Otherwise the reason is shown above;
                    no send control is rendered. Click opens the confirm modal — it does
                    NOT send directly. */}
                {supplier.readiness === 'READY' ? (
                  <button
                    type="button"
                    className="secondary-button supplier-confirmation-send-button"
                    onClick={() => setConfirmFor(supplier)}
                    disabled={sending}
                  >
                    Send confirmation request
                  </button>
                ) : supplier.readiness === 'NOT_APPLICABLE' ? (
                  // O.2C-1 — neutral, no error framing; this line simply isn't sendable.
                  <p className="form-help" role="note">Not applicable — no supplier confirmation needed for this line.</p>
                ) : (
                  <p className="form-help" role="note">Send unavailable — {READINESS_LABEL[supplier.readiness]}.</p>
                )}
              </section>
            ))}
          </div>
        )
      ) : null}

      {/* O.2B-2C — final confirmation modal. Only its Confirm triggers the POST send. */}
      {confirmFor ? (
        <div className="modal-overlay supplier-confirmation-send-modal" role="dialog" aria-modal="true" aria-label="Confirm supplier confirmation send">
          <div className="modal-card">
            <h4>Send confirmation request?</h4>
            <ul className="form-help">
              <li>Supplier: <strong>{confirmFor.recipient.supplierName}</strong></li>
              <li>Email: <strong>{confirmFor.recipient.email}</strong></li>
              <li>Booking: <strong>{preview?.bookingRef ?? '—'}</strong></li>
              <li>Services: <strong>{confirmFor.services.length}</strong></li>
              <li>Status after send: <strong>Requested</strong></li>
            </ul>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setConfirmFor(null)} disabled={sending}>
                Cancel
              </button>
              <button type="button" className="primary-button" onClick={handleConfirmSend} disabled={sending}>
                {sending ? 'Sending…' : 'Confirm & send'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

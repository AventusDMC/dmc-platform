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
type ConfirmationReadiness = 'READY' | 'NO_SUPPLIER' | 'MISSING_EMAIL' | 'NO_SERVICES';

type SupplierDraft = {
  supplierId: string | null;
  supplierName: string;
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

  async function handlePreview() {
    try {
      setLoading(true);
      setError('');
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

  return (
    <div className="section-stack supplier-confirmation-preview">
      <button type="button" className="secondary-button" onClick={handlePreview} disabled={loading}>
        {loading ? 'Loading preview…' : 'Preview confirmation'}
      </button>
      <p className="form-help">
        Read-only draft of the confirmation request per supplier. No email is sent and nothing is changed.
      </p>
      {error ? <p className="form-error">{error}</p> : null}

      {preview ? (
        preview.suppliers.length === 0 ? (
          <p className="form-help">No supplier-assigned services to preview for this booking.</p>
        ) : (
          <div className="supplier-confirmation-preview-list">
            {preview.suppliers.map((supplier) => (
              <section key={supplier.supplierId || supplier.supplierName} className="detail-card supplier-confirmation-preview-card">
                <p className="eyebrow">{supplier.supplierName}</p>
                {/* O.2B-2B — recipient source + send-readiness (read-only signal; no send). */}
                <p className="form-help">
                  Recipient source: <strong>{RECIPIENT_SOURCE_LABEL[supplier.recipientSource]}</strong>
                  {' · '}
                  Readiness:{' '}
                  <span
                    className={supplier.readiness === 'READY' ? 'form-success' : 'form-error'}
                    role="note"
                    data-readiness={supplier.readiness}
                  >
                    {READINESS_LABEL[supplier.readiness]}
                  </span>
                </p>
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
                <p><strong>Subject:</strong> {supplier.subject}</p>
                <pre className="supplier-confirmation-preview-body">{supplier.body}</pre>
                <p className="form-help">{supplier.services.length} service(s) included.</p>
              </section>
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}

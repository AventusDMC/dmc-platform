import { notFound } from 'next/navigation';
import { adminPageFetchJson } from '../../lib/admin-server';
import { InvoicePortalActions } from './InvoicePortalActions';

const API_BASE_URL = '/api';

type PublicInvoice = {
  bookingId: string;
  token: string;
  invoiceNumber: string;
  bookingReference: string;
  clientName: string;
  total: number;
  paid: number;
  outstanding: number;
  overdue: boolean;
  overdueAmount: number;
  paymentInstructions: string[];
  supportEmail: string | null;
  viewedAt: string | null;
  acknowledgedAt: string | null;
  paymentProofSubmission?: {
    reference: string | null;
    amount: number | null;
    receiptUrl: string | null;
    submittedAt: string | null;
  } | null;
};

type InvoicePortalPageProps = {
  params: Promise<{
    token: string;
  }>;
};

function formatMoney(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(amount);
}

async function getInvoice(token: string): Promise<PublicInvoice | null> {
  return adminPageFetchJson<PublicInvoice | null>(`${API_BASE_URL}/public/invoice/${token}`, 'Public invoice', {
    cache: 'no-store',
    allowAnonymous: true,
    allow404: true,
  });
}

export default async function InvoicePortalPage({ params }: InvoicePortalPageProps) {
  const { token } = await params;
  const invoice = await getInvoice(token);

  if (!invoice) {
    notFound();
  }

  return (
    <main className="invoice-portal-shell">
      <section className="invoice-portal-page">
        <header className="invoice-portal-hero">
          <div className="invoice-portal-hero-copy">
            <p className="eyebrow">Invoice</p>
            <h1>{invoice.invoiceNumber}</h1>
            <p>Booking {invoice.bookingReference} for {invoice.clientName}</p>
          </div>
          <div className="invoice-portal-status-row">
            {invoice.overdue ? <span className="invoice-portal-status-badge invoice-portal-status-badge-overdue">Overdue</span> : null}
            {!invoice.overdue && invoice.outstanding > 0 ? <span className="invoice-portal-status-badge">Open</span> : null}
            {invoice.outstanding <= 0 ? <span className="invoice-portal-status-badge invoice-portal-status-badge-settled">Settled</span> : null}
          </div>
        </header>

        <section className="invoice-portal-amount-card">
          <p className="invoice-portal-amount-label">Amount Due</p>
          <strong className="invoice-portal-amount-value">{formatMoney(invoice.outstanding)}</strong>
          <div className="invoice-portal-amount-meta">
            <div>
              <span>Total</span>
              <strong>{formatMoney(invoice.total)}</strong>
            </div>
            <div>
              <span>Paid</span>
              <strong>{formatMoney(invoice.paid)}</strong>
            </div>
          </div>
          {invoice.overdue ? (
            <p className="invoice-portal-overdue-copy">Overdue amount: {formatMoney(invoice.overdueAmount)}. Please prioritize settlement.</p>
          ) : invoice.outstanding > 0 ? (
            <p className="invoice-portal-trust-copy">If you have already paid, please ignore this message.</p>
          ) : (
            <p className="invoice-portal-trust-copy">This invoice is fully settled.</p>
          )}
        </section>

        <InvoicePortalActions
          token={token}
          invoiceNumber={invoice.invoiceNumber}
          supportEmail={invoice.supportEmail}
          initialAcknowledgedAt={invoice.acknowledgedAt}
          initialPaymentProofSubmission={invoice.paymentProofSubmission || null}
        />

        <section className="invoice-portal-card">
          <p className="eyebrow">Payment Instructions</p>
          <div className="section-stack">
            {invoice.paymentInstructions.map((instruction) => (
              <p key={instruction} className="detail-copy">
                {instruction}
              </p>
            ))}
          </div>
        </section>

        <section className="invoice-portal-card">
          <p className="eyebrow">Need help?</p>
          <p className="detail-copy">If you have any questions about this invoice, contact our support team.</p>
          <p className="invoice-portal-support-email">{invoice.supportEmail || 'Support email unavailable'}</p>
          <p className="invoice-portal-trust-copy">If you have already paid, please ignore this message.</p>
        </section>
      </section>
    </main>
  );
}

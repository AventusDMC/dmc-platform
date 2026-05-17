import Link from 'next/link';
import { adminPageFetchJson, isNextRedirectError } from '../../lib/admin-server';

type AgentMe = {
  id: string;
  name: string;
  email: string;
  role: string;
  company?: {
    id: string;
    name: string;
  } | null;
};

type AgentInvoice = {
  id: string;
  invoiceNumber?: string | null;
  bookingRef?: string | null;
  totalAmount?: number | null;
  depositsReceived?: number | null;
  balanceDue?: number | null;
  currency?: string | null;
  status?: string | null;
  paymentStatus?: string | null;
  paymentMethods?: string[] | null;
  paymentReferences?: Array<{
    id: string;
    method?: string | null;
    reference: string | null;
    amount?: number | null;
    status?: string | null;
  }> | null;
  dueDate?: string | null;
  pdfUrl?: string | null;
  quote?: {
    title?: string | null;
    clientCompany?: {
      name?: string | null;
    } | null;
  } | null;
};

export const dynamic = 'force-dynamic';

function formatMoney(amount?: number | null, currency = 'USD') {
  const normalizedAmount = Number(amount ?? 0);
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number.isFinite(normalizedAmount) ? normalizedAmount : 0);
}

function formatDate(value?: string | null) {
  if (!value) {
    return 'Not set';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Not set';
  }

  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(date);
}

function formatPaymentReferences(invoice: AgentInvoice) {
  return (invoice.paymentReferences || [])
    .map((payment) => payment.reference || payment.method)
    .filter(Boolean)
    .join(', ') || 'Pending';
}

async function getMe() {
  return adminPageFetchJson<AgentMe>('/api/agent/me', 'Agent profile', { cache: 'no-store' });
}

async function getInvoices() {
  return adminPageFetchJson<AgentInvoice[]>('/api/agent/invoices', 'Agent invoices', { cache: 'no-store' });
}

async function safeAgentFetch<T>(label: string, load: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await load();
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    console.error(`[agent/invoices] ${label} unavailable`, error);
    return fallback;
  }
}

export default async function AgentInvoicesPage() {
  const [me, invoices] = await Promise.all([
    safeAgentFetch<AgentMe | null>('profile', getMe, null),
    safeAgentFetch<AgentInvoice[]>('invoices', getInvoices, []),
  ]);

  if (!me) {
    return (
      <main className="page">
        <section className="panel workspace-panel">
          <div className="section-stack">
            <div className="workspace-section-head">
              <div>
                <p className="eyebrow">Agent Portal</p>
                <h1>Agent sign in required</h1>
                <p className="detail-copy">Sign in with an active agent account to view assigned invoices, balances, payment status, and document downloads.</p>
              </div>
            </div>
            <div className="table-action-row">
              <Link href="/login?next=/agent/invoices" className="secondary-button">Sign in</Link>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      <section className="panel workspace-panel">
        <div className="section-stack">
          <div className="workspace-section-head">
            <div>
              <p className="eyebrow">Agent Portal</p>
              <h1>Invoices</h1>
              <p className="detail-copy">Client billing visibility only. Internal audit and backend finance controls remain in admin.</p>
            </div>
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Quote</th>
                  <th>Client</th>
                  <th>Due Date</th>
                  <th>Status</th>
                  <th>Total</th>
                  <th>Deposits</th>
                  <th>Balance</th>
                  <th>Payment Reference</th>
                  <th>Documents</th>
                </tr>
              </thead>
              <tbody>
                {invoices.length === 0 ? (
                  <tr>
                    <td colSpan={9}>
                      <p className="empty-state">No invoices are available for this agent account.</p>
                    </td>
                  </tr>
                ) : invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>
                      <strong>{invoice.invoiceNumber || 'Invoice pending'}</strong>
                      <div className="table-subcopy">{invoice.bookingRef || invoice.quote?.title || 'Booking reference pending'}</div>
                    </td>
                    <td>{invoice.quote?.clientCompany?.name || 'Client pending'}</td>
                    <td>{formatDate(invoice.dueDate)}</td>
                    <td><span className="status-badge">{invoice.paymentStatus || invoice.status || 'pending'}</span></td>
                    <td>{formatMoney(invoice.totalAmount, invoice.currency || 'USD')}</td>
                    <td>{formatMoney(invoice.depositsReceived, invoice.currency || 'USD')}</td>
                    <td>{formatMoney(invoice.balanceDue, invoice.currency || 'USD')}</td>
                    <td>{formatPaymentReferences(invoice)}</td>
                    <td>{invoice.pdfUrl ? <a href={invoice.pdfUrl} className="compact-button">Download invoice</a> : <span className="table-subcopy">Not available</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}

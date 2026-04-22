import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SummaryStrip } from '../../components/SummaryStrip';
import { TableSectionShell } from '../../components/TableSectionShell';
import { WorkspaceSubheader } from '../../components/WorkspaceSubheader';
import { ADMIN_API_BASE_URL, adminPageFetchJson } from '../../lib/admin-server';
import { InvoiceStatusForm } from '../InvoiceStatusForm';

const API_BASE_URL = ADMIN_API_BASE_URL;
const ACTION_API_BASE_URL = '/api';

type InvoiceDetail = {
  id: string;
  totalAmount: number;
  currency: string;
  status: 'DRAFT' | 'ISSUED' | 'PAID' | 'CANCELLED';
  dueDate: string;
  quote: {
    id: string;
    quoteNumber: string | null;
    title: string;
    status: string;
    clientCompany: {
      name: string;
    };
    contact: {
      firstName: string;
      lastName: string;
    };
    booking: {
      id: string;
      status: string;
    } | null;
  };
  auditLogs: Array<{
    id: string;
    action: string;
    oldValue: string | null;
    newValue: string | null;
    note: string | null;
    actorUserId: string | null;
    actor: string | null;
    createdAt: string;
  }>;
};

type InvoiceDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

async function getInvoice(id: string): Promise<InvoiceDetail | null> {
  return adminPageFetchJson<InvoiceDetail | null>(`${API_BASE_URL}/invoices/${id}`, 'Invoice detail', {
    cache: 'no-store',
    allow404: true,
  });
}

function formatMoney(amount: number, currency = 'USD') {
  return `${currency} ${amount.toFixed(2)}`;
}

function formatDate(value: string | null) {
  if (!value) {
    return 'Not set';
  }

  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatStatus(status: string) {
  return status
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export default async function InvoiceDetailPage({ params }: InvoiceDetailPageProps) {
  const { id } = await params;
  const invoice = await getInvoice(id);

  if (!invoice) {
    notFound();
  }

  return (
    <main className="page">
      <section className="panel quote-workspace-page">
        <Link href="/invoices" className="back-link">
          Back to invoices
        </Link>

        <div className="workspace-shell">
          <section className="workspace-summary">
            <div className="workspace-summary-head">
              <div>
                <p className="eyebrow">Invoice</p>
                <h1 className="section-title quote-title">{invoice.quote.quoteNumber || 'Invoice detail'}</h1>
                <p className="detail-copy">{invoice.quote.title}</p>
              </div>
              <span className="workspace-status">{formatStatus(invoice.status)}</span>
            </div>

            <div className="workspace-summary-grid">
              <article className="workspace-summary-card">
                <span>Linked quote</span>
                <strong>{invoice.quote.quoteNumber || 'Pending reference'}</strong>
                <p>{invoice.quote.title}</p>
              </article>
              <article className="workspace-summary-card">
                <span>Client</span>
                <strong>{invoice.quote.clientCompany.name}</strong>
                <p>
                  {invoice.quote.contact.firstName} {invoice.quote.contact.lastName}
                </p>
              </article>
              <article className="workspace-summary-card">
                <span>Total amount</span>
                <strong>{formatMoney(invoice.totalAmount, invoice.currency)}</strong>
                <p>{invoice.currency}</p>
              </article>
              <article className="workspace-summary-card">
                <span>Due date</span>
                <strong>{formatDate(invoice.dueDate)}</strong>
                <p>Commercial collection target</p>
              </article>
              <article className="workspace-summary-card">
                <span>Invoice status</span>
                <strong>{formatStatus(invoice.status)}</strong>
                <p>Strict lifecycle handling</p>
              </article>
              <article className="workspace-summary-card">
                <span>Commercials</span>
                <strong>{invoice.status === 'PAID' ? 'Confirmed' : 'Pending'}</strong>
                <p>{invoice.status === 'PAID' ? 'Quote is commercially confirmed.' : 'Awaiting paid settlement.'}</p>
              </article>
            </div>
          </section>

          <section className="section-stack">
            <WorkspaceSubheader
              eyebrow="Invoice"
              title="Invoice actions"
              description="Update invoice lifecycle with strict transitions and a visible audit trail."
              actions={
                <>
                  <Link href={`/quotes/${invoice.quote.id}`} className="dashboard-toolbar-link">
                    Open quote
                  </Link>
                  {invoice.quote.booking ? (
                    <Link href={`/bookings/${invoice.quote.booking.id}`} className="dashboard-toolbar-link">
                      Open booking
                    </Link>
                  ) : null}
                </>
              }
            />

            <SummaryStrip
              items={[
                { id: 'status', label: 'Status', value: formatStatus(invoice.status), helper: 'Current lifecycle state' },
                { id: 'due', label: 'Due date', value: formatDate(invoice.dueDate), helper: 'Collection target' },
                { id: 'quote-status', label: 'Quote', value: formatStatus(invoice.quote.status), helper: 'Linked quote status' },
                { id: 'audit', label: 'Audit entries', value: String(invoice.auditLogs.length), helper: 'Lifecycle history' },
              ]}
            />

            <TableSectionShell title="Invoice lifecycle" description="Run invoice status updates from the existing admin layout.">
              <div className="split-layout">
                <article className="detail-card">
                  <p className="eyebrow">Status Update</p>
                  <InvoiceStatusForm apiBaseUrl={ACTION_API_BASE_URL} invoiceId={invoice.id} currentStatus={invoice.status} />
                </article>
                <article className="detail-card">
                  <p className="eyebrow">Linked records</p>
                  <div className="section-stack">
                    <p className="detail-copy">Quote: {invoice.quote.quoteNumber || 'Pending reference'}</p>
                    <p className="detail-copy">Quote status: {formatStatus(invoice.quote.status)}</p>
                    {invoice.quote.booking ? <p className="detail-copy">Booking status: {formatStatus(invoice.quote.booking.status)}</p> : <p className="detail-copy">No booking linked yet.</p>}
                    <div className="table-action-row">
                      <Link href={`/quotes/${invoice.quote.id}`} className="secondary-button">
                        Open quote
                      </Link>
                      {invoice.quote.booking ? (
                        <Link href={`/bookings/${invoice.quote.booking.id}`} className="secondary-button">
                          Open booking
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </article>
              </div>
            </TableSectionShell>

            <TableSectionShell
              title="Audit trail"
              description="Each status mutation records actor identity and before/after values."
              emptyState={<p className="empty-state">No audit entries yet.</p>}
            >
              {invoice.auditLogs.length > 0 ? (
                <div className="entity-list allotment-table-stack">
                  <div className="table-wrap">
                    <table className="data-table allotment-table">
                      <thead>
                        <tr>
                          <th>When</th>
                          <th>Action</th>
                          <th>Change</th>
                          <th>Actor</th>
                          <th>Note</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoice.auditLogs.map((entry) => (
                          <tr key={entry.id}>
                            <td>{formatDateTime(entry.createdAt)}</td>
                            <td>{formatStatus(entry.action)}</td>
                            <td>
                              <strong>{entry.newValue ? formatStatus(entry.newValue) : 'Updated'}</strong>
                              <div className="table-subcopy">{entry.oldValue ? `From ${formatStatus(entry.oldValue)}` : 'Initial state change'}</div>
                            </td>
                            <td>
                              <strong>{entry.actor || 'System'}</strong>
                              <div className="table-subcopy">{entry.actorUserId || 'No actor id'}</div>
                            </td>
                            <td>{entry.note || 'No note'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </TableSectionShell>
          </section>
        </div>
      </section>
    </main>
  );
}

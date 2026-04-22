import Link from 'next/link';
import { RowDetailsPanel } from '../components/RowDetailsPanel';

type InvoiceRow = {
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
    booking: {
      id: string;
      status: string;
    } | null;
  };
};

type InvoicesTableProps = {
  invoices: InvoiceRow[];
};

function formatMoney(amount: number, currency = 'USD') {
  return `${currency} ${amount.toFixed(2)}`;
}

function formatDate(value: string | null) {
  if (!value) {
    return 'Not set';
  }

  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(value));
}

function formatStatus(status: string) {
  return status
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function InvoicesTable({ invoices }: InvoicesTableProps) {
  return (
    <div className="entity-list allotment-table-stack">
      <div className="table-wrap">
        <table className="data-table allotment-table">
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Quote</th>
              <th>Client</th>
              <th>Due</th>
              <th>Status</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => (
              <tr key={invoice.id}>
                <td>
                  <strong>{formatMoney(invoice.totalAmount, invoice.currency)}</strong>
                  <div className="table-subcopy">{invoice.currency}</div>
                </td>
                <td>
                  <strong>{invoice.quote.quoteNumber || 'Quote reference pending'}</strong>
                  <div className="table-subcopy">{invoice.quote.title}</div>
                </td>
                <td>
                  <strong>{invoice.quote.clientCompany.name}</strong>
                  <div className="table-subcopy">{formatStatus(invoice.quote.status)}</div>
                </td>
                <td>
                  <strong>{formatDate(invoice.dueDate)}</strong>
                  <div className="table-subcopy">{invoice.status === 'PAID' ? 'Commercially confirmed' : 'Awaiting settlement'}</div>
                </td>
                <td>
                  <strong>{formatStatus(invoice.status)}</strong>
                  <div className="table-subcopy">{invoice.quote.booking ? `Booking ${formatStatus(invoice.quote.booking.status)}` : 'No booking yet'}</div>
                </td>
                <td>
                  <RowDetailsPanel summary="Open details" className="operations-row-details" bodyClassName="operations-row-details-body">
                    <div className="table-action-row">
                      <Link href={`/invoices/${invoice.id}`} className="compact-button">
                        View invoice
                      </Link>
                      <Link href={`/quotes/${invoice.quote.id}`} className="compact-button">
                        Open quote
                      </Link>
                    </div>
                    <p className="detail-copy">
                      {`Invoice ${formatStatus(invoice.status)} | Due ${formatDate(invoice.dueDate)} | Total ${formatMoney(invoice.totalAmount, invoice.currency)}`}
                    </p>
                    {invoice.status === 'PAID' ? <p className="detail-copy">Invoice is paid and the quote is commercially confirmed.</p> : null}
                  </RowDetailsPanel>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

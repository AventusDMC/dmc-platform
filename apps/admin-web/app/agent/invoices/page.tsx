import { adminPageFetchJson } from '../../lib/admin-server';

type AgentInvoice = {
  id: string;
  totalAmount: number;
  currency: string;
  status: string;
  dueDate: string;
  quote: {
    title: string;
    clientCompany: {
      name: string;
    };
  };
};

function formatMoney(amount: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(value));
}

async function getInvoices() {
  return adminPageFetchJson<AgentInvoice[]>('/api/agent/invoices', 'Agent invoices', { cache: 'no-store' });
}

export default async function AgentInvoicesPage() {
  const invoices = await getInvoices();

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
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>{invoice.quote.title}</td>
                    <td>{invoice.quote.clientCompany.name}</td>
                    <td>{formatDate(invoice.dueDate)}</td>
                    <td><span className="status-badge">{invoice.status}</span></td>
                    <td>{formatMoney(invoice.totalAmount, invoice.currency)}</td>
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

import Link from 'next/link';
import { ModuleSwitcher } from '../components/ModuleSwitcher';
import { PageActionBar } from '../components/PageActionBar';
import { SummaryStrip } from '../components/SummaryStrip';
import { TableSectionShell } from '../components/TableSectionShell';
import { WorkspaceShell } from '../components/WorkspaceShell';
import { WorkspaceSubheader } from '../components/WorkspaceSubheader';
import { AdminForbiddenState } from '../components/AdminForbiddenState';
import { adminPageFetchJson, isAdminForbiddenError, isNextRedirectError } from '../lib/admin-server';
import { InvoicesTable } from './InvoicesTable';

export const dynamic = 'force-dynamic';

type Invoice = {
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

async function getInvoices(): Promise<Invoice[]> {
  return adminPageFetchJson<Invoice[]>('/api/invoices', 'Invoices list', {
    cache: 'no-store',
  });
}

export default async function InvoicesPage() {
  let invoices: Invoice[] = [];
  let loadError = false;

  try {
    invoices = await getInvoices();
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    if (isAdminForbiddenError(error)) {
      return (
        <AdminForbiddenState
          title="Finance access restricted"
          description="Your account does not have permission to view invoices for this company."
        />
      );
    }

    console.error('[invoices] list unavailable', error);
    loadError = true;
  }

  const issuedCount = invoices.filter((invoice) => invoice.status === 'ISSUED').length;
  const paidCount = invoices.filter((invoice) => invoice.status === 'PAID').length;
  const cancelledCount = invoices.filter((invoice) => invoice.status === 'CANCELLED').length;

  return (
    <main className="page">
      <section className="panel workspace-panel">
        <WorkspaceShell
          eyebrow="Finance"
          title="Invoices"
          description="Review and manage invoice lifecycle from a compact list-first finance surface."
          switcher={
            <ModuleSwitcher
              ariaLabel="Finance modules"
              activeId="invoices"
              items={[
                { id: 'invoices', label: 'Invoices', href: '/invoices', helper: 'Invoice lifecycle' },
                { id: 'finance', label: 'Finance', href: '/finance', helper: 'Booking finance' },
              ]}
            />
          }
          summary={
            <SummaryStrip
              items={[
                { id: 'invoices', label: 'Invoices', value: String(invoices.length), helper: 'Total tracked' },
                { id: 'issued', label: 'Issued', value: String(issuedCount), helper: 'Awaiting payment' },
                { id: 'paid', label: 'Paid', value: String(paidCount), helper: 'Commercially confirmed' },
                { id: 'cancelled', label: 'Cancelled', value: String(cancelledCount), helper: 'Closed without payment' },
              ]}
            />
          }
        >
          <section className="section-stack">
            <WorkspaceSubheader
              eyebrow="Finance"
              title="Invoice queue"
              description="Keep invoice handling list-first, then open the full invoice record only when lifecycle action is needed."
              actions={
                <>
                  <Link href="/finance" className="dashboard-toolbar-link">
                    Booking finance
                  </Link>
                  <Link href="/quotes" className="dashboard-toolbar-link">
                    Quotes
                  </Link>
                </>
              }
            />

            <PageActionBar title="Finance shortcuts" description="Move between invoice management and related quote or booking finance surfaces.">
              <Link href="/finance" className="dashboard-toolbar-link">
                Finance
              </Link>
              <Link href="/quotes" className="dashboard-toolbar-link">
                Quotes
              </Link>
            </PageActionBar>

            <TableSectionShell
              title="Invoices"
              description="Track issued, paid, and cancelled invoices from a compact admin list."
              context={<p>{invoices.length} invoices in scope</p>}
              emptyState={
                <p className="empty-state">{loadError ? 'Invoices are temporarily unavailable.' : 'No invoices available yet.'}</p>
              }
            >
              {invoices.length > 0 ? <InvoicesTable invoices={invoices} /> : null}
            </TableSectionShell>
          </section>
        </WorkspaceShell>
      </section>
    </main>
  );
}

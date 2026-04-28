import { CollapsibleCreatePanel } from '../components/CollapsibleCreatePanel';
import { ModuleSwitcher } from '../components/ModuleSwitcher';
import { SummaryStrip } from '../components/SummaryStrip';
import { TableSectionShell } from '../components/TableSectionShell';
import { WorkspaceShell } from '../components/WorkspaceShell';
import { SuppliersForm } from './SuppliersForm';
import { SuppliersTable } from './SuppliersTable';

import { adminPageFetchJson, isNextRedirectError } from '../lib/admin-server';

const ACTION_API_BASE_URL = '/api';

export const dynamic = 'force-dynamic';

type Supplier = {
  id: string;
  name: string;
  type: 'hotel' | 'transport' | 'activity' | 'guide' | 'other';
  email: string | null;
  phone: string | null;
  notes: string | null;
};

async function getSuppliers(): Promise<Supplier[]> {
  return adminPageFetchJson<Supplier[]>('/api/suppliers', 'Suppliers list', {
    cache: 'no-store',
  });
}

export default async function SuppliersPage() {
  let suppliers: Supplier[] = [];
  let loadError = false;

  try {
    suppliers = await getSuppliers();
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    console.error('[suppliers] list unavailable', error);
    loadError = true;
  }

  const supplierTypeCounts = suppliers.reduce<Record<Supplier['type'], number>>(
    (counts, supplier) => {
      counts[supplier.type] += 1;
      return counts;
    },
    {
      hotel: 0,
      transport: 0,
      activity: 0,
      guide: 0,
      other: 0,
    },
  );

  return (
    <main className="page">
      <section className="panel workspace-panel">
        <WorkspaceShell
          eyebrow="Suppliers"
          title="Manage suppliers"
          description="Keep supplier records in one operational workspace for hotels, transport, activities, guides, and other vendors."
          switcher={
            <ModuleSwitcher
              ariaLabel="Supplier modules"
              activeId="suppliers"
              items={[
                {
                  id: 'suppliers',
                  label: 'Suppliers',
                  href: '/suppliers',
                  helper: 'Vendor directory',
                },
              ]}
            />
          }
          summary={
            <SummaryStrip
              items={[
                { id: 'total', label: 'Suppliers', value: String(suppliers.length), helper: 'All vendor records' },
                { id: 'hotel', label: 'Hotel', value: String(supplierTypeCounts.hotel), helper: 'Accommodation suppliers' },
                { id: 'transport', label: 'Transport', value: String(supplierTypeCounts.transport), helper: 'Fleet and transfer suppliers' },
                { id: 'other', label: 'Other', value: String(supplierTypeCounts.activity + supplierTypeCounts.guide + supplierTypeCounts.other), helper: 'Activity, guide, and misc.' },
              ]}
            />
          }
        >
          <TableSectionShell
            title="Supplier Directory"
            description="Manage vendor records without leaving the Suppliers workspace."
            context={<p>{suppliers.length} suppliers in scope</p>}
            createPanel={
              <CollapsibleCreatePanel
                title="Create supplier"
                description="Add a supplier record and keep the list visible."
                triggerLabelOpen="Add supplier"
              >
                <SuppliersForm apiBaseUrl={ACTION_API_BASE_URL} />
              </CollapsibleCreatePanel>
            }
            emptyState={
              suppliers.length === 0 ? (
                <p className="empty-state">{loadError ? 'Suppliers are temporarily unavailable.' : 'No suppliers yet.'}</p>
              ) : undefined
            }
          >
            {suppliers.length > 0 ? <SuppliersTable apiBaseUrl={ACTION_API_BASE_URL} suppliers={suppliers} /> : null}
          </TableSectionShell>
        </WorkspaceShell>
      </section>
    </main>
  );
}

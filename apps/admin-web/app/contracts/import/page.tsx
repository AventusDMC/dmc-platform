import Link from 'next/link';
import { ADMIN_API_BASE_URL, adminPageFetchJson } from '../../lib/admin-server';
import { ContractImportFlow } from './ContractImportFlow';

type Supplier = {
  id: string;
  name: string;
  type: string;
};

async function getSuppliers() {
  return adminPageFetchJson<Supplier[]>(`${ADMIN_API_BASE_URL}/suppliers`, 'Contract import suppliers', {
    cache: 'no-store',
  });
}

export default async function ImportContractPage() {
  const suppliers = await getSuppliers();

  return (
    <main className="page">
      <section className="panel workspace-panel">
        <div className="workspace-shell">
          <div className="workspace-header">
            <div>
              <p className="eyebrow">Contracts</p>
              <h1>Import supplier contract</h1>
              <p className="workspace-description">
                Upload a contract, review extracted data, edit anything uncertain, then approve the import.
              </p>
            </div>
            <Link className="secondary-button" href="/contracts/import/history">
              Import history
            </Link>
          </div>
          <ContractImportFlow suppliers={suppliers} />
        </div>
      </section>
    </main>
  );
}

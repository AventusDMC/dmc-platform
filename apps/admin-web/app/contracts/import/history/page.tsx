import Link from 'next/link';
import { ADMIN_API_BASE_URL, adminPageFetchJson } from '../../../lib/admin-server';
import { ContractImportHistoryTable } from './ContractImportHistoryTable';

type ContractImportHistoryItem = {
  id: string;
  contractName: string;
  contractType: 'HOTEL' | 'TRANSPORT' | 'ACTIVITY';
  status: string;
  createdAt: string;
  importedAt?: string | null;
  user: string;
  sourceFileName: string;
  approvedJson?: unknown;
  extractedJson?: unknown;
  warnings?: Array<{ severity: string; field: string; message: string }> | null;
  auditLogs: Array<{
    id: string;
    action: string;
    status: string;
    user: string;
    note?: string | null;
    createdAt: string;
  }>;
};

async function getContractImports() {
  return adminPageFetchJson<ContractImportHistoryItem[]>(`${ADMIN_API_BASE_URL}/contract-imports`, 'Contract import history', {
    cache: 'no-store',
  });
}

export default async function ContractImportHistoryPage() {
  const imports = await getContractImports();

  return (
    <main className="page">
      <section className="panel workspace-panel">
        <div className="workspace-shell">
          <div className="workspace-header">
            <div>
              <p className="eyebrow">Contracts</p>
              <h1>Import history</h1>
              <p className="workspace-description">Track uploaded contracts, reviewed data, warnings, and import activity.</p>
            </div>
            <Link className="primary-button" href="/contracts/import">
              Import contract
            </Link>
          </div>
          <ContractImportHistoryTable initialImports={imports} />
        </div>
      </section>
    </main>
  );
}

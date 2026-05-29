import Link from 'next/link';
import { notFound } from 'next/navigation';
import { adminPageFetchJson, isNextRedirectError } from '../../../../../lib/admin-server';
import { ImportPreviewPanel } from './ImportPreviewPanel';

// Hotels Engine — Excel import (preview phase). Round-trip step 2 of 2:
// download the contract Excel, edit it offline, upload it here to see
// what would change. Apply is a confirmed follow-up; this is preview-only.

export const dynamic = 'force-dynamic';

const API_BASE_URL = '/api';

type ContractSummary = { id: string; hotelId: string; name: string; hotel: { id: string; name: string } };

async function getContract(contractId: string): Promise<ContractSummary | null> {
  try {
    return await adminPageFetchJson<ContractSummary>(
      `${API_BASE_URL}/hotel-contracts/${encodeURIComponent(contractId)}?summary=1`,
      'Import — contract',
      { cache: 'no-store', allow404: true },
    );
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error('[hotels/contract/import] contract unavailable', error);
    return null;
  }
}

type Props = { params: Promise<{ id: string; contractId: string }> };

export default async function ContractImportPage({ params }: Props) {
  const { id: hotelId, contractId } = await params;
  const contract = await getContract(contractId);

  if (!contract) notFound();
  if (contract.hotelId !== hotelId) notFound();

  return (
    <main className="page">
      <section className="panel workspace-panel workspace-panel-wide">
        <header style={{ marginBottom: '1.5rem' }}>
          <p className="eyebrow">Hotels Engine — Excel import</p>
          <h1 className="section-title">{contract.name}</h1>
          <p className="copy section-copy">{contract.hotel.name}</p>
          <p className="table-subcopy" style={{ marginTop: '0.5rem' }}>
            <Link href={`/hotels/${hotelId}/contracts/${contractId}`} prefetch={false}>
              ← Back to contract
            </Link>
            {' · '}
            <a
              href={`/api/hotel-contracts/${contractId}/export.xlsx`}
              download
              className="compact-button"
              style={{ textDecoration: 'none' }}
            >
              Download current Excel
            </a>
          </p>
        </header>

        <section data-testid="hotel-contract-import" className="detail-card" style={{ marginBottom: '1.5rem' }}>
          <h2 className="section-title" style={{ fontSize: '1.05rem', marginBottom: '0.6rem' }}>
            Preview an edited workbook
          </h2>
          <p className="table-subcopy" style={{ marginTop: 0, marginBottom: '0.8rem' }}>
            Download the contract Excel (above), edit it offline, then upload it here to see
            exactly what would change — <strong>before</strong> anything is written. Review the
            diff, then click <strong>Apply</strong> to write the creates &amp; updates (audited).
            Edit the same file you downloaded (it carries a hidden id that matches your rows back
            to the contract). Today this covers the <strong>Supplements</strong> sheet; rows you
            delete from the file are flagged but, for safety, not auto-deleted. Other sheets
            follow next.
          </p>
          <ImportPreviewPanel hotelId={hotelId} contractId={contractId} />
        </section>

        <p
          className="table-subcopy"
          style={{ marginTop: '1.5rem', color: '#94a3b8', fontSize: '0.75rem' }}
        >
          /hotels/{hotelId}/contracts/{contractId}/import — preview (dry-run) via
          /hotel-contracts/:id/import-preview. Read-only; no changes are saved.
        </p>
      </section>
    </main>
  );
}

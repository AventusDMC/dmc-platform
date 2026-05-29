import Link from 'next/link';
import { notFound } from 'next/navigation';
import { adminPageFetchJson, isNextRedirectError } from '../../../../../lib/admin-server';
import { updateContract } from './actions';

// Hotels Engine — contract master-data editor.
//
// Closes a glaring gap: v2 let you create a contract but never edit its
// name / validity / currency afterwards. The backend PATCH endpoint and
// proxy route already existed; this is the missing screen. Pre-fills from
// the contract summary and submits through the updateContract action.

export const dynamic = 'force-dynamic';

const API_BASE_URL = '/api';

type ContractSummary = {
  id: string;
  hotelId: string;
  name: string;
  validFrom: string;
  validTo: string;
  currency: string;
  hotel: { id: string; name: string };
};

const CURRENCIES = ['USD', 'JOD', 'AED', 'EUR', 'GBP'];

// ISO timestamp → YYYY-MM-DD for <input type="date">. The contract stores
// validity at noon UTC (see actions), so a plain slice is safe and avoids
// a timezone-driven off-by-one on the date input.
function toDateInputValue(iso: string): string {
  return typeof iso === 'string' ? iso.slice(0, 10) : '';
}

async function getContract(contractId: string): Promise<ContractSummary | null> {
  try {
    return await adminPageFetchJson<ContractSummary>(
      `${API_BASE_URL}/hotel-contracts/${encodeURIComponent(contractId)}?summary=1`,
      'Hotel contract summary',
      { cache: 'no-store', allow404: true },
    );
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error('[hotels/contract/edit] summary unavailable', error);
    return null;
  }
}

type Props = { params: Promise<{ id: string; contractId: string }> };

export default async function ContractEditPage({ params }: Props) {
  const { id: hotelId, contractId } = await params;
  const contract = await getContract(contractId);

  if (!contract) {
    notFound();
  }

  const updateAction = updateContract.bind(null, hotelId, contractId);
  const currencyOptions = CURRENCIES.includes(contract.currency)
    ? CURRENCIES
    : [contract.currency, ...CURRENCIES];

  return (
    <main className="page">
      <section className="panel workspace-panel workspace-panel-wide">
        <header style={{ marginBottom: '1.5rem' }}>
          <p className="eyebrow">Hotels Engine — Contract</p>
          <h1 className="section-title">Edit contract details</h1>
          <p className="copy section-copy">
            {contract.hotel.name} · {contract.name}
          </p>
          <p className="table-subcopy" style={{ marginTop: '0.5rem' }}>
            <Link href={`/hotels/${hotelId}/contracts/${contractId}`} prefetch={false}>
              ← Back to contract
            </Link>
          </p>
        </header>

        <section
          data-testid="hotel-contract-edit"
          className="detail-card"
          style={{ marginBottom: '1.5rem' }}
        >
          <h2 className="section-title" style={{ fontSize: '1.05rem', marginBottom: '0.6rem' }}>
            Master data
          </h2>
          <p className="table-subcopy" style={{ marginTop: 0, marginBottom: '0.6rem' }}>
            Rates, supplements and policies are edited from the contract page. Changing the
            currency here does not convert existing rate amounts.
          </p>
          <form action={updateAction} className="entity-form compact-form">
            <div className="form-row form-row-4">
              <label>
                Name
                <input
                  type="text"
                  name="name"
                  defaultValue={contract.name}
                  placeholder="Summer 2026 BAR"
                  required
                  maxLength={120}
                />
              </label>
              <label>
                Valid from
                <input
                  type="date"
                  name="validFrom"
                  required
                  defaultValue={toDateInputValue(contract.validFrom)}
                />
              </label>
              <label>
                Valid to
                <input
                  type="date"
                  name="validTo"
                  required
                  defaultValue={toDateInputValue(contract.validTo)}
                />
              </label>
              <label>
                Currency
                <select name="currency" defaultValue={contract.currency} required>
                  {currencyOptions.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <button type="submit" className="primary-button">
                Save changes
              </button>
              <Link
                href={`/hotels/${hotelId}/contracts/${contractId}`}
                prefetch={false}
                className="compact-button"
                style={{ textDecoration: 'none' }}
              >
                Cancel
              </Link>
            </div>
          </form>
        </section>
      </section>
    </main>
  );
}

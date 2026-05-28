import Link from 'next/link';
import { notFound } from 'next/navigation';
import { adminPageFetchJson, isNextRedirectError } from '../../../../../lib/admin-server';
import { createBand, deleteBand, upsertPolicy } from './actions';

// Hotels Engine v2 — child policy editor (PR-A8).
//
// Mirror of PR-A7 (cancellation): a single header row defines the
// infant/child age cut-offs and notes, with a nested list of charge
// bands (e.g. "2-5 years → free", "6-12 years → 50% of adult").
//
// Pure UI integration. Backend endpoints on the contract-child-policy
// controller follow the same upsert pattern as cancellation; reached via
// the existing /api/hotel-contracts/[id]/[...path] catch-all proxy
// (PUT support landed in PR-A7).
//
// findOne returns null when no policy has been created yet — the page
// renders an explicit empty header form and disables the add-band form
// until the header is saved.

export const dynamic = 'force-dynamic';

const API_BASE_URL = '/api';

const CHARGE_BASIS_LABELS: Record<string, string> = {
  FREE: 'Free',
  PERCENT_OF_ADULT: 'Percent of adult',
  FIXED_AMOUNT: 'Fixed amount',
};

type ContractSummary = {
  id: string;
  hotelId: string;
  name: string;
  currency: string;
  hotel: { id: string; name: string };
};

type ChildPolicyBand = {
  id: string;
  childPolicyId: string;
  label: string;
  minAge: number;
  maxAge: number;
  chargeBasis: string;
  chargeValue: number | null;
  isActive: boolean;
  notes: string | null;
};

type ChildPolicy = {
  id: string;
  hotelContractId: string;
  infantMaxAge: number;
  childMaxAge: number;
  notes: string | null;
  bands: ChildPolicyBand[];
};

async function getContract(contractId: string): Promise<ContractSummary | null> {
  try {
    return await adminPageFetchJson<ContractSummary>(
      `${API_BASE_URL}/hotel-contracts/${encodeURIComponent(contractId)}?summary=1`,
      'Hotel v2 child policy — contract',
      { cache: 'no-store', allow404: true },
    );
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error('[hotels-v2/contract/child-policy] contract unavailable', error);
    return null;
  }
}

async function getPolicy(contractId: string): Promise<ChildPolicy | null> {
  try {
    return await adminPageFetchJson<ChildPolicy | null>(
      `${API_BASE_URL}/hotel-contracts/${encodeURIComponent(contractId)}/child-policy`,
      'Hotel v2 child policy — policy',
      { cache: 'no-store', allow404: true },
    );
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error('[hotels-v2/contract/child-policy] policy unavailable', error);
    return null;
  }
}

function formatChargeValue(band: { chargeBasis: string; chargeValue: number | null }, currency: string): string {
  if (band.chargeBasis === 'FREE') return 'Free';
  if (band.chargeValue == null) return '—';
  if (band.chargeBasis === 'PERCENT_OF_ADULT') return `${band.chargeValue}% of adult`;
  if (band.chargeBasis === 'FIXED_AMOUNT') return `${band.chargeValue.toFixed(2)} ${currency}`;
  return String(band.chargeValue);
}

type Props = { params: Promise<{ id: string; contractId: string }> };

export default async function ContractChildPolicyPage({ params }: Props) {
  const { id: hotelId, contractId } = await params;
  const [contract, policy] = await Promise.all([getContract(contractId), getPolicy(contractId)]);

  if (!contract) notFound();
  if (contract.hotelId !== hotelId) notFound();

  const upsertAction = upsertPolicy.bind(null, hotelId, contractId);
  const createBandAction = createBand.bind(null, hotelId, contractId);
  const bands = policy?.bands ?? [];

  return (
    <main className="page">
      <section className="panel workspace-panel workspace-panel-wide">
        <header style={{ marginBottom: '1.5rem' }}>
          <p className="eyebrow">Hotels Engine v2 — Child policy</p>
          <h1 className="section-title">{contract.name}</h1>
          <p className="copy section-copy">
            {contract.hotel.name} · {contract.currency}
          </p>
          <p className="table-subcopy" style={{ marginTop: '0.5rem' }}>
            <Link href={`/hotels-v2/${hotelId}/contracts/${contractId}`} prefetch={false}>
              ← Back to contract
            </Link>
            {' · '}
            <Link href={`/hotels-v2/${hotelId}/contracts`} prefetch={false}>
              All contracts
            </Link>
          </p>
        </header>

        {/* Policy header — PUT upsert */}
        <section
          data-testid="hotel-v2-child-policy-header"
          className="detail-card"
          style={{ marginBottom: '1.5rem' }}
        >
          <h2 className="section-title" style={{ fontSize: '1.05rem', marginBottom: '0.6rem' }}>
            Age cut-offs
          </h2>
          <p className="table-subcopy" style={{ marginTop: 0, marginBottom: '0.6rem' }}>
            Set the infant and child age ceilings. Anyone above the child max age is treated
            as an adult by the quote engine. Bands below add per-age-range charge rules.
          </p>
          <form action={upsertAction} className="entity-form compact-form">
            <div className="form-row form-row-4">
              <label>
                Infant max age (years)
                <input
                  type="number"
                  name="infantMaxAge"
                  min={0}
                  step="1"
                  required
                  defaultValue={policy?.infantMaxAge ?? 1}
                />
              </label>
              <label>
                Child max age (years)
                <input
                  type="number"
                  name="childMaxAge"
                  min={1}
                  step="1"
                  required
                  defaultValue={policy?.childMaxAge ?? 12}
                />
              </label>
              <label style={{ gridColumn: 'span 2' }}>
                Notes (optional)
                <input
                  type="text"
                  name="notes"
                  defaultValue={policy?.notes ?? ''}
                  maxLength={500}
                  placeholder="Christmas-period bands apply to whole-room bookings only"
                />
              </label>
            </div>
            <button type="submit" className="primary-button">
              {policy ? 'Save age cut-offs' : 'Create policy'}
            </button>
          </form>
        </section>

        {/* Add band form */}
        <section
          data-testid="hotel-v2-child-policy-band-create"
          className="detail-card"
          style={{ marginBottom: '1.5rem' }}
        >
          <h2 className="section-title" style={{ fontSize: '1.05rem', marginBottom: '0.6rem' }}>
            Add age band
          </h2>
          <p className="table-subcopy" style={{ marginTop: 0, marginBottom: '0.6rem' }}>
            Bands describe what the hotel charges per age range. Common shapes: "0-1 →
            Free", "2-5 → Free", "6-12 → 50% of adult", "13+ → adult rate" (the last one is
            implicit when no band covers an age).
          </p>
          {!policy ? (
            <p className="table-subcopy" style={{ color: '#b45309' }}>
              Save the age cut-offs above first — bands attach to a policy, and the policy
              has to exist before bands can be added.
            </p>
          ) : (
            <form action={createBandAction} className="entity-form compact-form">
              <div className="form-row form-row-4">
                <label>
                  Label
                  <input
                    type="text"
                    name="label"
                    required
                    maxLength={80}
                    placeholder="Children 6-12"
                  />
                </label>
                <label>
                  Min age
                  <input type="number" name="minAge" min={0} step="1" required placeholder="6" />
                </label>
                <label>
                  Max age
                  <input type="number" name="maxAge" min={0} step="1" required placeholder="12" />
                </label>
                <label>
                  Charge basis
                  <select name="chargeBasis" required defaultValue="PERCENT_OF_ADULT">
                    <option value="FREE">Free</option>
                    <option value="PERCENT_OF_ADULT">Percent of adult</option>
                    <option value="FIXED_AMOUNT">Fixed amount</option>
                  </select>
                </label>
              </div>
              <div className="form-row form-row-4">
                <label>
                  Charge value (blank if Free)
                  <input
                    type="number"
                    name="chargeValue"
                    min={0}
                    step="0.01"
                    placeholder="50"
                  />
                </label>
                <label style={{ gridColumn: 'span 3' }}>
                  Notes (optional)
                  <input
                    type="text"
                    name="notes"
                    maxLength={240}
                    placeholder="Sharing parents' bed only"
                  />
                </label>
              </div>
              <button type="submit" className="primary-button">
                Add band
              </button>
            </form>
          )}
        </section>

        {/* Bands list */}
        <section data-testid="hotel-v2-child-policy-band-list">
          <h2 className="section-title" style={{ fontSize: '1.05rem', marginBottom: '0.6rem' }}>
            Existing bands ({bands.length})
          </h2>
          {bands.length === 0 ? (
            <p className="table-subcopy">
              No child age bands yet. Add your first band above once the age cut-offs are
              saved. Ages outside any band default to the full adult rate.
            </p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Label</th>
                    <th>Age range</th>
                    <th>Charge basis</th>
                    <th>Value</th>
                    <th>Active</th>
                    <th>Notes</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {bands.map((b) => {
                    const deleteBandAction = deleteBand.bind(null, hotelId, contractId, b.id);
                    return (
                      <tr key={b.id}>
                        <td>
                          <strong>{b.label}</strong>
                        </td>
                        <td>
                          {b.minAge}–{b.maxAge} years
                        </td>
                        <td>{CHARGE_BASIS_LABELS[b.chargeBasis] || b.chargeBasis}</td>
                        <td>{formatChargeValue(b, contract.currency)}</td>
                        <td>{b.isActive ? 'Yes' : 'No'}</td>
                        <td style={{ maxWidth: '20rem' }}>{b.notes || '—'}</td>
                        <td>
                          <form action={deleteBandAction}>
                            <button
                              type="submit"
                              className="compact-button"
                              style={{
                                background: '#dc2626',
                                color: '#fff',
                                borderColor: '#dc2626',
                              }}
                            >
                              Delete
                            </button>
                          </form>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Stop-gap to legacy for band edit + audit history */}
        <section
          data-testid="hotel-v2-child-policy-legacy-bridge"
          className="detail-card"
          style={{
            marginTop: '1.5rem',
            marginBottom: '1rem',
            background: '#fffbeb',
            border: '1px solid #fde68a',
          }}
        >
          <h2 className="section-title" style={{ fontSize: '1rem', marginBottom: '0.4rem' }}>
            Editing existing bands + audit history
          </h2>
          <p className="table-subcopy" style={{ margin: 0 }}>
            Header upsert + add / delete bands work inline here. Single-band edit (change
            age range or charge without recreating) and the per-band audit log still live in
            the legacy workspace:{' '}
            <Link
              href={`/hotels/contracts/${contractId}`}
              prefetch={false}
              style={{ fontWeight: 600 }}
            >
              Open in legacy workspace →
            </Link>
          </p>
        </section>

        <p
          className="table-subcopy"
          style={{ marginTop: '1.5rem', color: '#94a3b8', fontSize: '0.75rem' }}
        >
          /hotels-v2/{hotelId}/contracts/{contractId}/child-policy — server-rendered.
          Policy upsert via PUT; band create / delete via Server Actions. Band edit ships
          in a follow-up.
        </p>
      </section>
    </main>
  );
}

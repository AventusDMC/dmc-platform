import Link from 'next/link';
import { notFound } from 'next/navigation';
import { adminPageFetchJson, isNextRedirectError } from '../../../lib/admin-server';
import { createContract } from './actions';

// Hotels Engine v2 — contracts list for a single hotel (PR-A1).
//
// Server-rendered. Lists every contract belonging to this hotel, with
// a minimal inline create form (name + validity + currency). The
// multi-step wizard (seasons → rates → supplements → cancellation)
// arrives in PR-A2..A5; this PR sticks to the minimum so operators
// can start tracking contracts immediately.

export const dynamic = 'force-dynamic';

const API_BASE_URL = '/api';

type HotelHeader = {
  id: string;
  name: string;
  city: string;
  category: string;
};

type ContractListItem = {
  id: string;
  hotelId: string;
  name: string;
  validFrom: string;
  validTo: string;
  currency: string;
  confidence: string | null;
  lastVerifiedAt: string | null;
  _count?: {
    rates?: number;
    quoteItems?: number;
    allotments?: number;
  };
};

async function getHotel(id: string): Promise<HotelHeader | null> {
  try {
    return await adminPageFetchJson<HotelHeader>(
      `${API_BASE_URL}/hotels/${encodeURIComponent(id)}`,
      'Hotel v2 contracts header',
      { cache: 'no-store', allow404: true },
    );
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error('[hotels-v2/contracts] hotel header unavailable', error);
    return null;
  }
}

async function getContracts(hotelId: string): Promise<ContractListItem[]> {
  try {
    const all = await adminPageFetchJson<ContractListItem[]>(
      `${API_BASE_URL}/hotel-contracts`,
      'Hotel v2 contracts list',
      { cache: 'no-store' },
    );
    if (!Array.isArray(all)) return [];
    return all.filter((c) => c.hotelId === hotelId);
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error('[hotels-v2/contracts] contracts list unavailable', error);
    return [];
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return iso;
  }
}

function confidenceLabel(c: string | null | undefined): { label: string; color: string } {
  switch (c) {
    case 'VERIFIED':
      return { label: 'Verified', color: '#15803d' };
    case 'NEEDS_REVIEW':
      return { label: 'Needs review', color: '#b45309' };
    case 'PRICING_INCOMPLETE':
      return { label: 'Pricing incomplete', color: '#b45309' };
    case 'SUPPLEMENT_REVIEW_REQUIRED':
      return { label: 'Supplement review', color: '#b45309' };
    case 'SEASON_CONFLICT':
      return { label: 'Season conflict', color: '#dc2626' };
    case 'IMPORTED_UNVERIFIED':
      return { label: 'Imported · unverified', color: '#94a3b8' };
    default:
      return { label: '—', color: '#94a3b8' };
  }
}

type Props = { params: Promise<{ id: string }> };

export default async function ContractsListPage({ params }: Props) {
  const { id: hotelId } = await params;
  const [hotel, contracts] = await Promise.all([getHotel(hotelId), getContracts(hotelId)]);

  if (!hotel) {
    notFound();
  }

  const createAction = createContract.bind(null, hotelId);
  // Default validity: today → +1 year, matches industry default contract lengths.
  const today = new Date();
  const inOneYear = new Date(today);
  inOneYear.setFullYear(inOneYear.getFullYear() + 1);
  const todayStr = today.toISOString().slice(0, 10);
  const inOneYearStr = inOneYear.toISOString().slice(0, 10);

  return (
    <main className="page">
      <section className="panel workspace-panel workspace-panel-wide">
        <header style={{ marginBottom: '1.5rem' }}>
          <p className="eyebrow">Hotels Engine v2 — Contracts</p>
          <h1 className="section-title">{hotel.name}</h1>
          <p className="copy section-copy">
            Hotel contracts define validity windows, currency, and the rate / supplement /
            cancellation rules used by the quote engine. Every contract is scoped to one
            hotel and one date range.
          </p>
          <p className="table-subcopy" style={{ marginTop: '0.5rem' }}>
            <Link href={`/hotels-v2/${hotelId}`} prefetch={false}>
              ← Back to {hotel.name}
            </Link>
          </p>
        </header>

        {/* Create form */}
        <section
          data-testid="hotel-v2-contract-create"
          className="detail-card"
          style={{ marginBottom: '1.5rem' }}
        >
          <h2 className="section-title" style={{ fontSize: '1.05rem', marginBottom: '0.6rem' }}>
            Add contract
          </h2>
          <p className="table-subcopy" style={{ marginTop: 0, marginBottom: '0.6rem' }}>
            Create the contract row first. Seasons, rates, supplements, cancellation policy
            and child policy are added inside the contract page.
          </p>
          <form action={createAction} className="entity-form compact-form">
            <div className="form-row form-row-4">
              <label>
                Name
                <input
                  type="text"
                  name="name"
                  placeholder="Summer 2026 BAR"
                  required
                  maxLength={120}
                />
              </label>
              <label>
                Valid from
                <input type="date" name="validFrom" required defaultValue={todayStr} />
              </label>
              <label>
                Valid to
                <input type="date" name="validTo" required defaultValue={inOneYearStr} />
              </label>
              <label>
                Currency
                <select name="currency" defaultValue="USD" required>
                  <option value="USD">USD</option>
                  <option value="JOD">JOD</option>
                  <option value="AED">AED</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                </select>
              </label>
            </div>
            <button type="submit" className="primary-button">
              Create contract
            </button>
          </form>
        </section>

        {/* List */}
        <section data-testid="hotel-v2-contract-list">
          <h2 className="section-title" style={{ fontSize: '1.05rem', marginBottom: '0.6rem' }}>
            Existing contracts ({contracts.length})
          </h2>
          {contracts.length === 0 ? (
            <p className="table-subcopy">
              No contracts yet for this hotel. Add your first one above. Each contract gets
              its own seasons / rates / supplements / cancellation policy.
            </p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Contract</th>
                    <th>Validity</th>
                    <th>Currency</th>
                    <th>Status</th>
                    <th className="numeric-cell">Rates</th>
                    <th className="numeric-cell">Allotments</th>
                    <th className="numeric-cell">Quote items</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {contracts.map((c) => {
                    const conf = confidenceLabel(c.confidence);
                    return (
                      <tr key={c.id}>
                        <td>
                          <strong>{c.name}</strong>
                        </td>
                        <td>
                          {formatDate(c.validFrom)} → {formatDate(c.validTo)}
                        </td>
                        <td>{c.currency}</td>
                        <td>
                          <span style={{ color: conf.color, fontWeight: 600, fontSize: '0.78rem' }}>
                            {conf.label}
                          </span>
                        </td>
                        <td className="numeric-cell">{c._count?.rates ?? 0}</td>
                        <td className="numeric-cell">{c._count?.allotments ?? 0}</td>
                        <td className="numeric-cell">{c._count?.quoteItems ?? 0}</td>
                        <td>
                          <Link
                            href={`/hotels-v2/${hotelId}/contracts/${c.id}`}
                            prefetch={false}
                            className="compact-button"
                          >
                            Open
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p
          className="table-subcopy"
          style={{ marginTop: '1.5rem', color: '#94a3b8', fontSize: '0.75rem' }}
        >
          /hotels-v2/{hotelId}/contracts — server-rendered with Server Actions for mutations.
          Seasons / rates / supplements / cancellation policy editors ship in PRs A2-A5.
        </p>
      </section>
    </main>
  );
}

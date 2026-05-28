import Link from 'next/link';
import { adminPageFetchJson, isNextRedirectError } from '../lib/admin-server';

// Hotels Engine v2 — Phase 1, foundation list view.
//
// Why this exists: the original /hotels page rendered a heavy inner
// chrome (17-item top nav, 10-chip ModuleSwitcher, WorkspaceShell,
// HotelsDirectoryErrorBoundary, lazy-mounted RoomCategoriesManager
// CRUD) that triggered Chrome's "Page Unresponsive" detector on
// every cold-start visit. Even with the lazy-mount + row memo
// optimizations from PRs #142-#143 the chrome itself was too heavy.
//
// /hotels-v2 is the clean rebuild: this list page is a PURE server
// component. Zero client JS beyond what the global AdminChromeNav
// already loads. The 12 hotels render as a static HTML table.
//
// Subsequent PRs add:
//   /hotels-v2/[id]           — hotel detail
//   /hotels-v2/[id]/rooms     — room types CRUD
//   /hotels-v2/[id]/contracts/new — contract wizard
//   /hotels-v2/[id]/allotments — inventory calendar
//   /hotels-v2/quote-simulator — pricing simulator

export const dynamic = 'force-dynamic';

const API_BASE_URL = '/api';

type HotelDirectorySummary = {
  id: string;
  name: string;
  city: string;
  category: string;
  isActive: boolean;
  supplierName: string | null;
  contractCount: number;
  roomCategoryCount: number;
  confidenceSummary: 'verified' | 'needs-review' | 'mixed' | 'no-contracts';
  hasVerifiedContract: boolean;
};

async function getHotels(): Promise<HotelDirectorySummary[]> {
  try {
    return await adminPageFetchJson<HotelDirectorySummary[]>(
      `${API_BASE_URL}/hotels/directory-summary`,
      'Hotels v2 directory',
      { cache: 'no-store' },
    );
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }
    console.error('[hotels-v2] directory summary unavailable', error);
    return [];
  }
}

function confidenceBadge(summary: HotelDirectorySummary['confidenceSummary']) {
  if (summary === 'verified') return { label: 'Verified', color: '#15803d' };
  if (summary === 'needs-review') return { label: 'Needs review', color: '#b45309' };
  if (summary === 'mixed') return { label: 'Mixed', color: '#475467' };
  return { label: 'No contracts', color: '#94a3b8' };
}

export default async function HotelsV2ListPage() {
  const hotels = await getHotels();
  const totalContracts = hotels.reduce((sum, h) => sum + h.contractCount, 0);
  const totalRoomCategories = hotels.reduce((sum, h) => sum + h.roomCategoryCount, 0);
  const verifiedCount = hotels.filter((h) => h.hasVerifiedContract).length;

  return (
    <main className="page">
      <section className="panel workspace-panel workspace-panel-wide">
        <header style={{ marginBottom: '1.5rem' }}>
          <p className="eyebrow">Hotels Engine v2 — Phase 1</p>
          <h1 className="section-title">Hotels</h1>
          <p className="copy section-copy">
            Clean rebuild of the hotels workspace. Pure server-rendered list — no heavy
            client chrome, no inner navigation. Click a hotel to see its detail in the
            new architecture.
          </p>
          <p className="table-subcopy" style={{ marginTop: '0.5rem' }}>
            <Link href="/hotels-v2/import" prefetch={false}>
              Import from RateHawk
            </Link>
            {' · '}
            <Link href="/admin/hotel-engine-health">Engine health &amp; cleanup</Link>
            {' · '}
            <Link href="/hotels">Legacy /hotels page</Link>
          </p>
        </header>

        <section
          data-testid="hotels-v2-summary"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '0.75rem',
            marginBottom: '1.5rem',
          }}
        >
          <SummaryCard label="Hotels" value={hotels.length} helper="Master records" />
          <SummaryCard label="Contracts" value={totalContracts} helper="Total across all hotels" />
          <SummaryCard label="Room categories" value={totalRoomCategories} helper="Total across all hotels" />
          <SummaryCard label="Verified" value={verifiedCount} helper="At least one verified contract" />
        </section>

        {hotels.length === 0 ? (
          <div className="detail-card" role="status">
            <p className="eyebrow">Empty catalog</p>
            <h2>No hotels yet</h2>
            <p className="detail-copy">
              The hotels table is empty. Import a contract or create a hotel directly to
              get started.
            </p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table" data-testid="hotels-v2-table">
              <thead>
                <tr>
                  <th>Hotel</th>
                  <th>City</th>
                  <th>Category</th>
                  <th>Supplier</th>
                  <th className="numeric-cell">Contracts</th>
                  <th className="numeric-cell">Room types</th>
                  <th>Confidence</th>
                </tr>
              </thead>
              <tbody>
                {hotels.map((hotel) => {
                  const badge = confidenceBadge(hotel.confidenceSummary);
                  return (
                    <tr key={hotel.id}>
                      <td>
                        <Link
                          href={`/hotels-v2/${hotel.id}`}
                          prefetch={false}
                          style={{ fontWeight: 600 }}
                        >
                          {hotel.name || '(unnamed)'}
                        </Link>
                      </td>
                      <td>{hotel.city || '—'}</td>
                      <td>{hotel.category || '—'}</td>
                      <td>{hotel.supplierName || '—'}</td>
                      <td className="numeric-cell">{hotel.contractCount}</td>
                      <td className="numeric-cell">{hotel.roomCategoryCount}</td>
                      <td>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '0.15rem 0.5rem',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            borderRadius: 999,
                            color: badge.color,
                            border: `1px solid ${badge.color}`,
                          }}
                        >
                          {badge.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="table-subcopy" style={{ marginTop: '1.5rem', color: '#94a3b8', fontSize: '0.75rem' }}>
          /hotels-v2 — pure server component, no client JS beyond the global admin shell.
          Detail pages and the contract wizard ship in subsequent PRs.
        </p>
      </section>
    </main>
  );
}

function SummaryCard({ label, value, helper }: { label: string; value: number; helper: string }) {
  return (
    <article className="detail-card" style={{ padding: '0.75rem' }}>
      <p className="eyebrow" style={{ margin: 0, fontSize: '0.7rem' }}>
        {label}
      </p>
      <strong style={{ fontSize: '1.6rem', display: 'block', margin: '0.2rem 0' }}>
        {value.toLocaleString()}
      </strong>
      <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{helper}</span>
    </article>
  );
}

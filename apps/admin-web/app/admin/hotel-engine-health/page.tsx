import Link from 'next/link';
import { adminPageFetchJson, isNextRedirectError } from '../../lib/admin-server';
import { CleanupActions } from './CleanupActions';

// Hotel Engine Phase 0 — health dashboard.
//
// Surfaces backend counts + bad-data flags so operators can:
//   - See at a glance how many hotels / contracts / rates / categories
//     are in the DB
//   - Identify malformed records left by bad contract imports (room
//     categories with null/empty name, orphans, etc.)
//   - Trigger destructive cleanup (wipe all contracts, wipe invalid
//     room categories) with explicit confirmation tokens
//
// Backed by GET /hotels/admin/engine-health (read-only) +
// POST /hotels/admin/wipe-contracts +
// POST /hotels/admin/wipe-invalid-room-categories.

export const dynamic = 'force-dynamic';

const API_BASE_URL = '/api';

type EngineHealth = {
  counts: {
    hotels: number;
    contracts: number;
    rates: number;
    allotments: number;
    roomCategories: number;
  };
  problems: {
    roomCategoriesWithEmptyName: number;
    roomCategoriesWithoutHotel: number;
  };
  generatedAt: string;
};

async function getEngineHealth(): Promise<EngineHealth | null> {
  try {
    return await adminPageFetchJson<EngineHealth>(
      `${API_BASE_URL}/hotels/admin/engine-health`,
      'Hotel engine health',
      { cache: 'no-store' },
    );
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }
    console.error('[hotel-engine-health] could not load health audit', error);
    return null;
  }
}

export default async function HotelEngineHealthPage() {
  const health = await getEngineHealth();
  const totalProblems = health
    ? health.problems.roomCategoriesWithEmptyName + health.problems.roomCategoriesWithoutHotel
    : 0;

  return (
    <main className="page">
      <section className="panel workspace-panel workspace-panel-wide">
        <header style={{ marginBottom: '1.5rem' }}>
          <p className="eyebrow">Hotel Engine — Phase 0</p>
          <h1 className="section-title">Engine Health & Cleanup</h1>
          <p className="copy section-copy">
            Backend audit of the hotel data layer. Use this page to see the current data
            shape and to wipe test contracts / invalid room categories before the
            Phase 1 UI rebuild.
          </p>
          <p className="table-subcopy" style={{ marginTop: '0.5rem' }}>
            <Link href="/hotels">← Back to Hotels workspace</Link>
          </p>
        </header>

        {health === null ? (
          <div className="detail-card" role="alert">
            <p className="eyebrow">Audit unavailable</p>
            <h2>Could not load engine health</h2>
            <p className="detail-copy">
              The /hotels/admin/engine-health endpoint is not responding. Check the
              API logs.
            </p>
          </div>
        ) : (
          <>
            <section
              data-testid="hotel-engine-counts"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: '0.75rem',
                marginBottom: '1.5rem',
              }}
            >
              <CountCard label="Hotels" value={health.counts.hotels} helper="Master records" />
              <CountCard label="Contracts" value={health.counts.contracts} helper="hotel_contracts" />
              <CountCard label="Rates" value={health.counts.rates} helper="hotel_rates" />
              <CountCard label="Allotments" value={health.counts.allotments} helper="hotel_allotments" />
              <CountCard label="Room categories" value={health.counts.roomCategories} helper="hotel_room_categories" />
            </section>

            <section
              data-testid="hotel-engine-problems"
              style={{ marginBottom: '1.5rem' }}
            >
              <h2 className="section-title" style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>
                Data quality
              </h2>
              {totalProblems === 0 ? (
                <p className="table-subcopy">
                  No data-quality issues detected — every room category has a hotel and a name.
                </p>
              ) : (
                <ul className="entity-list" style={{ paddingLeft: '1rem' }}>
                  {health.problems.roomCategoriesWithEmptyName > 0 ? (
                    <li>
                      <strong style={{ color: '#dc2626' }}>
                        {health.problems.roomCategoriesWithEmptyName}
                      </strong>{' '}
                      room categor{health.problems.roomCategoriesWithEmptyName === 1 ? 'y' : 'ies'} with
                      empty or null name. These crashed the client-side hydration of the
                      /hotels?tab=room-categories page (the long-standing blank-page bug).
                    </li>
                  ) : null}
                  {health.problems.roomCategoriesWithoutHotel > 0 ? (
                    <li>
                      <strong style={{ color: '#dc2626' }}>
                        {health.problems.roomCategoriesWithoutHotel}
                      </strong>{' '}
                      orphaned room categor
                      {health.problems.roomCategoriesWithoutHotel === 1 ? 'y' : 'ies'} —
                      hotel record has been removed but the category survived.
                    </li>
                  ) : null}
                </ul>
              )}
            </section>

            <section data-testid="hotel-engine-cleanup-actions">
              <h2 className="section-title" style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>
                Cleanup actions
              </h2>
              <p className="table-subcopy" style={{ marginBottom: '0.75rem' }}>
                Destructive. Each action requires explicit confirmation in the dialog
                before it runs.
              </p>
              <CleanupActions
                contractCount={health.counts.contracts}
                invalidRoomCategoryCount={health.problems.roomCategoriesWithEmptyName}
              />
            </section>

            <p
              className="table-subcopy"
              style={{ marginTop: '1.5rem', color: '#94a3b8', fontSize: '0.75rem' }}
            >
              Audit generated at {health.generatedAt}
            </p>
          </>
        )}
      </section>
    </main>
  );
}

function CountCard({ label, value, helper }: { label: string; value: number; helper: string }) {
  return (
    <article className="detail-card" style={{ padding: '0.75rem' }}>
      <p className="eyebrow" style={{ margin: 0, fontSize: '0.7rem' }}>{label}</p>
      <strong style={{ fontSize: '1.6rem', display: 'block', margin: '0.2rem 0' }}>
        {value.toLocaleString()}
      </strong>
      <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{helper}</span>
    </article>
  );
}

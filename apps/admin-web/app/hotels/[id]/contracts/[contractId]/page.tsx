import Link from 'next/link';
import { notFound } from 'next/navigation';
import { adminPageFetchJson, isNextRedirectError } from '../../../../lib/admin-server';

// Hotels Engine — single contract detail (PR-A1).
//
// Read-only summary. The real editors (rate matrix, supplements,
// cancellation policy, child policy, seasons) all already exist in the
// /hotel-contracts legacy workspace and will be progressively reintroduced
// in PR-A2..A5 with proper v2 UX. For now this page surfaces the contract
// metadata and counts, and links back to the legacy workspace for
// operators who need to edit child policies / supplements etc. today.

export const dynamic = 'force-dynamic';

const API_BASE_URL = '/api';

type RoomCategoryAggregate = {
  id: string;
  name: string;
  code: string | null;
  rateCount: number;
  seasonCount: number;
  mealPlanCount: number;
  supplementCount: number;
  occupancyTypes: string[];
  costRange: { min: number | null; max: number | null; currency: string | null } | null;
};

// Shape the backend actually returns from
// GET /hotel-contracts/:id/room-types-summary — wraps the per-room
// aggregate inside a `rooms` array on a contract envelope object.
// PR-A1 typed this as a flat array and called .length / .map() directly,
// which crashed the page server-side on any contract.
type RoomTypesSummaryResponse = {
  contractId: string;
  hotelId: string;
  hotelName: string;
  currency: string;
  totalRoomCategories: number;
  totalRates: number;
  rooms: Array<{
    id: string;
    name: string;
    code: string | null;
    description: string | null;
    isActive: boolean;
    rateCount: number;
    minCost: number | null;
    maxCost: number | null;
    currency: string | null;
    occupancyTypes: string[];
    mealPlans: string[];
    seasonNames: string[];
    supplementCount: number;
  }>;
};

type ContractSummary = {
  id: string;
  hotelId: string;
  name: string;
  validFrom: string;
  validTo: string;
  currency: string;
  confidence: string | null;
  lastVerifiedAt: string | null;
  verifiedBy: string | null;
  verificationNotes: string | null;
  hotel: {
    id: string;
    name: string;
    city: string;
    category: string;
    roomCategories: Array<{ id: string; name: string; code: string | null; isActive: boolean }>;
    _count?: { roomCategories?: number };
  };
  _count?: {
    rates?: number;
    quoteItems?: number;
    allotments?: number;
    supplements?: number;
    mealPlans?: number;
  };
};

async function getContractSummary(contractId: string): Promise<ContractSummary | null> {
  try {
    return await adminPageFetchJson<ContractSummary>(
      `${API_BASE_URL}/hotel-contracts/${encodeURIComponent(contractId)}?summary=1`,
      'Hotel contract summary',
      { cache: 'no-store', allow404: true },
    );
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error('[hotels/contract] summary unavailable', error);
    return null;
  }
}

async function getRoomTypesAggregate(contractId: string): Promise<RoomCategoryAggregate[]> {
  try {
    const response = await adminPageFetchJson<RoomTypesSummaryResponse | null>(
      `${API_BASE_URL}/hotel-contracts/${encodeURIComponent(contractId)}/room-types-summary`,
      'Hotel contract room types',
      { cache: 'no-store', allow404: true },
    );
    const rooms = response?.rooms;
    if (!Array.isArray(rooms)) return [];
    // Reshape backend fields to the display shape this page uses:
    // - seasonCount  ← seasonNames.length
    // - mealPlanCount ← mealPlans.length
    // - costRange    ← { min: minCost, max: maxCost, currency }
    return rooms.map((r) => ({
      id: r.id,
      name: r.name,
      code: r.code,
      rateCount: r.rateCount,
      seasonCount: Array.isArray(r.seasonNames) ? r.seasonNames.length : 0,
      mealPlanCount: Array.isArray(r.mealPlans) ? r.mealPlans.length : 0,
      supplementCount: r.supplementCount ?? 0,
      occupancyTypes: Array.isArray(r.occupancyTypes) ? r.occupancyTypes : [],
      costRange:
        r.minCost != null || r.maxCost != null
          ? { min: r.minCost, max: r.maxCost, currency: r.currency }
          : null,
    }));
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error('[hotels/contract] room types unavailable', error);
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

type Props = { params: Promise<{ id: string; contractId: string }> };

export default async function ContractDetailPage({ params }: Props) {
  const { id: hotelId, contractId } = await params;
  const [contract, roomAggregates] = await Promise.all([
    getContractSummary(contractId),
    getRoomTypesAggregate(contractId),
  ]);

  if (!contract) notFound();
  if (contract.hotelId !== hotelId) {
    // Defensive: routes always match because the link comes from the
    // parent page, but a hand-typed URL could land here. Treat as 404.
    notFound();
  }

  const conf = confidenceLabel(contract.confidence);
  const totalRoomTypes = contract.hotel.roomCategories.length;
  const totalRates = contract._count?.rates ?? 0;
  const totalSupplements = contract._count?.supplements ?? 0;
  const totalMealPlans = contract._count?.mealPlans ?? 0;
  const totalAllotments = contract._count?.allotments ?? 0;
  const totalQuoteItems = contract._count?.quoteItems ?? 0;

  return (
    <main className="page">
      <section className="panel workspace-panel workspace-panel-wide">
        <header style={{ marginBottom: '1.5rem' }}>
          <p className="eyebrow">Hotels Engine — Contract</p>
          <h1 className="section-title">{contract.name}</h1>
          <p className="copy section-copy">
            {contract.hotel.name} · {formatDate(contract.validFrom)} →{' '}
            {formatDate(contract.validTo)} · {contract.currency}
          </p>
          <p className="table-subcopy" style={{ marginTop: '0.5rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem' }}>
            <Link href={`/hotels/${hotelId}/contracts`} prefetch={false}>
              ← Back to contracts
            </Link>
            <span style={{ color: '#cbd5e1' }}>·</span>
            {/* Excel round-trip: download the whole contract as a
                multi-sheet workbook, edit offline, re-import. Renders as
                a plain anchor with the `download` attribute so the
                browser triggers the file save dialog instead of opening
                an Excel preview pane inside Next.js. */}
            <a
              href={`/api/hotel-contracts/${contractId}/export.xlsx`}
              download
              className="compact-button"
              style={{ textDecoration: 'none' }}
            >
              Download Excel
            </a>
            {' · '}
            <Link href={`/hotels/${hotelId}`} prefetch={false}>
              {contract.hotel.name}
            </Link>
          </p>
        </header>

        {/* Master data */}
        <section
          data-testid="hotel-contract-master"
          className="detail-card"
          style={{ marginBottom: '1.5rem' }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '0.6rem',
              gap: '0.75rem',
            }}
          >
            <h2 className="section-title" style={{ fontSize: '1.05rem', margin: 0 }}>
              Contract master data
            </h2>
            <Link
              href={`/hotels/${hotelId}/contracts/${contractId}/edit`}
              prefetch={false}
              className="compact-button"
              style={{ textDecoration: 'none' }}
            >
              Edit details
            </Link>
          </div>
          <dl
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
              columnGap: '1rem',
              rowGap: '0.4rem',
              margin: 0,
            }}
          >
            <Field label="Name">{contract.name}</Field>
            <Field label="Validity">
              {formatDate(contract.validFrom)} → {formatDate(contract.validTo)}
            </Field>
            <Field label="Currency">{contract.currency}</Field>
            <Field label="Status">
              <span style={{ color: conf.color, fontWeight: 600 }}>{conf.label}</span>
              {contract.lastVerifiedAt ? (
                <span style={{ color: '#94a3b8', fontSize: '0.8rem', marginLeft: '0.5rem' }}>
                  last verified {formatDate(contract.lastVerifiedAt)}
                </span>
              ) : null}
            </Field>
            {contract.verificationNotes ? (
              <Field label="Verification notes">{contract.verificationNotes}</Field>
            ) : null}
          </dl>
        </section>

        {/* Counts row */}
        <section
          data-testid="hotel-contract-counts"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '0.6rem',
            marginBottom: '1.5rem',
          }}
        >
          <CountCard label="Room types" value={totalRoomTypes} />
          <CountCard
            label="Rate cells"
            value={totalRates}
            href={`/hotels/${hotelId}/contracts/${contractId}/rates`}
          />
          <CountCard
            label="Meal plans"
            value={totalMealPlans}
            href={`/hotels/${hotelId}/contracts/${contractId}/meal-plans`}
          />
          <CountCard
            label="Supplements"
            value={totalSupplements}
            href={`/hotels/${hotelId}/contracts/${contractId}/supplements`}
          />
          <CountCard label="Allotment ranges" value={totalAllotments} />
          <CountCard label="Linked quote items" value={totalQuoteItems} />
        </section>

        {/* Editor shortcuts — every commercial entity addressable in v2,
            surfaced as visible action cards instead of buried in body
            text. The counts row above is at-a-glance only; this block
            is what an operator clicks when they're ready to edit. */}
        <section
          data-testid="hotel-contract-editors"
          style={{ marginBottom: '1.5rem' }}
        >
          <h2 className="section-title" style={{ fontSize: '1.05rem', marginBottom: '0.6rem' }}>
            Edit contract
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '0.6rem',
            }}
          >
            <EditorCard
              label="Rate cells"
              description="Per room × season × occupancy × meal plan rates"
              href={`/hotels/${hotelId}/contracts/${contractId}/rates`}
            />
            <EditorCard
              label="Supplements"
              description="Extra breakfast, gala dinner, extra bed, etc."
              href={`/hotels/${hotelId}/contracts/${contractId}/supplements`}
            />
            <EditorCard
              label="Cancellation policy"
              description="No-show penalty + cancel-window rules"
              href={`/hotels/${hotelId}/contracts/${contractId}/cancellation`}
            />
            <EditorCard
              label="Child policy"
              description="Age cut-offs + per-age-band charge rules"
              href={`/hotels/${hotelId}/contracts/${contractId}/child-policy`}
            />
            <EditorCard
              label="Meal plans"
              description="Which board bases this contract offers"
              href={`/hotels/${hotelId}/contracts/${contractId}/meal-plans`}
            />
          </div>
        </section>

        {/* Per-room aggregate */}
        <section data-testid="hotel-contract-rooms" style={{ marginBottom: '1.5rem' }}>
          <h2 className="section-title" style={{ fontSize: '1.05rem', marginBottom: '0.6rem' }}>
            Room types covered ({roomAggregates.length})
          </h2>
          {roomAggregates.length === 0 ? (
            <p className="table-subcopy">
              No room types have rates on this contract yet. Use the{' '}
              <Link
                href={`/hotels/${hotelId}/contracts/${contractId}/rates`}
                prefetch={false}
                style={{ fontWeight: 600 }}
              >
                rate cells editor
              </Link>
              {' '}to add your first rate, or jump to the legacy workspace below for the full
              matrix UI.
            </p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Room type</th>
                    <th>Code</th>
                    <th className="numeric-cell">Rates</th>
                    <th className="numeric-cell">Seasons</th>
                    <th className="numeric-cell">Meal plans</th>
                    <th className="numeric-cell">Supplements</th>
                    <th>Occupancy</th>
                    <th>Cost range</th>
                  </tr>
                </thead>
                <tbody>
                  {roomAggregates.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <strong>{r.name}</strong>
                      </td>
                      <td>{r.code || '—'}</td>
                      <td className="numeric-cell">{r.rateCount}</td>
                      <td className="numeric-cell">{r.seasonCount}</td>
                      <td className="numeric-cell">{r.mealPlanCount}</td>
                      <td className="numeric-cell">{r.supplementCount}</td>
                      <td>{r.occupancyTypes.length > 0 ? r.occupancyTypes.join(' · ') : '—'}</td>
                      <td>
                        {r.costRange && r.costRange.min != null && r.costRange.max != null
                          ? `${r.costRange.min.toFixed(2)} – ${r.costRange.max.toFixed(2)} ${r.costRange.currency || contract.currency}`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Backlog still pending. Surfaces a friendly note instead of
            silently missing functionality — these flows are tracked but
            don't have a UI yet. */}
        <section
          data-testid="hotel-contract-backlog"
          className="detail-card"
          style={{ marginBottom: '1rem', background: '#fffbeb', border: '1px solid #fde68a' }}
        >
          <h2 className="section-title" style={{ fontSize: '1rem', marginBottom: '0.4rem' }}>
            Coming soon
          </h2>
          <p className="table-subcopy" style={{ margin: 0 }}>
            Bulk PDF import of contract terms is at <Link href="/contracts/import" prefetch={false} style={{ fontWeight: 600 }}>Import Contract →</Link>.
            Per-entity audit log, the "mark as default" meal plan toggle, and the per-rate
            seasons editor are on the backlog and will land in follow-up releases.
          </p>
        </section>

        <p
          className="table-subcopy"
          style={{ marginTop: '1.5rem', color: '#94a3b8', fontSize: '0.75rem' }}
        >
          /hotels/{hotelId}/contracts/{contract.id} — read-only summary. v2 editors arrive
          in subsequent PRs.
        </p>
      </section>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt style={{ color: '#475467', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>{label}</dt>
      <dd style={{ margin: 0, fontWeight: 500 }}>{children}</dd>
    </>
  );
}

function EditorCard({
  label,
  description,
  href,
}: {
  label: string;
  description: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      className="detail-card"
      style={{
        padding: '0.75rem 0.9rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.25rem',
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <strong style={{ fontSize: '0.95rem' }}>{label}</strong>
        <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>→</span>
      </div>
      <div style={{ color: '#475467', fontSize: '0.8rem' }}>{description}</div>
    </Link>
  );
}

function CountCard({ label, value, href }: { label: string; value: number; href?: string }) {
  const inner = (
    <>
      <div style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {label}
      </div>
      <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{value.toLocaleString()}</div>
    </>
  );
  const baseStyle: React.CSSProperties = {
    padding: '0.6rem 0.8rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.2rem',
  };
  if (href) {
    return (
      <Link
        href={href}
        prefetch={false}
        className="detail-card"
        style={{ ...baseStyle, textDecoration: 'none', color: 'inherit' }}
      >
        {inner}
      </Link>
    );
  }
  return (
    <div className="detail-card" style={baseStyle}>
      {inner}
    </div>
  );
}

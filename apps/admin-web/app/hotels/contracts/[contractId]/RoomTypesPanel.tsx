'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// Room Types lightweight panel for the hotel contract workspace.
//
// Loads `GET /api/hotel-contracts/:id/room-types-summary` on tab open.
// That endpoint returns ONE row per HotelRoomCategory plus aggregate
// counts (rates / occupancy / meal plans / supplements) — never the
// full rate matrix. The expensive per-room rate matrix loads only when
// the operator expands a specific room (`fetchRoomRates`).
//
// This panel intentionally:
//   - never reads the heavy contract blob (rate policy JSON, cancellation
//     rules, allotment list) — only the summary it owns
//   - never iterates the full /hotel-rates response — pagination cap
//     enforced server-side, mirrored client-side
//   - uses an AbortController to cancel inflight fetches if the user
//     switches tabs / contracts mid-fetch (prevents stale setState
//     after unmount → no infinite update loops)

export type RoomTypeSummaryEntry = {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  isActive: boolean;
  rateCount: number;
  minCost: number | null;
  maxCost: number | null;
  currency: string;
  occupancyTypes: string[];
  mealPlans: string[];
  seasonNames: string[];
  supplementCount: number;
};

export type RoomTypeSummaryResponse = {
  contractId: string;
  hotelId: string;
  hotelName: string;
  validFrom: string;
  validTo: string;
  currency: string;
  totalRoomCategories: number;
  totalRates: number;
  rooms: RoomTypeSummaryEntry[];
};

export type RoomRateDetail = {
  id: string;
  seasonName: string;
  occupancyType: string;
  mealPlan: string;
  cost: number;
  currency: string;
};

// Threshold mirrors the workspace-level CONTRACT_SAFE_MODE_THRESHOLD —
// keep them aligned. When EITHER side trips, the heavy paths render
// the summary-first banner copy.
const LARGE_CONTRACT_RATE_THRESHOLD = 200;

type Props = {
  apiBaseUrl: string;
  contractId: string;
  // Optional: per-room detail fetcher. The default uses
  // /api/hotel-rates?contractId=:id&roomCategoryId=:rid&limit=50 — tests
  // override this to assert that no full-blob fetch happens.
  fetchRoomRates?: (roomCategoryId: string, signal: AbortSignal) => Promise<RoomRateDetail[]>;
  fetchSummary?: (signal: AbortSignal) => Promise<RoomTypeSummaryResponse>;
};

export function RoomTypesPanel({ apiBaseUrl, contractId, fetchRoomRates, fetchSummary }: Props) {
  const [summary, setSummary] = useState<RoomTypeSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRoomId, setExpandedRoomId] = useState<string | null>(null);
  const [roomDetail, setRoomDetail] = useState<Record<string, { loading: boolean; rates: RoomRateDetail[]; error: string | null }>>({});

  // Stable refs for the fetcher overrides — passing them via props can
  // make a parent's identity change every render, which would otherwise
  // re-trigger our load effect every render. The ref pattern keeps the
  // effect deps tiny (just contractId + apiBaseUrl).
  const summaryFetcherRef = useRef(fetchSummary);
  const detailFetcherRef = useRef(fetchRoomRates);
  summaryFetcherRef.current = fetchSummary;
  detailFetcherRef.current = fetchRoomRates;

  const loadSummary = useCallback(
    async (signal: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const result = summaryFetcherRef.current
          ? await summaryFetcherRef.current(signal)
          : await defaultFetchSummary(apiBaseUrl, contractId, signal);
        if (!signal.aborted) {
          setSummary(result);
        }
      } catch (err) {
        if (signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Could not load room types.');
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [apiBaseUrl, contractId],
  );

  useEffect(() => {
    const controller = new AbortController();
    loadSummary(controller.signal);
    return () => controller.abort();
  }, [loadSummary]);

  const isLargeContract = useMemo(
    () => (summary?.totalRates || 0) > LARGE_CONTRACT_RATE_THRESHOLD,
    [summary?.totalRates],
  );

  const toggleRoom = useCallback(
    async (room: RoomTypeSummaryEntry) => {
      if (expandedRoomId === room.id) {
        setExpandedRoomId(null);
        return;
      }

      setExpandedRoomId(room.id);
      // Re-use cached detail if we already loaded it for this room.
      if (roomDetail[room.id]?.rates) {
        return;
      }
      // Don't bother fetching if the room has no rates — service already
      // told us so via rateCount.
      if (room.rateCount === 0) {
        setRoomDetail((current) => ({
          ...current,
          [room.id]: { loading: false, rates: [], error: null },
        }));
        return;
      }

      setRoomDetail((current) => ({
        ...current,
        [room.id]: { loading: true, rates: [], error: null },
      }));
      const controller = new AbortController();
      try {
        const rates = detailFetcherRef.current
          ? await detailFetcherRef.current(room.id, controller.signal)
          : await defaultFetchRoomRates(apiBaseUrl, contractId, room.id, controller.signal);
        if (controller.signal.aborted) return;
        setRoomDetail((current) => ({
          ...current,
          [room.id]: { loading: false, rates, error: null },
        }));
      } catch (err) {
        if (controller.signal.aborted) return;
        setRoomDetail((current) => ({
          ...current,
          [room.id]: {
            loading: false,
            rates: [],
            error: err instanceof Error ? err.message : 'Could not load room detail.',
          },
        }));
      }
    },
    [apiBaseUrl, contractId, expandedRoomId, roomDetail],
  );

  if (loading) {
    return (
      <section className="contract-workspace-card" data-testid="room-types-loading">
        <p className="empty-state">Loading room types summary…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="contract-workspace-card" role="alert">
        <p className="form-error">{error}</p>
        <button
          type="button"
          className="compact-button"
          onClick={() => {
            const controller = new AbortController();
            loadSummary(controller.signal);
          }}
        >
          Retry
        </button>
      </section>
    );
  }

  if (!summary || summary.rooms.length === 0) {
    return (
      <section className="contract-workspace-card">
        <p className="empty-state">No room categories are connected to this contract hotel yet.</p>
      </section>
    );
  }

  return (
    <section className="contract-workspace-card" data-testid="room-types-panel">
      <div className="section-header-inline">
        <div>
          <p className="eyebrow">Rooms</p>
          <h3>Room Types</h3>
          <p>
            {summary.rooms.length} room categories &middot; {summary.totalRates} rates across all rooms.
            Click a room to load its rate detail.
          </p>
        </div>
        <span>{summary.totalRoomCategories} total</span>
      </div>

      {isLargeContract ? (
        <p className="table-subcopy" role="status">
          Large contract — showing summary first. Each room loads its own rate detail on demand.
        </p>
      ) : null}

      <ul className="contract-list-stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {summary.rooms.map((room) => {
          const isExpanded = expandedRoomId === room.id;
          const detail = roomDetail[room.id];
          return (
            <li key={room.id} className="contract-list-row contract-list-row-wide" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <button
                type="button"
                onClick={() => toggleRoom(room)}
                aria-expanded={isExpanded}
                aria-controls={`room-detail-${room.id}`}
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  textAlign: 'left',
                  cursor: 'pointer',
                  width: '100%',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '0.75rem',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                  <strong>
                    {room.name}
                    {room.code ? <small style={{ marginLeft: '0.4rem', color: '#667085' }}>({room.code})</small> : null}
                  </strong>
                  <span style={{ fontSize: '0.78rem', color: '#475467' }}>
                    {room.rateCount} rates
                    {room.occupancyTypes.length > 0 ? ` · ${room.occupancyTypes.join(' / ')}` : ''}
                    {room.mealPlans.length > 0 ? ` · ${room.mealPlans.join(' / ')}` : ''}
                    {room.supplementCount > 0 ? ` · ${room.supplementCount} supplements` : ''}
                  </span>
                  {room.minCost !== null && room.maxCost !== null ? (
                    <span style={{ fontSize: '0.78rem', color: '#475467' }}>
                      {room.minCost === room.maxCost
                        ? `${room.minCost.toFixed(2)} ${room.currency}`
                        : `${room.minCost.toFixed(2)} – ${room.maxCost.toFixed(2)} ${room.currency}`}
                    </span>
                  ) : null}
                </div>
                <span aria-hidden="true" style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                  {isExpanded ? '▾' : '▸'}
                </span>
              </button>

              {isExpanded ? (
                <div id={`room-detail-${room.id}`} style={{ marginTop: '0.6rem' }}>
                  {detail?.loading ? <p className="empty-state">Loading rate detail…</p> : null}
                  {detail?.error ? <p className="form-error">{detail.error}</p> : null}
                  {detail && !detail.loading && !detail.error && detail.rates.length === 0 ? (
                    <p className="empty-state">No rate rows for this room category yet.</p>
                  ) : null}
                  {detail && detail.rates.length > 0 ? (
                    <div className="table-wrap">
                      <table className="data-table" data-testid={`room-detail-table-${room.id}`}>
                        <thead>
                          <tr>
                            <th>Season</th>
                            <th>Occupancy</th>
                            <th>Board</th>
                            <th>Cost</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.rates.map((rate) => (
                            <tr key={rate.id}>
                              <td>{rate.seasonName}</td>
                              <td>{rate.occupancyType}</td>
                              <td>{rate.mealPlan}</td>
                              <td className="numeric-cell">
                                {Number(rate.cost).toFixed(2)} {rate.currency}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {detail.rates.length >= 50 ? (
                        <p className="table-subcopy">
                          Showing the first 50 rates for this room. Open the classic Rates view for the full matrix.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

async function defaultFetchSummary(apiBaseUrl: string, contractId: string, signal: AbortSignal): Promise<RoomTypeSummaryResponse> {
  const response = await fetch(`${apiBaseUrl}/hotel-contracts/${encodeURIComponent(contractId)}/room-types-summary`, {
    cache: 'no-store',
    signal,
  });
  if (!response.ok) {
    throw new Error(`Could not load room types summary (${response.status})`);
  }
  return (await response.json()) as RoomTypeSummaryResponse;
}

async function defaultFetchRoomRates(
  apiBaseUrl: string,
  contractId: string,
  roomCategoryId: string,
  signal: AbortSignal,
): Promise<RoomRateDetail[]> {
  // Re-uses the existing /hotel-rates list endpoint with both
  // contractId + roomCategoryId filters + the same 50-row cap that the
  // Rates tab enforces. We deliberately fetch ONLY the columns the
  // expanded row renders — extra metadata stays in the classic view.
  const url = `${apiBaseUrl}/hotel-rates?contractId=${encodeURIComponent(contractId)}&roomCategoryId=${encodeURIComponent(roomCategoryId)}&limit=50&offset=0`;
  const response = await fetch(url, { cache: 'no-store', signal });
  if (!response.ok) {
    throw new Error(`Could not load room rates (${response.status})`);
  }
  const payload = (await response.json()) as Array<{
    id: string;
    seasonName: string;
    occupancyType: string;
    mealPlan: string;
    cost: number;
    currency: string;
  }>;
  return (payload || []).map((rate) => ({
    id: rate.id,
    seasonName: rate.seasonName,
    occupancyType: rate.occupancyType,
    mealPlan: rate.mealPlan,
    cost: Number(rate.cost),
    currency: rate.currency,
  }));
}

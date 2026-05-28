'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

// Wizard talks to the admin-web proxies under /api/ratehawk/*.

type StatusResponse = {
  mode: 'fixture' | 'live';
  hasCredentials: boolean;
  defaultCountries: string[];
};

type Facets = {
  total: number;
  countries: Array<{ code: string; count: number }>;
  cities: Array<{ country: string; city: string; count: number }>;
  stars: Array<{ star: number; count: number }>;
};

type Candidate = {
  id: string;
  rateHawkId: string;
  name: string;
  countryCode: string;
  cityName: string | null;
  addressLine: string | null;
  starRating: number | null;
  latitude: number | null;
  longitude: number | null;
  chainName: string | null;
  kind: string | null;
  photoCount: number;
  thumbnailUrl: string | null;
  importedHotelId: string | null;
  syncedAt: string;
};

type CandidateList = {
  total: number;
  offset: number;
  limit: number;
  items: Candidate[];
};

type SyncResult = {
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: Array<{ rateHawkId?: string; message: string }>;
};

type ImportResult = {
  requested: number;
  created: number;
  skipped: number;
  errors: Array<{ candidateId: string; message: string }>;
  createdHotelIds: string[];
};

const PAGE_SIZE = 50;

export function RateHawkImportWizard() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [candidates, setCandidates] = useState<CandidateList | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<SyncResult | null>(null);
  const [lastImport, setLastImport] = useState<ImportResult | null>(null);

  const [countryFilter, setCountryFilter] = useState<string>('');
  const [cityFilter, setCityFilter] = useState<string>('');
  const [starFilter, setStarFilter] = useState<string>('');
  const [showFilter, setShowFilter] = useState<'all' | 'notImported' | 'imported'>('notImported');
  const [searchInput, setSearchInput] = useState<string>('');
  const [appliedSearch, setAppliedSearch] = useState<string>('');
  const [offset, setOffset] = useState<number>(0);

  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Cities scoped to the chosen country
  const availableCities = useMemo(() => {
    if (!facets) return [] as Facets['cities'];
    if (!countryFilter) return facets.cities;
    return facets.cities.filter((c) => c.country === countryFilter);
  }, [facets, countryFilter]);

  // --- fetchers ----------------------------------------------------------
  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/ratehawk/status', { cache: 'no-store' });
      if (!res.ok) throw new Error(`Status check failed: HTTP ${res.status}`);
      setStatus((await res.json()) as StatusResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load RateHawk status');
    }
  }, []);

  const loadFacets = useCallback(async () => {
    try {
      const res = await fetch('/api/ratehawk/facets', { cache: 'no-store' });
      if (!res.ok) throw new Error(`Facets failed: HTTP ${res.status}`);
      setFacets((await res.json()) as Facets);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load filter options');
    }
  }, []);

  const loadCandidates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (countryFilter) params.set('countryCode', countryFilter);
      if (cityFilter) params.set('cityName', cityFilter);
      if (starFilter) params.set('starRating', starFilter);
      if (showFilter === 'imported') params.set('importedOnly', 'true');
      if (showFilter === 'notImported') params.set('notImportedOnly', 'true');
      if (appliedSearch) params.set('search', appliedSearch);
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(offset));
      const res = await fetch(`/api/ratehawk/candidates?${params.toString()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Candidates failed: HTTP ${res.status}`);
      setCandidates((await res.json()) as CandidateList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load candidates');
    } finally {
      setLoading(false);
    }
  }, [countryFilter, cityFilter, starFilter, showFilter, appliedSearch, offset]);

  useEffect(() => {
    void loadStatus();
    void loadFacets();
  }, [loadStatus, loadFacets]);

  useEffect(() => {
    void loadCandidates();
  }, [loadCandidates]);

  // Reset offset when filters change so the table doesn't land mid-empty
  useEffect(() => {
    setOffset(0);
  }, [countryFilter, cityFilter, starFilter, showFilter, appliedSearch]);

  // Country change → reset city since the previous city may not exist
  // in the new country.
  useEffect(() => {
    setCityFilter('');
  }, [countryFilter]);

  // --- actions -----------------------------------------------------------
  async function handleSync() {
    setSyncing(true);
    setError(null);
    setLastSync(null);
    try {
      const res = await fetch('/api/ratehawk/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(`Sync failed: HTTP ${res.status}`);
      const result = (await res.json()) as SyncResult;
      setLastSync(result);
      await loadFacets();
      await loadCandidates();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  async function handleImport() {
    if (selected.size === 0) return;
    if (selected.size > 100) {
      setError('Import at most 100 hotels at a time. Narrow your selection.');
      return;
    }
    setImporting(true);
    setError(null);
    setLastImport(null);
    try {
      const res = await fetch('/api/ratehawk/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateIds: [...selected] }),
      });
      if (!res.ok) throw new Error(`Import failed: HTTP ${res.status}`);
      const result = (await res.json()) as ImportResult;
      setLastImport(result);
      setSelected(new Set());
      await loadCandidates();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllOnPage(visible: Candidate[]) {
    setSelected((prev) => {
      const next = new Set(prev);
      const allOn = visible.every((c) => next.has(c.id));
      if (allOn) {
        for (const c of visible) next.delete(c.id);
      } else {
        for (const c of visible) if (!c.importedHotelId) next.add(c.id);
      }
      return next;
    });
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAppliedSearch(searchInput.trim());
  }

  // --- render ------------------------------------------------------------
  const visibleCandidates = candidates?.items ?? [];
  const totalShown = candidates?.total ?? 0;
  const importableOnPage = visibleCandidates.filter((c) => !c.importedHotelId);
  const allImportableOnPageSelected =
    importableOnPage.length > 0 && importableOnPage.every((c) => selected.has(c.id));

  return (
    <div data-testid="ratehawk-import-wizard">
      {/* Status + sync row */}
      <section
        className="detail-card"
        style={{ marginBottom: '1.5rem' }}
        data-testid="ratehawk-status"
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.6rem' }}>
          <div>
            <h2 className="section-title" style={{ fontSize: '1rem', margin: 0 }}>
              Inventory source
            </h2>
            {status ? (
              <p className="table-subcopy" style={{ marginTop: '0.3rem' }}>
                Mode:{' '}
                <strong style={{ color: status.hasCredentials ? '#15803d' : '#b45309' }}>
                  {status.mode}
                </strong>
                {' · '}Countries: <strong>{status.defaultCountries.join(', ')}</strong>
                {!status.hasCredentials ? (
                  <>
                    {' · '}
                    <span style={{ color: '#b45309' }}>
                      Using bundled fixture (10 sample hotels) — set RATEHAWK_KEY_ID + RATEHAWK_KEY in Railway to switch to live.
                    </span>
                  </>
                ) : null}
              </p>
            ) : (
              <p className="table-subcopy">Loading status…</p>
            )}
          </div>
          <button
            type="button"
            className="primary-button"
            onClick={handleSync}
            disabled={syncing}
            data-testid="ratehawk-sync-button"
          >
            {syncing ? 'Syncing…' : 'Sync from RateHawk'}
          </button>
        </div>
        {lastSync ? (
          <p className="table-subcopy" style={{ marginTop: '0.6rem', color: '#15803d' }}>
            Last sync — fetched {lastSync.fetched}, inserted {lastSync.inserted}, updated{' '}
            {lastSync.updated}, skipped {lastSync.skipped}
            {lastSync.errors.length > 0 ? `, errors ${lastSync.errors.length}` : ''}.
          </p>
        ) : null}
      </section>

      {/* Filter row */}
      <section
        className="detail-card"
        style={{ marginBottom: '1.5rem' }}
        data-testid="ratehawk-filters"
      >
        <div className="entity-form compact-form">
          <div className="form-row form-row-4">
            <label>
              Country
              <select
                value={countryFilter}
                onChange={(e) => setCountryFilter(e.target.value)}
                data-testid="ratehawk-filter-country"
              >
                <option value="">All ({facets?.total ?? 0})</option>
                {facets?.countries.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} ({c.count})
                  </option>
                ))}
              </select>
            </label>
            <label>
              City
              <select
                value={cityFilter}
                onChange={(e) => setCityFilter(e.target.value)}
                disabled={availableCities.length === 0}
                data-testid="ratehawk-filter-city"
              >
                <option value="">All cities</option>
                {availableCities.map((c) => (
                  <option key={`${c.country}-${c.city}`} value={c.city}>
                    {c.city} ({c.count})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Stars
              <select
                value={starFilter}
                onChange={(e) => setStarFilter(e.target.value)}
                data-testid="ratehawk-filter-star"
              >
                <option value="">Any</option>
                {facets?.stars.map((s) => (
                  <option key={s.star} value={String(s.star)}>
                    {s.star} Star ({s.count})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Show
              <select
                value={showFilter}
                onChange={(e) => setShowFilter(e.target.value as 'all' | 'notImported' | 'imported')}
                data-testid="ratehawk-filter-show"
              >
                <option value="notImported">Not imported yet</option>
                <option value="imported">Already imported</option>
                <option value="all">All</option>
              </select>
            </label>
          </div>
          <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem' }}>
            <input
              type="text"
              placeholder="Search name / chain / city…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              style={{ flex: 1 }}
              data-testid="ratehawk-search-input"
            />
            <button type="submit" className="compact-button">Search</button>
            {appliedSearch ? (
              <button
                type="button"
                className="compact-button"
                onClick={() => {
                  setSearchInput('');
                  setAppliedSearch('');
                }}
              >
                Clear
              </button>
            ) : null}
          </form>
        </div>
      </section>

      {error ? (
        <p
          className="form-error"
          data-testid="ratehawk-error"
          style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '0.6rem 0.8rem', borderRadius: 6, marginBottom: '1rem' }}
        >
          {error}
        </p>
      ) : null}

      {/* Selection toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.5rem',
          marginBottom: '0.6rem',
        }}
      >
        <p className="table-subcopy" style={{ margin: 0 }}>
          {loading
            ? 'Loading candidates…'
            : `${totalShown.toLocaleString()} match${totalShown === 1 ? '' : 'es'} — selected ${selected.size}`}
        </p>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button
            type="button"
            className="compact-button"
            onClick={() => setSelected(new Set())}
            disabled={selected.size === 0 || importing}
          >
            Clear selection
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={handleImport}
            disabled={selected.size === 0 || importing}
            data-testid="ratehawk-import-button"
          >
            {importing ? 'Importing…' : `Import ${selected.size} hotel${selected.size === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>

      {lastImport ? (
        <p
          className="table-subcopy"
          style={{ color: '#15803d', marginBottom: '0.6rem' }}
          data-testid="ratehawk-import-result"
        >
          Imported {lastImport.created} of {lastImport.requested}
          {lastImport.skipped > 0 ? `, skipped ${lastImport.skipped}` : ''}
          {lastImport.errors.length > 0 ? `, errors ${lastImport.errors.length}` : ''}.
        </p>
      ) : null}

      {/* Candidates table */}
      <div className="table-wrap" data-testid="ratehawk-candidates-table">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: 36 }}>
                <input
                  type="checkbox"
                  aria-label="Select all importable on page"
                  checked={allImportableOnPageSelected}
                  onChange={() => toggleAllOnPage(visibleCandidates)}
                  disabled={importableOnPage.length === 0}
                />
              </th>
              <th>Hotel</th>
              <th>Location</th>
              <th>Stars</th>
              <th>Chain</th>
              <th className="numeric-cell">Photos</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {visibleCandidates.length === 0 && !loading ? (
              <tr>
                <td colSpan={7}>
                  <p className="table-subcopy">
                    No candidates match your filters. Try widening them, or click{' '}
                    <strong>Sync from RateHawk</strong> if the staging table is empty.
                  </p>
                </td>
              </tr>
            ) : null}
            {visibleCandidates.map((c) => {
              const isImported = Boolean(c.importedHotelId);
              return (
                <tr key={c.id} style={{ opacity: isImported ? 0.6 : 1 }}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Select ${c.name}`}
                      checked={selected.has(c.id)}
                      disabled={isImported}
                      onChange={() => toggleOne(c.id)}
                      data-testid={`ratehawk-candidate-${c.rateHawkId}`}
                    />
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                      {c.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={c.thumbnailUrl}
                          alt=""
                          width={48}
                          height={36}
                          style={{ borderRadius: 4, objectFit: 'cover', flex: '0 0 auto' }}
                          loading="lazy"
                        />
                      ) : (
                        <div
                          style={{
                            width: 48,
                            height: 36,
                            background: '#f1f5f9',
                            borderRadius: 4,
                            flex: '0 0 auto',
                          }}
                        />
                      )}
                      <div>
                        <strong>{c.name}</strong>
                        {c.kind ? (
                          <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{c.kind}</div>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td>
                    {c.cityName ?? '—'}, {c.countryCode}
                    {c.addressLine ? (
                      <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{c.addressLine}</div>
                    ) : null}
                  </td>
                  <td>{c.starRating != null ? `${c.starRating}★` : '—'}</td>
                  <td>{c.chainName ?? '—'}</td>
                  <td className="numeric-cell">{c.photoCount}</td>
                  <td>
                    {isImported ? (
                      <span style={{ color: '#15803d', fontWeight: 600, fontSize: '0.78rem' }}>
                        Imported
                      </span>
                    ) : (
                      <span style={{ color: '#94a3b8', fontWeight: 600, fontSize: '0.78rem' }}>
                        Available
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {candidates && candidates.total > PAGE_SIZE ? (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: '0.8rem',
          }}
        >
          <button
            type="button"
            className="compact-button"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          >
            ← Prev
          </button>
          <p className="table-subcopy" style={{ margin: 0 }}>
            Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, candidates.total)} of{' '}
            {candidates.total}
          </p>
          <button
            type="button"
            className="compact-button"
            disabled={offset + PAGE_SIZE >= candidates.total}
            onClick={() => setOffset(offset + PAGE_SIZE)}
          >
            Next →
          </button>
        </div>
      ) : null}
    </div>
  );
}

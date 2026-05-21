'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type AuditRow = {
  id: string;
  currentCode?: string;
  suggestedCanonicalCode?: string;
  legacyAliases?: string[];
  name?: string;
  region?: string;
  classification: string;
  cleanupRecommendation: string;
  candidateTarget?: string;
  selectorEligible?: boolean;
  warnings?: string[];
  cleanupPreview?: {
    safeToConvert: boolean;
    impact: {
      affectedQuotes: { total: number; active: number };
      affectedTemplates: { total: number; active: number };
      affectedBookings: { total: number; active: number };
      affectedSelectorReferences: { total: number };
      affectedRouteAliases: { total: number; aliases: string[]; preserved: boolean };
      affectedDepartures: { total: number };
    };
    executionDryRuns?: Array<{
      action: string;
      safeExecutionScore: number;
      safeToExecute: boolean;
      conflicts: {
        existingActivityDuplicates: number;
        existingExcursionTemplateDuplicates: number;
        canonicalCodeConflicts: number;
        activeDepartureConflicts: number;
        hasConflicts: boolean;
      };
      referenceMigrationPreview?: {
        quotes: { total: number; active: number };
        bookings: { total: number; active: number };
        templates: { total: number; active: number };
        selectorReferences: { total: number };
        aliases: { total: number; aliases: string[]; preserved: boolean };
      };
      rollbackSnapshotPreview?: {
        touringRoute: {
          id: string;
          code: string;
          name: string;
          active: boolean;
          suggestedCanonicalCode: string;
          legacyAliases: string[];
        };
        stops: Array<Record<string, unknown>>;
        pricings: Array<Record<string, unknown>>;
      };
      warnings?: string[];
    }>;
  };
};

type AuditPreview = {
  rows: AuditRow[];
};

const FILTERS = [
  { id: 'ALL', label: 'All routes' },
  { id: 'ACTIVITY_CANDIDATE', label: 'Activity candidates' },
  { id: 'EXCURSION_TEMPLATE_CANDIDATE', label: 'Excursion candidates' },
  { id: 'KEEP_AS_TOURING_ROUTE', label: 'Keep touring routes' },
  { id: 'MANUAL_REVIEW', label: 'Manual review' },
] as const;

const CLASSIFICATION_LABELS: Record<string, string> = {
  TOURING_ROUTE: 'Touring Route',
  ACTIVITY_CANDIDATE: 'Activity Candidate',
  EXCURSION_TEMPLATE_CANDIDATE: 'Excursion Candidate',
  TRANSFER_ROUTE_CANDIDATE: 'Transfer Candidate',
  REVIEW: 'Review',
};

const RECOMMENDATION_LABELS: Record<string, string> = {
  KEEP_AS_TOURING_ROUTE: 'Keep Touring Route',
  MOVE_TO_ACTIVITY_MASTER: 'Move to Activity Master',
  CONVERT_TO_EXCURSION_TEMPLATE: 'Convert to Excursion Template',
  MOVE_TO_TRANSFER_ROUTE: 'Move to Transfer Route',
  MANUAL_REVIEW: 'Manual Review',
};

export default function SimpleTouringRouteAuditPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadAudit() {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch('/api/touring-routes/operational-audit/preview', {
          cache: 'no-store',
          credentials: 'same-origin',
        });
        const payload = (await response.json().catch(() => null)) as AuditPreview | null;

        if (!response.ok) {
          throw new Error((payload as any)?.message || `Audit preview failed with ${response.status}`);
        }

        if (!cancelled) {
          setRows(payload?.rows || []);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Could not load touring route audit.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadAudit();

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredRows = useMemo(() => {
    if (filter === 'ALL') return rows;
    if (filter === 'KEEP_AS_TOURING_ROUTE' || filter === 'MANUAL_REVIEW') {
      return rows.filter((row) => row.cleanupRecommendation === filter);
    }
    return rows.filter((row) => row.classification === filter);
  }, [filter, rows]);

  return (
    <main className="page touring-audit-simple-page">
      <section className="panel workspace-panel workspace-panel-wide">
        <div className="page-header">
          <div>
            <p className="eyebrow">Touring Routes</p>
            <h1>Simple Operational Audit</h1>
            <p className="detail-copy">Readable, read-only review cards for touring route cleanup planning.</p>
          </div>
          <Link href="/touring-routes/audit" className="secondary-button">
            Table audit
          </Link>
        </div>

        <section className="workspace-section touring-audit-simple-filters">
          {FILTERS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={filter === option.id ? 'primary-button' : 'secondary-button'}
              onClick={() => setFilter(option.id)}
            >
              {option.label}
            </button>
          ))}
        </section>

        {loading ? (
          <section className="workspace-section">
            <p className="detail-copy">Loading touring route audit...</p>
          </section>
        ) : null}

        {error ? (
          <section className="workspace-section">
            <div className="empty-state">
              <h2>Audit unavailable</h2>
              <p className="detail-copy">{error}</p>
            </div>
          </section>
        ) : null}

        {!loading && !error ? (
          <section className="touring-audit-simple-list" aria-label="Touring route audit cards">
            <div className="workspace-section-head">
              <div>
                <p className="eyebrow">Routes</p>
                <h2>{formatNumber(filteredRows.length)} routes shown</h2>
              </div>
            </div>

            {filteredRows.length > 0 ? (
              filteredRows.map((row) => <AuditRouteCard key={row.id} row={row} />)
            ) : (
              <section className="workspace-section">
                <p className="detail-copy">No routes match this filter.</p>
              </section>
            )}
          </section>
        ) : null}
      </section>
    </main>
  );
}

function AuditRouteCard({ row }: { row: AuditRow }) {
  const dryRun = row.cleanupPreview?.executionDryRuns?.[0];
  const conflicts = dryRun?.conflicts;
  const impact = row.cleanupPreview?.impact;

  return (
    <article className="workspace-section touring-audit-simple-card">
      <div className="touring-audit-simple-card-head">
        <div>
          <p className="eyebrow">{row.currentCode || row.id}</p>
          <h2>{row.name || 'Unnamed touring route'}</h2>
          <p className="detail-copy">{row.suggestedCanonicalCode || 'Canonical code pending'}</p>
        </div>
        <div className="touring-audit-simple-score">
          <span>Safe score</span>
          <strong>{dryRun?.safeExecutionScore ?? 'N/A'}</strong>
          <small>{dryRun?.safeToExecute ? 'Executable by dry-run gates' : 'Blocked or review required'}</small>
        </div>
      </div>

      <div className="touring-audit-simple-badges">
        <Badge>{CLASSIFICATION_LABELS[row.classification] || row.classification}</Badge>
        <Badge>{RECOMMENDATION_LABELS[row.cleanupRecommendation] || row.cleanupRecommendation}</Badge>
        <Badge>{row.selectorEligible ? 'Selector eligible' : 'Hidden from selector'}</Badge>
      </div>

      <div className="touring-audit-simple-grid">
        <SummaryBlock title="References">
          {impact ? (
            <>
              <span>Quotes: {formatNumber(impact.affectedQuotes.total)} ({formatNumber(impact.affectedQuotes.active)} active)</span>
              <span>Bookings: {formatNumber(impact.affectedBookings.total)} ({formatNumber(impact.affectedBookings.active)} active)</span>
              <span>Templates: {formatNumber(impact.affectedTemplates.total)} ({formatNumber(impact.affectedTemplates.active)} active)</span>
              <span>Selectors: {formatNumber(impact.affectedSelectorReferences.total)}</span>
            </>
          ) : (
            <span>No reference preview returned.</span>
          )}
        </SummaryBlock>

        <SummaryBlock title="Conflicts">
          {conflicts ? (
            <>
              <span>Activity duplicates: {formatNumber(conflicts.existingActivityDuplicates)}</span>
              <span>Excursion duplicates: {formatNumber(conflicts.existingExcursionTemplateDuplicates)}</span>
              <span>Code conflicts: {formatNumber(conflicts.canonicalCodeConflicts)}</span>
              <span>Departure conflicts: {formatNumber(conflicts.activeDepartureConflicts)}</span>
            </>
          ) : (
            <span>No conflict preview returned.</span>
          )}
        </SummaryBlock>

        <SummaryBlock title="Warnings">
          {(row.warnings || dryRun?.warnings || []).length > 0 ? (
            (row.warnings || dryRun?.warnings || []).map((warning) => <span key={warning}>{warning}</span>)
          ) : (
            <span>No warnings.</span>
          )}
        </SummaryBlock>
      </div>

      <details className="touring-audit-simple-details">
        <summary>Review details</summary>
        <div className="touring-audit-simple-detail-grid">
          <SummaryBlock title="Dry-run preview">
            {(row.cleanupPreview?.executionDryRuns || []).length > 0 ? (
              row.cleanupPreview?.executionDryRuns?.map((entry) => (
                <span key={entry.action}>
                  {formatActionName(entry.action)}: score {entry.safeExecutionScore}, {entry.safeToExecute ? 'safe by score' : 'blocked/review'}
                </span>
              ))
            ) : (
              <span>No dry-run previews.</span>
            )}
          </SummaryBlock>

          <SummaryBlock title="Rollback snapshot">
            {dryRun?.rollbackSnapshotPreview ? (
              <>
                <span>Route: {dryRun.rollbackSnapshotPreview.touringRoute.code || row.currentCode || row.id}</span>
                <span>Stops: {formatNumber(dryRun.rollbackSnapshotPreview.stops.length)}</span>
                <span>Pricing rows: {formatNumber(dryRun.rollbackSnapshotPreview.pricings.length)}</span>
              </>
            ) : (
              <span>No rollback snapshot returned.</span>
            )}
          </SummaryBlock>

          <SummaryBlock title="Aliases">
            {(row.legacyAliases || []).length > 0 ? (
              row.legacyAliases?.map((alias) => <span key={alias}>{alias}</span>)
            ) : (
              <span>No legacy aliases.</span>
            )}
          </SummaryBlock>
        </div>
      </details>
    </article>
  );
}

function SummaryBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="touring-audit-simple-block">
      <strong>{title}</strong>
      <div>{children}</div>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="status-badge touring-audit-simple-badge">{children}</span>;
}

function formatActionName(action: string) {
  return action
    .replace(/DryRun$/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (value) => value.toUpperCase());
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value || 0);
}

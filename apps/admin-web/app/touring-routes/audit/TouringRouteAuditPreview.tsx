'use client';

import { useEffect, useState } from 'react';

type AuditRow = {
  id: string;
  currentCode?: string;
  suggestedCanonicalCode?: string;
  legacyAliases?: string[];
  name?: string;
  region?: string;
  classification: string;
  cleanupRecommendation: string;
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
      safeExecutionScore: number;
      safeToExecute: boolean;
      conflicts: {
        existingActivityDuplicates: number;
        existingExcursionTemplateDuplicates: number;
        canonicalCodeConflicts: number;
        activeDepartureConflicts: number;
      };
      warnings?: string[];
    }>;
  };
};

type AuditPreview = {
  mode: 'preview';
  mutatesData: boolean;
  canonicalCodeFormat: string;
  counts: Record<string, number>;
  recommendationCounts?: Record<string, number>;
  rows: AuditRow[];
};

const RECOMMENDATION_LABELS: Record<string, string> = {
  KEEP_AS_TOURING_ROUTE: 'Keep Touring',
  MOVE_TO_ACTIVITY_MASTER: 'Move to Activity',
  CONVERT_TO_EXCURSION_TEMPLATE: 'Convert to Excursion',
  MOVE_TO_TRANSFER_ROUTE: 'Move to Transfer',
  MANUAL_REVIEW: 'Manual Review',
};

const CLASSIFICATION_LABELS: Record<string, string> = {
  TOURING_ROUTE: 'Touring Route',
  ACTIVITY_CANDIDATE: 'Activity Candidate',
  EXCURSION_TEMPLATE_CANDIDATE: 'Excursion Candidate',
  TRANSFER_ROUTE_CANDIDATE: 'Transfer Candidate',
  REVIEW: 'Review',
};

export function TouringRouteAuditPreview() {
  const [audit, setAudit] = useState<AuditPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(payload?.message || `Touring route operational audit failed with ${response.status}`);
        }

        if (!cancelled) {
          setAudit(payload as AuditPreview);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Could not load touring route operational audit.');
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

  if (loading) {
    return (
      <section className="workspace-section">
        <p className="detail-copy">Loading touring route operational audit...</p>
      </section>
    );
  }

  if (error || !audit) {
    return (
      <section className="workspace-section">
        <div className="empty-state">
          <h2>Audit preview unavailable</h2>
          <p className="detail-copy">{error || 'No audit preview was returned.'}</p>
        </div>
      </section>
    );
  }

  const totalAudited = audit.counts.total || audit.rows.length;
  const selectorEligible = audit.counts.selectorEligible || audit.rows.filter((row) => row.selectorEligible).length;
  const recommendationCounts = Object.entries(audit.recommendationCounts || {}).sort(([left], [right]) => left.localeCompare(right));

  return (
    <>
      <section className="dashboard-grid touring-audit-summary-grid">
        <AuditMetric label="Total audited" value={formatNumber(totalAudited)} helper={audit.canonicalCodeFormat} />
        <AuditMetric label="Selector eligible" value={formatNumber(selectorEligible)} helper="True operational touring routes" />
        <AuditMetric label="Mode" value={audit.mode} helper={audit.mutatesData ? 'Unexpected mutation risk' : 'Read-only'} />
      </section>

      <section className="workspace-section touring-audit-filter-panel">
        <div className="workspace-section-head">
          <div>
            <p className="eyebrow">Recommendations</p>
            <h2>Cleanup recommendations</h2>
          </div>
        </div>
        <div className="touring-audit-card-badges">
          {recommendationCounts.map(([recommendation, count]) => (
            <span key={recommendation} className="status-badge touring-audit-badge">
              {RECOMMENDATION_LABELS[recommendation] || recommendation}: {formatNumber(count)}
            </span>
          ))}
        </div>
      </section>

      <section className="touring-audit-card-list" aria-label="Touring route audit rows">
        <div className="workspace-section-head">
          <div>
            <p className="eyebrow">Rows</p>
            <h2>{formatNumber(audit.rows.length)} audit rows</h2>
          </div>
        </div>

        {audit.rows.length > 0 ? (
          audit.rows.map((row) => <AuditRouteCard key={row.id} row={row} />)
        ) : (
          <section className="workspace-section">
            <p className="detail-copy">No rows match this filter.</p>
          </section>
        )}
      </section>
    </>
  );
}

function AuditRouteCard({ row }: { row: AuditRow }) {
  const dryRun = row.cleanupPreview?.executionDryRuns?.[0];
  const impact = row.cleanupPreview?.impact;
  const conflicts = dryRun?.conflicts;
  const warnings = [...(row.warnings || []), ...(dryRun?.warnings || [])].filter(Boolean);

  return (
    <article className="workspace-section touring-audit-card">
      <div className="touring-audit-card-head">
        <div>
          <p className="eyebrow">{row.currentCode || row.id}</p>
          <h2>{row.name || 'Unnamed touring route'}</h2>
          <p className="detail-copy">{row.suggestedCanonicalCode || 'Canonical code pending'}</p>
        </div>
        <div className="touring-audit-score-box">
          <span>Safe score</span>
          <strong>{dryRun?.safeExecutionScore ?? 'N/A'}</strong>
          <small>{dryRun?.safeToExecute ? 'Safe by dry-run score' : 'Blocked or review required'}</small>
        </div>
      </div>

      <div className="touring-audit-card-badges">
        <Badge>{CLASSIFICATION_LABELS[row.classification] || row.classification}</Badge>
        <Badge>{RECOMMENDATION_LABELS[row.cleanupRecommendation] || row.cleanupRecommendation}</Badge>
        <Badge>{row.selectorEligible ? 'Selector eligible' : 'Hidden from selector'}</Badge>
      </div>

      <div className="touring-audit-card-grid">
        <InfoBlock title="References">
          {impact ? (
            <>
              <span>Quotes: {formatNumber(impact.affectedQuotes.total)} ({formatNumber(impact.affectedQuotes.active)} active)</span>
              <span>Bookings: {formatNumber(impact.affectedBookings.total)} ({formatNumber(impact.affectedBookings.active)} active)</span>
              <span>Templates: {formatNumber(impact.affectedTemplates.total)} ({formatNumber(impact.affectedTemplates.active)} active)</span>
              <span>Selectors: {formatNumber(impact.affectedSelectorReferences.total)}</span>
              <span>Departures: {formatNumber(impact.affectedDepartures.total)}</span>
            </>
          ) : (
            <span>No reference preview returned.</span>
          )}
        </InfoBlock>

        <InfoBlock title="Warnings">
          {warnings.length > 0 ? warnings.map((warning) => <span key={warning}>{warning}</span>) : <span>No warnings.</span>}
        </InfoBlock>

        <InfoBlock title="Conflicts">
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
        </InfoBlock>
      </div>
    </article>
  );
}

function AuditMetric({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <article className="dashboard-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{helper}</p>
    </article>
  );
}

function InfoBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="touring-audit-info-block">
      <strong>{title}</strong>
      <div>{children}</div>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="status-badge touring-audit-badge">{children}</span>;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value || 0);
}

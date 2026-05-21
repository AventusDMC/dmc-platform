'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import {
  AuditRow,
  ClassificationBadge,
  ExecutionDryRunPanel,
  ImpactSummary,
  RecommendationBadge,
  SafeExecutionScore,
} from '../TouringRouteAuditPreview';

type AuditPreview = {
  rows: AuditRow[];
};

export function TouringRouteAuditDetail({ routeId }: { routeId: string }) {
  const [row, setRow] = useState<AuditRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadAuditRow() {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch('/api/touring-routes/operational-audit/preview', {
          cache: 'no-store',
          credentials: 'same-origin',
        });
        const payload = (await response.json().catch(() => null)) as AuditPreview | null;

        if (!response.ok) {
          throw new Error((payload as any)?.message || `Touring route operational audit failed with ${response.status}`);
        }

        const matchedRow = (payload?.rows || []).find((candidate) => candidate.id === routeId);
        if (!matchedRow) {
          throw new Error('Touring route audit row was not found.');
        }

        if (!cancelled) {
          setRow(matchedRow);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Could not load touring route audit detail.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadAuditRow();

    return () => {
      cancelled = true;
    };
  }, [routeId]);

  if (loading) {
    return (
      <section className="workspace-section">
        <p className="detail-copy">Loading touring route audit detail...</p>
      </section>
    );
  }

  if (error || !row) {
    return (
      <section className="workspace-section">
        <div className="empty-state">
          <h2>Audit row unavailable</h2>
          <p className="detail-copy">{error || 'No audit row was returned.'}</p>
          <Link href="/touring-routes/audit" className="secondary-button">
            Back to audit
          </Link>
        </div>
      </section>
    );
  }

  const firstDryRun = row.cleanupPreview?.executionDryRuns?.[0];

  return (
    <>
      <section className="dashboard-grid">
        <AuditDetailMetric label="Classification" value={<ClassificationBadge classification={row.classification} />} helper={row.candidateTarget || 'TOURING_ROUTE'} />
        <AuditDetailMetric label="Recommendation" value={<RecommendationBadge recommendation={row.cleanupRecommendation} />} helper={row.cleanupPreview?.safeToConvert ? 'Safe to convert' : 'Review before converting'} />
        <AuditDetailMetric label="Safe score" value={<SafeExecutionScore row={row} />} helper={firstDryRun?.safeToExecute ? 'Eligible by dry-run score' : 'Blocked or review required'} />
      </section>

      <section className="workspace-section">
        <div className="workspace-section-head">
          <div>
            <p className="eyebrow">Route</p>
            <h2>{row.name || 'Unnamed touring route'}</h2>
            <p className="detail-copy">{row.currentCode || row.id}</p>
          </div>
          <Link href="/touring-routes/audit" className="secondary-button">
            Back to list
          </Link>
        </div>

        <div className="table-wrap">
          <table className="touring-audit-table">
            <tbody>
              <tr>
                <th>Canonical code</th>
                <td><code>{row.suggestedCanonicalCode}</code></td>
              </tr>
              <tr>
                <th>Legacy aliases</th>
                <td>
                  {(row.legacyAliases || []).length > 0 ? (
                    <div className="touring-audit-aliases">
                      {row.legacyAliases.map((alias) => <code key={alias}>{alias}</code>)}
                    </div>
                  ) : (
                    <span className="table-subcopy">None</span>
                  )}
                </td>
              </tr>
              <tr>
                <th>Selector</th>
                <td>{row.selectorEligible ? 'Eligible' : 'Hidden'}</td>
              </tr>
              <tr>
                <th>Operational fields</th>
                <td>
                  <div className="table-subcopy">
                    <strong>{row.region || 'General'}</strong>
                    {' | '}
                    {row.safeFields?.routeCategory || 'Uncategorized'}
                    {' | '}
                    {row.safeFields?.operationalComplexity || 'LOW'}
                  </div>
                  <div className="table-subcopy">{row.safeFields?.primaryOperatingCity || 'City pending'}</div>
                </td>
              </tr>
              <tr>
                <th>References</th>
                <td><ImpactSummary row={row} /></td>
              </tr>
              <tr>
                <th>Warnings</th>
                <td>
                  {(row.warnings || []).length > 0 ? (
                    <ul className="touring-audit-warning-list">
                      {row.warnings?.map((warning) => <li key={warning}>{warning}</li>)}
                    </ul>
                  ) : (
                    <span className="table-subcopy">No warnings</span>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <ExecutionDryRunPanel row={row} />
    </>
  );
}

function AuditDetailMetric({ label, value, helper }: { label: string; value: ReactNode; helper: string }) {
  return (
    <article className="dashboard-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{helper}</p>
    </article>
  );
}

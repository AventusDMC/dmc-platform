'use client';

import { useEffect, useState } from 'react';

type AuditClassification =
  | 'TOURING_ROUTE'
  | 'ACTIVITY_CANDIDATE'
  | 'EXCURSION_TEMPLATE_CANDIDATE'
  | 'TRANSFER_ROUTE_CANDIDATE'
  | 'REVIEW'
  | string;

type AuditRow = {
  id: string;
  currentCode: string;
  suggestedCanonicalCode: string;
  legacyAliases: string[];
  name: string;
  region: string;
  classification: AuditClassification;
  cleanupRecommendation: string;
  cleanupPreview?: {
    mutatesData: boolean;
    safeToConvert: boolean;
    impact: {
      affectedQuotes: { total: number; active: number };
      affectedTemplates: { total: number; active: number; excursionTemplateComponents?: number; packageTemplateComponents?: number };
      affectedBookings: { total: number; active: number };
      affectedSelectorReferences: { total: number };
      affectedRouteAliases: { total: number; aliases: string[]; preserved: boolean };
      affectedDepartures: { total: number };
    };
    actions: Array<{
      action: string;
      available: boolean;
      safeToConvert: boolean;
      mutatesData: boolean;
      preservesHistoricalAliases: boolean;
      warnings: string[];
    }>;
    executionDryRuns?: Array<{
      action: string;
      mode: 'DRY_RUN_ONLY';
      mutatesData: boolean;
      deletesData: boolean;
      safeExecutionScore: number;
      safeToExecute: boolean;
      preservesHistoricalAliases: boolean;
      rollbackSnapshotPreview: {
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
      referenceMigrationPreview: {
        quotes: { total: number; active: number };
        bookings: { total: number; active: number };
        templates: { total: number; active: number };
        selectorReferences: { total: number };
        aliases: { total: number; aliases: string[]; preserved: boolean };
      };
      conflicts: {
        existingActivityDuplicates: number;
        existingExcursionTemplateDuplicates: number;
        canonicalCodeConflicts: number;
        activeDepartureConflicts: number;
        hasConflicts: boolean;
      };
      warnings: string[];
    }>;
  };
  selectorEligible: boolean;
  candidateTarget: string;
  safeFields?: {
    operationalType?: string;
    routeCategory?: string;
    primaryOperatingCity?: string;
    operationalComplexity?: string;
  };
  warnings?: string[];
};

type AuditPreview = {
  success: boolean;
  mode: 'preview';
  mutatesData: boolean;
  canonicalCodeFormat: string;
  counts: Record<string, number>;
  recommendationCounts?: Record<string, number>;
  rows: AuditRow[];
};

const CLASSIFICATION_LABELS: Record<string, string> = {
  TOURING_ROUTE: 'Touring Route',
  ACTIVITY_CANDIDATE: 'Activity Candidate',
  EXCURSION_TEMPLATE_CANDIDATE: 'Excursion Candidate',
  TRANSFER_ROUTE_CANDIDATE: 'Transfer Candidate',
  REVIEW: 'Review',
};

const RECOMMENDATION_LABELS: Record<string, string> = {
  KEEP_AS_TOURING_ROUTE: 'Keep Touring',
  MOVE_TO_ACTIVITY_MASTER: 'Move to Activity',
  CONVERT_TO_EXCURSION_TEMPLATE: 'Convert to Excursion',
  MOVE_TO_TRANSFER_ROUTE: 'Move to Transfer',
  MANUAL_REVIEW: 'Manual Review',
};

export function TouringRouteAuditPreview() {
  const [audit, setAudit] = useState<AuditPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [recommendationFilter, setRecommendationFilter] = useState('ALL');
  const [selectedDryRun, setSelectedDryRun] = useState<AuditRow | null>(null);

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
  const classifications = Object.entries(audit.counts)
    .filter(([key]) => key !== 'total' && key !== 'selectorEligible' && !key.startsWith('recommendation:'))
    .sort(([left], [right]) => left.localeCompare(right));
  const recommendationCounts = Object.entries(audit.recommendationCounts || {})
    .sort(([left], [right]) => left.localeCompare(right));
  const filteredRows =
    recommendationFilter === 'ALL' ? audit.rows : audit.rows.filter((row) => row.cleanupRecommendation === recommendationFilter);

  return (
    <>
      <section className="dashboard-grid">
        <AuditMetric label="Total audited" value={formatNumber(totalAudited)} helper={audit.canonicalCodeFormat} />
        <AuditMetric label="Selector eligible" value={formatNumber(selectorEligible)} helper="True operational touring routes" />
        <AuditMetric label="Mode" value={audit.mode} helper={audit.mutatesData ? 'Unexpected mutation risk' : 'Read-only'} />
      </section>

      <section className="workspace-section">
        <div className="workspace-section-head">
          <div>
            <p className="eyebrow">Classification Counts</p>
            <h2>Audit summary</h2>
          </div>
        </div>
        <div className="touring-audit-counts">
          {classifications.length > 0 ? (
            classifications.map(([classification, count]) => (
              <div key={classification} className="touring-audit-count">
                <ClassificationBadge classification={classification} />
                <strong>{formatNumber(count)}</strong>
              </div>
            ))
          ) : (
            <p className="detail-copy">No classification counts returned.</p>
          )}
        </div>
      </section>

      <section className="workspace-section">
        <div className="workspace-section-head">
          <div>
            <p className="eyebrow">Cleanup Recommendations</p>
            <h2>Planning summary</h2>
          </div>
          <label className="field-label">
            Recommendation
            <select value={recommendationFilter} onChange={(event) => setRecommendationFilter(event.target.value)}>
              <option value="ALL">All recommendations</option>
              {recommendationCounts.map(([recommendation]) => (
                <option key={recommendation} value={recommendation}>
                  {RECOMMENDATION_LABELS[recommendation] || recommendation}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="touring-audit-counts">
          {recommendationCounts.length > 0 ? (
            recommendationCounts.map(([recommendation, count]) => (
              <div key={recommendation} className="touring-audit-count">
                <RecommendationBadge recommendation={recommendation} />
                <strong>{formatNumber(count)}</strong>
              </div>
            ))
          ) : (
            <p className="detail-copy">No cleanup recommendations returned.</p>
          )}
        </div>
      </section>

      <section className="workspace-section">
        <div className="workspace-section-head">
          <div>
            <p className="eyebrow">Rows</p>
            <h2>Touring route audit rows</h2>
            <p className="detail-copy">{formatNumber(filteredRows.length)} rows shown</p>
          </div>
        </div>
        <div className="table-wrap touring-audit-table-wrap">
          <table className="touring-audit-table">
            <thead>
              <tr>
                <th>Route</th>
                <th>Classification</th>
                <th>Recommendation</th>
                <th>Preview Actions</th>
                <th>Impact</th>
                <th>Canonical Code</th>
                <th>Legacy Aliases</th>
                <th>Selector</th>
                <th>Operational Fields</th>
                <th>Warnings</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>{row.name || 'Unnamed touring route'}</strong>
                    <div className="table-subcopy">{row.currentCode || row.id}</div>
                  </td>
                  <td>
                    <ClassificationBadge classification={row.classification} />
                    <div className="table-subcopy">{row.candidateTarget || 'TOURING_ROUTE'}</div>
                  </td>
                  <td>
                    <RecommendationBadge recommendation={row.cleanupRecommendation} />
                    <div className="table-subcopy">{row.cleanupPreview?.safeToConvert ? 'Safe to convert' : 'Review before converting'}</div>
                  </td>
                  <td>
                    {(row.cleanupPreview?.actions || []).length > 0 ? (
                      <div className="touring-audit-aliases">
                        {(row.cleanupPreview?.actions || []).map((action) => (
                          <code key={action.action}>{formatActionName(action.action)}</code>
                        ))}
                        <button type="button" className="secondary-button" onClick={() => setSelectedDryRun(row)}>
                          Dry-run
                        </button>
                      </div>
                    ) : (
                      <span className="table-subcopy">No cleanup action</span>
                    )}
                  </td>
                  <td>
                    <ImpactSummary row={row} />
                  </td>
                  <td>
                    <code>{row.suggestedCanonicalCode}</code>
                  </td>
                  <td>
                    {(row.legacyAliases || []).length > 0 ? (
                      <div className="touring-audit-aliases">
                        {(row.legacyAliases || []).map((alias) => (
                          <code key={alias}>{alias}</code>
                        ))}
                      </div>
                    ) : (
                      <span className="table-subcopy">None</span>
                    )}
                  </td>
                  <td>
                    <span className={row.selectorEligible ? 'status-badge' : 'status-badge status-badge-expired'}>
                      {row.selectorEligible ? 'Eligible' : 'Hidden'}
                    </span>
                  </td>
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
                  <td>
                    {(row.warnings || []).length > 0 ? (
                      <ul className="touring-audit-warning-list">
                        {(row.warnings || []).map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    ) : (
                      <span className="table-subcopy">No warnings</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {selectedDryRun ? <ExecutionDryRunModal row={selectedDryRun} onClose={() => setSelectedDryRun(null)} /> : null}
    </>
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

function ClassificationBadge({ classification }: { classification: string }) {
  const label = CLASSIFICATION_LABELS[classification] || classification;
  return <span className={`status-badge touring-audit-badge touring-audit-badge-${classification.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>{label}</span>;
}

function RecommendationBadge({ recommendation }: { recommendation: string }) {
  const label = RECOMMENDATION_LABELS[recommendation] || recommendation;
  return <span className={`status-badge touring-audit-badge touring-audit-badge-${recommendation.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>{label}</span>;
}

function ImpactSummary({ row }: { row: AuditRow }) {
  const impact = row.cleanupPreview?.impact;
  if (!impact) return <span className="table-subcopy">No impact preview</span>;

  return (
    <div className="table-subcopy">
      <div>Quotes: {formatNumber(impact.affectedQuotes.total)} ({formatNumber(impact.affectedQuotes.active)} active)</div>
      <div>Templates: {formatNumber(impact.affectedTemplates.total)}</div>
      <div>Bookings: {formatNumber(impact.affectedBookings.total)} ({formatNumber(impact.affectedBookings.active)} active)</div>
      <div>Selectors: {formatNumber(impact.affectedSelectorReferences.total)}</div>
      <div>Aliases: {formatNumber(impact.affectedRouteAliases.total)} preserved</div>
      <div>Departures: {formatNumber(impact.affectedDepartures.total)}</div>
    </div>
  );
}

function ExecutionDryRunModal({ row, onClose }: { row: AuditRow; onClose: () => void }) {
  const dryRuns = row.cleanupPreview?.executionDryRuns || [];
  const firstDryRun = dryRuns[0];

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="touring-cleanup-dry-run-title">
        <div className="workspace-section-head">
          <div>
            <p className="eyebrow">Dry-Run Only</p>
            <h2 id="touring-cleanup-dry-run-title">{row.name || 'Touring route cleanup preview'}</h2>
            <p className="detail-copy">No database writes, deletes, selector hiding, or production execution path is available here.</p>
          </div>
          <button type="button" className="secondary-button" onClick={onClose}>
            Close
          </button>
        </div>

        {dryRuns.length > 0 ? (
          <div className="workspace-section">
            <div className="touring-audit-counts">
              {dryRuns.map((dryRun) => (
                <div key={dryRun.action} className="touring-audit-count">
                  <code>{formatActionName(dryRun.action)}</code>
                  <strong>{dryRun.safeExecutionScore}</strong>
                  <span>{dryRun.safeToExecute ? 'Safe score' : 'Blocked/review'}</span>
                </div>
              ))}
            </div>

            {firstDryRun ? (
              <div className="table-wrap">
                <table className="touring-audit-table">
                  <tbody>
                    <tr>
                      <th>Rollback snapshot</th>
                      <td>
                        <code>{firstDryRun.rollbackSnapshotPreview.touringRoute.code || row.id}</code>
                        <div className="table-subcopy">
                          {formatNumber(firstDryRun.rollbackSnapshotPreview.stops.length)} stops,{' '}
                          {formatNumber(firstDryRun.rollbackSnapshotPreview.pricings.length)} pricing rows
                        </div>
                      </td>
                    </tr>
                    <tr>
                      <th>Reference migration preview</th>
                      <td>
                        <ImpactSummary row={row} />
                      </td>
                    </tr>
                    <tr>
                      <th>Aliases</th>
                      <td>
                        {(firstDryRun.referenceMigrationPreview.aliases.aliases || []).length > 0 ? (
                          <div className="touring-audit-aliases">
                            {firstDryRun.referenceMigrationPreview.aliases.aliases.map((alias) => (
                              <code key={alias}>{alias}</code>
                            ))}
                          </div>
                        ) : (
                          <span className="table-subcopy">No aliases</span>
                        )}
                        <div className="table-subcopy">
                          {firstDryRun.referenceMigrationPreview.aliases.preserved ? 'Historical aliases preserved' : 'Alias preservation missing'}
                        </div>
                      </td>
                    </tr>
                    <tr>
                      <th>Conflicts</th>
                      <td>
                        <div className="table-subcopy">Activity duplicates: {formatNumber(firstDryRun.conflicts.existingActivityDuplicates)}</div>
                        <div className="table-subcopy">Excursion duplicates: {formatNumber(firstDryRun.conflicts.existingExcursionTemplateDuplicates)}</div>
                        <div className="table-subcopy">Canonical code conflicts: {formatNumber(firstDryRun.conflicts.canonicalCodeConflicts)}</div>
                        <div className="table-subcopy">Active departure conflicts: {formatNumber(firstDryRun.conflicts.activeDepartureConflicts)}</div>
                      </td>
                    </tr>
                    <tr>
                      <th>Warnings</th>
                      <td>
                        {(firstDryRun.warnings || []).length > 0 ? (
                          <ul className="touring-audit-warning-list">
                            {firstDryRun.warnings.map((warning) => (
                              <li key={warning}>{warning}</li>
                            ))}
                          </ul>
                        ) : (
                          <span className="table-subcopy">No dry-run warnings</span>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="detail-copy">No dry-run actions are available for this recommendation.</p>
        )}
      </section>
    </div>
  );
}

function formatActionName(action: string) {
  return action
    .replace(/Preview$/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (value) => value.toUpperCase());
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value || 0);
}

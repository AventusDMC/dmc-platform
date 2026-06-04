import Link from 'next/link';
import { notFound } from 'next/navigation';
import { adminPageFetchJson, isNextRedirectError } from '../../../../../lib/admin-server';

// Hotels Engine — contract audit-log viewer (roadmap Phase 1).
//
// Read-only timeline merging the per-entity audit tables (supplements /
// cancellation / child policy / meal plans / occupancy) into one
// reverse-chronological "who changed what, when" view. Drives the unified
// GET /hotel-contracts/:id/audit-log endpoint via the catch-all proxy.

export const dynamic = 'force-dynamic';

const API_BASE_URL = '/api';

const ENTITY_LABELS: Record<string, string> = {
  supplement: 'Supplement',
  cancellation: 'Cancellation',
  childPolicy: 'Child policy',
  mealPlan: 'Meal plan',
  occupancy: 'Occupancy',
};

const ENTITY_COLORS: Record<string, string> = {
  supplement: '#e0e7ff',
  cancellation: '#fee2e2',
  childPolicy: '#dcfce7',
  mealPlan: '#fef9c3',
  occupancy: '#f3e8ff',
};

type ContractSummary = {
  id: string;
  hotelId: string;
  name: string;
  hotel: { id: string; name: string };
};

type AuditEntry = {
  entity: string;
  action: string;
  oldValue: string | null;
  newValue: string | null;
  note: string | null;
  actor: string | null;
  actorUserId: string | null;
  createdAt: string;
};

type AuditResponse = { total: number; limit: number; offset: number; entries: AuditEntry[] };

async function getContract(contractId: string): Promise<ContractSummary | null> {
  try {
    return await adminPageFetchJson<ContractSummary>(
      `${API_BASE_URL}/hotel-contracts/${encodeURIComponent(contractId)}?summary=1`,
      'Audit log — contract',
      { cache: 'no-store', allow404: true },
    );
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error('[hotels/contract/audit-log] contract unavailable', error);
    return null;
  }
}

async function getAuditLog(contractId: string): Promise<AuditResponse | null> {
  try {
    return await adminPageFetchJson<AuditResponse>(
      `${API_BASE_URL}/hotel-contracts/${encodeURIComponent(contractId)}/audit-log`,
      'Audit log — entries',
      { cache: 'no-store', allow404: true },
    );
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error('[hotels/contract/audit-log] entries unavailable', error);
    return null;
  }
}

// 'contract_supplement_updated' → 'Updated' (strip the entity prefix,
// title-case the verb). Falls back to a humanized form for anything else.
function humanizeAction(action: string): string {
  const verb = action.split('_').pop() || action;
  const map: Record<string, string> = { created: 'Created', updated: 'Updated', deleted: 'Deleted' };
  return map[verb] || action.replace(/_/g, ' ');
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
}

type Props = { params: Promise<{ id: string; contractId: string }> };

export default async function ContractAuditLogPage({ params }: Props) {
  const { id: hotelId, contractId } = await params;
  const [contract, audit] = await Promise.all([getContract(contractId), getAuditLog(contractId)]);

  if (!contract) notFound();
  if (contract.hotelId !== hotelId) notFound();

  const entries = audit?.entries ?? [];

  return (
    <main className="page">
      <section className="panel workspace-panel workspace-panel-wide">
        <header style={{ marginBottom: '1.5rem' }}>
          <p className="eyebrow">Hotels Engine — Audit log</p>
          <h1 className="section-title">{contract.name}</h1>
          <p className="copy section-copy">{contract.hotel.name}</p>
          <p className="table-subcopy" style={{ marginTop: '0.5rem' }}>
            <Link href={`/hotels/${hotelId}/contracts/${contractId}`} prefetch={false}>
              ← Back to contract
            </Link>
          </p>
        </header>

        <section data-testid="hotel-contract-audit-log">
          <h2 className="section-title" style={{ fontSize: '1.05rem', marginBottom: '0.6rem' }}>
            Change history
          </h2>
          <p className="table-subcopy" style={{ marginTop: 0, marginBottom: '0.6rem' }}>
            Every create / edit / delete to this contract's supplements, cancellation rules,
            child-policy bands, meal plans and occupancy rules — newest first.
            {entries.length > 0 ? ` Showing the ${entries.length} most recent.` : ''}
          </p>
          {entries.length === 0 ? (
            <p className="table-subcopy">
              No changes recorded yet. Edits made from the contract editors will appear here.
            </p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>When (UTC)</th>
                    <th>Area</th>
                    <th>Action</th>
                    <th>Change</th>
                    <th>By</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e, i) => {
                    const change =
                      e.oldValue && e.newValue
                        ? `${e.oldValue}  →  ${e.newValue}`
                        : e.newValue || e.oldValue || '—';
                    return (
                      <tr key={`${e.createdAt}-${i}`}>
                        <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>{formatTimestamp(e.createdAt)}</td>
                        <td>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '0.1rem 0.45rem',
                              borderRadius: '4px',
                              background: ENTITY_COLORS[e.entity] || '#e2e8f0',
                              color: '#1e293b',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                            }}
                          >
                            {ENTITY_LABELS[e.entity] || e.entity}
                          </span>
                        </td>
                        <td>{humanizeAction(e.action)}</td>
                        <td style={{ maxWidth: '34rem', fontSize: '0.8rem' }}>
                          {change}
                          {e.note ? (
                            <div style={{ color: 'var(--ds-color-text-faint, #94A3B8)', fontSize: '0.72rem', marginTop: '0.2rem' }}>{e.note}</div>
                          ) : null}
                        </td>
                        <td style={{ fontSize: '0.8rem' }}>{e.actor || '—'}</td>
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
          style={{ marginTop: '1.5rem', color: 'var(--ds-color-text-faint, #94A3B8)', fontSize: '0.75rem' }}
        >
          /hotels/{hotelId}/contracts/{contractId}/audit-log — server-rendered, read-only.
          Merged from the per-entity audit tables via /hotel-contracts/:id/audit-log.
        </p>
      </section>
    </main>
  );
}

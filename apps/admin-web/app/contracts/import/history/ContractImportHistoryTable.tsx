'use client';

import { Fragment, useState } from 'react';
import { getErrorMessage, readJsonResponse } from '../../../lib/api';

type ContractImportHistoryItem = {
  id: string;
  contractName: string;
  contractType: 'HOTEL' | 'TRANSPORT' | 'ACTIVITY';
  status: string;
  createdAt: string;
  importedAt?: string | null;
  user: string;
  sourceFileName: string;
  approvedJson?: unknown;
  extractedJson?: unknown;
  warnings?: Array<{ severity: string; field: string; message: string }> | null;
  auditLogs: Array<{
    id: string;
    action: string;
    status: string;
    user: string;
    note?: string | null;
    createdAt: string;
  }>;
};

type ContractImportHistoryTableProps = {
  initialImports: ContractImportHistoryItem[];
};

function formatDate(value: string | null | undefined) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function previewSummary(value: unknown) {
  if (!value || typeof value !== 'object') return [];
  const record = value as {
    supplier?: { name?: string };
    contract?: { name?: string; validFrom?: string; validTo?: string; currency?: string };
    hotel?: { name?: string; city?: string; category?: string };
    rates?: unknown[];
  };

  return [
    ['Supplier', record.supplier?.name || '-'],
    ['Contract', record.contract?.name || '-'],
    ['Validity', `${record.contract?.validFrom || '-'} to ${record.contract?.validTo || '-'}`],
    ['Currency', record.contract?.currency || '-'],
    ['Hotel', record.hotel?.name ? `${record.hotel.name}, ${record.hotel.city || '-'}` : '-'],
    ['Rates', String(Array.isArray(record.rates) ? record.rates.length : 0)],
  ];
}

export function ContractImportHistoryTable({ initialImports }: ContractImportHistoryTableProps) {
  const [imports, setImports] = useState(initialImports);
  const [openId, setOpenId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [reimportingId, setReimportingId] = useState<string | null>(null);

  async function handleReimport(item: ContractImportHistoryItem) {
    setMessage('');
    setError('');
    setReimportingId(item.id);

    try {
      const response = await fetch(`/api/contract-imports/${item.id}/reimport`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not re-import contract.'));
      }

      await readJsonResponse(response, 'Contract re-import');
      const refreshed = await fetch('/api/contract-imports', { cache: 'no-store' });
      if (refreshed.ok) {
        setImports(await readJsonResponse<ContractImportHistoryItem[]>(refreshed, 'Contract import history refresh'));
      }
      setMessage('Contract re-imported.');
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not re-import contract.');
    } finally {
      setReimportingId(null);
    }
  }

  return (
    <div className="contract-import-layout">
      {error ? <div className="form-error">{error}</div> : null}
      {message ? <div className="success-message">{message}</div> : null}
      <section className="table-section">
        {imports.length === 0 ? <p className="empty-state">No contract imports yet.</p> : null}
        {imports.length > 0 ? (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Contract</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>User</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {imports.map((item) => {
                  const isOpen = openId === item.id;
                  const importedData = item.approvedJson || item.extractedJson;

                  return (
                    <Fragment key={item.id}>
                      <tr>
                        <td>
                          <strong>{item.contractName}</strong>
                          <div className="table-subcopy">{item.sourceFileName}</div>
                        </td>
                        <td>{item.contractType}</td>
                        <td>{item.status}</td>
                        <td>{formatDate(item.importedAt || item.createdAt)}</td>
                        <td>{item.user}</td>
                        <td>
                          <div className="table-actions">
                            <button className="compact-button" type="button" onClick={() => setOpenId(isOpen ? null : item.id)}>
                              {isOpen ? 'Hide details' : 'View details'}
                            </button>
                            <button
                              className="compact-button"
                              type="button"
                              onClick={() => handleReimport(item)}
                              disabled={reimportingId === item.id || !importedData}
                            >
                              {reimportingId === item.id ? 'Re-importing...' : 'Re-import'}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isOpen ? (
                        <tr>
                          <td colSpan={6}>
                            <div className="contract-import-details">
                              <section>
                                <h3>Imported data</h3>
                                <div className="summary-strip">
                                  {previewSummary(importedData).map(([label, value]) => (
                                    <div className="summary-card" key={label}>
                                      <span>{label}</span>
                                      <strong>{value}</strong>
                                    </div>
                                  ))}
                                </div>
                                <details>
                                  <summary>Raw imported data</summary>
                                  <pre>{JSON.stringify(importedData, null, 2)}</pre>
                                </details>
                              </section>
                              <section>
                                <h3>Warnings</h3>
                                {item.warnings?.length ? (
                                  <div className="warning-list">
                                    {item.warnings.map((warning) => (
                                      <p key={`${warning.field}-${warning.message}`} className={warning.severity === 'blocker' ? 'form-error' : 'empty-state'}>
                                        {warning.message}
                                      </p>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="empty-state">No warnings recorded.</p>
                                )}
                              </section>
                              <section>
                                <h3>Audit log</h3>
                                {item.auditLogs.length === 0 ? <p className="empty-state">No audit events recorded.</p> : null}
                                {item.auditLogs.length > 0 ? (
                                  <table className="data-table">
                                    <thead>
                                      <tr>
                                        <th>Action</th>
                                        <th>Status</th>
                                        <th>User</th>
                                        <th>Date</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {item.auditLogs.map((log) => (
                                        <tr key={log.id}>
                                          <td>{log.action}</td>
                                          <td>{log.status}</td>
                                          <td>{log.user}</td>
                                          <td>{formatDate(log.createdAt)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                ) : null}
                              </section>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}

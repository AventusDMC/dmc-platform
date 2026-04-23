'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getErrorMessage } from '../../lib/api';

type QueueItem = {
  bookingId: string;
  bookingReference: string;
  clientName: string;
  outstandingAmount: number;
  overdue: boolean;
  overdueAmount: number;
  paymentId: string;
  paymentAmount: number;
  submittedProofReference: string | null;
  submittedProofAmount: number | null;
  receiptUrl: string | null;
  submittedAt: string | null;
  matchPct: number | null;
  confidence: 'high' | 'medium' | 'low';
  readyToConfirm: boolean;
  reminderStage: 'gentle' | 'firm' | 'urgent';
  reminderCooldownActive: boolean;
  nextReminderDueAt: string | null;
  invoiceDelivery: {
    sentAt: string | null;
    sentTo: string | null;
  };
  paymentReminderDelivery: {
    sentAt: string | null;
    sentTo: string | null;
  };
};

type BatchConfirmResponse = {
  confirmedCount: number;
  clientNotifiedCount: number;
  totalConfirmedAmount: number;
  currency: string;
};

type BatchReminderResponse = {
  count: number;
  totalNotified: number;
  skippedCooldownCount: number;
};

type ReconciliationQueueTableProps = {
  items: QueueItem[];
  dailySummary: {
    confirmedCount: number;
    confirmedAmount: number;
    remindersSent: number;
    avgProcessingTime: number | null;
  };
};

function formatMoney(amount: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDateTime(value: string | null) {
  if (!value) {
    return 'Not sent';
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function resolveReceiptUrl(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  return `${apiBaseUrl}${value.startsWith('/') ? value : `/${value}`}`;
}

function getItemKey(item: QueueItem) {
  return `${item.bookingId}:${item.paymentId}`;
}

function canAutoSelect(item: QueueItem) {
  return item.readyToConfirm;
}

function getSelectionTotal(items: QueueItem[]) {
  return items.reduce((sum, item) => sum + Number(item.paymentAmount || 0), 0);
}

function isStaleItem(item: QueueItem) {
  if (item.overdue) {
    return true;
  }

  if (!item.submittedAt) {
    return false;
  }

  return Date.now() - new Date(item.submittedAt).getTime() >= 24 * 60 * 60 * 1000;
}

export function ReconciliationQueueTable({ items, dailySummary }: ReconciliationQueueTableProps) {
  const router = useRouter();
  const [pendingActionKey, setPendingActionKey] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<string[]>(() =>
    items.filter((item) => canAutoSelect(item)).map((item) => getItemKey(item)),
  );
  const [activeRowKey, setActiveRowKey] = useState<string | null>(() => {
    const firstHighConfidenceItem = items.find((item) => canAutoSelect(item));
    return firstHighConfidenceItem ? getItemKey(firstHighConfidenceItem) : items[0] ? getItemKey(items[0]) : null;
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [previewItemKey, setPreviewItemKey] = useState<string | null>(null);

  useEffect(() => {
    const itemKeys = new Set(items.map((item) => getItemKey(item)));

    setSelectedKeys((current) => {
      const next = current.filter((key) => itemKeys.has(key));
      const nextSet = new Set(next);

      for (const item of items) {
        if (canAutoSelect(item)) {
          nextSet.add(getItemKey(item));
        }
      }

      return Array.from(nextSet);
    });

    setActiveRowKey((current) => {
      if (current && itemKeys.has(current)) {
        return current;
      }

      const firstHighConfidenceItem = items.find((item) => canAutoSelect(item));
      return firstHighConfidenceItem ? getItemKey(firstHighConfidenceItem) : items[0] ? getItemKey(items[0]) : null;
    });
  }, [items]);

  const selectedKeySet = new Set(selectedKeys);
  const selectedItems = items.filter((item) => selectedKeySet.has(getItemKey(item)));
  const readyItems = items.filter((item) => item.readyToConfirm);
  const selectedReadyItems = readyItems.filter((item) => selectedKeySet.has(getItemKey(item)));
  const selectedRemindableItems = items.filter(
    (item) => selectedKeySet.has(getItemKey(item)) && !item.readyToConfirm && !item.reminderCooldownActive,
  );
  const activeSelectedItem =
    activeRowKey && selectedKeySet.has(activeRowKey)
      ? items.find((item) => getItemKey(item) === activeRowKey) || null
      : null;
  const keyboardConfirmItem = activeSelectedItem;

  useEffect(() => {
    if (!keyboardConfirmItem || reviewModalOpen || previewItemKey) {
      return undefined;
    }

    const confirmableItem = keyboardConfirmItem;

    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();

      if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) {
        return;
      }

      if (
        tagName === 'input' ||
        tagName === 'textarea' ||
        tagName === 'select' ||
        tagName === 'button' ||
        tagName === 'a'
      ) {
        return;
      }

      event.preventDefault();
      void handleConfirmItems([confirmableItem], `confirm:${getItemKey(confirmableItem)}`);
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [keyboardConfirmItem, reviewModalOpen, previewItemKey]);

  function toggleSelection(item: QueueItem) {
    const key = getItemKey(item);
    setSelectedKeys((current) =>
      current.includes(key) ? current.filter((value) => value !== key) : [...current, key],
    );
    setActiveRowKey(key);
  }

  function selectOnly(item: QueueItem) {
    const key = getItemKey(item);
    setSelectedKeys([key]);
    setActiveRowKey(key);
  }

  function handleReviewStale() {
    const staleItems = items.filter((item) => isStaleItem(item));

    if (staleItems.length === 0) {
      setSuccess('No stale submissions need review right now.');
      setError('');
      return;
    }

    const staleKeys = staleItems.map((item) => getItemKey(item));
    const firstKey = staleKeys[0] || null;
    setSelectedKeys(staleKeys);
    setActiveRowKey(firstKey);

    const firstPreviewableStaleItem = staleItems.find((item) => Boolean(resolveReceiptUrl(item.receiptUrl)));
    setPreviewItemKey(firstPreviewableStaleItem ? getItemKey(firstPreviewableStaleItem) : null);
    setSuccess(`Focused ${staleItems.length} stale submission${staleItems.length === 1 ? '' : 's'}.`);
    setError('');
  }

  function buildConfirmSuccessMessage(payload: BatchConfirmResponse) {
    const currency = payload.currency || 'USD';
    const summary = `${payload.confirmedCount} payment${payload.confirmedCount === 1 ? '' : 's'} totaling ${formatMoney(payload.totalConfirmedAmount, currency)}.`;

    if (payload.clientNotifiedCount > 0) {
      if (payload.confirmedCount === 1 && payload.clientNotifiedCount === 1) {
        return `Payment confirmed and client notified. ${summary}`;
      }

      if (payload.clientNotifiedCount === payload.confirmedCount) {
        return `Payments confirmed and clients notified. ${summary}`;
      }

      return `Payments confirmed. ${payload.clientNotifiedCount} client notification${payload.clientNotifiedCount === 1 ? '' : 's'} sent. ${summary}`;
    }

    return `Payments confirmed. ${summary}`;
  }

  function getNextPreviewableSelectedKey(currentKey: string) {
    const previewableSelectedKeys = items
      .filter((item) => selectedKeySet.has(getItemKey(item)) && Boolean(resolveReceiptUrl(item.receiptUrl)))
      .map((item) => getItemKey(item))
      .filter((key) => key !== currentKey);

    return previewableSelectedKeys[0] || null;
  }

  async function handleConfirmItems(targetItems: QueueItem[], actionKey: string) {
    if (targetItems.length === 0) {
      return;
    }

    try {
      setPendingActionKey(actionKey);
      setError('');
      setSuccess('');

      const response = await fetch('/api/bookings/reconciliation/payment-proofs/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          paymentIds: targetItems.map((item) => item.paymentId),
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not confirm the selected payments.'));
      }

      const payload = (await response.json()) as BatchConfirmResponse;
      setSuccess(buildConfirmSuccessMessage(payload));
      setReviewModalOpen(false);
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not confirm the selected payments.');
    } finally {
      setPendingActionKey(null);
    }
  }

  async function handlePreviewConfirmAndNext(item: QueueItem) {
    const currentKey = getItemKey(item);
    const nextKey = getNextPreviewableSelectedKey(currentKey);
    const actionKey = `confirm:${currentKey}`;

    try {
      setPendingActionKey(actionKey);
      setError('');
      setSuccess('');

      const response = await fetch('/api/bookings/reconciliation/payment-proofs/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          paymentIds: [item.paymentId],
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not confirm the selected payment.'));
      }

      const payload = (await response.json()) as BatchConfirmResponse;
      const successMessage = buildConfirmSuccessMessage(payload);

      setSelectedKeys((current) => current.filter((key) => key !== currentKey));

      if (nextKey) {
        setPreviewItemKey(nextKey);
        setActiveRowKey(nextKey);
      } else {
        setPreviewItemKey(null);
      }

      setSuccess(successMessage);
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not confirm the selected payment.');
    } finally {
      setPendingActionKey(null);
    }
  }

  async function handleNeedsFollowUp(item: QueueItem) {
    if (item.reminderCooldownActive) {
      setError(
        item.nextReminderDueAt
          ? `Reminder cooldown active until ${formatDateTime(item.nextReminderDueAt)}.`
          : 'Reminder cooldown is still active for this booking.',
      );
      return;
    }

    try {
      const actionKey = `follow-up:${item.bookingId}`;
      setPendingActionKey(actionKey);
      setError('');
      setSuccess('');
      const response = await fetch('/api/bookings/reconciliation/payment-proofs/remind', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          bookingIds: [item.bookingId],
          paymentIds: [item.paymentId],
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not trigger the follow-up reminder.'));
      }

      const payload = (await response.json()) as BatchReminderResponse;
      setSuccess(
        payload.totalNotified > 0
          ? `Reminder sent for ${item.bookingReference}.`
          : `No reminder sent for ${item.bookingReference}. Cooldown still applies.`,
      );
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not trigger the follow-up reminder.');
    } finally {
      setPendingActionKey(null);
    }
  }

  async function handleBatchReminder() {
    if (selectedRemindableItems.length === 0) {
      return;
    }

    try {
      setPendingActionKey('batch-remind');
      setError('');
      setSuccess('');

      const response = await fetch('/api/bookings/reconciliation/payment-proofs/remind', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          bookingIds: selectedRemindableItems.map((item) => item.bookingId),
          paymentIds: selectedRemindableItems.map((item) => item.paymentId),
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not send reminders for the selected bookings.'));
      }

      const payload = (await response.json()) as BatchReminderResponse;
      setSuccess(
        `Sent ${payload.totalNotified} reminder${payload.totalNotified === 1 ? '' : 's'} from ${payload.count} selected booking${payload.count === 1 ? '' : 's'}.`,
      );
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not send reminders for the selected bookings.');
    } finally {
      setPendingActionKey(null);
    }
  }

  const selectedCount = selectedItems.length;
  const selectedTotal = getSelectionTotal(selectedItems);
  const reviewTotal = getSelectionTotal(selectedReadyItems);
  const staleItems = items.filter((item) => isStaleItem(item));
  const previewItem = previewItemKey ? items.find((item) => getItemKey(item) === previewItemKey) || null : null;
  const previewReceiptHref = resolveReceiptUrl(previewItem?.receiptUrl);
  const previewIsPdf = Boolean(previewReceiptHref && /\.pdf($|\?)/i.test(previewReceiptHref));

  return (
    <div className="entity-list allotment-table-stack">
      <div className="finance-reconciliation-daily-panel detail-card">
        <div className="finance-reconciliation-daily-grid">
          <div>
            <span>Confirmed today</span>
            <strong>{String(dailySummary.confirmedCount)}</strong>
            <p>{formatMoney(dailySummary.confirmedAmount)}</p>
          </div>
          <div>
            <span>Reminders sent</span>
            <strong>{String(dailySummary.remindersSent)}</strong>
            <p>Today</p>
          </div>
          <div>
            <span>Avg processing time</span>
            <strong>{dailySummary.avgProcessingTime !== null ? `${dailySummary.avgProcessingTime}m` : '—'}</strong>
            <p>Proof to confirm</p>
          </div>
          <div>
            <span>Stale queue</span>
            <strong>{String(staleItems.length)}</strong>
            <p>Needs review</p>
          </div>
        </div>
        <div className="table-action-row finance-reconciliation-daily-actions">
          <button
            type="button"
            className="primary-button"
            onClick={() => setReviewModalOpen(true)}
            disabled={selectedReadyItems.length === 0 || Boolean(pendingActionKey)}
          >
            Confirm all ready
          </button>
          <button type="button" className="secondary-button" onClick={handleReviewStale}>
            Review stale
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => void handleBatchReminder()}
            disabled={selectedRemindableItems.length === 0 || pendingActionKey === 'batch-remind'}
          >
            {pendingActionKey === 'batch-remind' ? 'Sending...' : 'Send batch reminders'}
          </button>
        </div>
      </div>

      <div className="finance-reconciliation-toolbar">
        <div>
          <p className="eyebrow">Fast lane</p>
          <h3>Selected for confirmation</h3>
          <p className="table-subcopy">
            {selectedCount} payment{selectedCount === 1 ? '' : 's'} selected | {formatMoney(selectedTotal)}
          </p>
          <p className="table-subcopy">
            {selectedRemindableItems.length} selected for reminder follow-up
          </p>
        </div>
        <div className="table-action-row finance-reconciliation-toolbar-actions">
          <button
            type="button"
            className="primary-button"
            onClick={() => setReviewModalOpen(true)}
            disabled={selectedReadyItems.length === 0 || Boolean(pendingActionKey)}
          >
            Confirm all ready
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => void handleBatchReminder()}
            disabled={selectedRemindableItems.length === 0 || pendingActionKey === 'batch-remind'}
          >
            {pendingActionKey === 'batch-remind' ? 'Sending...' : 'Send reminder'}
          </button>
        </div>
      </div>

      <div className="table-wrap">
        <table className="data-table allotment-table">
          <thead>
            <tr>
              <th aria-label="Select proof" />
              <th>Booking</th>
              <th>Proof</th>
              <th>Outstanding</th>
              <th>Delivery</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const key = getItemKey(item);
              const receiptHref = resolveReceiptUrl(item.receiptUrl);
              const confirmActionKey = `confirm:${key}`;
              const followUpActionKey = `follow-up:${item.bookingId}`;
              const isSelected = selectedKeySet.has(key);
              const isActive = activeRowKey === key;

              return (
                <tr
                  key={key}
                  className={[
                    item.overdue ? 'finance-reconciliation-row-overdue' : '',
                    item.readyToConfirm ? 'finance-reconciliation-row-high-confidence' : '',
                    isSelected ? 'finance-reconciliation-row-selected' : '',
                    isActive ? 'finance-reconciliation-row-active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ') || undefined}
                  onClick={() => setActiveRowKey(key)}
                >
                  <td>
                    <label className="finance-reconciliation-checkbox">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelection(item)}
                        aria-label={`Select ${item.bookingReference}`}
                      />
                    </label>
                  </td>
                  <td>
                    <strong>{item.bookingReference}</strong>
                    <div className="table-subcopy">{item.clientName}</div>
                    {item.overdue ? <p className="form-error operations-inline-warning">Overdue booking</p> : null}
                    {item.readyToConfirm ? (
                      <p className="table-subcopy finance-reconciliation-confidence finance-reconciliation-confidence-high">
                        Ready to confirm
                      </p>
                    ) : (
                      <p className="table-subcopy">
                        {item.reminderStage === 'urgent'
                          ? 'Urgent reminder'
                          : item.reminderStage === 'firm'
                            ? 'Firm reminder'
                            : 'Gentle reminder'}
                        {item.reminderCooldownActive && item.nextReminderDueAt
                          ? ` | Cooldown until ${formatDateTime(item.nextReminderDueAt)}`
                          : ''}
                      </p>
                    )}
                  </td>
                  <td>
                    <strong>{item.submittedProofReference || 'Reference pending'}</strong>
                    <div className="table-subcopy">Submitted {formatDateTime(item.submittedAt)}</div>
                    {item.submittedProofAmount !== null ? (
                      <div className="table-subcopy">Submitted amount {formatMoney(item.submittedProofAmount)}</div>
                    ) : null}
                    <div className="table-subcopy">
                      Match {item.matchPct !== null ? `${item.matchPct.toFixed(1)}%` : 'Unavailable'} | {item.confidence}
                    </div>
                    {receiptHref ? (
                      <div className="table-subcopy">
                        <button
                          type="button"
                          className="compact-button"
                          onClick={() => setPreviewItemKey(key)}
                          disabled={Boolean(pendingActionKey)}
                        >
                          Preview receipt
                        </button>
                      </div>
                    ) : null}
                    {receiptHref ? (
                      <div className="table-subcopy">
                        <a href={receiptHref} target="_blank" rel="noreferrer">
                          Open receipt
                        </a>
                      </div>
                    ) : (
                      <div className="table-subcopy">No receipt uploaded</div>
                    )}
                  </td>
                  <td>
                    <strong>{formatMoney(item.outstandingAmount)}</strong>
                    <div className="table-subcopy">Payment {formatMoney(item.paymentAmount)}</div>
                    {item.overdueAmount > 0 ? <div className="table-subcopy">Overdue {formatMoney(item.overdueAmount)}</div> : null}
                  </td>
                  <td>
                    <div className="table-subcopy">Invoice {formatDateTime(item.invoiceDelivery.sentAt)}</div>
                    <div className="table-subcopy">Reminder {formatDateTime(item.paymentReminderDelivery.sentAt)}</div>
                  </td>
                  <td>
                    <div className="table-action-row finance-reconciliation-actions">
                      <button
                        type="button"
                        className={item.readyToConfirm ? 'invoice-portal-primary-button' : 'secondary-button'}
                        onClick={() => (item.readyToConfirm ? void handleConfirmItems([item], confirmActionKey) : void handleNeedsFollowUp(item))}
                        disabled={Boolean(pendingActionKey) || (!item.readyToConfirm && item.reminderCooldownActive)}
                      >
                        {pendingActionKey === confirmActionKey
                          ? 'Saving...'
                          : item.readyToConfirm
                            ? 'Confirm & notify'
                            : pendingActionKey === followUpActionKey
                              ? 'Sending...'
                              : 'Send reminder'}
                      </button>
                      <button
                        type="button"
                        className="compact-button"
                        onClick={() => selectOnly(item)}
                        disabled={Boolean(pendingActionKey)}
                      >
                        {isSelected && selectedCount === 1 ? 'Selected' : 'Select row'}
                      </button>
                      <Link href={`/bookings/${item.bookingId}?tab=financials`} className="compact-button">
                        Open booking
                      </Link>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => void handleNeedsFollowUp(item)}
                        disabled={Boolean(pendingActionKey) || item.reminderCooldownActive}
                      >
                        {item.reminderCooldownActive ? 'Cooldown active' : pendingActionKey === followUpActionKey ? 'Sending...' : 'Needs follow-up'}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {success ? <p className="form-helper finance-reconciliation-success">{success}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      {reviewModalOpen ? (
        <div className="quote-client-modal-backdrop" onClick={() => setReviewModalOpen(false)}>
          <div className="detail-card quote-client-modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="quote-hotel-workflow-modal-bar">
              <div>
                <p className="eyebrow">Fast-lane review</p>
                <h3>Confirm all ready matches</h3>
                <p className="table-subcopy">
                  {selectedReadyItems.length} payment{selectedReadyItems.length === 1 ? '' : 's'} | {formatMoney(reviewTotal)}
                </p>
              </div>
              <button
                type="button"
                className="quote-modal-close-button"
                onClick={() => setReviewModalOpen(false)}
                aria-label="Close reconciliation review modal"
              >
                X
              </button>
            </div>

            <div className="finance-reconciliation-review-list">
              {selectedReadyItems.map((item) => (
                <div key={getItemKey(item)} className="finance-reconciliation-review-item">
                  <div>
                    <strong>{item.bookingReference}</strong>
                    <p className="table-subcopy">{item.clientName}</p>
                  </div>
                  <div className="finance-reconciliation-review-meta">
                    <span>{formatMoney(item.paymentAmount)}</span>
                    <span>{item.matchPct !== null ? `${item.matchPct.toFixed(1)}% match` : 'Match unavailable'}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="table-action-row quote-client-modal-actions">
              <button type="button" className="secondary-button" onClick={() => setReviewModalOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => void handleConfirmItems(selectedReadyItems, 'confirm-high-confidence')}
                disabled={pendingActionKey === 'confirm-high-confidence'}
              >
                {pendingActionKey === 'confirm-high-confidence' ? 'Confirming...' : 'Confirm selected payments'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {previewItem && previewReceiptHref ? (
        <div className="quote-client-modal-backdrop" onClick={() => setPreviewItemKey(null)}>
          <div className="detail-card quote-client-modal-card finance-reconciliation-preview-modal" onClick={(event) => event.stopPropagation()}>
            <div className="quote-hotel-workflow-modal-bar">
              <div>
                <p className="eyebrow">Receipt preview</p>
                <h3>{previewItem.bookingReference}</h3>
                <p className="table-subcopy">{previewItem.submittedProofReference || 'Reference pending'}</p>
              </div>
              <button
                type="button"
                className="quote-modal-close-button"
                onClick={() => setPreviewItemKey(null)}
                aria-label="Close receipt preview"
              >
                X
              </button>
            </div>

            <div className="finance-reconciliation-preview-frame">
              {previewIsPdf ? (
                <iframe
                  src={previewReceiptHref}
                  title={`Receipt preview for ${previewItem.bookingReference}`}
                  className="finance-reconciliation-preview-iframe"
                />
              ) : (
                <img
                  src={previewReceiptHref}
                  alt={`Receipt for ${previewItem.bookingReference}`}
                  className="finance-reconciliation-preview-image"
                />
              )}
            </div>

            <div className="table-action-row quote-client-modal-actions">
              <a href={previewReceiptHref} target="_blank" rel="noreferrer" className="secondary-button">
                Download receipt
              </a>
              {previewItem.readyToConfirm ? (
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => void handlePreviewConfirmAndNext(previewItem)}
                  disabled={Boolean(pendingActionKey)}
                >
                  {pendingActionKey === `confirm:${getItemKey(previewItem)}` ? 'Saving...' : 'Confirm & next'}
                </button>
              ) : (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => void handleNeedsFollowUp(previewItem)}
                  disabled={Boolean(pendingActionKey) || previewItem.reminderCooldownActive}
                >
                  {previewItem.reminderCooldownActive ? 'Cooldown active' : 'Send reminder'}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

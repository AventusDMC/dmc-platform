'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { InlineRowEditorShell } from '../components/InlineRowEditorShell';
import { RowDetailsPanel } from '../components/RowDetailsPanel';
import { getErrorMessage } from '../lib/api';
import { HotelPromotionsForm } from './HotelPromotionsForm';

type HotelRoomCategoryOption = {
  id: string;
  name: string;
  code: string | null;
  isActive: boolean;
};

type HotelContractOption = {
  id: string;
  name: string;
  currency: string;
  hotel: {
    id: string;
    name: string;
    roomCategories: HotelRoomCategoryOption[];
  };
};

type PromotionRule = {
  id: string;
  roomCategoryId: string | null;
  travelDateFrom: string | null;
  travelDateTo: string | null;
  bookingDateFrom: string | null;
  bookingDateTo: string | null;
  boardBasis: 'RO' | 'BB' | 'HB' | 'FB' | 'AI' | null;
  minStay: number | null;
  isActive: boolean;
  roomCategory: {
    id: string;
    name: string;
    code: string | null;
  } | null;
};

type Promotion = {
  id: string;
  hotelContractId: string;
  name: string;
  type: 'PERCENTAGE_DISCOUNT' | 'FIXED_DISCOUNT' | 'STAY_PAY' | 'FREE_NIGHT';
  value: number | null;
  stayPayNights: number | null;
  payNights: number | null;
  freeNightCount: number | null;
  isActive: boolean;
  priority: number;
  combinable: boolean;
  notes: string | null;
  hotelContract: {
    id: string;
    name: string;
    currency: string;
    hotel: {
      name: string;
    };
  };
  rules: PromotionRule[];
};

type HotelPromotionsTableProps = {
  apiBaseUrl: string;
  contracts: HotelContractOption[];
  promotions: Promotion[];
};

function formatDate(value?: string | null) {
  if (!value) {
    return 'Any';
  }

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(value));
}

function formatPromotionType(type: Promotion['type']) {
  if (type === 'PERCENTAGE_DISCOUNT') {
    return 'Percentage discount';
  }

  if (type === 'FIXED_DISCOUNT') {
    return 'Fixed discount';
  }

  if (type === 'STAY_PAY') {
    return 'Stay-pay';
  }

  return 'Free night';
}

function formatEffect(promotion: Promotion) {
  if (promotion.type === 'PERCENTAGE_DISCOUNT') {
    return `${promotion.value || 0}% off`;
  }

  if (promotion.type === 'FIXED_DISCOUNT') {
    return `${promotion.hotelContract.currency} ${(promotion.value || 0).toFixed(2)} off`;
  }

  if (promotion.type === 'STAY_PAY') {
    return `Stay ${promotion.stayPayNights || 0}, pay ${promotion.payNights || 0}`;
  }

  return `${promotion.freeNightCount || 0} free night`;
}

function toFormRule(rule: PromotionRule) {
  return {
    roomCategoryId: rule.roomCategoryId || '',
    travelDateFrom: rule.travelDateFrom ? rule.travelDateFrom.slice(0, 10) : '',
    travelDateTo: rule.travelDateTo ? rule.travelDateTo.slice(0, 10) : '',
    bookingDateFrom: rule.bookingDateFrom ? rule.bookingDateFrom.slice(0, 10) : '',
    bookingDateTo: rule.bookingDateTo ? rule.bookingDateTo.slice(0, 10) : '',
    boardBasis: (rule.boardBasis || '') as '' | 'RO' | 'BB' | 'HB' | 'FB' | 'AI',
    minStay: rule.minStay ? String(rule.minStay) : '',
    isActive: rule.isActive,
  };
}

export function HotelPromotionsTable({ apiBaseUrl, contracts, promotions }: HotelPromotionsTableProps) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  async function handleDelete(promotion: Promotion) {
    if (!window.confirm(`Delete promotion "${promotion.name}"?`)) {
      return;
    }

    setDeletingId(promotion.id);
    setActionError('');

    try {
      const response = await fetch(`${apiBaseUrl}/promotions/${promotion.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not delete promotion.'));
      }

      router.refresh();
    } catch (caughtError) {
      setActionError(caughtError instanceof Error ? caughtError.message : 'Could not delete promotion.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="table-wrap">
      {actionError ? <p className="form-error">{actionError}</p> : null}
      <table className="data-table quote-consistency-table">
        <thead>
          <tr>
            <th>Promotion</th>
            <th>Contract</th>
            <th>Type</th>
            <th>Priority</th>
            <th>Status</th>
            <th>Rules</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          {promotions.map((promotion) => (
            <tr key={promotion.id}>
              <td>
                <strong>{promotion.name}</strong>
                <div className="table-subcopy">{formatEffect(promotion)}</div>
              </td>
              <td>
                <strong>{promotion.hotelContract.name}</strong>
                <div className="table-subcopy">{promotion.hotelContract.hotel.name}</div>
              </td>
              <td>{formatPromotionType(promotion.type)}</td>
              <td className="quote-table-number-cell">{promotion.priority}</td>
              <td>
                <span className={`quote-ui-badge ${promotion.isActive ? 'quote-ui-badge-success' : 'quote-ui-badge-info'}`}>
                  {promotion.isActive ? 'Active' : 'Inactive'}
                </span>
                <div className="table-subcopy">{promotion.combinable ? 'Combinable' : 'Non-combinable'}</div>
              </td>
              <td>
                <strong>{promotion.rules.length}</strong>
                <div className="table-subcopy">{promotion.rules.some((rule) => !rule.isActive) ? 'Contains inactive rules' : 'All rules active'}</div>
              </td>
              <td>
                <RowDetailsPanel
                  summary="View details"
                  description="Rules, notes, and edit actions"
                  groupId="hotel-promotions"
                >
                  <div className="section-stack">
                    <div className="detail-card">
                      <h3>Rules</h3>
                      {promotion.rules.length === 0 ? (
                        <p className="table-subcopy">No rules. This promotion applies to the full contract when active.</p>
                      ) : (
                        <div className="entity-list">
                          {promotion.rules.map((rule, index) => (
                            <div key={rule.id} className="detail-card">
                              <h3>Rule {index + 1}</h3>
                              <div className="table-subcopy">
                                Travel {formatDate(rule.travelDateFrom)} - {formatDate(rule.travelDateTo)}
                              </div>
                              <div className="table-subcopy">
                                Booking {formatDate(rule.bookingDateFrom)} - {formatDate(rule.bookingDateTo)}
                              </div>
                              <div className="table-subcopy">
                                Room {rule.roomCategory?.name || 'Any'} | Board {rule.boardBasis || 'Any'} | Min stay{' '}
                                {rule.minStay || 'Any'}
                              </div>
                              <div className="table-subcopy">{rule.isActive ? 'Rule active' : 'Rule inactive'}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {promotion.notes ? (
                      <div className="detail-card">
                        <h3>Notes</h3>
                        <p className="table-subcopy">{promotion.notes}</p>
                      </div>
                    ) : null}

                    <InlineRowEditorShell>
                      <HotelPromotionsForm
                        apiBaseUrl={apiBaseUrl}
                        contracts={contracts}
                        promotionId={promotion.id}
                        submitLabel="Save promotion"
                        initialValues={{
                          hotelContractId: promotion.hotelContractId,
                          name: promotion.name,
                          type: promotion.type,
                          value: promotion.value == null ? '' : String(promotion.value),
                          stayPayNights: promotion.stayPayNights == null ? '' : String(promotion.stayPayNights),
                          payNights: promotion.payNights == null ? '' : String(promotion.payNights),
                          freeNightCount: promotion.freeNightCount == null ? '' : String(promotion.freeNightCount),
                          priority: String(promotion.priority),
                          combinable: promotion.combinable,
                          isActive: promotion.isActive,
                          notes: promotion.notes || '',
                          rules: promotion.rules.length ? promotion.rules.map(toFormRule) : [toFormRule({
                            id: 'new',
                            roomCategoryId: null,
                            travelDateFrom: null,
                            travelDateTo: null,
                            bookingDateFrom: null,
                            bookingDateTo: null,
                            boardBasis: null,
                            minStay: null,
                            isActive: true,
                            roomCategory: null,
                          })],
                        }}
                      />
                      <div className="table-action-row">
                        <button
                          type="button"
                          className="compact-button compact-button-danger"
                          onClick={() => handleDelete(promotion)}
                          disabled={deletingId === promotion.id}
                        >
                          {deletingId === promotion.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </InlineRowEditorShell>
                  </div>
                </RowDetailsPanel>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getErrorMessage } from '../lib/api';

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
    name: string;
    roomCategories: HotelRoomCategoryOption[];
  };
};

type PromotionTypeValue = 'PERCENTAGE_DISCOUNT' | 'FIXED_DISCOUNT' | 'STAY_PAY' | 'FREE_NIGHT';

type PromotionRuleFormValue = {
  roomCategoryId: string;
  travelDateFrom: string;
  travelDateTo: string;
  bookingDateFrom: string;
  bookingDateTo: string;
  boardBasis: '' | 'RO' | 'BB' | 'HB' | 'FB' | 'AI';
  minStay: string;
  isActive: boolean;
};

type PromotionFormValues = {
  hotelContractId: string;
  name: string;
  type: PromotionTypeValue;
  value: string;
  stayPayNights: string;
  payNights: string;
  freeNightCount: string;
  priority: string;
  combinable: boolean;
  isActive: boolean;
  notes: string;
  rules: PromotionRuleFormValue[];
};

type HotelPromotionsFormProps = {
  apiBaseUrl: string;
  contracts: HotelContractOption[];
  promotionId?: string;
  submitLabel?: string;
  initialValues?: PromotionFormValues;
};

function createEmptyRule(): PromotionRuleFormValue {
  return {
    roomCategoryId: '',
    travelDateFrom: '',
    travelDateTo: '',
    bookingDateFrom: '',
    bookingDateTo: '',
    boardBasis: '',
    minStay: '',
    isActive: true,
  };
}

function createDefaultValues(contractId: string): PromotionFormValues {
  return {
    hotelContractId: contractId,
    name: '',
    type: 'PERCENTAGE_DISCOUNT',
    value: '',
    stayPayNights: '',
    payNights: '',
    freeNightCount: '',
    priority: '0',
    combinable: false,
    isActive: true,
    notes: '',
    rules: [createEmptyRule()],
  };
}

export function HotelPromotionsForm({
  apiBaseUrl,
  contracts,
  promotionId,
  submitLabel,
  initialValues,
}: HotelPromotionsFormProps) {
  const router = useRouter();
  const defaultContractId = initialValues?.hotelContractId || contracts[0]?.id || '';
  const initialState = initialValues || createDefaultValues(defaultContractId);
  const [hotelContractId, setHotelContractId] = useState(initialState.hotelContractId);
  const [name, setName] = useState(initialState.name);
  const [type, setType] = useState<PromotionTypeValue>(initialState.type);
  const [value, setValue] = useState(initialState.value);
  const [stayPayNights, setStayPayNights] = useState(initialState.stayPayNights);
  const [payNights, setPayNights] = useState(initialState.payNights);
  const [freeNightCount, setFreeNightCount] = useState(initialState.freeNightCount);
  const [priority, setPriority] = useState(initialState.priority);
  const [combinable, setCombinable] = useState(initialState.combinable);
  const [isActive, setIsActive] = useState(initialState.isActive);
  const [notes, setNotes] = useState(initialState.notes);
  const [rules, setRules] = useState(initialState.rules.length ? initialState.rules : [createEmptyRule()]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const isEditing = Boolean(promotionId);
  const selectedContract = contracts.find((contract) => contract.id === hotelContractId) || null;
  const roomCategories = selectedContract?.hotel.roomCategories.filter((roomCategory) => roomCategory.isActive) || [];

  function resetForm() {
    const nextState = createDefaultValues(contracts[0]?.id || '');
    setHotelContractId(nextState.hotelContractId);
    setName(nextState.name);
    setType(nextState.type);
    setValue(nextState.value);
    setStayPayNights(nextState.stayPayNights);
    setPayNights(nextState.payNights);
    setFreeNightCount(nextState.freeNightCount);
    setPriority(nextState.priority);
    setCombinable(nextState.combinable);
    setIsActive(nextState.isActive);
    setNotes(nextState.notes);
    setRules(nextState.rules);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/promotions${promotionId ? `/${promotionId}` : ''}`, {
        method: promotionId ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          hotelContractId,
          name,
          type,
          value: value || undefined,
          stayPayNights: stayPayNights || undefined,
          payNights: payNights || undefined,
          freeNightCount: freeNightCount || undefined,
          priority: priority || '0',
          combinable,
          isActive,
          notes,
          rules: rules
            .filter(
              (rule) =>
                rule.roomCategoryId ||
                rule.travelDateFrom ||
                rule.travelDateTo ||
                rule.bookingDateFrom ||
                rule.bookingDateTo ||
                rule.boardBasis ||
                rule.minStay ||
                !rule.isActive,
            )
            .map((rule) => ({
              roomCategoryId: rule.roomCategoryId || undefined,
              travelDateFrom: rule.travelDateFrom || undefined,
              travelDateTo: rule.travelDateTo || undefined,
              bookingDateFrom: rule.bookingDateFrom || undefined,
              bookingDateTo: rule.bookingDateTo || undefined,
              boardBasis: rule.boardBasis || undefined,
              minStay: rule.minStay || undefined,
              isActive: rule.isActive,
            })),
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, `Could not ${isEditing ? 'update' : 'create'} promotion.`));
      }

      if (!isEditing) {
        resetForm();
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : `Could not ${isEditing ? 'update' : 'create'} promotion.`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="entity-form" onSubmit={handleSubmit}>
      <div className="form-row form-row-3">
        <label>
          Contract
          <select value={hotelContractId} onChange={(event) => setHotelContractId(event.target.value)} disabled={contracts.length === 0} required>
            {contracts.length === 0 ? (
              <option value="">Create a contract first</option>
            ) : (
              contracts.map((contract) => (
                <option key={contract.id} value={contract.id}>
                  {contract.name} ({contract.hotel.name})
                </option>
              ))
            )}
          </select>
        </label>

        <label>
          Promotion name
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Summer stay-pay" required />
        </label>

        <label>
          Type
          <select value={type} onChange={(event) => setType(event.target.value as PromotionTypeValue)}>
            <option value="PERCENTAGE_DISCOUNT">Percentage discount</option>
            <option value="FIXED_DISCOUNT">Fixed discount</option>
            <option value="STAY_PAY">Stay-pay</option>
            <option value="FREE_NIGHT">Free night</option>
          </select>
        </label>
      </div>

      <div className="form-row form-row-4">
        {(type === 'PERCENTAGE_DISCOUNT' || type === 'FIXED_DISCOUNT') && (
          <label>
            {type === 'PERCENTAGE_DISCOUNT' ? 'Discount %' : 'Discount amount'}
            <input value={value} onChange={(event) => setValue(event.target.value)} type="number" min="0" step="0.01" required />
          </label>
        )}

        {type === 'STAY_PAY' && (
          <>
            <label>
              Stay nights
              <input value={stayPayNights} onChange={(event) => setStayPayNights(event.target.value)} type="number" min="1" step="1" required />
            </label>
            <label>
              Pay nights
              <input value={payNights} onChange={(event) => setPayNights(event.target.value)} type="number" min="1" step="1" required />
            </label>
          </>
        )}

        {type === 'FREE_NIGHT' && (
          <label>
            Free nights
            <input value={freeNightCount} onChange={(event) => setFreeNightCount(event.target.value)} type="number" min="1" step="1" required />
          </label>
        )}

        <label>
          Priority
          <input value={priority} onChange={(event) => setPriority(event.target.value)} type="number" step="1" />
        </label>
      </div>

      <div className="form-row form-row-3">
        <label className="checkbox-field">
          <input type="checkbox" checked={combinable} onChange={(event) => setCombinable(event.target.checked)} />
          Combinable
        </label>

        <label className="checkbox-field">
          <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
          Active
        </label>
      </div>

      <label>
        Notes
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} placeholder="Commercial guidance or usage notes" />
      </label>

      <section className="entity-card">
        <div className="entity-card-header">
          <div>
            <h3>Rules</h3>
            <p>Leave a rule blank to make the promotion more broadly applicable.</p>
          </div>
          <button type="button" className="compact-button" onClick={() => setRules((current) => [...current, createEmptyRule()])}>
            Add rule
          </button>
        </div>

        <div className="entity-list">
          {rules.map((rule, index) => (
            <div key={`${index}-${rule.roomCategoryId}-${rule.travelDateFrom}`} className="detail-card">
              <div className="entity-card-header">
                <div>
                  <h3>Rule {index + 1}</h3>
                  <p>Travel, booking, room, and board restrictions for this promotion.</p>
                </div>
                {rules.length > 1 ? (
                  <button
                    type="button"
                    className="compact-button compact-button-danger"
                    onClick={() => setRules((current) => current.filter((_, ruleIndex) => ruleIndex !== index))}
                  >
                    Remove
                  </button>
                ) : null}
              </div>

              <div className="form-row form-row-3">
                <label>
                  Room category
                  <select
                    value={rule.roomCategoryId}
                    onChange={(event) =>
                      setRules((current) =>
                        current.map((entry, ruleIndex) =>
                          ruleIndex === index ? { ...entry, roomCategoryId: event.target.value } : entry,
                        ),
                      )
                    }
                  >
                    <option value="">Any room</option>
                    {roomCategories.map((roomCategory) => (
                      <option key={roomCategory.id} value={roomCategory.id}>
                        {roomCategory.name}
                        {roomCategory.code ? ` (${roomCategory.code})` : ''}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Board basis
                  <select
                    value={rule.boardBasis}
                    onChange={(event) =>
                      setRules((current) =>
                        current.map((entry, ruleIndex) =>
                          ruleIndex === index ? { ...entry, boardBasis: event.target.value as PromotionRuleFormValue['boardBasis'] } : entry,
                        ),
                      )
                    }
                  >
                    <option value="">Any board</option>
                    <option value="RO">RO</option>
                    <option value="BB">BB</option>
                    <option value="HB">HB</option>
                    <option value="FB">FB</option>
                    <option value="AI">AI</option>
                  </select>
                </label>

                <label>
                  Min stay
                  <input
                    value={rule.minStay}
                    onChange={(event) =>
                      setRules((current) =>
                        current.map((entry, ruleIndex) => (ruleIndex === index ? { ...entry, minStay: event.target.value } : entry)),
                      )
                    }
                    type="number"
                    min="1"
                    step="1"
                    placeholder="Any"
                  />
                </label>
              </div>

              <div className="form-row form-row-4">
                <label>
                  Travel from
                  <input
                    value={rule.travelDateFrom}
                    onChange={(event) =>
                      setRules((current) =>
                        current.map((entry, ruleIndex) =>
                          ruleIndex === index ? { ...entry, travelDateFrom: event.target.value } : entry,
                        ),
                      )
                    }
                    type="date"
                  />
                </label>

                <label>
                  Travel to
                  <input
                    value={rule.travelDateTo}
                    onChange={(event) =>
                      setRules((current) =>
                        current.map((entry, ruleIndex) => (ruleIndex === index ? { ...entry, travelDateTo: event.target.value } : entry)),
                      )
                    }
                    type="date"
                  />
                </label>

                <label>
                  Booking from
                  <input
                    value={rule.bookingDateFrom}
                    onChange={(event) =>
                      setRules((current) =>
                        current.map((entry, ruleIndex) =>
                          ruleIndex === index ? { ...entry, bookingDateFrom: event.target.value } : entry,
                        ),
                      )
                    }
                    type="date"
                  />
                </label>

                <label>
                  Booking to
                  <input
                    value={rule.bookingDateTo}
                    onChange={(event) =>
                      setRules((current) =>
                        current.map((entry, ruleIndex) =>
                          ruleIndex === index ? { ...entry, bookingDateTo: event.target.value } : entry,
                        ),
                      )
                    }
                    type="date"
                  />
                </label>
              </div>

              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={rule.isActive}
                  onChange={(event) =>
                    setRules((current) =>
                      current.map((entry, ruleIndex) => (ruleIndex === index ? { ...entry, isActive: event.target.checked } : entry)),
                    )
                  }
                />
                Rule active
              </label>
            </div>
          ))}
        </div>
      </section>

      <button type="submit" disabled={isSubmitting || contracts.length === 0}>
        {isSubmitting ? 'Saving...' : submitLabel || (isEditing ? 'Save changes' : 'Create promotion')}
      </button>

      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}

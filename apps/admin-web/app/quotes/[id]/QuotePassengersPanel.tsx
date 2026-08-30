'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getApiError } from '../../lib/api';

export type QuotePassenger = {
  id: string;
  quoteId: string;
  firstName: string;
  lastName: string;
  gender?: string | null;
  dateOfBirth?: string | null;
  nationality?: string | null;
  passportNumber?: string | null;
  passportExpiry?: string | null;
  dietaryNotes?: string | null;
  mobilityNotes?: string | null;
  emergencyContact?: string | null;
  remarks?: string | null;
};

type QuotePassengersPanelProps = {
  apiBaseUrl: string;
  quoteId: string;
  expectedPax: number;
  passengers: QuotePassenger[];
  // CP-N3b2b: full passenger-PII predicate (admin/super_admin/operations). When
  // false, the panel shows names only and hides all passenger PII columns + the
  // add/edit/delete controls. The data itself is already name-only for these roles
  // (routed to the operational passengers companion); this is precise field gating.
  canViewPassengerPii: boolean;
};

type PassengerFormState = {
  firstName: string;
  lastName: string;
  gender: string;
  dateOfBirth: string;
  nationality: string;
  passportNumber: string;
  passportExpiry: string;
  dietaryNotes: string;
  mobilityNotes: string;
  emergencyContact: string;
  remarks: string;
};

const EMPTY_FORM: PassengerFormState = {
  firstName: '',
  lastName: '',
  gender: '',
  dateOfBirth: '',
  nationality: '',
  passportNumber: '',
  passportExpiry: '',
  dietaryNotes: '',
  mobilityNotes: '',
  emergencyContact: '',
  remarks: '',
};

function dateInputValue(value?: string | null) {
  return value ? value.slice(0, 10) : '';
}

function toFormState(passenger: QuotePassenger): PassengerFormState {
  return {
    firstName: passenger.firstName || '',
    lastName: passenger.lastName || '',
    gender: passenger.gender || '',
    dateOfBirth: dateInputValue(passenger.dateOfBirth),
    nationality: passenger.nationality || '',
    passportNumber: passenger.passportNumber || '',
    passportExpiry: dateInputValue(passenger.passportExpiry),
    dietaryNotes: passenger.dietaryNotes || '',
    mobilityNotes: passenger.mobilityNotes || '',
    emergencyContact: passenger.emergencyContact || '',
    remarks: passenger.remarks || '',
  };
}

function buildPayload(form: PassengerFormState) {
  return {
    firstName: form.firstName,
    lastName: form.lastName,
    gender: form.gender || null,
    dateOfBirth: form.dateOfBirth || null,
    nationality: form.nationality || null,
    passportNumber: form.passportNumber || null,
    passportExpiry: form.passportExpiry || null,
    dietaryNotes: form.dietaryNotes || null,
    mobilityNotes: form.mobilityNotes || null,
    emergencyContact: form.emergencyContact || null,
    remarks: form.remarks || null,
  };
}

export function QuotePassengersPanel({ apiBaseUrl, quoteId, expectedPax, passengers, canViewPassengerPii }: QuotePassengersPanelProps) {
  const router = useRouter();
  const [localPassengers, setLocalPassengers] = useState(passengers);
  const [editingPassengerId, setEditingPassengerId] = useState<string | null>(null);
  const [form, setForm] = useState<PassengerFormState>(EMPTY_FORM);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const passengerCount = localPassengers.length;

  function updateField(field: keyof PassengerFormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function startEdit(passenger: QuotePassenger) {
    setEditingPassengerId(passenger.id);
    setForm(toFormState(passenger));
    setError('');
    setStatusMessage('');
  }

  function resetForm() {
    setEditingPassengerId(null);
    setForm(EMPTY_FORM);
  }

  async function readMutationResponse(response: Response, fallback: string) {
    if (!response.ok) {
      const apiError = await getApiError(response, fallback);
      throw new Error(apiError.message);
    }
    return response.json().catch(() => null) as Promise<QuotePassenger | null>;
  }

  async function savePassenger() {
    setError('');
    setStatusMessage('');
    setIsSaving(true);
    try {
      const endpoint = editingPassengerId
        ? `${apiBaseUrl}/quotes/${quoteId}/passengers/${editingPassengerId}`
        : `${apiBaseUrl}/quotes/${quoteId}/passengers`;
      const response = await fetch(endpoint, {
        method: editingPassengerId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload(form)),
      });
      const savedPassenger = await readMutationResponse(response, 'Could not save quote passenger.');
      if (savedPassenger) {
        setLocalPassengers((current) => {
          const next = [...current.filter((passenger) => passenger.id !== savedPassenger.id), savedPassenger];
          return next.sort((left, right) => `${left.lastName} ${left.firstName}`.localeCompare(`${right.lastName} ${right.firstName}`));
        });
      }
      setStatusMessage(editingPassengerId ? 'Passenger updated.' : 'Passenger added.');
      resetForm();
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not save quote passenger.');
    } finally {
      setIsSaving(false);
    }
  }

  async function removePassenger(passenger: QuotePassenger) {
    if (!window.confirm(`Remove passenger ${passenger.firstName} ${passenger.lastName}?`)) {
      return;
    }

    setError('');
    setStatusMessage('');
    setIsSaving(true);
    try {
      const response = await fetch(`${apiBaseUrl}/quotes/${quoteId}/passengers/${passenger.id}`, { method: 'DELETE' });
      if (!response.ok) {
        const apiError = await getApiError(response, 'Could not remove quote passenger.');
        throw new Error(apiError.message);
      }
      setLocalPassengers((current) => current.filter((entry) => entry.id !== passenger.id));
      setStatusMessage('Passenger removed.');
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not remove quote passenger.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="workspace-section app-card quote-passengers-panel">
      <div className="workspace-section-head">
        <div>
          <p className="eyebrow">Passengers</p>
          <h2>Quote passenger list</h2>
          <p className="detail-copy">Quote-scoped operational passenger foundation for future rooming, manifests, dispatch, and participant assignment.</p>
        </div>
        <div className="quote-preview-total-list">
          <div>
            <span>Passenger records</span>
            <strong>{passengerCount}</strong>
          </div>
          <div>
            <span>Expected pax</span>
            <strong>{expectedPax}</strong>
          </div>
        </div>
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      {statusMessage ? <p className="form-success">{statusMessage}</p> : null}

      {canViewPassengerPii ? (
      <>
      <div className="form-grid">
        <label>
          First name
          <input value={form.firstName} onChange={(event) => updateField('firstName', event.currentTarget.value)} required />
        </label>
        <label>
          Last name
          <input value={form.lastName} onChange={(event) => updateField('lastName', event.currentTarget.value)} required />
        </label>
        <label>
          Gender
          <input value={form.gender} onChange={(event) => updateField('gender', event.currentTarget.value)} />
        </label>
        <label>
          Date of birth
          <input type="date" value={form.dateOfBirth} onChange={(event) => updateField('dateOfBirth', event.currentTarget.value)} />
        </label>
        <label>
          Nationality
          <input value={form.nationality} onChange={(event) => updateField('nationality', event.currentTarget.value)} />
        </label>
        <label>
          Passport number
          <input value={form.passportNumber} onChange={(event) => updateField('passportNumber', event.currentTarget.value)} />
        </label>
        <label>
          Passport expiry
          <input type="date" value={form.passportExpiry} onChange={(event) => updateField('passportExpiry', event.currentTarget.value)} />
        </label>
        <label>
          Emergency contact
          <input value={form.emergencyContact} onChange={(event) => updateField('emergencyContact', event.currentTarget.value)} />
        </label>
      </div>
      <div className="form-grid">
        <label>
          Dietary notes
          <textarea rows={2} value={form.dietaryNotes} onChange={(event) => updateField('dietaryNotes', event.currentTarget.value)} />
        </label>
        <label>
          Mobility notes
          <textarea rows={2} value={form.mobilityNotes} onChange={(event) => updateField('mobilityNotes', event.currentTarget.value)} />
        </label>
        <label>
          Remarks
          <textarea rows={2} value={form.remarks} onChange={(event) => updateField('remarks', event.currentTarget.value)} />
        </label>
      </div>
      <div className="table-action-row">
        <button type="button" className="primary-button" disabled={isSaving} onClick={savePassenger}>
          {editingPassengerId ? 'Update passenger' : 'Add passenger'}
        </button>
        {editingPassengerId ? (
          <button type="button" className="secondary-button" disabled={isSaving} onClick={resetForm}>
            Cancel edit
          </button>
        ) : null}
      </div>
      </>
      ) : null}

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              {canViewPassengerPii ? (
                <>
                  <th>Nationality</th>
                  <th>Passport</th>
                  <th>Operations notes</th>
                  <th>Controls</th>
                </>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {localPassengers.length === 0 ? (
              <tr>
                <td colSpan={canViewPassengerPii ? 5 : 1}>No quote passengers added yet.</td>
              </tr>
            ) : (
              localPassengers.map((passenger) => (
                <tr key={passenger.id}>
                  <td>
                    <strong>{passenger.firstName} {passenger.lastName}</strong>
                    {canViewPassengerPii ? (
                      <p className="table-cell-copy">{[passenger.gender, dateInputValue(passenger.dateOfBirth)].filter(Boolean).join(' / ') || 'Personal details pending'}</p>
                    ) : null}
                  </td>
                  {canViewPassengerPii ? (
                    <>
                      <td>{passenger.nationality || 'To confirm'}</td>
                      <td>
                        {passenger.passportNumber || 'To confirm'}
                        {passenger.passportExpiry ? <p className="table-cell-copy">Expires {dateInputValue(passenger.passportExpiry)}</p> : null}
                      </td>
                      <td>
                        {[passenger.dietaryNotes, passenger.mobilityNotes, passenger.emergencyContact, passenger.remarks].filter(Boolean).join(' | ') || 'None'}
                      </td>
                      <td>
                        <div className="table-action-group">
                          <button type="button" className="secondary-button" disabled={isSaving} onClick={() => startEdit(passenger)}>
                            Edit
                          </button>
                          <button type="button" className="secondary-button secondary-button-danger" disabled={isSaving} onClick={() => removePassenger(passenger)}>
                            Remove
                          </button>
                        </div>
                      </td>
                    </>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

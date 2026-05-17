'use client';

import type { FormEvent } from 'react';
import { useState } from 'react';
import { getErrorMessage, readJsonResponse } from '../../lib/api';

type AmendmentType =
  | 'add_service'
  | 'remove_service'
  | 'change_hotel_category'
  | 'add_extension'
  | 'add_meal'
  | 'add_transfer'
  | 'add_excursion'
  | 'upgrade_service'
  | 'downgrade_service';

type AmendmentServiceOption = {
  id: string;
  description: string;
  serviceType: string;
  operationType?: string | null;
  status?: string | null;
};

type AmendmentDayOption = {
  id: string;
  dayNumber: number;
  title: string;
  date: string | null;
};

type OperationalAmendmentResponse = {
  bookingId: string;
  amendmentType: AmendmentType;
  affectedServices: string[];
};

const SERVICE_TARGET_TYPES: AmendmentType[] = [
  'remove_service',
  'change_hotel_category',
  'upgrade_service',
  'downgrade_service',
];

const ADDITIVE_TYPES: AmendmentType[] = ['add_service', 'add_meal', 'add_transfer', 'add_excursion', 'add_extension'];

function requiresTargetService(amendmentType: AmendmentType) {
  return SERVICE_TARGET_TYPES.includes(amendmentType);
}

function defaultServiceTypeFor(amendmentType: AmendmentType) {
  if (amendmentType === 'add_meal') return 'DINING';
  if (amendmentType === 'add_transfer') return 'TRANSPORT';
  if (amendmentType === 'add_excursion') return 'ACTIVITY';
  if (amendmentType === 'change_hotel_category') return 'HOTEL';
  return 'SERVICE';
}

export function AmendBookingButton({
  bookingId,
  disabled = false,
  services = [],
  days = [],
}: {
  bookingId: string;
  disabled?: boolean;
  services?: AmendmentServiceOption[];
  days?: AmendmentDayOption[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [amendmentType, setAmendmentType] = useState<AmendmentType>('add_service');
  const [serviceId, setServiceId] = useState('');
  const [bookingDayId, setBookingDayId] = useState('');
  const [description, setDescription] = useState('');
  const [serviceDate, setServiceDate] = useState('');
  const [participantCount, setParticipantCount] = useState('');
  const [confirmProtected, setConfirmProtected] = useState(false);
  const [roomingImpacted, setRoomingImpacted] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (requiresTargetService(amendmentType) && !serviceId) {
      setError('Select the affected service before submitting this amendment.');
      return;
    }

    setIsSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const payload = {
        amendmentType,
        serviceId: serviceId || null,
        bookingDayId: bookingDayId || null,
        serviceType: defaultServiceTypeFor(amendmentType),
        description: description || null,
        serviceDate: serviceDate || null,
        participantCount: participantCount ? Number(participantCount) : null,
        confirmProtected,
        roomingImpacted,
      };

      const response = await fetch(`/api/bookings/${bookingId}/operational-amendments`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not apply booking amendment.'));
      }

      const amendment = await readJsonResponse<OperationalAmendmentResponse>(response, 'Could not apply booking amendment.');
      setSuccess(`Amendment recorded. Affected services: ${amendment.affectedServices.length || 0}.`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not apply booking amendment.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div>
      <button type="button" className="secondary-button" onClick={() => setIsOpen((value) => !value)} disabled={disabled || isSubmitting}>
        Amend Booking
      </button>
      {isOpen ? (
        <form className="inline-edit-panel amendment-workflow-panel" onSubmit={handleSubmit}>
          <label>
            Amendment action
            <select
              value={amendmentType}
              onChange={(event) => {
                const nextType = event.target.value as AmendmentType;
                setAmendmentType(nextType);
                if (ADDITIVE_TYPES.includes(nextType)) {
                  setServiceId('');
                }
              }}
            >
              <option value="add_service">Add operational service</option>
              <option value="remove_service">Remove operational service</option>
              <option value="change_hotel_category">Change hotel category</option>
              <option value="add_extension">Add extension</option>
              <option value="add_meal">Add meal</option>
              <option value="add_transfer">Add transfer</option>
              <option value="add_excursion">Add excursion</option>
              <option value="upgrade_service">Upgrade service</option>
              <option value="downgrade_service">Downgrade service</option>
            </select>
          </label>
          {requiresTargetService(amendmentType) ? (
            <label>
              Affected service
              <select value={serviceId} onChange={(event) => setServiceId(event.target.value)} required>
                <option value="">Select service</option>
                {services
                  .filter((service) => service.status !== 'cancelled')
                  .map((service) => (
                    <option key={service.id} value={service.id}>
                      {(service.operationType || service.serviceType || 'SERVICE')} - {service.description}
                    </option>
                  ))}
              </select>
            </label>
          ) : null}
          {ADDITIVE_TYPES.includes(amendmentType) ? (
            <>
              <label>
                Service day
                <select value={bookingDayId} onChange={(event) => setBookingDayId(event.target.value)}>
                  <option value="">Use booking start date</option>
                  {days.map((day) => (
                    <option key={day.id} value={day.id}>
                      Day {day.dayNumber} - {day.title || day.date || 'Program day'}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Service date
                <input type="date" value={serviceDate} onChange={(event) => setServiceDate(event.target.value)} />
              </label>
              <label>
                Pax
                <input type="number" min="0" value={participantCount} onChange={(event) => setParticipantCount(event.target.value)} />
              </label>
            </>
          ) : null}
          <label>
            Operational note
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Describe the requested amendment" rows={3} />
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={roomingImpacted} onChange={(event) => setRoomingImpacted(event.target.checked)} />
            Rooming is impacted
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={confirmProtected} onChange={(event) => setConfirmProtected(event.target.checked)} />
            Confirm protected supplier, rooming, guide, or restaurant impact
          </label>
          <div className="quote-status-actions">
            <button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Submitting...' : 'Submit amendment'}
            </button>
            <button type="button" className="secondary-button" onClick={() => setIsOpen(false)} disabled={isSubmitting}>
              Close
            </button>
          </div>
        </form>
      ) : null}
      {success ? <p className="form-helper">{success}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
    </div>
  );
}

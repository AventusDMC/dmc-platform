'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getErrorMessage } from '../../lib/api';
import type { QuotePassenger } from './QuotePassengersPanel';
import type { QuoteItineraryResponse } from './QuoteItineraryTab';

type RoomOccupancy = 'single' | 'double' | 'triple' | 'quad' | 'unknown';

type QuoteRoomingAssignment = {
  id: string;
  quotePassengerId: string;
  quotePassenger: QuotePassenger;
};

export type QuoteRoomingGroup = {
  id: string;
  quoteId: string;
  itineraryDayId: string;
  hotelQuoteItemId: string;
  roomType: string | null;
  occupancyType: RoomOccupancy;
  notes: string | null;
  temporaryRoomLabel: string | null;
  guideRoom: boolean;
  leaderRoom: boolean;
  sortOrder: number;
  assignments: QuoteRoomingAssignment[];
  itineraryDay?: {
    id: string;
    dayNumber: number;
    title: string;
  } | null;
  hotelQuoteItem?: {
    id: string;
    pricingDescription: string | null;
    occupancyType: string | null;
    roomCount: number | null;
    hotel?: { id: string; name: string } | null;
    contract?: { id: string; name: string } | null;
    roomCategory?: { id: string; name: string } | null;
  } | null;
};

type QuoteRoomingPanelProps = {
  apiBaseUrl: string;
  quoteId: string;
  passengers: QuotePassenger[];
  itinerary: QuoteItineraryResponse;
  roomingGroups: QuoteRoomingGroup[];
};

type RoomingHotelOption = {
  dayId: string;
  dayLabel: string;
  hotelQuoteItemId: string;
  label: string;
};

const OCCUPANCY_OPTIONS: Array<{ value: RoomOccupancy; label: string }> = [
  { value: 'single', label: 'Single' },
  { value: 'double', label: 'Double' },
  { value: 'triple', label: 'Triple' },
  { value: 'quad', label: 'Quad' },
  { value: 'unknown', label: 'Unknown' },
];

function getPassengerName(passenger: QuotePassenger) {
  return [passenger.firstName, passenger.lastName].filter(Boolean).join(' ') || 'Unnamed passenger';
}

function getOccupancyCapacity(occupancy: RoomOccupancy) {
  if (occupancy === 'single') return 1;
  if (occupancy === 'double') return 2;
  if (occupancy === 'triple') return 3;
  if (occupancy === 'quad') return 4;
  return null;
}

function formatOccupancyCount(group: QuoteRoomingGroup) {
  const assigned = group.assignments.length;
  const capacity = getOccupancyCapacity(group.occupancyType);
  return capacity === null ? `${assigned} assigned` : `${assigned}/${capacity}`;
}

function buildHotelOptions(itinerary: QuoteItineraryResponse): RoomingHotelOption[] {
  return itinerary.days.flatMap((day) =>
    day.dayItems
      .filter((item) => item.isActive && item.quoteService?.hotel)
      .map((item) => ({
        dayId: day.id,
        dayLabel: `Day ${day.dayNumber} | ${day.title}`,
        hotelQuoteItemId: item.quoteServiceId,
        label: [
          `Day ${day.dayNumber}`,
          item.quoteService?.hotel?.name,
          item.quoteService?.roomCategory?.name,
          item.quoteService?.pricingDescription,
        ]
          .filter(Boolean)
          .join(' | '),
      })),
  );
}

function getGroupHotelLabel(group: QuoteRoomingGroup) {
  return [
    group.itineraryDay ? `Day ${group.itineraryDay.dayNumber}` : null,
    group.hotelQuoteItem?.hotel?.name,
    group.hotelQuoteItem?.roomCategory?.name,
    group.hotelQuoteItem?.pricingDescription,
  ]
    .filter(Boolean)
    .join(' | ') || 'Hotel stay';
}

export function QuoteRoomingPanel({ apiBaseUrl, quoteId, passengers, itinerary, roomingGroups }: QuoteRoomingPanelProps) {
  const router = useRouter();
  const hotelOptions = useMemo(() => buildHotelOptions(itinerary), [itinerary]);
  const [selectedHotelKey, setSelectedHotelKey] = useState(() => hotelOptions[0] ? `${hotelOptions[0].dayId}|${hotelOptions[0].hotelQuoteItemId}` : '');
  const [roomType, setRoomType] = useState('');
  const [occupancyType, setOccupancyType] = useState<RoomOccupancy>('double');
  const [temporaryRoomLabel, setTemporaryRoomLabel] = useState('');
  const [notes, setNotes] = useState('');
  const [guideRoom, setGuideRoom] = useState(false);
  const [leaderRoom, setLeaderRoom] = useState(false);
  const [assignmentDrafts, setAssignmentDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const selectedHotelOption = hotelOptions.find((option) => `${option.dayId}|${option.hotelQuoteItemId}` === selectedHotelKey) || hotelOptions[0] || null;

  async function createRoomingGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedHotelOption) {
      setError('Assign a hotel stay to an itinerary day before creating rooming groups.');
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/quotes/${quoteId}/rooming`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itineraryDayId: selectedHotelOption.dayId,
          hotelQuoteItemId: selectedHotelOption.hotelQuoteItemId,
          roomType,
          occupancyType,
          temporaryRoomLabel,
          notes,
          guideRoom,
          leaderRoom,
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not create room group.'));
      }

      setRoomType('');
      setTemporaryRoomLabel('');
      setNotes('');
      setGuideRoom(false);
      setLeaderRoom(false);
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not create room group.');
    } finally {
      setIsSaving(false);
    }
  }

  async function assignPassenger(group: QuoteRoomingGroup) {
    const quotePassengerId = assignmentDrafts[group.id];
    if (!quotePassengerId) {
      return;
    }

    setError('');
    const response = await fetch(`${apiBaseUrl}/quotes/${quoteId}/rooming/${group.id}/assignments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quotePassengerId }),
    });

    if (!response.ok) {
      setError(await getErrorMessage(response, 'Could not assign passenger.'));
      return;
    }

    setAssignmentDrafts((current) => ({ ...current, [group.id]: '' }));
    router.refresh();
  }

  async function removePassenger(group: QuoteRoomingGroup, quotePassengerId: string) {
    setError('');
    const response = await fetch(`${apiBaseUrl}/quotes/${quoteId}/rooming/${group.id}/assignments/${quotePassengerId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      setError(await getErrorMessage(response, 'Could not remove passenger from room.'));
      return;
    }

    router.refresh();
  }

  async function deleteRoomingGroup(group: QuoteRoomingGroup) {
    setError('');
    const response = await fetch(`${apiBaseUrl}/quotes/${quoteId}/rooming/${group.id}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      setError(await getErrorMessage(response, 'Could not delete room group.'));
      return;
    }

    router.refresh();
  }

  function getUnassignedPassengers(group: QuoteRoomingGroup) {
    const assignedPassengerIds = new Set(
      roomingGroups
        .filter((candidate) => candidate.itineraryDayId === group.itineraryDayId && candidate.hotelQuoteItemId === group.hotelQuoteItemId)
        .flatMap((candidate) => candidate.assignments.map((assignment) => assignment.quotePassengerId)),
    );

    return passengers.filter((passenger) => !assignedPassengerIds.has(passenger.id));
  }

  const totalAssigned = roomingGroups.reduce((sum, group) => sum + group.assignments.length, 0);

  return (
    <section className="workspace-section app-card quote-rooming-panel">
      <div className="workspace-section-head">
        <div>
          <p className="eyebrow">Rooming foundation</p>
          <h2>Operational room groups</h2>
          <p className="detail-copy">Manual rooming by itinerary day and hotel stay. Pricing, supplements, manifests, rooming lists, and vouchers remain separate workflows.</p>
        </div>
        <div className="quote-passenger-summary">
          <strong>{roomingGroups.length} rooms</strong>
          <span>{totalAssigned}/{passengers.length} passengers assigned</span>
        </div>
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      <form className="entity-form compact-form" onSubmit={createRoomingGroup}>
        <div className="form-row">
          <label>
            Hotel stay
            <select value={selectedHotelKey} onChange={(event) => setSelectedHotelKey(event.target.value)} disabled={hotelOptions.length === 0} required>
              {hotelOptions.length === 0 ? <option value="">No hotel stays assigned to itinerary days</option> : null}
              {hotelOptions.map((option) => (
                <option key={`${option.dayId}|${option.hotelQuoteItemId}`} value={`${option.dayId}|${option.hotelQuoteItemId}`}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Room type
            <input value={roomType} onChange={(event) => setRoomType(event.target.value)} placeholder="Standard, Deluxe, Suite" />
          </label>
          <label>
            Occupancy
            <select value={occupancyType} onChange={(event) => setOccupancyType(event.target.value as RoomOccupancy)}>
              {OCCUPANCY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Room label
            <input value={temporaryRoomLabel} onChange={(event) => setTemporaryRoomLabel(event.target.value)} placeholder="TMP-101" />
          </label>
        </div>
        <div className="form-row">
          <label className="checkbox-label">
            <input type="checkbox" checked={guideRoom} onChange={(event) => setGuideRoom(event.target.checked)} />
            Guide room
          </label>
          <label className="checkbox-label">
            <input type="checkbox" checked={leaderRoom} onChange={(event) => setLeaderRoom(event.target.checked)} />
            Leader room
          </label>
          <label>
            Notes
            <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Manual rooming note" />
          </label>
        </div>
        <button type="submit" disabled={isSaving || !selectedHotelOption}>
          {isSaving ? 'Creating...' : 'Create room group'}
        </button>
      </form>

      {roomingGroups.length === 0 ? <p className="empty-state">No room groups yet.</p> : null}

      <div className="quote-rooming-grid">
        {roomingGroups.map((group) => {
          const unassignedPassengers = getUnassignedPassengers(group);

          return (
            <article key={group.id} className="quote-rooming-group">
              <div className="workspace-section-head">
                <div>
                  <p className="eyebrow">{getGroupHotelLabel(group)}</p>
                  <h3>{group.temporaryRoomLabel || group.roomType || 'Room group'}</h3>
                  <p className="detail-copy">
                    {OCCUPANCY_OPTIONS.find((option) => option.value === group.occupancyType)?.label || 'Unknown'} | Occupancy {formatOccupancyCount(group)}
                    {group.guideRoom ? ' | Guide room' : ''}
                    {group.leaderRoom ? ' | Leader room' : ''}
                  </p>
                </div>
                <button type="button" className="compact-button compact-button-danger" onClick={() => deleteRoomingGroup(group)}>
                  Delete
                </button>
              </div>

              {group.notes ? <p className="table-subcopy">{group.notes}</p> : null}

              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Passenger</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.assignments.length === 0 ? (
                      <tr>
                        <td colSpan={2}>No passengers assigned.</td>
                      </tr>
                    ) : (
                      group.assignments.map((assignment) => (
                        <tr key={assignment.id}>
                          <td>{getPassengerName(assignment.quotePassenger)}</td>
                          <td>
                            <button type="button" className="compact-button" onClick={() => removePassenger(group, assignment.quotePassengerId)}>
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="form-row">
                <label>
                  Unassigned passengers
                  <select
                    value={assignmentDrafts[group.id] || ''}
                    onChange={(event) => setAssignmentDrafts((current) => ({ ...current, [group.id]: event.target.value }))}
                  >
                    <option value="">Select passenger</option>
                    {unassignedPassengers.map((passenger) => (
                      <option key={passenger.id} value={passenger.id}>
                        {getPassengerName(passenger)}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" className="secondary-button" onClick={() => assignPassenger(group)} disabled={!assignmentDrafts[group.id]}>
                  Assign passenger
                </button>
              </div>
              <p className="table-subcopy">Unassigned for this hotel stay: {unassignedPassengers.length}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

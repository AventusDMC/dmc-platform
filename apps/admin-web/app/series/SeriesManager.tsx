'use client';

import { FormEvent, Fragment, useState } from 'react';

type Series = {
  id: string;
  seriesCode: string;
  seriesName: string;
  active: boolean;
  recurringSchedule: string | null;
  destinationCountry: string | null;
  operationalNotes: string | null;
  departures?: Array<{
    id: string;
    departureCode: string | null;
    departureDate: string | null;
    paxCount: number;
    totalCapacity?: number | null;
    guaranteedMinimumPax?: number | null;
    sharedCoachCapacity?: number | null;
    lowOccupancyThreshold?: number | null;
    booking?: {
      id: string;
      bookingRef: string;
      status: string;
      roomingEntries?: Array<{ id: string }>;
      vouchers?: Array<{ id: string; status: string }>;
      services?: Array<{ id: string; operationStatus: string; supplierConfirmationStatus: string }>;
    };
  }>;
};

type SeriesDeparture = NonNullable<Series['departures']>[number];

async function readActionError(response: Response, fallback: string) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const body = await response.json().catch(() => null);
    const message = body?.message;
    if (typeof message === 'string' && message.trim()) return message;
    if (Array.isArray(message) && message.length) return message.join(', ');
    if (typeof body?.error === 'string' && body.error.trim()) return body.error;
  }

  const text = await response.text().catch(() => '');
  return text.trim() || fallback;
}

function getDepartureLabel(departure: SeriesDeparture) {
  return departure.departureCode || departure.booking?.bookingRef || departure.id;
}

export function SeriesManager({ initialSeries }: { initialSeries: Series[] }) {
  const [series, setSeries] = useState(initialSeries);
  const [error, setError] = useState('');
  const [busyAction, setBusyAction] = useState('');

  async function refreshSeries() {
    const response = await fetch('/api/series', { cache: 'no-store' });
    if (response.ok) {
      setSeries(await response.json());
    }
  }

  async function createSeries(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const form = event.currentTarget;
    const formData = new FormData(form);
    const response = await fetch('/api/series', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        seriesCode: String(formData.get('seriesCode') || ''),
        seriesName: String(formData.get('seriesName') || ''),
        active: formData.has('active'),
        recurringSchedule: String(formData.get('recurringSchedule') || ''),
        destinationCountry: String(formData.get('destinationCountry') || ''),
        operationalNotes: String(formData.get('operationalNotes') || ''),
      }),
    });
    if (!response.ok) {
      setError('Series could not be saved.');
      return;
    }
    const created = await response.json();
    setSeries((current) => [created, ...current]);
    form.reset();
  }

  async function addDeparture(event: FormEvent<HTMLFormElement>, seriesId: string) {
    event.preventDefault();
    setError('');
    setBusyAction(`add-${seriesId}`);
    const form = event.currentTarget;
    const formData = new FormData(form);
    const response = await fetch(`/api/series/${seriesId}/departures`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bookingId: String(formData.get('bookingId') || ''),
        departureCode: String(formData.get('departureCode') || ''),
        departureDate: String(formData.get('departureDate') || ''),
        paxCount: String(formData.get('paxCount') || ''),
        lowOccupancyThreshold: String(formData.get('lowOccupancyThreshold') || ''),
        totalCapacity: String(formData.get('totalCapacity') || ''),
        guaranteedMinimumPax: String(formData.get('guaranteedMinimumPax') || ''),
        sharedCoachCapacity: String(formData.get('sharedCoachCapacity') || ''),
        operationalNotes: String(formData.get('operationalNotes') || ''),
      }),
    });
    setBusyAction('');
    if (!response.ok) {
      setError(await readActionError(response, 'Departure could not be created. Check the booking ID and try again.'));
      return;
    }
    form.reset();
    await refreshSeries();
  }

  async function cloneDeparture(event: FormEvent<HTMLFormElement>, seriesId: string) {
    event.preventDefault();
    setError('');
    const form = event.currentTarget;
    const formData = new FormData(form);
    const departureId = String(formData.get('departureId') || '');
    if (!departureId) {
      setError('Select a departure to clone.');
      return;
    }
    setBusyAction(`clone-${seriesId}`);
    const response = await fetch(`/api/series/${seriesId}/departures/${departureId}/clone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        departureCode: String(formData.get('cloneDepartureCode') || ''),
        departureDate: String(formData.get('cloneDepartureDate') || ''),
        paxCount: String(formData.get('clonePaxCount') || ''),
        lowOccupancyThreshold: String(formData.get('cloneLowOccupancyThreshold') || ''),
        totalCapacity: String(formData.get('cloneTotalCapacity') || ''),
        guaranteedMinimumPax: String(formData.get('cloneGuaranteedMinimumPax') || ''),
        sharedCoachCapacity: String(formData.get('cloneSharedCoachCapacity') || ''),
        operationalNotes: String(formData.get('cloneOperationalNotes') || ''),
        cloneRooming: formData.has('cloneRooming'),
      }),
    });
    setBusyAction('');
    if (!response.ok) {
      setError(await readActionError(response, 'Departure could not be cloned.'));
      return;
    }
    form.reset();
    await refreshSeries();
  }

  function getDepartureCounts(departure: SeriesDeparture) {
    const vouchersPending = (departure.booking?.vouchers || []).filter((voucher) => voucher.status !== 'ISSUED' && voucher.status !== 'CANCELLED').length;
    const confirmationsPending = (departure.booking?.services || []).filter((service) => service.supplierConfirmationStatus !== 'CONFIRMED').length;
    const seatsSold = departure.paxCount || 0;
    const totalCapacity = departure.totalCapacity || 0;
    const seatsRemaining = totalCapacity > 0 ? Math.max(totalCapacity - seatsSold, 0) : 0;
    return {
      pax: seatsSold,
      totalCapacity,
      seatsRemaining,
      rooming: departure.booking?.roomingEntries?.length || 0,
      vouchersPending,
      confirmationsPending,
    };
  }

  return (
    <div className="section-stack">
      {error ? <p className="form-error">{error}</p> : null}
      <form className="entity-form" onSubmit={createSeries}>
        <label>
          Series code
          <input name="seriesCode" required />
        </label>
        <label>
          Series name
          <input name="seriesName" required />
        </label>
        <label>
          Recurring schedule
          <input name="recurringSchedule" placeholder="Weekly Saturdays / monthly" />
        </label>
        <label>
          Destination/country
          <input name="destinationCountry" />
        </label>
        <label className="checkbox-field">
          <input name="active" type="checkbox" defaultChecked /> Active
        </label>
        <label>
          Operational notes
          <textarea name="operationalNotes" rows={3} />
        </label>
        <button type="submit">Create series</button>
      </form>

      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Series</th>
              <th>Schedule</th>
              <th>Departures</th>
              <th>Operations</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {series.map((item) => {
              const departures = item.departures || [];
              const unreconfirmed = departures.filter((departure) =>
                (departure.booking?.services || []).some((service) => service.supplierConfirmationStatus !== 'CONFIRMED'),
              ).length;
              const voucherPending = departures.filter((departure) => (departure.booking?.vouchers || []).some((voucher) => voucher.status !== 'ISSUED')).length;

              return (
                <Fragment key={item.id}>
                  <tr key={item.id} id={`series-${item.id}`}>
                    <td>
                      <strong>{item.seriesCode}</strong>
                      <p className="table-subcopy">{item.seriesName}</p>
                      <p className="table-subcopy">{item.destinationCountry || 'Destination pending'}</p>
                    </td>
                    <td>{item.recurringSchedule || 'Not set'}</td>
                    <td>{departures.length}</td>
                    <td>
                      <p className="table-subcopy">{unreconfirmed} unreconfirmed</p>
                      <p className="table-subcopy">{voucherPending} voucher pending</p>
                    </td>
                    <td>
                      <p>{item.active ? 'Active' : 'Inactive'}</p>
                      <div className="quote-status-actions">
                        <a className="secondary-button" href={`#series-${item.id}`}>
                          Open Series
                        </a>
                        <button className="secondary-button" type="submit" form={`add-departure-${item.id}`} disabled={busyAction === `add-${item.id}`}>
                          Add Departure
                        </button>
                        <button className="secondary-button" type="submit" form={`clone-departure-${item.id}`} disabled={!departures.length || busyAction === `clone-${item.id}`}>
                          Clone Departure
                        </button>
                      </div>
                    </td>
                  </tr>
                  <tr key={`${item.id}-departures`}>
                    <td colSpan={5}>
                      <div className="section-stack">
                        <div>
                          <strong>Upcoming departures</strong>
                          {departures.length ? (
                            <div className="table-card">
                              <table>
                                <thead>
                                  <tr>
                                    <th>Departure</th>
                                    <th>Operational counts</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {departures.map((departure) => {
                                    const counts = getDepartureCounts(departure);
                                    return (
                                      <tr key={departure.id}>
                                        <td>
                                          <strong>{departure.departureCode || departure.booking?.bookingRef || 'Departure'}</strong>
                                          <p className="table-subcopy">{departure.departureDate ? new Date(departure.departureDate).toLocaleDateString() : 'Date pending'}</p>
                                          <p className="table-subcopy">{departure.booking?.bookingRef || 'Booking pending'}</p>
                                        </td>
                                        <td>
                                          <p className="table-subcopy">Pax: {counts.pax}</p>
                                          <p className="table-subcopy">Seats remaining: {counts.totalCapacity ? counts.seatsRemaining : 'Capacity pending'}</p>
                                          <p className="table-subcopy">Total capacity: {counts.totalCapacity || 'Not set'}</p>
                                          <p className="table-subcopy">Guaranteed minimum: {departure.guaranteedMinimumPax || 'Not set'}</p>
                                          <p className="table-subcopy">Rooming: {counts.rooming}</p>
                                          <p className="table-subcopy">Vouchers pending: {counts.vouchersPending}</p>
                                          <p className="table-subcopy">Confirmations pending: {counts.confirmationsPending}</p>
                                        </td>
                                        <td>{departure.booking?.status || 'Planned'}</td>
                                        <td>
                                          {departure.booking?.id ? (
                                            <a className="secondary-button" href={`/bookings/${departure.booking.id}`}>
                                              Open Departure
                                            </a>
                                          ) : null}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <p className="table-subcopy">No departure instances yet.</p>
                          )}
                        </div>

                        <form id={`add-departure-${item.id}`} className="operations-inline-form" onSubmit={(event) => addDeparture(event, item.id)}>
                          <input name="bookingId" placeholder="Existing booking ID" required />
                          <input name="departureCode" placeholder="Departure code" />
                          <input name="departureDate" type="date" />
                          <input name="paxCount" type="number" min="0" placeholder="Pax" />
                          <input name="lowOccupancyThreshold" type="number" min="0" placeholder="Low occupancy threshold" />
                          <input name="totalCapacity" type="number" min="0" placeholder="Total capacity" />
                          <input name="guaranteedMinimumPax" type="number" min="0" placeholder="Guaranteed minimum pax" />
                          <input name="sharedCoachCapacity" type="number" min="0" placeholder="Shared coach capacity" />
                          <input name="operationalNotes" placeholder="Operational notes" />
                          <div className="quote-status-actions series-departure-actions">
                            <button className="secondary-button" type="submit" disabled={busyAction === `add-${item.id}`}>
                              Create Departure
                            </button>
                          </div>
                        </form>

                        <form id={`clone-departure-${item.id}`} className="operations-inline-form" onSubmit={(event) => cloneDeparture(event, item.id)}>
                          <select name="departureId" defaultValue="">
                            <option value="" disabled>
                              Select departure to clone
                            </option>
                            {departures.map((departure) => (
                              <option key={departure.id} value={departure.id} data-departure-code={departure.departureCode || ''}>
                                {getDepartureLabel(departure)}
                              </option>
                            ))}
                          </select>
                          <p className="table-subcopy">Departure code is shown for operations; clone submits the source departure ID.</p>
                          <input name="cloneDepartureCode" placeholder="New departure code" />
                          <input name="cloneDepartureDate" type="date" />
                          <input name="clonePaxCount" type="number" min="0" placeholder="Pax" />
                          <input name="cloneLowOccupancyThreshold" type="number" min="0" placeholder="Low occupancy threshold" />
                          <input name="cloneTotalCapacity" type="number" min="0" placeholder="Total capacity" />
                          <input name="cloneGuaranteedMinimumPax" type="number" min="0" placeholder="Guaranteed minimum pax" />
                          <input name="cloneSharedCoachCapacity" type="number" min="0" placeholder="Shared coach capacity" />
                          <input name="cloneOperationalNotes" placeholder="Operational notes" />
                          <label className="checkbox-field">
                            <input name="cloneRooming" type="checkbox" /> Clone rooming shell
                          </label>
                          <div className="quote-status-actions series-departure-actions">
                            <button className="secondary-button" type="submit" disabled={!departures.length || busyAction === `clone-${item.id}`}>
                              Execute Clone Departure
                            </button>
                          </div>
                        </form>
                      </div>
                    </td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

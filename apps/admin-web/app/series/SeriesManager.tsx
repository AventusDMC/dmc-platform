'use client';

import { FormEvent, useState } from 'react';

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

export function SeriesManager({ initialSeries }: { initialSeries: Series[] }) {
  const [series, setSeries] = useState(initialSeries);
  const [error, setError] = useState('');

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
                <tr key={item.id}>
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
                  <td>{item.active ? 'Active' : 'Inactive'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

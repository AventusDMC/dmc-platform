'use client';

import { useEffect, useState } from 'react';

type SingleSupplement = {
  currency: string;
  singleRoomCount: number;
  perRoomSupplement: number;
  total: number;
  perHotel: Array<{ hotelName: string; nights: number; singleRoomRate: number; sharingPerPerson: number; perRoomSupplement: number }>;
  warnings: string[];
};

export function BookingSingleSupplementCard({ bookingId }: { bookingId: string }) {
  const [data, setData] = useState<SingleSupplement | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let active = true;
    fetch(`/api/bookings/${bookingId}/single-supplement`, { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('failed'))))
      .then((json) => {
        if (active) {
          setData(json);
          setState('ready');
        }
      })
      .catch(() => {
        if (active) setState('error');
      });
    return () => {
      active = false;
    };
  }, [bookingId]);

  const fmt = (value: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: data?.currency || 'USD', maximumFractionDigits: 2 }).format(value);

  return (
    <section className="detail-card" data-testid="booking-single-supplement">
      <p className="eyebrow">Single supplement</p>
      {state === 'loading' ? <p className="detail-copy">Calculating from hotel contracts…</p> : null}
      {state === 'error' ? <p className="detail-copy">Single supplement unavailable right now.</p> : null}
      {state === 'ready' && data ? (
        data.singleRoomCount === 0 ? (
          <p className="detail-copy">No single rooms in the rooming plan — no single supplement.</p>
        ) : (
          <>
            <div className="quote-preview-total-list">
              <div>
                <span>Single rooms</span>
                <strong>{data.singleRoomCount}</strong>
              </div>
              <div>
                <span>Supplement / room</span>
                <strong>{fmt(data.perRoomSupplement)}</strong>
              </div>
              <div>
                <span>Total single supplement</span>
                <strong>{fmt(data.total)}</strong>
              </div>
            </div>
            <p className="detail-copy">
              Single-room rate minus the per-person sharing rate, derived from the hotel contracts (read-only — quote pricing is unchanged).
            </p>
            {data.perHotel.length > 0 ? (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Hotel</th>
                      <th className="money-cell">Nights</th>
                      <th className="money-cell">Single</th>
                      <th className="money-cell">Sharing pp</th>
                      <th className="money-cell">Supp / room</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.perHotel.map((hotel, index) => (
                      <tr key={`${hotel.hotelName}-${index}`}>
                        <td>{hotel.hotelName}</td>
                        <td className="money-cell">{hotel.nights}</td>
                        <td className="money-cell">{fmt(hotel.singleRoomRate)}</td>
                        <td className="money-cell">{fmt(hotel.sharingPerPerson)}</td>
                        <td className="money-cell">{fmt(hotel.perRoomSupplement)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            {data.warnings?.length ? <p className="form-error">{data.warnings.join(' ')}</p> : null}
          </>
        )
      ) : null}
    </section>
  );
}

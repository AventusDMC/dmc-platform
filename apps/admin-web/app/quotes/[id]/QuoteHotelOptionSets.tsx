'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type Hotel = {
  id: string;
  name: string;
  city: string;
  category: string;
  roomCategories?: Array<{
    id: string;
    name: string;
    code: string | null;
    isActive: boolean;
  }>;
  factSheet?: HotelFactSheet | null;
};

type HotelFactSheet = {
  shortDescription?: string | null;
  highlightsJson?: unknown;
  amenitiesJson?: unknown;
  checkInTime?: string | null;
  checkOutTime?: string | null;
};

type QuoteHotelOption = {
  id: string;
  quoteOptionId: string;
  city: string;
  hotelId?: string | null;
  roomCategoryId?: string | null;
  hotelNameSnapshot: string;
  roomType: string;
  mealPlan: string;
  mealPlanCode?: 'RO' | 'BB' | 'HB' | 'FB' | 'AI' | null;
  nights: number;
  isPrimary: boolean;
  notes?: string | null;
  roomCategory?: {
    id: string;
    name: string;
    code: string | null;
  } | null;
};

type QuoteOptionSet = {
  id: string;
  kind?: 'HOTEL_OPTION_SET' | 'COMMERCIAL_OPTION';
  name: string;
  notes: string | null;
  pricingMode: 'itemized' | 'package';
  hotelOptions?: QuoteHotelOption[];
};

type QuoteHotelOptionSetsProps = {
  apiBaseUrl: string;
  quoteId: string;
  quoteOptions: QuoteOptionSet[];
  hotels: Hotel[];
};

const HOTEL_OPTION_SET_CATEGORIES = ['3 Star', '4 Star STD', '4 Star DLX', 'Custom'];
const MEAL_PLAN_OPTIONS = ['RO', 'BB', 'HB', 'FB', 'AI'] as const;
type MealPlanCode = (typeof MEAL_PLAN_OPTIONS)[number];

function listFactSheetValues(value: unknown) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || '').trim()).filter(Boolean);
  }

  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).map((entry) => String(entry || '').trim()).filter(Boolean);
  }

  return String(value)
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

async function readError(response: Response, fallback: string) {
  const payload = await response.json().catch(() => null);
  return payload?.message || fallback;
}

function HotelFactSheetSummary({ hotel }: { hotel: Hotel }) {
  const factSheet = hotel.factSheet;
  const highlights = listFactSheetValues(factSheet?.highlightsJson);
  const amenities = listFactSheetValues(factSheet?.amenitiesJson);
  const hasFactSheet =
    Boolean(factSheet?.shortDescription) ||
    highlights.length > 0 ||
    amenities.length > 0 ||
    Boolean(factSheet?.checkInTime || factSheet?.checkOutTime);

  if (!hasFactSheet) {
    return (
      <div className="detail-card">
        <p className="eyebrow">Selected hotel</p>
        <h4>{hotel.name}</h4>
        <p className="detail-copy">No fact sheet details saved yet.</p>
      </div>
    );
  }

  return (
    <div className="detail-card">
      <div className="workspace-section-head">
        <div>
          <p className="eyebrow">Selected hotel fact sheet</p>
          <h4>{hotel.name}</h4>
          {factSheet?.shortDescription ? <p className="detail-copy">{factSheet.shortDescription}</p> : null}
        </div>
        {factSheet?.checkInTime || factSheet?.checkOutTime ? (
          <p className="status-pill">
            {factSheet.checkInTime ? `In ${factSheet.checkInTime}` : 'Check-in pending'}
            {' / '}
            {factSheet.checkOutTime ? `Out ${factSheet.checkOutTime}` : 'Check-out pending'}
          </p>
        ) : null}
      </div>
      <div className="form-row form-row-2">
        <div>
          <p className="eyebrow">Highlights</p>
          {highlights.length > 0 ? (
            <ul className="compact-list">
              {highlights.slice(0, 4).map((highlight) => (
                <li key={highlight}>{highlight}</li>
              ))}
            </ul>
          ) : (
            <p className="detail-copy">No highlights saved.</p>
          )}
        </div>
        <div>
          <p className="eyebrow">Amenities</p>
          {amenities.length > 0 ? (
            <ul className="compact-list">
              {amenities.slice(0, 6).map((amenity) => (
                <li key={amenity}>{amenity}</li>
              ))}
            </ul>
          ) : (
            <p className="detail-copy">No amenities saved.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function QuoteHotelOptionSets({ apiBaseUrl, quoteId, quoteOptions, hotels }: QuoteHotelOptionSetsProps) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [setForm, setSetForm] = useState({ category: '4 Star STD', name: '4 Star STD', notes: '' });
  const sortedOptions = useMemo(
    () => quoteOptions.filter((option) => option.kind === 'HOTEL_OPTION_SET').sort((left, right) => left.name.localeCompare(right.name)),
    [quoteOptions],
  );

  async function createOptionSet() {
    setError('');
    try {
      const response = await fetch(`${apiBaseUrl}/quotes/${quoteId}/options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: setForm.category === 'Custom' ? setForm.name : setForm.category,
          kind: 'HOTEL_OPTION_SET',
          notes: setForm.notes,
          pricingMode: 'itemized',
        }),
      });

      if (!response.ok) {
        throw new Error(await readError(response, 'Could not add hotel option set.'));
      }

      setSetForm({ category: '4 Star STD', name: '4 Star STD', notes: '' });
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not add hotel option set.');
    }
  }

  return (
    <section className="workspace-section app-card">
      <div className="workspace-section-head">
        <div>
          <p className="eyebrow">Hotel Option Sets</p>
          <h2>Build package hotel options</h2>
          <p className="detail-copy">Create 3 Star, 4 Star STD, 4 Star DLX, or custom sets, then add city-level hotel alternatives. This stores structure only; pricing remains manual.</p>
        </div>
      </div>
      {error ? <p className="form-error">{error}</p> : null}
      <div className="form-row form-row-3">
        <label>
          Option set
          <select value={setForm.category} onChange={(event) => setSetForm({ ...setForm, category: event.target.value, name: event.target.value === 'Custom' ? '' : event.target.value })}>
            {HOTEL_OPTION_SET_CATEGORIES.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>
        </label>
        {setForm.category === 'Custom' ? (
          <label>
            Custom name
            <input value={setForm.name} onChange={(event) => setSetForm({ ...setForm, name: event.target.value })} placeholder="Custom option" />
          </label>
        ) : null}
        <label>
          Notes
          <input value={setForm.notes} onChange={(event) => setSetForm({ ...setForm, notes: event.target.value })} placeholder="Client-facing or internal note" />
        </label>
      </div>
      <button className="button" type="button" onClick={createOptionSet}>Add hotel option set</button>
      {sortedOptions.length === 0 ? <p className="empty-state">No hotel option sets yet. Add your first category, then add hotel alternatives by city.</p> : null}
      <div className="section-stack">
        {sortedOptions.map((optionSet) => (
          <HotelOptionSetCard key={optionSet.id} apiBaseUrl={apiBaseUrl} quoteId={quoteId} optionSet={optionSet} hotels={hotels} />
        ))}
      </div>
    </section>
  );
}

function HotelOptionSetCard({
  apiBaseUrl,
  quoteId,
  optionSet,
  hotels,
}: {
  apiBaseUrl: string;
  quoteId: string;
  optionSet: QuoteOptionSet;
  hotels: Hotel[];
}) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    city: '',
    hotelId: '',
    roomCategoryId: '',
    hotelNameSnapshot: '',
    roomType: 'Standard',
    mealPlan: 'BB',
    mealPlanCode: 'BB' as MealPlanCode,
    nights: '1',
    isPrimary: false,
    notes: '',
  });
  const hotelsByCity = useMemo(() => {
    return hotels.reduce<Record<string, Hotel[]>>((groups, hotel) => {
      const city = hotel.city || 'City pending';
      groups[city] = [...(groups[city] || []), hotel];
      return groups;
    }, {});
  }, [hotels]);
  const optionHotelsByCity = useMemo(() => {
    return (optionSet.hotelOptions || []).reduce<Record<string, QuoteHotelOption[]>>((groups, option) => {
      groups[option.city] = [...(groups[option.city] || []), option];
      return groups;
    }, {});
  }, [optionSet.hotelOptions]);
  const selectedHotel = useMemo(() => hotels.find((entry) => entry.id === form.hotelId) || null, [form.hotelId, hotels]);
  const activeRoomCategories = useMemo(
    () => (selectedHotel?.roomCategories || []).filter((category) => category.isActive),
    [selectedHotel],
  );
  const showManualRoomType = !selectedHotel || activeRoomCategories.length === 0;

  function selectHotel(hotelId: string) {
    const hotel = hotels.find((entry) => entry.id === hotelId);
    const activeCategories = (hotel?.roomCategories || []).filter((category) => category.isActive);
    const firstCategory = activeCategories[0];
    setForm({
      ...form,
      hotelId,
      city: hotel?.city || form.city,
      hotelNameSnapshot: hotel?.name || form.hotelNameSnapshot,
      roomCategoryId: firstCategory?.id || '',
      roomType: firstCategory?.name || (hotel ? 'Standard' : form.roomType),
    });
  }

  function selectRoomCategory(roomCategoryId: string) {
    const roomCategory = activeRoomCategories.find((category) => category.id === roomCategoryId);
    setForm({
      ...form,
      roomCategoryId,
      roomType: roomCategory?.name || form.roomType,
    });
  }

  function selectMealPlan(mealPlanCode: MealPlanCode) {
    setForm({
      ...form,
      mealPlanCode,
      mealPlan: mealPlanCode,
    });
  }

  async function addHotelAlternative() {
    setError('');
    try {
      const payload = {
        ...form,
        hotelId: form.hotelId || null,
        roomCategoryId: form.hotelId && form.roomCategoryId ? form.roomCategoryId : null,
        mealPlanCode: form.mealPlanCode,
        mealPlan: form.mealPlanCode,
      };
      const response = await fetch(`${apiBaseUrl}/quotes/${quoteId}/options/${optionSet.id}/hotel-options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(await readError(response, 'Could not add hotel alternative.'));
      }

      setForm({ city: '', hotelId: '', roomCategoryId: '', hotelNameSnapshot: '', roomType: 'Standard', mealPlan: 'BB', mealPlanCode: 'BB', nights: '1', isPrimary: false, notes: '' });
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not add hotel alternative.');
    }
  }

  async function patchHotelAlternative(hotelOptionId: string, body: Record<string, unknown>) {
    setError('');
    try {
      const response = await fetch(`${apiBaseUrl}/quotes/${quoteId}/options/${optionSet.id}/hotel-options/${hotelOptionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(await readError(response, 'Could not update hotel alternative.'));
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not update hotel alternative.');
    }
  }

  async function deleteHotelAlternative(hotelOptionId: string) {
    setError('');
    try {
      const response = await fetch(`${apiBaseUrl}/quotes/${quoteId}/options/${optionSet.id}/hotel-options/${hotelOptionId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(await readError(response, 'Could not delete hotel alternative.'));
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not delete hotel alternative.');
    }
  }

  async function deleteOptionSet() {
    if (!window.confirm('Delete this hotel option set and all hotel alternatives inside it?')) {
      return;
    }

    setError('');
    try {
      const response = await fetch(`${apiBaseUrl}/quotes/${quoteId}/options/${optionSet.id}?kind=HOTEL_OPTION_SET`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(await readError(response, 'Could not delete hotel option set.'));
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not delete hotel option set.');
    }
  }

  return (
    <article className="detail-card">
      <div className="workspace-section-head">
        <div>
          <p className="eyebrow">Option Set</p>
          <h3>{optionSet.name}</h3>
          <p className="detail-copy">{optionSet.notes || 'No notes yet.'}</p>
        </div>
        <button className="compact-button" type="button" onClick={deleteOptionSet}>Delete Option Set</button>
      </div>
      {error ? <p className="form-error">{error}</p> : null}
      <div className="form-row form-row-3">
        <label>
          Hotel catalog
          <select value={form.hotelId} onChange={(event) => selectHotel(event.target.value)}>
            <option value="">Manual / hotel or similar</option>
            {Object.entries(hotelsByCity).map(([city, entries]) => (
              <optgroup key={city} label={city}>
                {entries.map((hotel) => (
                  <option key={hotel.id} value={hotel.id}>{hotel.name} ({hotel.category})</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label>City<input value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} placeholder="Amman" /></label>
        <label>Hotel alternative<input value={form.hotelNameSnapshot} onChange={(event) => setForm({ ...form, hotelNameSnapshot: event.target.value })} placeholder="Hotel name / similar" /></label>
        {!showManualRoomType ? (
          <label>
            Room category
            <select value={form.roomCategoryId} onChange={(event) => selectRoomCategory(event.target.value)}>
              {activeRoomCategories.map((category) => (
                <option key={category.id} value={category.id}>{category.name}{category.code ? ` (${category.code})` : ''}</option>
              ))}
            </select>
          </label>
        ) : (
          <label>Room type<input value={form.roomType} onChange={(event) => setForm({ ...form, roomType: event.target.value })} placeholder="Standard" /></label>
        )}
        <label>
          Meal plan
          <select value={form.mealPlanCode} onChange={(event) => selectMealPlan(event.target.value as MealPlanCode)}>
            {MEAL_PLAN_OPTIONS.map((mealPlan) => (
              <option key={mealPlan} value={mealPlan}>{mealPlan}</option>
            ))}
          </select>
        </label>
        <label>Nights<input type="number" min="1" value={form.nights} onChange={(event) => setForm({ ...form, nights: event.target.value })} /></label>
        <label>Primary<select value={form.isPrimary ? 'yes' : 'no'} onChange={(event) => setForm({ ...form, isPrimary: event.target.value === 'yes' })}><option value="no">No</option><option value="yes">Yes</option></select></label>
      </div>
      {selectedHotel ? <HotelFactSheetSummary hotel={selectedHotel} /> : null}
      <label>Notes<textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Internal notes, client caveat, or hotel-or-similar wording" /></label>
      <button className="button" type="button" onClick={addHotelAlternative}>Add hotel alternative</button>
      {Object.keys(optionHotelsByCity).length === 0 ? <p className="empty-state">No hotel alternatives yet for this option set.</p> : null}
      <div className="section-stack">
        {Object.entries(optionHotelsByCity).map(([city, options]) => (
          <div className="subsection" key={city}>
            <h4>{city}</h4>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Hotel</th>
                    <th>Room</th>
                    <th>Meal</th>
                    <th>Nights</th>
                    <th>Primary</th>
                    <th>Notes</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {options.map((option) => (
                    <tr key={option.id}>
                      <td>{option.hotelNameSnapshot}</td>
                      <td>{option.roomCategory?.name || option.roomType}</td>
                      <td>{option.mealPlanCode || option.mealPlan}</td>
                      <td>{option.nights}</td>
                      <td>{option.isPrimary ? 'Primary' : 'Alternative'}</td>
                      <td>{option.notes || '-'}</td>
                      <td>
                        <button className="compact-button" type="button" onClick={() => patchHotelAlternative(option.id, { isPrimary: true })}>Mark primary</button>
                        <button className="compact-button" type="button" onClick={() => deleteHotelAlternative(option.id)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

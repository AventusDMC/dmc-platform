import Link from 'next/link';
import { notFound } from 'next/navigation';
import { adminPageFetchJson, isNextRedirectError } from '../../../lib/admin-server';
import { updateHotel } from './actions';

// Hotels Engine — edit hotel master data.
//
// Server-rendered form pre-filled from the existing hotel record.
// Three catalog dropdowns (City, Category, Supplier) replace the
// earlier free-text inputs — operators pick from the existing
// catalog instead of typing UUIDs or risking typo'd strings that
// break the directory summary's rollup labels.

export const dynamic = 'force-dynamic';

const API_BASE_URL = '/api';

type FactSheetIdentity = {
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  coordinates?: { lat?: number | null; lng?: number | null } | null;
  distanceToAirport?: string | null;
  distanceToCityCenter?: string | null;
};

type FactSheetStays = {
  totalRooms?: number | null;
  yearBuilt?: number | null;
  yearRenovated?: number | null;
  chain?: string | null;
};

type FactSheetOperational = {
  groupCapacity?: number | null;
  earlyCheckIn?: string | null;
  lateCheckOut?: string | null;
  notes?: string | null;
};

type FactSheetFacilities = {
  pool?: boolean;
  spa?: boolean;
  gym?: boolean;
  wifi?: string | null;
  parking?: string | null;
  beachAccess?: string | null;
  petFriendly?: boolean;
  wheelchair?: boolean;
  restaurants?: number | null;
  bars?: number | null;
};

type HotelDetail = {
  id: string;
  name: string;
  city: string;
  category: string;
  supplierId: string;
  supplierName: string | null;
  cityId: string | null;
  hotelCategoryId: string | null;
  cityRecord: { id: string; name: string } | null;
  hotelCategory: { id: string; name: string } | null;
  factSheet: {
    shortDescription: string | null;
    checkInTime: string | null;
    checkOutTime: string | null;
    highlightsJson: {
      identity?: FactSheetIdentity | null;
      stays?: FactSheetStays | null;
      operational?: FactSheetOperational | null;
    } | null;
    amenitiesJson: FactSheetFacilities | null;
  } | null;
};

type CityOption = { id: string; name: string };
type CategoryOption = { id: string; name: string; isActive?: boolean };
type SupplierOption = {
  id: string;
  // suppliers in this codebase may surface as `name` or `legalName` or
  // `displayName` — the dropdown picks whichever's present.
  name?: string | null;
  legalName?: string | null;
  displayName?: string | null;
};

async function getHotel(id: string): Promise<HotelDetail | null> {
  try {
    return await adminPageFetchJson<HotelDetail>(
      `${API_BASE_URL}/hotels/${encodeURIComponent(id)}`,
      'Hotel edit form',
      { cache: 'no-store', allow404: true },
    );
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }
    console.error('[hotels/edit] hotel detail unavailable', error);
    return null;
  }
}

async function getCities(): Promise<CityOption[]> {
  try {
    const rows = await adminPageFetchJson<CityOption[]>(
      `${API_BASE_URL}/cities`,
      'Hotel edit city catalog',
      { cache: 'no-store' },
    );
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error('[hotels/edit] cities catalog unavailable', error);
    return [];
  }
}

async function getCategories(): Promise<CategoryOption[]> {
  try {
    const rows = await adminPageFetchJson<CategoryOption[]>(
      `${API_BASE_URL}/hotel-categories`,
      'Hotel edit category catalog',
      { cache: 'no-store' },
    );
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error('[hotels/edit] categories catalog unavailable', error);
    return [];
  }
}

async function getSuppliers(): Promise<SupplierOption[]> {
  try {
    const rows = await adminPageFetchJson<SupplierOption[]>(
      `${API_BASE_URL}/suppliers`,
      'Hotel edit supplier catalog',
      { cache: 'no-store' },
    );
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error('[hotels/edit] suppliers catalog unavailable', error);
    return [];
  }
}

function supplierLabel(s: SupplierOption): string {
  return s.name || s.displayName || s.legalName || `(id: ${s.id.slice(0, 8)}…)`;
}

type EditHotelPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditHotelPage({ params }: EditHotelPageProps) {
  const { id: hotelId } = await params;
  const [hotel, cities, categories, suppliers] = await Promise.all([
    getHotel(hotelId),
    getCities(),
    getCategories(),
    getSuppliers(),
  ]);

  if (!hotel) {
    notFound();
  }

  const updateAction = updateHotel.bind(null, hotelId);

  const sortedCities = [...cities].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const sortedCategories = [...categories]
    .filter((c) => c.isActive !== false)
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const sortedSuppliers = [...suppliers].sort((a, b) =>
    supplierLabel(a).localeCompare(supplierLabel(b)),
  );

  // Detect when the hotel's current value isn't in the catalog —
  // means an older record has a free-text value that should be
  // migrated to a real catalog row.
  const currentCityInCatalog = hotel.cityId
    ? sortedCities.some((c) => c.id === hotel.cityId)
    : false;
  const currentCategoryInCatalog = hotel.hotelCategoryId
    ? sortedCategories.some((c) => c.id === hotel.hotelCategoryId)
    : false;
  const currentSupplierInCatalog = sortedSuppliers.some((s) => s.id === hotel.supplierId);

  return (
    <main className="page">
      <section className="panel workspace-panel workspace-panel-wide">
        <header style={{ marginBottom: '1.5rem' }}>
          <p className="eyebrow">Hotels Engine — Edit hotel</p>
          <h1 className="section-title">{hotel.name}</h1>
          <p className="copy section-copy">
            Update master data + fact sheet for this hotel. City, Category, and Supplier
            are picked from the existing catalogs so the directory rollups stay clean.
          </p>
          <p className="table-subcopy" style={{ marginTop: '0.5rem' }}>
            <Link href={`/hotels/${hotelId}`} prefetch={false}>
              ← Back to {hotel.name}
            </Link>
          </p>
        </header>

        <form action={updateAction}>
          {/* Master data */}
          <section
            className="detail-card"
            style={{ marginBottom: '1.5rem' }}
            data-testid="hotel-edit-master"
          >
            <h2 className="section-title" style={{ fontSize: '1.05rem', marginBottom: '0.6rem' }}>
              Master data
            </h2>
            <div className="entity-form compact-form">
              <div className="form-row form-row-4">
                <label>
                  Name
                  <input
                    type="text"
                    name="name"
                    defaultValue={hotel.name || ''}
                    required
                    maxLength={200}
                  />
                </label>
                <label>
                  City{' '}
                  <Link
                    href="/cities"
                    target="_blank"
                    rel="noreferrer"
                    prefetch={false}
                    style={{ fontSize: '0.75rem', fontWeight: 400 }}
                  >
                    + add new
                  </Link>
                  <select name="cityId" defaultValue={hotel.cityId || ''} required>
                    <option value="" disabled>
                      Select city…
                    </option>
                    {sortedCities.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Category{' '}
                  <Link
                    href="/hotel-categories"
                    target="_blank"
                    rel="noreferrer"
                    prefetch={false}
                    style={{ fontSize: '0.75rem', fontWeight: 400 }}
                  >
                    + add new
                  </Link>
                  <select
                    name="hotelCategoryId"
                    defaultValue={hotel.hotelCategoryId || ''}
                    required
                  >
                    <option value="" disabled>
                      Select category…
                    </option>
                    {sortedCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Supplier{' '}
                  <Link
                    href="/suppliers"
                    target="_blank"
                    rel="noreferrer"
                    prefetch={false}
                    style={{ fontSize: '0.75rem', fontWeight: 400 }}
                  >
                    + add new
                  </Link>
                  <select name="supplierId" defaultValue={hotel.supplierId || ''} required>
                    <option value="" disabled>
                      Select supplier…
                    </option>
                    {sortedSuppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {supplierLabel(s)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {/* Warnings for legacy / unresolved values */}
              {!currentCityInCatalog && hotel.city ? (
                <p className="table-subcopy" style={{ marginTop: '0.4rem', color: '#b45309' }}>
                  ⚠ Current city <strong>"{hotel.city}"</strong> is free-text from a legacy
                  import — pick a catalog city to normalize.
                </p>
              ) : null}
              {!currentCategoryInCatalog && hotel.category ? (
                <p className="table-subcopy" style={{ marginTop: '0.4rem', color: '#b45309' }}>
                  ⚠ Current category <strong>"{hotel.category}"</strong> is free-text from a
                  legacy import — pick a catalog category to normalize.
                </p>
              ) : null}
              {!currentSupplierInCatalog ? (
                <p className="table-subcopy" style={{ marginTop: '0.4rem', color: '#b45309' }}>
                  ⚠ Current supplier id is not in the supplier catalog — pick one to fix.
                </p>
              ) : hotel.supplierName ? (
                <p className="table-subcopy" style={{ marginTop: '0.4rem', color: '#475467' }}>
                  Currently resolves to: <strong>{hotel.supplierName}</strong>
                </p>
              ) : null}
              {sortedCities.length === 0 || sortedCategories.length === 0 || sortedSuppliers.length === 0 ? (
                <p className="table-subcopy" style={{ marginTop: '0.4rem', color: '#dc2626' }}>
                  ⚠ One or more catalogs are empty. Populate{' '}
                  {sortedCities.length === 0 ? <Link href="/cities">cities</Link> : null}
                  {sortedCategories.length === 0 ? (
                    <>
                      {sortedCities.length === 0 ? ' / ' : ''}
                      <Link href="/hotel-categories">categories</Link>
                    </>
                  ) : null}
                  {sortedSuppliers.length === 0 ? (
                    <>
                      {sortedCities.length === 0 || sortedCategories.length === 0 ? ' / ' : ''}
                      <Link href="/suppliers">suppliers</Link>
                    </>
                  ) : null}{' '}
                  before saving.
                </p>
              ) : null}
            </div>
          </section>

          {/* Fact sheet — overview */}
          <section
            className="detail-card"
            style={{ marginBottom: '1.5rem' }}
            data-testid="hotel-edit-factsheet"
          >
            <h2 className="section-title" style={{ fontSize: '1.05rem', marginBottom: '0.6rem' }}>
              Fact sheet · Overview
            </h2>
            <div className="entity-form compact-form">
              <div className="form-row form-row-1">
                <label>
                  Short description
                  <textarea
                    name="shortDescription"
                    defaultValue={hotel.factSheet?.shortDescription || ''}
                    placeholder="Sales-friendly summary used in proposals and quote previews"
                    maxLength={600}
                    rows={3}
                  />
                </label>
              </div>
              <div className="form-row form-row-2">
                <label>
                  Check-in time
                  <input
                    type="text"
                    name="checkInTime"
                    defaultValue={hotel.factSheet?.checkInTime || ''}
                    placeholder="15:00"
                    maxLength={32}
                  />
                </label>
                <label>
                  Check-out time
                  <input
                    type="text"
                    name="checkOutTime"
                    defaultValue={hotel.factSheet?.checkOutTime || ''}
                    placeholder="12:00"
                    maxLength={32}
                  />
                </label>
              </div>
              <p className="table-subcopy" style={{ marginTop: '0.4rem', color: '#94a3b8', fontSize: '0.75rem' }}>
                Leave a field blank to clear it. Times are free-text — use 24-hour or 12-hour
                format consistent with how your operations team writes them.
              </p>
            </div>
          </section>

          {/* Fact sheet — identity & location */}
          <section
            className="detail-card"
            style={{ marginBottom: '1.5rem' }}
            data-testid="hotel-edit-identity"
          >
            <h2 className="section-title" style={{ fontSize: '1.05rem', marginBottom: '0.6rem' }}>
              Fact sheet · Identity &amp; location
            </h2>
            <div className="entity-form compact-form">
              <div className="form-row form-row-1">
                <label>
                  Street address
                  <input
                    type="text"
                    name="address"
                    defaultValue={hotel.factSheet?.highlightsJson?.identity?.address || ''}
                    placeholder="Zahran Street, Jabal Amman"
                    maxLength={240}
                  />
                </label>
              </div>
              <div className="form-row form-row-3">
                <label>
                  Phone
                  <input
                    type="text"
                    name="phone"
                    defaultValue={hotel.factSheet?.highlightsJson?.identity?.phone || ''}
                    placeholder="+962 6 460 7000"
                    maxLength={64}
                  />
                </label>
                <label>
                  Email
                  <input
                    type="email"
                    name="email"
                    defaultValue={hotel.factSheet?.highlightsJson?.identity?.email || ''}
                    placeholder="reservations@hotel.com"
                    maxLength={120}
                  />
                </label>
                <label>
                  Website
                  <input
                    type="url"
                    name="website"
                    defaultValue={hotel.factSheet?.highlightsJson?.identity?.website || ''}
                    placeholder="https://…"
                    maxLength={240}
                  />
                </label>
              </div>
              <div className="form-row form-row-4">
                <label>
                  Latitude
                  <input
                    type="number"
                    step="any"
                    name="lat"
                    defaultValue={
                      hotel.factSheet?.highlightsJson?.identity?.coordinates?.lat ?? ''
                    }
                    placeholder="31.9539"
                  />
                </label>
                <label>
                  Longitude
                  <input
                    type="number"
                    step="any"
                    name="lng"
                    defaultValue={
                      hotel.factSheet?.highlightsJson?.identity?.coordinates?.lng ?? ''
                    }
                    placeholder="35.9106"
                  />
                </label>
                <label>
                  Distance to airport
                  <input
                    type="text"
                    name="distanceToAirport"
                    defaultValue={
                      hotel.factSheet?.highlightsJson?.identity?.distanceToAirport || ''
                    }
                    placeholder="35 km / 45 min"
                    maxLength={64}
                  />
                </label>
                <label>
                  Distance to city center
                  <input
                    type="text"
                    name="distanceToCityCenter"
                    defaultValue={
                      hotel.factSheet?.highlightsJson?.identity?.distanceToCityCenter || ''
                    }
                    placeholder="2 km"
                    maxLength={64}
                  />
                </label>
              </div>
            </div>
          </section>

          {/* Fact sheet — stays */}
          <section
            className="detail-card"
            style={{ marginBottom: '1.5rem' }}
            data-testid="hotel-edit-stays"
          >
            <h2 className="section-title" style={{ fontSize: '1.05rem', marginBottom: '0.6rem' }}>
              Fact sheet · Stays
            </h2>
            <div className="entity-form compact-form">
              <div className="form-row form-row-4">
                <label>
                  Total rooms
                  <input
                    type="number"
                    name="totalRooms"
                    min={0}
                    defaultValue={hotel.factSheet?.highlightsJson?.stays?.totalRooms ?? ''}
                    placeholder="412"
                  />
                </label>
                <label>
                  Year built
                  <input
                    type="number"
                    name="yearBuilt"
                    min={1800}
                    max={2100}
                    defaultValue={hotel.factSheet?.highlightsJson?.stays?.yearBuilt ?? ''}
                    placeholder="1985"
                  />
                </label>
                <label>
                  Year renovated
                  <input
                    type="number"
                    name="yearRenovated"
                    min={1800}
                    max={2100}
                    defaultValue={hotel.factSheet?.highlightsJson?.stays?.yearRenovated ?? ''}
                    placeholder="2019"
                  />
                </label>
                <label>
                  Chain / brand
                  <input
                    type="text"
                    name="chain"
                    defaultValue={hotel.factSheet?.highlightsJson?.stays?.chain || ''}
                    placeholder="Marriott / Rotana / Independent"
                    maxLength={120}
                  />
                </label>
              </div>
            </div>
          </section>

          {/* Fact sheet — facilities */}
          <section
            className="detail-card"
            style={{ marginBottom: '1.5rem' }}
            data-testid="hotel-edit-facilities"
          >
            <h2 className="section-title" style={{ fontSize: '1.05rem', marginBottom: '0.6rem' }}>
              Fact sheet · Facilities
            </h2>
            <div className="entity-form compact-form">
              <div className="form-row form-row-3">
                <label>
                  Wi-Fi
                  <select name="wifi" defaultValue={hotel.factSheet?.amenitiesJson?.wifi || 'unknown'}>
                    <option value="unknown">—</option>
                    <option value="free">Free</option>
                    <option value="paid">Paid</option>
                    <option value="none">None</option>
                  </select>
                </label>
                <label>
                  Parking
                  <select
                    name="parking"
                    defaultValue={hotel.factSheet?.amenitiesJson?.parking || 'unknown'}
                  >
                    <option value="unknown">—</option>
                    <option value="free">Free</option>
                    <option value="paid">Paid</option>
                    <option value="valet">Valet</option>
                    <option value="none">None</option>
                  </select>
                </label>
                <label>
                  Beach access
                  <select
                    name="beachAccess"
                    defaultValue={hotel.factSheet?.amenitiesJson?.beachAccess || 'unknown'}
                  >
                    <option value="unknown">—</option>
                    <option value="private">Private</option>
                    <option value="public">Public</option>
                    <option value="nearby">Nearby</option>
                    <option value="none">None</option>
                  </select>
                </label>
              </div>
              <div className="form-row form-row-2">
                <label>
                  Restaurants on site
                  <input
                    type="number"
                    name="restaurants"
                    min={0}
                    defaultValue={hotel.factSheet?.amenitiesJson?.restaurants ?? ''}
                    placeholder="3"
                  />
                </label>
                <label>
                  Bars on site
                  <input
                    type="number"
                    name="bars"
                    min={0}
                    defaultValue={hotel.factSheet?.amenitiesJson?.bars ?? ''}
                    placeholder="2"
                  />
                </label>
              </div>
              {/* Amenities — checkboxes. Rendered OUTSIDE the .entity-form
                  compact-form context (which forces label flex-direction:
                  column and stretches inputs to 100% width). Plain CSS-grid
                  of inline checkbox+label pairs keeps them on one row each. */}
            </div>
            <fieldset
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: 6,
                padding: '0.6rem 0.8rem',
                marginTop: '0.4rem',
              }}
            >
              <legend style={{ fontSize: '0.78rem', color: '#475467', padding: '0 0.4rem' }}>
                Amenities
              </legend>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: '0.5rem 1rem',
                }}
              >
                {[
                  { name: 'pool', label: 'Pool', checked: hotel.factSheet?.amenitiesJson?.pool === true },
                  { name: 'spa', label: 'Spa', checked: hotel.factSheet?.amenitiesJson?.spa === true },
                  { name: 'gym', label: 'Gym', checked: hotel.factSheet?.amenitiesJson?.gym === true },
                  {
                    name: 'petFriendly',
                    label: 'Pet friendly',
                    checked: hotel.factSheet?.amenitiesJson?.petFriendly === true,
                  },
                  {
                    name: 'wheelchair',
                    label: 'Wheelchair accessible',
                    checked: hotel.factSheet?.amenitiesJson?.wheelchair === true,
                  },
                ].map((item) => (
                  <label
                    key={item.name}
                    style={{
                      display: 'inline-flex',
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: '0.5rem',
                      fontWeight: 400,
                      fontSize: '0.9rem',
                      whiteSpace: 'nowrap',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      name={item.name}
                      defaultChecked={item.checked}
                      style={{ width: 'auto', margin: 0, flex: '0 0 auto' }}
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </section>

          {/* Fact sheet — operational */}
          <section
            className="detail-card"
            style={{ marginBottom: '1.5rem' }}
            data-testid="hotel-edit-operational"
          >
            <h2 className="section-title" style={{ fontSize: '1.05rem', marginBottom: '0.6rem' }}>
              Fact sheet · Operational profile
            </h2>
            <div className="entity-form compact-form">
              <div className="form-row form-row-3">
                <label>
                  Group capacity (rooms)
                  <input
                    type="number"
                    name="groupCapacity"
                    min={0}
                    defaultValue={
                      hotel.factSheet?.highlightsJson?.operational?.groupCapacity ?? ''
                    }
                    placeholder="80"
                  />
                </label>
                <label>
                  Early check-in policy
                  <input
                    type="text"
                    name="earlyCheckIn"
                    defaultValue={
                      hotel.factSheet?.highlightsJson?.operational?.earlyCheckIn || ''
                    }
                    placeholder="On request, subject to availability"
                    maxLength={200}
                  />
                </label>
                <label>
                  Late check-out policy
                  <input
                    type="text"
                    name="lateCheckOut"
                    defaultValue={
                      hotel.factSheet?.highlightsJson?.operational?.lateCheckOut || ''
                    }
                    placeholder="Until 18:00 — 50% room rate"
                    maxLength={200}
                  />
                </label>
              </div>
              <div className="form-row form-row-1">
                <label>
                  Operational notes
                  <textarea
                    name="operationalNotes"
                    defaultValue={
                      hotel.factSheet?.highlightsJson?.operational?.notes || ''
                    }
                    placeholder="Group meals, halal kitchen, conference setup, dietary handling, etc."
                    rows={3}
                    maxLength={1200}
                  />
                </label>
              </div>
            </div>
          </section>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit" className="primary-button">
              Save changes
            </button>
            <Link href={`/hotels/${hotelId}`} prefetch={false} className="compact-button">
              Cancel
            </Link>
          </div>
        </form>
      </section>
    </main>
  );
}

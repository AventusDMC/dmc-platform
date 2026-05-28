import Link from 'next/link';
import { notFound } from 'next/navigation';
import { adminPageFetchJson, isNextRedirectError } from '../../../lib/admin-server';
import { updateHotel } from './actions';

// Hotels Engine v2 — edit hotel master data.
//
// Server-rendered form pre-filled from the existing hotel record.
// Three catalog dropdowns (City, Category, Supplier) replace the
// earlier free-text inputs — operators pick from the existing
// catalog instead of typing UUIDs or risking typo'd strings that
// break the directory summary's rollup labels.

export const dynamic = 'force-dynamic';

const API_BASE_URL = '/api';

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
      'Hotel v2 edit form',
      { cache: 'no-store', allow404: true },
    );
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }
    console.error('[hotels-v2/edit] hotel detail unavailable', error);
    return null;
  }
}

async function getCities(): Promise<CityOption[]> {
  try {
    const rows = await adminPageFetchJson<CityOption[]>(
      `${API_BASE_URL}/cities`,
      'Hotel v2 edit city catalog',
      { cache: 'no-store' },
    );
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error('[hotels-v2/edit] cities catalog unavailable', error);
    return [];
  }
}

async function getCategories(): Promise<CategoryOption[]> {
  try {
    const rows = await adminPageFetchJson<CategoryOption[]>(
      `${API_BASE_URL}/hotel-categories`,
      'Hotel v2 edit category catalog',
      { cache: 'no-store' },
    );
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error('[hotels-v2/edit] categories catalog unavailable', error);
    return [];
  }
}

async function getSuppliers(): Promise<SupplierOption[]> {
  try {
    const rows = await adminPageFetchJson<SupplierOption[]>(
      `${API_BASE_URL}/suppliers`,
      'Hotel v2 edit supplier catalog',
      { cache: 'no-store' },
    );
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error('[hotels-v2/edit] suppliers catalog unavailable', error);
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
          <p className="eyebrow">Hotels Engine v2 — Edit hotel</p>
          <h1 className="section-title">{hotel.name}</h1>
          <p className="copy section-copy">
            Update master data + fact sheet for this hotel. City, Category, and Supplier
            are picked from the existing catalogs so the directory rollups stay clean.
          </p>
          <p className="table-subcopy" style={{ marginTop: '0.5rem' }}>
            <Link href={`/hotels-v2/${hotelId}`} prefetch={false}>
              ← Back to {hotel.name}
            </Link>
          </p>
        </header>

        <form action={updateAction}>
          {/* Master data */}
          <section
            className="detail-card"
            style={{ marginBottom: '1.5rem' }}
            data-testid="hotel-v2-edit-master"
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

          {/* Fact sheet */}
          <section
            className="detail-card"
            style={{ marginBottom: '1.5rem' }}
            data-testid="hotel-v2-edit-factsheet"
          >
            <h2 className="section-title" style={{ fontSize: '1.05rem', marginBottom: '0.6rem' }}>
              Fact sheet
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

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit" className="primary-button">
              Save changes
            </button>
            <Link href={`/hotels-v2/${hotelId}`} prefetch={false} className="compact-button">
              Cancel
            </Link>
          </div>
        </form>
      </section>
    </main>
  );
}

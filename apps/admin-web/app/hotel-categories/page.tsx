import { InlineEntityActions } from '../components/InlineEntityActions';
import { HotelCategoryOption } from '../lib/hotelCategories';
import { HotelCategoriesForm } from './HotelCategoriesForm';

import { ADMIN_API_BASE_URL, adminPageFetchJson } from '../lib/admin-server';

const API_BASE_URL = ADMIN_API_BASE_URL;
const ACTION_API_BASE_URL = '/api';

async function getHotelCategories(): Promise<HotelCategoryOption[]> {
  return adminPageFetchJson<HotelCategoryOption[]>(`${API_BASE_URL}/hotel-categories`, 'Hotel categories', {
    cache: 'no-store',
  });
}

export default async function HotelCategoriesPage() {
  const hotelCategories = await getHotelCategories();

  return (
    <main className="page">
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Catalog</p>
            <h1 className="section-title">Manage hotel categories</h1>
          </div>
        </div>

        <div className="detail-grid">
          <div className="detail-card">
            <h2>Create category</h2>
            <HotelCategoriesForm apiBaseUrl={ACTION_API_BASE_URL} />
          </div>

          <div className="detail-card">
            <h2>Why this exists</h2>
            <p className="detail-copy">
              Shared hotel category records keep hotels and quote options aligned around the same reusable labels.
            </p>
          </div>
        </div>

        <div className="detail-card">
          <h2>Hotel categories</h2>
          <div className="entity-list">
            {hotelCategories.length === 0 ? (
              <p className="empty-state">No hotel categories yet.</p>
            ) : (
              hotelCategories.map((category) => (
                <article key={category.id} className="entity-card">
                  <div className="entity-card-header">
                    <h2>{category.name}</h2>
                    <span>{category.isActive ? 'Active' : 'Inactive'}</span>
                  </div>
                  <InlineEntityActions
                    apiBaseUrl={ACTION_API_BASE_URL}
                    deletePath={`/hotel-categories/${category.id}`}
                    deleteLabel="hotel category"
                    confirmMessage={`Delete ${category.name}?`}
                  >
                    <HotelCategoriesForm
                      apiBaseUrl={ACTION_API_BASE_URL}
                      hotelCategoryId={category.id}
                      submitLabel="Save category"
                      initialValues={{
                        name: category.name,
                        isActive: category.isActive,
                      }}
                    />
                  </InlineEntityActions>
                </article>
              ))
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

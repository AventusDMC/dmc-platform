import { InlineEntityActions } from '../components/InlineEntityActions';
import { CollapsibleCreatePanel } from '../components/CollapsibleCreatePanel';
import { TableSectionShell } from '../components/TableSectionShell';
import { CityOption } from '../lib/cities';
import { ADMIN_API_BASE_URL, adminPageFetchJson } from '../lib/admin-server';
import { PlaceTypeOption } from '../lib/placeTypes';
import { PlaceOption, formatPlaceLabel } from '../lib/places';
import { PlacesForm } from '../places/PlacesForm';

const API_BASE_URL = ADMIN_API_BASE_URL;

async function getPlaces(): Promise<PlaceOption[]> {
  return adminPageFetchJson<PlaceOption[]>(`${API_BASE_URL}/places`, 'Catalog places', {
    cache: 'no-store',
  });
}

async function getCities(): Promise<CityOption[]> {
  return adminPageFetchJson<CityOption[]>(`${API_BASE_URL}/cities?active=true`, 'Catalog active cities', {
    cache: 'no-store',
  });
}

async function getPlaceTypes(): Promise<PlaceTypeOption[]> {
  return adminPageFetchJson<PlaceTypeOption[]>(`${API_BASE_URL}/place-types?active=true`, 'Catalog active place types', {
    cache: 'no-store',
  });
}

export async function PlacesCatalogSection() {
  const [places, cities, placeTypes] = await Promise.all([getPlaces(), getCities(), getPlaceTypes()]);

  return (
    <TableSectionShell
      title="Places"
      description="Reusable place records let transport routes and future modules pick consistent locations from search instead of retyping free text."
      context={<p>{places.length} places in scope</p>}
      createPanel={
        <CollapsibleCreatePanel title="Create place" description="Add reusable location records while keeping the library visible." triggerLabelOpen="Add place">
          <PlacesForm apiBaseUrl={API_BASE_URL} cities={cities} placeTypes={placeTypes} />
        </CollapsibleCreatePanel>
      }
      emptyState={places.length === 0 ? <p className="empty-state">No places yet.</p> : undefined}
    >
      {places.length > 0 ? (
        <div className="table-wrap">
          <table className="data-table allotment-table">
            <thead>
              <tr>
                <th>Place</th>
                <th>Type</th>
                <th>City</th>
                <th>Country</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {places.map((place) => (
                <tr key={place.id}>
                  <td>
                    <strong>{place.name}</strong>
                    <div className="table-subcopy">{formatPlaceLabel(place)}</div>
                  </td>
                  <td>{place.type}</td>
                  <td>{place.city || 'No city'}</td>
                  <td>{place.country || 'No country'}</td>
                  <td>{place.isActive ? 'Active' : 'Inactive'}</td>
                  <td>
                    <InlineEntityActions
                      apiBaseUrl={API_BASE_URL}
                      deletePath={`/places/${place.id}`}
                      deleteLabel="place"
                      confirmMessage={`Delete ${place.name}?`}
                    >
                      <PlacesForm
                        apiBaseUrl={API_BASE_URL}
                        cities={cities}
                        placeTypes={placeTypes}
                        placeId={place.id}
                        submitLabel="Save place"
                        initialValues={{
                          name: place.name,
                          type: place.type,
                          placeTypeId: place.placeTypeId || '',
                          cityId: place.cityId || '',
                          city: place.cityId ? '' : place.city || '',
                          country: place.country || '',
                          isActive: place.isActive,
                        }}
                      />
                    </InlineEntityActions>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </TableSectionShell>
  );
}

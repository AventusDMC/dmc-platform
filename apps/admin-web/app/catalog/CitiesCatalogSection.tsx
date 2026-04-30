import { InlineEntityActions } from '../components/InlineEntityActions';
import { CollapsibleCreatePanel } from '../components/CollapsibleCreatePanel';
import { TableSectionShell } from '../components/TableSectionShell';
import { CityOption, formatCityLabel } from '../lib/cities';
import { adminPageFetchJson } from '../lib/admin-server';
import { CitiesForm } from '../cities/CitiesForm';

const API_BASE_URL = '/api';

async function getCities(): Promise<CityOption[]> {
  return adminPageFetchJson<CityOption[]>(`${API_BASE_URL}/cities`, 'Catalog cities', {
    cache: 'no-store',
  });
}

export async function CitiesCatalogSection() {
  const cities = await getCities();

  return (
    <TableSectionShell
      title="Cities"
      description="Central city records keep hotels and places aligned around shared destination names instead of repeated free-text values."
      context={<p>{cities.length} destination records in scope</p>}
      createPanel={
        <CollapsibleCreatePanel title="Create city" description="Add destination records while keeping the registry visible." triggerLabelOpen="Add city">
          <CitiesForm apiBaseUrl="/api" />
        </CollapsibleCreatePanel>
      }
      emptyState={
        cities.length === 0 ? (
          <div className="empty-state ui-empty-state">
            <strong>No cities yet.</strong>
            <p>Create destination records so hotels, places, and catalog filters can use consistent city data.</p>
          </div>
        ) : undefined
      }
    >
      {cities.length > 0 ? (
        <div className="table-wrap">
          <table className="data-table allotment-table">
            <thead>
              <tr>
                <th>City</th>
                <th>Country</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {cities.map((city) => (
                <tr key={city.id}>
                  <td>
                    <strong>{city.name}</strong>
                  </td>
                  <td>{city.country || 'No country'}</td>
                  <td>{city.isActive ? 'Active' : 'Inactive'}</td>
                  <td>
                    <InlineEntityActions
                      apiBaseUrl="/api"
                      deletePath={`/cities/${city.id}`}
                      deleteLabel="city"
                      confirmMessage={`Delete ${city.name}?`}
                    >
                      <CitiesForm
                        apiBaseUrl="/api"
                        cityId={city.id}
                        submitLabel="Save city"
                        initialValues={{
                          name: city.name,
                          country: city.country || '',
                          isActive: city.isActive,
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

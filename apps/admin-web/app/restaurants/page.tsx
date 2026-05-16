import { AdminForbiddenState } from '../components/AdminForbiddenState';
import { SummaryStrip } from '../components/SummaryStrip';
import { WorkspaceShell } from '../components/WorkspaceShell';
import { adminPageFetchJson, isAdminForbiddenError } from '../lib/admin-server';
import { RestaurantsManager } from './RestaurantsManager';

async function getRestaurants() {
  return adminPageFetchJson<any[]>('/api/restaurants', 'Restaurants', {
    cache: 'no-store',
  });
}

export default async function RestaurantsPage() {
  try {
    const restaurants = await getRestaurants();
    const activeCount = restaurants.filter((restaurant) => restaurant.active).length;
    const assignedCount = restaurants.reduce((total, restaurant) => total + (restaurant.bookingServices?.length || 0), 0);

    return (
      <WorkspaceShell
        eyebrow="Dining Operations"
        title="Restaurant Master"
        description="Operational restaurant resources for meal services, assignment, capacity, and dietary readiness."
      >
        <SummaryStrip
          items={[
            { id: 'restaurants', label: 'Restaurants', value: String(restaurants.length) },
            { id: 'active', label: 'Active', value: String(activeCount) },
            { id: 'assigned', label: 'Assigned bookings', value: String(assignedCount) },
          ]}
        />
        <RestaurantsManager initialRestaurants={restaurants} />
      </WorkspaceShell>
    );
  } catch (error) {
    if (isAdminForbiddenError(error)) {
      return <AdminForbiddenState />;
    }
    throw error;
  }
}

'use client';

import { FormEvent, useState } from 'react';

type Restaurant = {
  id: string;
  name: string;
  city: string | null;
  region: string | null;
  cuisineType: string | null;
  capacity: number | null;
  email: string | null;
  phone: string | null;
  mealTypes: string[];
  active: boolean;
  indoor: boolean;
  outdoor: boolean;
  halalSupport: boolean;
  vegetarianSupport: boolean;
  veganSupport: boolean;
  bookingServices?: Array<{
    id: string;
    description: string;
    serviceDate: string | null;
    participantCount?: number | null;
    mealConfirmationStatus: string;
    mealDietaryRequirements: string[];
    booking?: { bookingRef: string | null } | null;
  }>;
};

export function RestaurantsManager({ initialRestaurants }: { initialRestaurants: Restaurant[] }) {
  const [restaurants, setRestaurants] = useState(initialRestaurants);
  const [error, setError] = useState('');

  async function createRestaurant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const form = event.currentTarget;
    const formData = new FormData(form);
    const response = await fetch('/api/restaurants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: String(formData.get('name') || ''),
        city: String(formData.get('city') || ''),
        region: String(formData.get('region') || ''),
        cuisineType: String(formData.get('cuisineType') || ''),
        capacity: String(formData.get('capacity') || ''),
        email: String(formData.get('email') || ''),
        phone: String(formData.get('phone') || ''),
        mealTypes: String(formData.get('mealTypes') || ''),
        active: formData.has('active'),
        indoor: formData.has('indoor'),
        outdoor: formData.has('outdoor'),
        halalSupport: formData.has('halalSupport'),
        vegetarianSupport: formData.has('vegetarianSupport'),
        veganSupport: formData.has('veganSupport'),
        notes: String(formData.get('notes') || ''),
      }),
    });
    if (!response.ok) {
      setError('Restaurant could not be saved.');
      return;
    }
    const restaurant = await response.json();
    setRestaurants((current) => [restaurant, ...current]);
    form.reset();
  }

  return (
    <div className="section-stack">
      {error ? <p className="form-error">{error}</p> : null}
      <form className="entity-form" onSubmit={createRestaurant}>
        <label>
          Restaurant name
          <input name="name" required />
        </label>
        <label>
          City/region
          <input name="city" placeholder="City" />
        </label>
        <label>
          Region
          <input name="region" placeholder="Region" />
        </label>
        <label>
          Cuisine type
          <input name="cuisineType" placeholder="Local, Italian, Levantine" />
        </label>
        <label>
          Capacity
          <input name="capacity" type="number" min="0" />
        </label>
        <label>
          Contact email
          <input name="email" type="email" />
        </label>
        <label>
          Contact phone
          <input name="phone" />
        </label>
        <label>
          Meal types supported
          <input name="mealTypes" placeholder="Breakfast, lunch, dinner" />
        </label>
        <label className="checkbox-field">
          <input name="active" type="checkbox" defaultChecked /> Active
        </label>
        <label className="checkbox-field">
          <input name="indoor" type="checkbox" defaultChecked /> Indoor
        </label>
        <label className="checkbox-field">
          <input name="outdoor" type="checkbox" /> Outdoor
        </label>
        <label className="checkbox-field">
          <input name="halalSupport" type="checkbox" /> Halal
        </label>
        <label className="checkbox-field">
          <input name="vegetarianSupport" type="checkbox" /> Vegetarian
        </label>
        <label className="checkbox-field">
          <input name="veganSupport" type="checkbox" /> Vegan
        </label>
        <label>
          Notes
          <textarea name="notes" rows={3} />
        </label>
        <button type="submit">Create restaurant</button>
      </form>

      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Restaurant</th>
              <th>Capacity</th>
              <th>Meal types</th>
              <th>Dietary</th>
              <th>Assigned bookings</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {restaurants.map((restaurant) => (
              <tr key={restaurant.id}>
                <td>
                  <strong>{restaurant.name}</strong>
                  <p className="table-subcopy">{[restaurant.city, restaurant.region, restaurant.cuisineType].filter(Boolean).join(' / ') || 'Location pending'}</p>
                  <p className="table-subcopy">{[restaurant.email, restaurant.phone].filter(Boolean).join(' / ') || 'Contact pending'}</p>
                </td>
                <td>{restaurant.capacity ?? 'Not set'}</td>
                <td>{restaurant.mealTypes.length ? restaurant.mealTypes.join(', ') : 'Not set'}</td>
                <td>
                  {[
                    restaurant.halalSupport ? 'Halal' : null,
                    restaurant.vegetarianSupport ? 'Vegetarian' : null,
                    restaurant.veganSupport ? 'Vegan' : null,
                    restaurant.indoor ? 'Indoor' : null,
                    restaurant.outdoor ? 'Outdoor' : null,
                  ].filter(Boolean).join(', ') || 'Not set'}
                </td>
                <td>{restaurant.bookingServices?.length || 0}</td>
                <td>{restaurant.active ? 'Active' : 'Inactive'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

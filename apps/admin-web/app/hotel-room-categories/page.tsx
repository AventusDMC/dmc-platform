import { redirect } from 'next/navigation';

// Deep-link fallback: /hotel-room-categories has no list page of its own;
// it redirects into the Hotels workspace where operators pick a hotel and
// drill into its rooms.
export default function HotelRoomCategoriesPage() {
  redirect('/hotels');
}

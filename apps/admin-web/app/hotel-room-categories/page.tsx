import { redirect } from 'next/navigation';

export default function HotelRoomCategoriesPage() {
  redirect('/hotels?tab=room-categories');
}

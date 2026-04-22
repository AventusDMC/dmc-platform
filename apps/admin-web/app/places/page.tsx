import { redirect } from 'next/navigation';

export default function PlacesPage() {
  redirect('/catalog?tab=places');
}

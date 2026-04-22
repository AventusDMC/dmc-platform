import { redirect } from 'next/navigation';

export default function PlaceTypesPage() {
  redirect('/catalog?tab=place-types');
}

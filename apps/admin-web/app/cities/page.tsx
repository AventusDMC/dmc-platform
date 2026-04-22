import { redirect } from 'next/navigation';

export default function CitiesPage() {
  redirect('/catalog?tab=cities');
}

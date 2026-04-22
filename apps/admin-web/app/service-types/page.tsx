import { redirect } from 'next/navigation';

export default function ServiceTypesPage() {
  redirect('/catalog?tab=service-types');
}

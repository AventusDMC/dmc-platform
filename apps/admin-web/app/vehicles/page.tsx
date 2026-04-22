import { redirect } from 'next/navigation';

export default function VehiclesPage() {
  redirect('/transport?tab=vehicles');
}

import { redirect } from 'next/navigation';

export default function VehicleRatesPage() {
  redirect('/transport?tab=rates');
}

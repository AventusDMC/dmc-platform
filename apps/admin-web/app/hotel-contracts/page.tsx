import { redirect } from 'next/navigation';

export default function HotelContractsPage() {
  redirect('/hotels?tab=contracts');
}

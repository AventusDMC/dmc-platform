import { redirect } from 'next/navigation';

// Deep-link fallback: /hotel-contracts has no list page of its own; it
// redirects into the Hotels workspace where operators pick a hotel to
// see its contracts.
export default function HotelContractsPage() {
  redirect('/hotels');
}

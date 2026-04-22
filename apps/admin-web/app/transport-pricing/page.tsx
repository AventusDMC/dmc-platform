import { redirect } from 'next/navigation';

export default function TransportPricingPage() {
  redirect('/transport?tab=pricing-rules');
}

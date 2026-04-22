import { redirect } from 'next/navigation';

type HotelRatesPageProps = {
  searchParams?: Promise<{
    cityId?: string;
    hotelId?: string;
    contractId?: string;
    roomCategoryId?: string;
    mealPlan?: string;
    status?: string;
  }>;
};

export default async function HotelRatesPage({ searchParams }: HotelRatesPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const nextParams = new URLSearchParams();

  nextParams.set('tab', 'rates');

  for (const [key, value] of Object.entries(resolvedSearchParams || {})) {
    if (key === 'tab' || !value) {
      continue;
    }

    nextParams.set(key, value);
  }

  redirect(`/hotels?${nextParams.toString()}`);
}

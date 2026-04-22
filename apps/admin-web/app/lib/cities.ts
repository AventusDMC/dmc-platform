export type CityOption = {
  id: string;
  name: string;
  country: string | null;
  isActive: boolean;
};

export function formatCityLabel(city: Pick<CityOption, 'name' | 'country'>) {
  return [city.name, city.country].filter(Boolean).join(', ');
}

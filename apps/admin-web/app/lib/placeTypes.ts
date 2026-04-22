export type PlaceTypeOption = {
  id: string;
  name: string;
  isActive: boolean;
};

export function formatPlaceTypeLabel(placeType: Pick<PlaceTypeOption, 'name'>) {
  return placeType.name;
}

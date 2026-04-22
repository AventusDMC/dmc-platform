export type HotelCategoryOption = {
  id: string;
  name: string;
  isActive: boolean;
};

export function formatHotelCategoryLabel(category: Pick<HotelCategoryOption, 'name'>) {
  return category.name;
}

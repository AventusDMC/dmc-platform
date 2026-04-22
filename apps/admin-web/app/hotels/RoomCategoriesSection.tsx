import { ADMIN_API_BASE_URL, adminPageFetchJson } from '../lib/admin-server';
import { TableSectionShell } from '../components/TableSectionShell';
import { RoomCategoriesManager } from '../hotel-room-categories/RoomCategoriesManager';

const API_BASE_URL = ADMIN_API_BASE_URL;

type HotelRoomCategory = {
  id: string;
  hotelId: string;
  name: string;
  code: string | null;
  description: string | null;
  isActive: boolean;
};

type Hotel = {
  id: string;
  name: string;
  city: string;
  roomCategories: HotelRoomCategory[];
};

async function getHotels(): Promise<Hotel[]> {
  return adminPageFetchJson<Hotel[]>(`${API_BASE_URL}/hotels`, 'Room categories hotels', {
    cache: 'no-store',
  });
}

export async function RoomCategoriesSection() {
  const hotels = await getHotels();
  const roomCategoryCount = hotels.reduce((total, hotel) => total + hotel.roomCategories.length, 0);

  return (
    <TableSectionShell
      title="Room Category Setup"
      description="Define sellable room categories per hotel so contracts and rates can reference structured room inventory."
      context={<p>{roomCategoryCount} room categories in scope</p>}
    >
      <RoomCategoriesManager apiBaseUrl={API_BASE_URL} hotels={hotels} />
    </TableSectionShell>
  );
}

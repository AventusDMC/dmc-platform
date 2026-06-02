import { Injectable, NotFoundException } from '@nestjs/common';
import { HotelMealPlan, HotelOccupancyType } from '@prisma/client';
import { requireActorCompanyId, type CompanyScopedActor } from '../auth/company-scope';
import { PrismaService } from '../prisma/prisma.service';
import { HotelRatesService } from '../hotel-rates/hotel-rates.service';

// Single-supplement charge for a booking, per the operator's rule: a single
// occupant pays the whole single room, versus half of a shared double. So,
// per single room per stay:
//   supplement = SGL room rate − (DBL room rate / 2)
//   e.g. SGL 90, DBL 100 → 90 − 50 = 40
// Computed READ-ONLY via the existing hotel pricing engine (calculateHotelCost
// priced as SGL vs DBL). The pricing engine itself is never modified — this
// only consumes it. Booking → quote → hotel quote-items supply the context
// (hotel/contract/room/meal/dates); the booking's current rooming supplies the
// number of single rooms.
@Injectable()
export class BookingSingleSupplementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hotelRates: HotelRatesService,
  ) {}

  async compute(bookingId: string, companyActor?: CompanyScopedActor) {
    requireActorCompanyId(companyActor);

    const booking = await (this.prisma.booking as any).findFirst({
      where: { id: bookingId },
      select: {
        id: true,
        quote: {
          select: {
            quoteCurrency: true,
            quoteItems: {
              where: { hotelId: { not: null } },
              select: {
                hotelId: true,
                contractId: true,
                roomCategoryId: true,
                mealPlan: true,
                serviceDate: true,
                quantity: true,
                hotel: { select: { name: true } },
              },
            },
          },
        },
        roomingEntries: { select: { occupancy: true, roomType: true } },
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const singleRoomCount = (booking.roomingEntries || []).filter((entry: any) => {
      const occ = String(entry.occupancy || '').toLowerCase();
      const code = String(entry.roomType || '').trim().toLowerCase();
      return occ === 'single' || code === 'sgl' || code === 'single';
    }).length;

    const currency = booking.quote?.quoteCurrency || 'USD';
    const stays = (booking.quote?.quoteItems || []).filter((item: any) => item.hotelId && item.serviceDate);

    const perHotel: Array<{
      hotelName: string;
      nights: number;
      singleRoomRate: number;
      sharingPerPerson: number;
      perRoomSupplement: number;
    }> = [];
    const warnings: string[] = [];
    let perRoomTotal = 0;

    for (const stay of stays) {
      const nights = Math.max(1, Math.trunc(Number(stay.quantity || 1)));
      const checkIn = new Date(stay.serviceDate);
      if (Number.isNaN(checkIn.getTime())) continue;
      const checkOut = new Date(checkIn.getTime() + nights * 24 * 60 * 60 * 1000);
      const mealPlan = (stay.mealPlan as HotelMealPlan) || HotelMealPlan.BB;
      const hotelName = stay.hotel?.name || 'Hotel';

      try {
        const [single, dbl] = await Promise.all([
          this.hotelRates.calculateHotelCost({
            hotelId: stay.hotelId,
            contractId: stay.contractId || null,
            roomCategoryId: stay.roomCategoryId || null,
            checkInDate: checkIn,
            checkOutDate: checkOut,
            occupancy: HotelOccupancyType.SGL,
            mealPlan,
            pax: 1,
            adults: 1,
            roomCount: 1,
          }),
          this.hotelRates.calculateHotelCost({
            hotelId: stay.hotelId,
            contractId: stay.contractId || null,
            roomCategoryId: stay.roomCategoryId || null,
            checkInDate: checkIn,
            checkOutDate: checkOut,
            occupancy: HotelOccupancyType.DBL,
            mealPlan,
            pax: 2,
            adults: 2,
            roomCount: 1,
          }),
        ]);

        const singleRoomRate = Number(Number(single?.totalCost || 0).toFixed(2));
        const sharingPerPerson = Number((Number(dbl?.totalCost || 0) / 2).toFixed(2));
        const perRoomSupplement = Number(Math.max(0, singleRoomRate - sharingPerPerson).toFixed(2));
        perRoomTotal += perRoomSupplement;
        perHotel.push({ hotelName, nights, singleRoomRate, sharingPerPerson, perRoomSupplement });
      } catch {
        // A stay we can't price (e.g. missing SGL/DBL rate rows) is skipped
        // and flagged rather than failing the whole computation.
        warnings.push(`Could not price single supplement for ${hotelName} — missing single or double rate.`);
      }
    }

    perRoomTotal = Number(perRoomTotal.toFixed(2));

    return {
      currency,
      singleRoomCount,
      perRoomSupplement: perRoomTotal,
      total: Number((perRoomTotal * singleRoomCount).toFixed(2)),
      perHotel,
      warnings,
    };
  }
}

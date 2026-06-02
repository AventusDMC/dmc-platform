import test = require('node:test');
import assert = require('node:assert/strict');
const { BookingSingleSupplementService } = require('./booking-single-supplement.service');

function createService(opts: { prisma: any; hotelRates: any }) {
  return new BookingSingleSupplementService(opts.prisma, opts.hotelRates);
}

test('single supplement = single-room rate minus per-person sharing, times single rooms', async () => {
  const seenOccupancies: string[] = [];
  const service = createService({
    prisma: {
      booking: {
        findFirst: async () => ({
          id: 'b1',
          quote: {
            quoteCurrency: 'USD',
            quoteItems: [
              {
                hotelId: 'h1',
                contractId: 'c1',
                roomCategoryId: 'r1',
                mealPlan: 'BB',
                serviceDate: new Date('2026-10-01T00:00:00Z'),
                quantity: 3,
                hotel: { name: 'Petra Moon' },
              },
            ],
          },
          roomingEntries: [
            { occupancy: 'single', roomType: 'SGL' },
            { occupancy: 'single', roomType: 'SGL' },
            { occupancy: 'double', roomType: 'DBL' },
          ],
        }),
      },
    },
    hotelRates: {
      // SGL 90/night x 3 = 270 ; DBL room 100/night x 3 = 300
      calculateHotelCost: async (input: any) => {
        seenOccupancies.push(input.occupancy);
        return { totalCost: input.occupancy === 'SGL' ? 270 : 300 };
      },
    },
  });

  const result = await service.compute('b1', { companyId: 'company-1' });

  assert.equal(result.singleRoomCount, 2);
  assert.equal(result.perHotel.length, 1);
  assert.equal(result.perHotel[0].singleRoomRate, 270);
  assert.equal(result.perHotel[0].sharingPerPerson, 150); // 300 / 2
  assert.equal(result.perHotel[0].perRoomSupplement, 120); // 270 - 150 (= 40/night x 3)
  assert.equal(result.perRoomSupplement, 120);
  assert.equal(result.total, 240); // 120 x 2 single rooms
  assert.ok(seenOccupancies.includes('SGL') && seenOccupancies.includes('DBL'));
});

test('single supplement is zero when there are no single rooms', async () => {
  const service = createService({
    prisma: {
      booking: {
        findFirst: async () => ({
          id: 'b1',
          quote: {
            quoteCurrency: 'USD',
            quoteItems: [
              { hotelId: 'h1', serviceDate: new Date('2026-10-01T00:00:00Z'), quantity: 2, mealPlan: 'BB', hotel: { name: 'X' } },
            ],
          },
          roomingEntries: [{ occupancy: 'double', roomType: 'DBL' }],
        }),
      },
    },
    hotelRates: { calculateHotelCost: async (input: any) => ({ totalCost: input.occupancy === 'SGL' ? 200 : 300 }) },
  });

  const result = await service.compute('b1', { companyId: 'company-1' });
  assert.equal(result.singleRoomCount, 0);
  assert.equal(result.total, 0);
});

test('single supplement requires authenticated company context', async () => {
  const service = createService({
    prisma: { booking: { findFirst: async () => null } },
    hotelRates: { calculateHotelCost: async () => ({ totalCost: 0 }) },
  });
  await assert.rejects(() => service.compute('b1', undefined), /Company context is required/);
});

test('a stay that cannot be priced is skipped with a warning, not a failure', async () => {
  const service = createService({
    prisma: {
      booking: {
        findFirst: async () => ({
          id: 'b1',
          quote: {
            quoteCurrency: 'USD',
            quoteItems: [
              { hotelId: 'h1', serviceDate: new Date('2026-10-01T00:00:00Z'), quantity: 2, mealPlan: 'BB', hotel: { name: 'No Rates Hotel' } },
            ],
          },
          roomingEntries: [{ occupancy: 'single', roomType: 'SGL' }],
        }),
      },
    },
    hotelRates: {
      calculateHotelCost: async () => {
        throw new Error('no rates');
      },
    },
  });

  const result = await service.compute('b1', { companyId: 'company-1' });
  assert.equal(result.singleRoomCount, 1);
  assert.equal(result.total, 0);
  assert.equal(result.warnings.length, 1);
});

import test = require('node:test');
import assert = require('node:assert/strict');
import { BadRequestException } from '@nestjs/common';
const { HotelsService } = require('./hotels.service');

function createHotelsService(prismaOverrides: Partial<any> = {}) {
  return new HotelsService({
    hotelRoomCategory: {
      findUnique: async () => ({
        id: 'room-1',
        hotelId: 'hotel-1',
        _count: {
          hotelRates: 0,
          quoteItems: 0,
        },
      }),
      delete: async ({ where }: any) => ({ id: where.id }),
    },
    quoteHotelOption: {
      count: async () => 0,
    },
    ...prismaOverrides,
  } as any);
}

test('blocks room category deletion when used by quote hotel options', async () => {
  let deleteCalled = false;
  const service = createHotelsService({
    hotelRoomCategory: {
      findUnique: async () => ({
        id: 'room-1',
        hotelId: 'hotel-1',
        _count: {
          hotelRates: 0,
          quoteItems: 0,
        },
      }),
      delete: async () => {
        deleteCalled = true;
        return { id: 'room-1' };
      },
    },
    quoteHotelOption: {
      count: async ({ where }: any) => (where.roomCategoryId === 'room-1' ? 1 : 0),
    },
  });

  await assert.rejects(
    () => service.removeRoomCategory('hotel-1', 'room-1'),
    (error: unknown) =>
      error instanceof BadRequestException &&
      error.message === 'This room category is used in quote hotel options and cannot be deleted.',
  );
  assert.equal(deleteCalled, false);
});

test('keeps existing hotel rate delete protection for room categories', async () => {
  const service = createHotelsService({
    hotelRoomCategory: {
      findUnique: async () => ({
        id: 'room-1',
        hotelId: 'hotel-1',
        _count: {
          hotelRates: 1,
          quoteItems: 0,
        },
      }),
      delete: async () => ({ id: 'room-1' }),
    },
  });

  await assert.rejects(
    () => service.removeRoomCategory('hotel-1', 'room-1'),
    (error: unknown) => error instanceof BadRequestException && /linked hotel rates/.test(error.message),
  );
});

test('deletes unused room category', async () => {
  let deletedCategoryId = '';
  const service = createHotelsService({
    hotelRoomCategory: {
      findUnique: async () => ({
        id: 'room-1',
        hotelId: 'hotel-1',
        _count: {
          hotelRates: 0,
          quoteItems: 0,
        },
      }),
      delete: async ({ where }: any) => {
        deletedCategoryId = where.id;
        return { id: where.id };
      },
    },
  });

  const result = await service.removeRoomCategory('hotel-1', 'room-1');

  assert.equal(result.id, 'room-1');
  assert.equal(deletedCategoryId, 'room-1');
});

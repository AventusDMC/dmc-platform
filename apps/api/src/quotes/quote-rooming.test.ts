import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { QuotesService } from './quotes.service';
import { QuotePricingService } from './quote-pricing.service';

function createService() {
  const roomingGroups: any[] = [];
  const assignments: any[] = [];
  const passengers = [
    { id: 'passenger-1', quoteId: 'quote-1', firstName: 'Lina', lastName: 'Haddad' },
    { id: 'passenger-2', quoteId: 'quote-1', firstName: 'Sami', lastName: 'Haddad' },
  ];
  const itineraryDays = [{ id: 'day-1', quoteId: 'quote-1', dayNumber: 1, title: 'Amman' }];
  const quoteItems = [{ id: 'hotel-item-1', quoteId: 'quote-1', hotelId: 'hotel-1', pricingDescription: 'DBL BB' }];
  const dayItems = [{ id: 'day-item-1', dayId: 'day-1', quoteServiceId: 'hotel-item-1', isActive: true }];

  const includeGroup = (group: any) => ({
    ...group,
    itineraryDay: itineraryDays.find((day) => day.id === group.itineraryDayId),
    hotelQuoteItem: quoteItems.find((item) => item.id === group.hotelQuoteItemId),
    assignments: assignments
      .filter((assignment) => assignment.roomingGroupId === group.id)
      .map((assignment) => ({
        ...assignment,
        quotePassenger: passengers.find((passenger) => passenger.id === assignment.quotePassengerId),
      })),
  });

  const prisma: any = {
    quote: {
      findFirst: async ({ where }: any) => (where.id === 'quote-1' ? { id: 'quote-1' } : null),
    },
    quoteItineraryDay: {
      findFirst: async ({ where }: any) =>
        itineraryDays.find((day) => day.id === where.id && day.quoteId === where.quoteId) || null,
    },
    quoteItineraryDayItem: {
      findFirst: async ({ where }: any) =>
        dayItems.find((item) => item.dayId === where.dayId && item.quoteServiceId === where.quoteServiceId && item.isActive === where.isActive) || null,
    },
    quoteItem: {
      findFirst: async ({ where }: any) =>
        quoteItems.find((item) => item.id === where.id && item.quoteId === where.quoteId) || null,
    },
    quotePassenger: {
      findFirst: async ({ where }: any) =>
        passengers.find((passenger) => passenger.id === where.id && passenger.quoteId === where.quoteId) || null,
    },
    roomingGroup: {
      findFirst: async ({ where }: any) => {
        let groups = roomingGroups.filter((group) => Object.entries(where).every(([key, value]) => group[key] === value));
        groups = groups.sort((left, right) => right.sortOrder - left.sortOrder);
        return groups[0] ? includeGroup(groups[0]) : null;
      },
      findMany: async ({ where }: any) => roomingGroups.filter((group) => group.quoteId === where.quoteId).map(includeGroup),
      findUnique: async ({ where }: any) => {
        const group = roomingGroups.find((entry) => entry.id === where.id);
        return group ? includeGroup(group) : null;
      },
      create: async ({ data }: any) => {
        const group = { id: `rooming-group-${roomingGroups.length + 1}`, createdAt: new Date(), updatedAt: new Date(), ...data };
        roomingGroups.push(group);
        return includeGroup(group);
      },
      update: async ({ where, data }: any) => {
        const index = roomingGroups.findIndex((group) => group.id === where.id);
        roomingGroups[index] = { ...roomingGroups[index], ...data, updatedAt: new Date() };
        return includeGroup(roomingGroups[index]);
      },
      delete: async ({ where }: any) => {
        const index = roomingGroups.findIndex((group) => group.id === where.id);
        const [deleted] = roomingGroups.splice(index, 1);
        for (let assignmentIndex = assignments.length - 1; assignmentIndex >= 0; assignmentIndex -= 1) {
          if (assignments[assignmentIndex].roomingGroupId === where.id) {
            assignments.splice(assignmentIndex, 1);
          }
        }
        return deleted;
      },
    },
    roomingAssignment: {
      create: async ({ data }: any) => {
        const assignment = { id: `assignment-${assignments.length + 1}`, createdAt: new Date(), ...data };
        assignments.push(assignment);
        return assignment;
      },
      deleteMany: async ({ where }: any) => {
        let count = 0;
        for (let index = assignments.length - 1; index >= 0; index -= 1) {
          const assignment = assignments[index];
          const group = roomingGroups.find((entry) => entry.id === assignment.roomingGroupId);
          const matchesDirectGroup = where.roomingGroupId === undefined || assignment.roomingGroupId === where.roomingGroupId;
          const matchesPassenger = where.quotePassengerId === undefined || assignment.quotePassengerId === where.quotePassengerId;
          const matchesGroupScope =
            !where.roomingGroup ||
            (group &&
              group.quoteId === where.roomingGroup.quoteId &&
              group.itineraryDayId === where.roomingGroup.itineraryDayId &&
              group.hotelQuoteItemId === where.roomingGroup.hotelQuoteItemId);

          if (matchesDirectGroup && matchesPassenger && matchesGroupScope) {
            assignments.splice(index, 1);
            count += 1;
          }
        }
        return { count };
      },
    },
    $transaction: async (callback: any) => callback(prisma),
  };

  const service = new QuotesService(
    prisma,
    {} as any,
    {} as any,
    { evaluate: async () => null } as any,
    new QuotePricingService(),
  );
  return { service, roomingGroups, assignments };
}

test('quote rooming groups can be created assigned reassigned and deleted with occupancy counts', async () => {
  const { service, assignments } = createService();
  const actor = { companyId: 'company-1' } as any;

  const firstRoom = await service.createRoomingGroup('quote-1', {
    itineraryDayId: 'day-1',
    hotelQuoteItemId: 'hotel-item-1',
    roomType: 'Standard',
    occupancyType: 'double',
    temporaryRoomLabel: 'TMP-101',
    leaderRoom: true,
  }, actor);

  const secondRoom = await service.createRoomingGroup('quote-1', {
    itineraryDayId: 'day-1',
    hotelQuoteItemId: 'hotel-item-1',
    roomType: 'Standard',
    occupancyType: 'single',
  }, actor);

  assert.equal(firstRoom.quoteId, 'quote-1');
  assert.equal(firstRoom.itineraryDayId, 'day-1');
  assert.equal(firstRoom.hotelQuoteItemId, 'hotel-item-1');
  assert.equal(firstRoom.occupancyType, 'double');

  const assigned = await service.assignPassengerToRoomingGroup('quote-1', firstRoom.id, 'passenger-1', actor);
  assert.equal(assigned.assignments.length, 1);
  assert.equal(assigned.assignments[0].quotePassengerId, 'passenger-1');
  assert.equal(assignments.length, 1);

  const reassigned = await service.assignPassengerToRoomingGroup('quote-1', secondRoom.id, 'passenger-1', actor);
  assert.equal(reassigned.assignments.length, 1);
  assert.equal(reassigned.assignments[0].quotePassengerId, 'passenger-1');
  assert.equal(assignments.length, 1);
  assert.equal(assignments[0].roomingGroupId, secondRoom.id);

  await service.assignPassengerToRoomingGroup('quote-1', secondRoom.id, 'passenger-2', actor);
  const groups = await service.findRoomingGroups('quote-1', actor);
  const occupancyCounts = new Map(groups.map((group: any) => [group.id, group.assignments.length]));
  assert.equal(occupancyCounts.get(firstRoom.id), 0);
  assert.equal(occupancyCounts.get(secondRoom.id), 2);

  await service.removePassengerFromRoomingGroup('quote-1', secondRoom.id, 'passenger-2', actor);
  assert.equal(assignments.length, 1);

  const deleted = await service.deleteRoomingGroup('quote-1', secondRoom.id, actor);
  assert.deepEqual(deleted, { id: secondRoom.id });
  assert.equal(assignments.length, 0);
});

test('quote rooming rejects non-hotel services and passengers outside the quote', async () => {
  const { service } = createService();
  const actor = { companyId: 'company-1' } as any;

  await assert.rejects(
    () => service.createRoomingGroup('quote-1', { itineraryDayId: 'day-1', hotelQuoteItemId: 'missing-item' }, actor),
    /Hotel quote item does not belong to the selected quote/,
  );

  const room = await service.createRoomingGroup('quote-1', { itineraryDayId: 'day-1', hotelQuoteItemId: 'hotel-item-1' }, actor);
  await assert.rejects(
    () => service.assignPassengerToRoomingGroup('quote-1', room.id, 'missing-passenger', actor),
    /Quote passenger not found/,
  );
});

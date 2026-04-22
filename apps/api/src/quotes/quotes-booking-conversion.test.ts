import test = require('node:test');
import assert = require('node:assert/strict');
const { QuotesService } = require('./quotes.service');
const { QuotePricingService } = require('./quote-pricing.service');

function createQuotesService() {
  return new QuotesService(
    {} as any,
    {} as any,
    new QuotePricingService(),
  );
}

test('buildBookingServicesFromAcceptedVersion carries resolved supplier and ready status into booking services', async () => {
  const service = createQuotesService();

  const bookingServices = await (service as any).buildBookingServicesFromAcceptedVersion(
    {
      travelStartDate: '2026-05-10T00:00:00.000Z',
      itineraries: [
        {
          id: 'day-1',
          dayNumber: 1,
          serviceDate: '2026-05-10T09:00:00.000Z',
        },
      ],
      quoteItems: [
        {
          id: 'item-1',
          itineraryId: 'day-1',
          quantity: 2,
          pricingDescription: 'Airport transfer',
          totalCost: 100,
          totalSell: 140,
          service: {
            name: 'Private Transfer',
            category: 'Transport',
            supplierId: 'supplier-1',
          },
        },
        {
          id: 'item-2',
          quantity: 1,
          pricingDescription: 'Meet and assist',
          totalCost: 35,
          totalSell: 45,
          service: {
            name: 'Meet and Assist',
            category: 'Operations',
          },
        },
        {
          id: 'item-3',
          itineraryId: 'day-1',
          quantity: 1,
          participantCount: 5,
          adultCount: 4,
          childCount: 1,
          startTime: '08:30',
          pickupTime: '08:00',
          pickupLocation: 'Hotel lobby',
          meetingPoint: 'Visitor center',
          pricingDescription: 'Sunrise jeep tour',
          totalCost: 120,
          totalSell: 180,
          reconfirmationRequired: true,
          reconfirmationDueAt: '2026-05-09T18:00:00.000Z',
          service: {
            name: 'Sunrise Jeep Tour',
            category: 'Activity',
            supplierId: 'supplier-1',
          },
        },
      ],
      adults: 2,
      children: 1,
    },
    {
      supplier: {
        findMany: async () => [
          {
            id: 'supplier-1',
            name: 'Desert Compass Transport',
          },
        ],
      },
    },
  );

  assert.equal(bookingServices.length, 3);
  assert.equal(bookingServices[0].supplierId, 'supplier-1');
  assert.equal(bookingServices[0].supplierName, 'Desert Compass Transport');
  assert.equal(bookingServices[0].status, 'ready');
  assert.equal(bookingServices[0].serviceOrder, 0);
  assert.equal(bookingServices[0].serviceDate, '2026-05-10T09:00:00.000Z');
  assert.equal(bookingServices[0].notes, 'Airport transfer');
  assert.equal(bookingServices[0].confirmationStatus, 'pending');

  assert.equal(bookingServices[1].supplierId, null);
  assert.equal(bookingServices[1].supplierName, null);
  assert.equal(bookingServices[1].status, 'pending');

  assert.equal(bookingServices[2].serviceType, 'Activity');
  assert.equal(bookingServices[2].serviceDate, '2026-05-10T09:00:00.000Z');
  assert.equal(bookingServices[2].startTime, '08:30');
  assert.equal(bookingServices[2].pickupTime, '08:00');
  assert.equal(bookingServices[2].pickupLocation, 'Hotel lobby');
  assert.equal(bookingServices[2].meetingPoint, 'Visitor center');
  assert.equal(bookingServices[2].participantCount, 5);
  assert.equal(bookingServices[2].adultCount, 4);
  assert.equal(bookingServices[2].childCount, 1);
  assert.equal(bookingServices[2].reconfirmationRequired, true);
  assert.equal(bookingServices[2].reconfirmationDueAt, '2026-05-09T18:00:00.000Z');
});

test('buildBookingServicesFromAcceptedVersion resolves activity dates from itinerary day and quote travel start date', async () => {
  const service = createQuotesService();

  const bookingServices = await (service as any).buildBookingServicesFromAcceptedVersion(
    {
      travelStartDate: '2026-06-01T00:00:00.000Z',
      itineraries: [
        {
          id: 'day-3',
          dayNumber: 3,
        },
      ],
      quoteItems: [
        {
          id: 'item-activity',
          itineraryId: 'day-3',
          quantity: 1,
          startTime: '09:00',
          meetingPoint: 'Camp gate',
          participantCount: 2,
          adultCount: 2,
          childCount: 0,
          totalCost: 50,
          totalSell: 80,
          service: {
            name: 'Desert Walk',
            category: 'Activity',
          },
        },
      ],
      adults: 2,
      children: 0,
    },
    {
      supplier: {
        findMany: async () => [],
      },
    },
  );

  assert.equal(bookingServices[0].serviceDate, '2026-06-03T00:00:00.000Z');
});

test('accepted activity snapshots must be operationally complete', () => {
  const service = createQuotesService();

  assert.throws(
    () =>
      (service as any).assertAcceptedActivityItemsAreOperationallyComplete({
        quoteItems: [
          {
            itineraryId: 'day-2',
            participantCount: 2,
            adultCount: 2,
            childCount: 0,
            pickupLocation: 'Hotel lobby',
            service: {
              category: 'Activity',
            },
          },
        ],
      }),
    /operationally incomplete/i,
  );
});

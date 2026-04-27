import test = require('node:test');
import assert = require('node:assert/strict');
const { QuotesService } = require('./quotes.service');
const { QuotePricingService } = require('./quote-pricing.service');

function createQuotesService(prisma: any = {}) {
  return new QuotesService(
    prisma,
    { log: async () => null } as any,
    new QuotePricingService(),
  );
}

test('accepted quote conversion creates booking with client company pax dates and booking days', async () => {
  let bookingCreateData: any;
  const tx = {
    quote: {
      findFirst: async () => ({
        id: 'quote-1',
        status: 'ACCEPTED',
        acceptedVersionId: 'version-1',
        booking: null,
      }),
    },
    quoteVersion: {
      findFirst: async () => ({
        id: 'version-1',
        quoteId: 'quote-1',
        booking: null,
        snapshotJson: {
          bookingType: 'FIT',
          clientCompany: { id: 'company-1', name: 'Client Co' },
          contact: { firstName: 'Lina', lastName: 'Haddad' },
          adults: 2,
          children: 1,
          roomCount: 2,
          nightCount: 2,
          travelStartDate: '2026-06-01T00:00:00.000Z',
          itineraries: [
            { id: 'day-1', dayNumber: 1, title: 'Arrival', description: 'Arrival day' },
            { id: 'day-2', dayNumber: 2, title: 'Petra', description: 'Touring day' },
          ],
          quoteItems: [],
        },
      }),
    },
    supplier: {
      findMany: async () => [],
    },
    booking: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        bookingCreateData = data;
        return {
          id: 'booking-1',
          bookingRef: data.bookingRef,
          quoteId: data.quoteId,
          ...data,
        };
      },
    },
    bookingPassenger: {
      create: async () => ({ id: 'passenger-1' }),
    },
    bookingRoomingEntry: {
      create: async () => ({ id: 'room-1' }),
    },
    bookingRoomingAssignment: {
      create: async () => ({}),
    },
  };
  const service = createQuotesService({
    $transaction: async (callback: any) => callback(tx),
  });

  const booking = await service.convertToBooking('quote-1', { companyId: 'company-1' });

  assert.equal(booking.id, 'booking-1');
  assert.equal(bookingCreateData.quoteId, 'quote-1');
  assert.equal(bookingCreateData.clientCompanyId, 'company-1');
  assert.equal(bookingCreateData.pax, 3);
  assert.equal(bookingCreateData.startDate.toISOString(), '2026-06-01T00:00:00.000Z');
  assert.equal(bookingCreateData.endDate.toISOString(), '2026-06-03T00:00:00.000Z');
  assert.equal(bookingCreateData.days.create.length, 3);
});

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

  const meetAssist = bookingServices.find((entry: any) => entry.description === 'Meet and Assist');
  assert.equal(meetAssist.supplierId, null);
  assert.equal(meetAssist.supplierName, null);
  assert.equal(meetAssist.status, 'pending');

  const activity = bookingServices.find((entry: any) => entry.description === 'Sunrise Jeep Tour');
  assert.equal(activity.serviceType, 'Activity');
  assert.equal(activity.serviceDate, '2026-05-10T09:00:00.000Z');
  assert.equal(activity.startTime, '08:30');
  assert.equal(activity.pickupTime, '08:00');
  assert.equal(activity.pickupLocation, 'Hotel lobby');
  assert.equal(activity.meetingPoint, 'Visitor center');
  assert.equal(activity.participantCount, 5);
  assert.equal(activity.adultCount, 4);
  assert.equal(activity.childCount, 1);
  assert.equal(activity.reconfirmationRequired, true);
  assert.equal(activity.reconfirmationDueAt, '2026-05-09T18:00:00.000Z');
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

test('buildBookingDaysFromAcceptedVersion creates dated booking days from quote timeline', () => {
  const service = createQuotesService();

  const bookingDays = (service as any).buildBookingDaysFromAcceptedVersion({
    travelStartDate: '2026-06-01T00:00:00.000Z',
    nightCount: 2,
    itineraries: [
      {
        dayNumber: 1,
        title: 'Arrival in Amman',
        description: 'Meet and assist.',
      },
      {
        dayNumber: 3,
        title: 'Petra touring',
        description: 'Full day touring.',
      },
    ],
  });

  assert.equal(bookingDays.length, 3);
  assert.equal(bookingDays[0].dayNumber, 1);
  assert.equal(bookingDays[0].date.toISOString(), '2026-06-01T00:00:00.000Z');
  assert.equal(bookingDays[0].status, 'PENDING');
  assert.equal(bookingDays[1].dayNumber, 2);
  assert.equal(bookingDays[1].title, 'Day 2');
  assert.equal(bookingDays[2].date.toISOString(), '2026-06-03T00:00:00.000Z');
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { SeriesService } from './series.service';

function buildSourceDeparture() {
  const baseDate = new Date('2026-05-22T00:00:00.000Z');
  return {
    id: 'source-departure-id',
    seriesId: 'series-id',
    bookingId: 'source-booking-id',
    departureCode: 'JOR-HL-2026-001',
    departureDate: baseDate,
    paxCount: 16,
    lowOccupancyThreshold: 8,
    totalCapacity: 24,
    guaranteedMinimumPax: 12,
    sharedCoachCapacity: 24,
    operationalNotes: 'Source notes',
    series: {
      id: 'series-id',
      seriesCode: 'JOR-HL-2026',
      packageTemplateId: null,
      packageTemplate: null,
    },
    booking: {
      id: 'source-booking-id',
      quoteId: 'source-quote-id',
      acceptedVersionId: 'source-version-id',
      clientCompanyId: 'company-id',
      bookingType: 'GROUP',
      status: 'confirmed',
      clientInvoiceStatus: 'unbilled',
      supplierPaymentStatus: 'unpaid',
      statusNote: null,
      snapshotJson: { title: 'Jordan Highlights' },
      clientSnapshotJson: {},
      brandSnapshotJson: null,
      contactSnapshotJson: {},
      itinerarySnapshotJson: {},
      pricingSnapshotJson: {},
      adults: 16,
      children: 0,
      pax: 16,
      roomCount: 8,
      nightCount: 7,
      startDate: baseDate,
      endDate: new Date('2026-05-29T00:00:00.000Z'),
      quote: {
        id: 'source-quote-id',
        clientCompanyId: 'company-id',
        contactId: 'contact-id',
        agentId: null,
        quoteType: 'GROUP',
        jordanPassType: 'NONE',
        bookingType: 'GROUP',
        title: 'Jordan Highlights',
        description: null,
        totalPrice: 3200,
        quoteCurrency: 'USD',
        status: 'ACCEPTED',
        adults: 16,
        children: 0,
        roomCount: 8,
        nightCount: 7,
        totalCost: 2400,
        totalSell: 3200,
        pricePerPax: 200,
        revisionNumber: 1,
        singleSupplement: null,
        pricingType: 'simple',
        focType: 'none',
        focRatio: null,
        focCount: null,
        focRoomType: null,
        brandCompanyId: null,
        pricingMode: 'FIXED',
        fixedPricePerPerson: 200,
        inclusionsText: null,
        exclusionsText: null,
        termsNotesText: null,
        travelStartDate: baseDate,
        validUntil: null,
        sentAt: null,
        acceptedAt: baseDate,
      },
      acceptedVersion: {
        id: 'source-version-id',
        label: 'Accepted',
        snapshotJson: { accepted: true },
      },
      days: [{ id: 'day-1', bookingDayId: null, dayNumber: 1, date: baseDate, title: 'Arrival', notes: null }],
      roomingEntries: [{ id: 'room-1', roomType: 'DBL', occupancy: 'double', notes: null, sortOrder: 1 }],
      services: [
        {
          id: 'service-1',
          bookingDayId: 'day-1',
          sourceQuoteItemId: null,
          activityId: null,
          touringRouteId: null,
          touringRoutePricingId: null,
          sourceMetadata: { hotelReservation: { status: 'Blocked', blockedRoomCount: 8 } },
          serviceOrder: 1,
          serviceType: 'HOTEL',
          operationType: 'HOTEL',
          referenceId: null,
          assignedTo: null,
          guidePhone: null,
          guideId: null,
          guideRequiredLanguages: [],
          guideReportingTime: null,
          restaurantId: null,
          mealTiming: null,
          mealSeatingNotes: null,
          mealDietaryRequirements: [],
          mealOperationalNotes: null,
          vehicleId: null,
          serviceDate: baseDate,
          startTime: null,
          pickupTime: null,
          pickupLocation: null,
          meetingPoint: null,
          participantCount: 16,
          adultCount: 16,
          childCount: 0,
          confirmationDeadline: null,
          reconfirmationRequired: true,
          reconfirmationDueAt: new Date('2026-05-20T00:00:00.000Z'),
          description: 'Amman hotel block',
          notes: null,
          qty: 1,
          unitCost: 2400,
          unitSell: 3200,
          totalCost: 2400,
          totalSell: 3200,
          supplierId: null,
          supplierName: 'Hotel Supplier',
        },
      ],
    },
  };
}

describe('SeriesService clone departure', () => {
  it('creates series with regular tour variants branches and shared core defaults', async () => {
    const createdPayloads: any[] = [];
    const service = new SeriesService({
      series: {
        create: async ({ data }: any) => {
          createdPayloads.push(data);
          return { id: 'series-id', ...data };
        },
      },
    } as any);

    await service.create({ seriesCode: 'JOR-SIC', seriesName: 'Jordan SIC' });

    assert.deepEqual(createdPayloads[0].programVariantsJson.map((variant: any) => variant.label), ['3 star', '4 star', '5 star', '5 star luxury']);
    assert.deepEqual(createdPayloads[0].branchExtensionsJson.map((branch: any) => branch.label), [
      'Dead Sea extension',
      'Aqaba extension',
      'Wadi Rum overnight',
      'Border departure variants',
    ]);
    assert.deepEqual(createdPayloads[0].sharedCoreServicesJson, []);
  });

  it('clones a JOR-HL-2026-001 style departure with an independent quote/version and booking', async () => {
    const source = buildSourceDeparture();
    const calls: Array<{ model: string; data: any }> = [];
    const tx = {
      quote: {
        create: async ({ data }: any) => {
          calls.push({ model: 'quote', data });
          return { id: 'cloned-quote-id', ...data };
        },
        update: async ({ data }: any) => {
          calls.push({ model: 'quote.update', data });
          return { id: 'cloned-quote-id', ...data };
        },
      },
      quoteVersion: {
        create: async ({ data }: any) => {
          calls.push({ model: 'quoteVersion', data });
          return { id: 'cloned-version-id', ...data };
        },
      },
      booking: {
        count: async () => 41,
        create: async ({ data }: any) => {
          calls.push({ model: 'booking', data });
          return { id: 'cloned-booking-id', bookingRef: data.bookingRef, ...data };
        },
      },
      bookingDay: {
        create: async ({ data }: any) => {
          calls.push({ model: 'bookingDay', data });
          return { id: 'cloned-day-id', ...data };
        },
      },
      bookingRoomingEntry: {
        create: async ({ data }: any) => {
          calls.push({ model: 'rooming', data });
          return { id: 'cloned-room-id', ...data };
        },
      },
      bookingService: {
        create: async ({ data }: any) => {
          calls.push({ model: 'service', data });
          return { id: 'cloned-service-id', ...data };
        },
      },
      seriesDeparture: {
        create: async ({ data }: any) => {
          calls.push({ model: 'seriesDeparture', data });
          return { id: 'cloned-departure-id', ...data };
        },
      },
    };
    const prisma = {
      seriesDeparture: {
        findFirst: async (args: any) => (args.select ? null : source),
      },
      $transaction: async (callback: any) => callback(tx),
    };
    const service = new SeriesService(prisma as any);

    const cloned = await service.cloneDeparture('series-id', 'source-departure-id', {
      departureCode: 'JOR-HL-2026-002',
      departureDate: '2026-05-29',
      paxCount: 20,
      lowOccupancyThreshold: 8,
      totalCapacity: 24,
      guaranteedMinimumPax: 12,
      sharedCoachCapacity: 24,
      cloneRooming: true,
    });

    const bookingCall = calls.find((call) => call.model === 'booking');
    const departureCall = calls.find((call) => call.model === 'seriesDeparture');
    const serviceCall = calls.find((call) => call.model === 'service');

    assert.equal(cloned.departureCode, 'JOR-HL-2026-002');
    assert.equal(bookingCall?.data.quoteId, 'cloned-quote-id');
    assert.equal(bookingCall?.data.acceptedVersionId, 'cloned-version-id');
    assert.equal(bookingCall?.data.pax, 20);
    assert.equal(departureCall?.data.bookingId, 'cloned-booking-id');
    assert.equal(departureCall?.data.totalCapacity, 24);
    assert.equal(departureCall?.data.guaranteedMinimumPax, 12);
    assert.equal(departureCall?.data.sharedCoachCapacity, 24);
    assert.equal(serviceCall?.data.sourceMetadata.hotelReservation.status, 'Blocked');
    assert.ok(calls.some((call) => call.model === 'quote.update' && call.data.acceptedVersionId === 'cloned-version-id'));
  });

  it('rejects duplicate target departure codes before the clone transaction', async () => {
    const service = new SeriesService({
      seriesDeparture: {
        findFirst: async (args: any) => (args.select ? { id: 'existing-departure-id' } : buildSourceDeparture()),
      },
      $transaction: async () => {
        throw new Error('transaction should not run');
      },
    } as any);

    await assert.rejects(
      () => service.cloneDeparture('series-id', 'source-departure-id', { departureCode: 'JOR-HL-2026-002' }),
      (error: unknown) => error instanceof BadRequestException && error.message === 'Departure code JOR-HL-2026-002 already exists for this series',
    );
  });

  it('creates departures with empty capacity fields as null and filled fields as numbers', async () => {
    const createdPayloads: any[] = [];
    const service = new SeriesService({
      series: {
        findUnique: async () => ({ id: 'series-id', seriesCode: 'JOR-HL-2026', seriesName: 'Jordan Highlights', packageTemplate: null }),
      },
      booking: {
        findUnique: async () => ({
          id: 'booking-id',
          startDate: new Date('2026-05-22T00:00:00.000Z'),
          pax: 20,
          adults: 20,
          children: 0,
        }),
      },
      seriesDeparture: {
        findFirst: async () => null,
        count: async () => 1,
        create: async ({ data }: any) => {
          createdPayloads.push(data);
          return { id: 'departure-id', ...data };
        },
      },
    } as any);

    await service.addDeparture('series-id', {
      bookingId: 'booking-id',
      totalCapacity: '',
      guaranteedMinimumPax: '12',
      sharedCoachCapacity: '48',
      lowOccupancyThreshold: '',
      reservedSeats: '10',
      stopSaleThreshold: '2',
      blockedRoomInventory: '12',
      roomTypeInventory: 'DBL:8,TWN:4',
      releaseDeadline: '2026-05-20',
      stopSale: 'true',
      allotmentStatus: 'blocked',
      sharedRestaurantCapacity: '44',
    });

    assert.equal(createdPayloads[0].totalCapacity, null);
    assert.equal(createdPayloads[0].lowOccupancyThreshold, null);
    assert.equal(createdPayloads[0].guaranteedMinimumPax, 12);
    assert.equal(createdPayloads[0].sharedCoachCapacity, 48);
    assert.equal(createdPayloads[0].reservedSeats, 10);
    assert.equal(createdPayloads[0].stopSaleThreshold, 2);
    assert.equal(createdPayloads[0].hotelAllotmentsJson[0].blockedRooms, 12);
    assert.deepEqual(createdPayloads[0].hotelAllotmentsJson[0].roomTypes, [
      { roomType: 'DBL', count: 8 },
      { roomType: 'TWN', count: 4 },
    ]);
    assert.equal(createdPayloads[0].hotelAllotmentsJson[0].stopSale, true);
    assert.equal(createdPayloads[0].sharedInventoryJson.restaurantCapacity, 44);
  });

  it('returns a clear error when adding a booking already linked to a departure', async () => {
    const service = new SeriesService({
      series: {
        findUnique: async () => ({ id: 'series-id', seriesCode: 'JOR-HL-2026', seriesName: 'Jordan Highlights', packageTemplate: null }),
      },
      booking: {
        findUnique: async () => ({ id: 'booking-id', pax: 20, adults: 20, children: 0 }),
      },
      seriesDeparture: {
        findFirst: async () => ({ id: 'existing-departure-id', departureCode: 'JOR-HL-2026-001' }),
        count: async () => {
          throw new Error('count should not run');
        },
      },
    } as any);

    await assert.rejects(
      () => service.addDeparture('series-id', { bookingId: 'booking-id', totalCapacity: '24' }),
      (error: unknown) => error instanceof BadRequestException && error.message === 'Booking is already linked to series departure JOR-HL-2026-001',
    );
  });
});

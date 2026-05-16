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
});

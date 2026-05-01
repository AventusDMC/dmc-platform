import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export const RESET_TEST_DATA_CONFIRMATION = 'This will delete all test quotes and transport data. Continue?';

@Injectable()
export class AdminResetService {
  constructor(private readonly prisma: PrismaService) {}

  async resetTestData(confirmation: string | undefined) {
    if (confirmation !== RESET_TEST_DATA_CONFIRMATION) {
      throw new BadRequestException(RESET_TEST_DATA_CONFIRMATION);
    }

    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_TEST_DATA_RESET !== 'true') {
      throw new ForbiddenException('Test data reset is disabled in production.');
    }

    return this.prisma.$transaction(async (tx) => {
      const bookingRoomingAssignments = await tx.bookingRoomingAssignment.deleteMany({});
      const bookingRoomingEntries = await tx.bookingRoomingEntry.deleteMany({});
      const bookingPassengers = await tx.bookingPassenger.deleteMany({});
      const bookingAuditLogs = await tx.bookingAuditLog.deleteMany({});
      const vouchers = await tx.voucher.deleteMany({});
      const bookingServices = await tx.bookingService.deleteMany({});
      const bookingDays = await tx.bookingDay.deleteMany({});
      const payments = await tx.payment.deleteMany({});
      const bookings = await tx.booking.deleteMany({});

      const invoiceAuditLogs = await tx.invoiceAuditLog.deleteMany({});
      const invoices = await tx.invoice.deleteMany({});

      await tx.quote.updateMany({
        data: {
          acceptedVersionId: null,
          revisedFromId: null,
        },
      });
      const quoteItineraryDayItems = await tx.quoteItineraryDayItem.deleteMany({});
      const quoteItineraryAuditLogs = await tx.quoteItineraryAuditLog.deleteMany({});
      const quoteItineraryDays = await tx.quoteItineraryDay.deleteMany({});
      const quoteItems = await tx.quoteItem.deleteMany({});
      const quoteScenarios = await tx.quoteScenario.deleteMany({});
      const quotePricingSlabs = await tx.quotePricingSlab.deleteMany({});
      const quoteOptions = await tx.quoteOption.deleteMany({});
      const itineraryImages = await tx.itineraryImage.deleteMany({});
      const itineraries = await tx.itinerary.deleteMany({});
      const quoteVersions = await tx.quoteVersion.deleteMany({});
      const quotes = await tx.quote.deleteMany({});

      const transportPricingRules = await tx.transportPricingRule.deleteMany({});
      const vehicleRates = await tx.vehicleRate.deleteMany({});

      return {
        confirmation: RESET_TEST_DATA_CONFIRMATION,
        deleted: {
          quotes: quotes.count,
          quoteItems: quoteItems.count,
          quoteOptions: quoteOptions.count,
          quoteVersions: quoteVersions.count,
          quotePricingSlabs: quotePricingSlabs.count,
          quoteScenarios: quoteScenarios.count,
          quoteItineraryDays: quoteItineraryDays.count,
          quoteItineraryDayItems: quoteItineraryDayItems.count,
          quoteItineraryAuditLogs: quoteItineraryAuditLogs.count,
          itineraries: itineraries.count,
          itineraryImages: itineraryImages.count,
          bookings: bookings.count,
          bookingItems: bookingServices.count,
          bookingDays: bookingDays.count,
          bookingPassengers: bookingPassengers.count,
          bookingRoomingEntries: bookingRoomingEntries.count,
          bookingRoomingAssignments: bookingRoomingAssignments.count,
          bookingAuditLogs: bookingAuditLogs.count,
          vouchers: vouchers.count,
          payments: payments.count,
          invoices: invoices.count,
          invoiceAuditLogs: invoiceAuditLogs.count,
          vehicleRates: vehicleRates.count,
          transportPricingRules: transportPricingRules.count,
        },
        kept: ['users', 'suppliers', 'vehicles', 'service types'],
      };
    });
  }
}

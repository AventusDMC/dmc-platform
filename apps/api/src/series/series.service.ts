import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, BookingServiceLifecycleStatus, BookingServiceStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type SeriesInput = {
  seriesCode: string;
  seriesName: string;
  active?: boolean | null;
  recurringSchedule?: string | null;
  destinationCountry?: string | null;
  operationalNotes?: string | null;
  packageTemplateId?: string | null;
};

type DepartureInput = {
  bookingId: string;
  departureCode?: string | null;
  departureDate?: string | null;
  paxCount?: number | string | null;
  lowOccupancyThreshold?: number | string | null;
  operationalNotes?: string | null;
};

type CloneDepartureInput = {
  departureDate?: string | null;
  departureCode?: string | null;
  paxCount?: number | string | null;
  lowOccupancyThreshold?: number | string | null;
  operationalNotes?: string | null;
  cloneRooming?: boolean | null;
};

@Injectable()
export class SeriesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return (this.prisma.series as any).findMany({
      include: this.seriesInclude(),
      orderBy: [{ active: 'desc' }, { seriesCode: 'asc' }],
    });
  }

  async findOne(id: string) {
    const series = await (this.prisma.series as any).findUnique({
      where: { id },
      include: this.seriesInclude(),
    });
    if (!series) throw new NotFoundException('Series not found');
    return series;
  }

  create(data: SeriesInput) {
    return (this.prisma.series as any).create({
      data: {
        seriesCode: this.required(data.seriesCode, 'Series code is required'),
        seriesName: this.required(data.seriesName, 'Series name is required'),
        active: data.active === undefined || data.active === null ? true : Boolean(data.active),
        recurringSchedule: this.optional(data.recurringSchedule),
        destinationCountry: this.optional(data.destinationCountry),
        operationalNotes: this.optional(data.operationalNotes),
        packageTemplateId: this.optional(data.packageTemplateId),
      },
      include: this.seriesInclude(),
    });
  }

  async update(id: string, data: Partial<SeriesInput>) {
    await this.findOne(id);
    return (this.prisma.series as any).update({
      where: { id },
      data: {
        seriesCode: data.seriesCode === undefined ? undefined : this.required(data.seriesCode, 'Series code is required'),
        seriesName: data.seriesName === undefined ? undefined : this.required(data.seriesName, 'Series name is required'),
        active: data.active === undefined || data.active === null ? undefined : Boolean(data.active),
        recurringSchedule: data.recurringSchedule === undefined ? undefined : this.optional(data.recurringSchedule),
        destinationCountry: data.destinationCountry === undefined ? undefined : this.optional(data.destinationCountry),
        operationalNotes: data.operationalNotes === undefined ? undefined : this.optional(data.operationalNotes),
        packageTemplateId: data.packageTemplateId === undefined ? undefined : this.optional(data.packageTemplateId),
      },
      include: this.seriesInclude(),
    });
  }

  async addDeparture(seriesId: string, data: DepartureInput) {
    const series = await this.findOne(seriesId);
    const booking = await this.prisma.booking.findUnique({ where: { id: this.required(data.bookingId, 'Booking is required') } });
    if (!booking) throw new NotFoundException('Booking not found');

    const departureCount = await this.prisma.seriesDeparture.count({ where: { seriesId } });

    return this.prisma.seriesDeparture.create({
      data: {
        seriesId,
        bookingId: booking.id,
        departureCode: this.optional(data.departureCode) || `${series.seriesCode}-${departureCount + 1}`,
        departureDate: this.dateOrNull(data.departureDate) || booking.startDate,
        paxCount: this.nonNegativeInt(data.paxCount, booking.pax || booking.adults + booking.children || 0) ?? 0,
        lowOccupancyThreshold: this.nonNegativeInt(data.lowOccupancyThreshold, undefined),
        operationalNotes: this.optional(data.operationalNotes),
        templateSnapshotJson: this.buildTemplateSnapshot(series) as Prisma.InputJsonValue,
      },
      include: this.departureInclude(),
    });
  }

  async cloneDeparture(seriesId: string, departureId: string, data: CloneDepartureInput) {
    const source = await this.prisma.seriesDeparture.findFirst({
      where: { id: departureId, seriesId },
      include: {
        series: { include: { packageTemplate: { include: { days: true, components: true } } } },
        booking: {
          include: {
            days: { orderBy: [{ dayNumber: 'asc' }, { id: 'asc' }] },
            roomingEntries: { include: { assignments: true }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
            services: { orderBy: [{ serviceOrder: 'asc' }, { id: 'asc' }] },
          },
        },
      },
    });
    if (!source) throw new NotFoundException('Series departure not found');

    const targetStartDate = this.dateOrNull(data.departureDate) || source.booking.startDate || source.departureDate;
    const sourceStartDate = source.booking.startDate || source.departureDate;
    const shiftMs = targetStartDate && sourceStartDate ? targetStartDate.getTime() - sourceStartDate.getTime() : 0;
    const paxCount = this.nonNegativeInt(data.paxCount, source.paxCount || source.booking.pax || source.booking.adults + source.booking.children || 0) ?? 0;

    return this.prisma.$transaction(async (tx) => {
      const clonedBooking = await tx.booking.create({
        data: {
          bookingRef: await this.nextBookingRef(tx),
          accessToken: this.randomToken(),
          quoteId: source.booking.quoteId,
          acceptedVersionId: source.booking.acceptedVersionId,
          clientCompanyId: source.booking.clientCompanyId,
          bookingType: source.booking.bookingType,
          status: source.booking.status,
          clientInvoiceStatus: source.booking.clientInvoiceStatus,
          supplierPaymentStatus: source.booking.supplierPaymentStatus,
          statusNote: source.booking.statusNote,
          snapshotJson: source.booking.snapshotJson,
          clientSnapshotJson: source.booking.clientSnapshotJson,
          brandSnapshotJson: source.booking.brandSnapshotJson ?? Prisma.JsonNull,
          contactSnapshotJson: source.booking.contactSnapshotJson,
          itinerarySnapshotJson: source.booking.itinerarySnapshotJson,
          pricingSnapshotJson: source.booking.pricingSnapshotJson,
          adults: paxCount,
          children: 0,
          pax: paxCount,
          roomCount: source.booking.roomCount,
          nightCount: source.booking.nightCount,
          startDate: this.shiftDate(source.booking.startDate, shiftMs),
          endDate: this.shiftDate(source.booking.endDate, shiftMs),
        } as any,
      });

      const dayIds = new Map<string, string>();
      for (const day of source.booking.days || []) {
        const clonedDay = await tx.bookingDay.create({
          data: {
            bookingId: clonedBooking.id,
            dayNumber: day.dayNumber,
            date: this.shiftDate(day.date, shiftMs),
            title: day.title,
            notes: day.notes,
            status: 'PENDING',
          },
        });
        dayIds.set(day.id, clonedDay.id);
      }

      if (data.cloneRooming) {
        for (const room of source.booking.roomingEntries || []) {
          await tx.bookingRoomingEntry.create({
            data: {
              bookingId: clonedBooking.id,
              roomType: room.roomType,
              occupancy: room.occupancy,
              notes: room.notes,
              sortOrder: room.sortOrder,
            },
          });
        }
      }

      for (const service of source.booking.services || []) {
        await tx.bookingService.create({
          data: this.cloneServiceData(service, clonedBooking.id, dayIds.get(service.bookingDayId || '') || null, shiftMs),
        });
      }

      const departure = await tx.seriesDeparture.create({
        data: {
          seriesId,
          bookingId: clonedBooking.id,
          departureCode: this.optional(data.departureCode) || `${source.series.seriesCode}-${clonedBooking.bookingRef}`,
          departureDate: targetStartDate,
          paxCount,
          lowOccupancyThreshold: this.nonNegativeInt(data.lowOccupancyThreshold, source.lowOccupancyThreshold ?? undefined),
          operationalNotes: this.optional(data.operationalNotes) || source.operationalNotes,
          templateSnapshotJson: this.buildTemplateSnapshot(source.series) as Prisma.InputJsonValue,
        },
        include: this.departureInclude(),
      });

      return departure;
    });
  }

  async regenerateOperationalServices(seriesId: string, departureId: string) {
    const departure = await this.prisma.seriesDeparture.findFirst({
      where: { id: departureId, seriesId },
      include: {
        series: { include: { packageTemplate: { include: { days: true, components: true } } } },
        booking: { include: { days: true } },
      },
    });
    if (!departure) throw new NotFoundException('Series departure not found');
    const template = departure.series.packageTemplate;
    if (!template) throw new BadRequestException('Series has no shared operational template');

    return this.prisma.$transaction(async (tx) => {
      await tx.bookingService.deleteMany({ where: { bookingId: departure.bookingId } });
      const dayByNumber = new Map<number, string>();
      for (const templateDay of template.days || []) {
        const day = await tx.bookingDay.upsert({
          where: { bookingId_dayNumber: { bookingId: departure.bookingId, dayNumber: templateDay.dayNumber } },
          update: {
            title: templateDay.title,
            notes: templateDay.description,
          },
          create: {
            bookingId: departure.bookingId,
            dayNumber: templateDay.dayNumber,
            title: templateDay.title,
            notes: templateDay.description,
            status: 'PENDING',
          },
        });
        dayByNumber.set(templateDay.dayNumber, day.id);
      }

      const components = [...(template.components || [])].sort((first: any, second: any) => first.dayNumber - second.dayNumber || first.sortOrder - second.sortOrder);
      for (const component of components) {
        if (!component.active) continue;
        const operationType = this.mapTemplateComponentToOperationType(component);
        const serviceDate = departure.departureDate ? new Date(departure.departureDate.getTime() + Math.max(component.dayNumber - 1, 0) * 24 * 60 * 60 * 1000) : null;
        await tx.bookingService.create({
          data: {
            bookingId: departure.bookingId,
            bookingDayId: dayByNumber.get(component.dayNumber) || null,
            serviceOrder: component.sortOrder,
            serviceType: operationType,
            operationType,
            operationStatus: 'PENDING',
            description: component.label,
            notes: component.operationalNotes,
            sourceMetadata: {
              seriesTemplate: {
                seriesId,
                departureId,
                packageTemplateId: template.id,
                packageTemplateComponentId: component.id,
                componentType: component.componentType,
                operationalNotes: component.operationalNotes,
              },
            },
            referenceId: component.routeId || component.touringRouteId || component.activityId || component.supplierServiceId || null,
            activityId: component.activityId,
            touringRouteId: component.touringRouteId,
            serviceDate,
            qty: 1,
            unitCost: 0,
            unitSell: 0,
            totalCost: 0,
            totalSell: 0,
            status: BookingServiceLifecycleStatus.pending,
            confirmationStatus: BookingServiceStatus.pending,
            participantCount: departure.paxCount,
          } as any,
        });
      }

      await tx.seriesDeparture.update({
        where: { id: departure.id },
        data: { templateSnapshotJson: this.buildTemplateSnapshot(departure.series) as Prisma.InputJsonValue },
      });

      return this.findOne(seriesId);
    });
  }

  private cloneServiceData(service: any, bookingId: string, bookingDayId: string | null, shiftMs: number) {
    return {
      bookingId,
      bookingDayId,
      sourceQuoteItemId: service.sourceQuoteItemId,
      activityId: service.activityId,
      touringRouteId: service.touringRouteId,
      touringRoutePricingId: service.touringRoutePricingId,
      sourceMetadata: service.sourceMetadata ?? Prisma.JsonNull,
      serviceOrder: service.serviceOrder,
      serviceType: service.serviceType,
      operationType: service.operationType,
      operationStatus: 'PENDING',
      referenceId: service.referenceId,
      assignedTo: service.assignedTo,
      guidePhone: service.guidePhone,
      guideId: service.guideId,
      guideConfirmationStatus: 'PENDING',
      guideRequiredLanguages: service.guideRequiredLanguages || [],
      guideReportingTime: service.guideReportingTime,
      restaurantId: service.restaurantId,
      mealConfirmationStatus: 'PENDING',
      mealTiming: service.mealTiming,
      mealSeatingNotes: service.mealSeatingNotes,
      mealDietaryRequirements: service.mealDietaryRequirements || [],
      mealOperationalNotes: service.mealOperationalNotes,
      vehicleId: service.vehicleId,
      serviceDate: this.shiftDate(service.serviceDate, shiftMs),
      startTime: service.startTime,
      pickupTime: service.pickupTime,
      pickupLocation: service.pickupLocation,
      meetingPoint: service.meetingPoint,
      participantCount: service.participantCount,
      adultCount: service.adultCount,
      childCount: service.childCount,
      supplierReference: null,
      supplierConfirmationStatus: 'NOT_SENT',
      confirmationSentAt: null,
      supplierConfirmedAt: null,
      supplierRemarks: null,
      confirmationDeadline: this.shiftDate(service.confirmationDeadline, shiftMs),
      lastSupplierContactAt: null,
      reconfirmationRequired: service.reconfirmationRequired,
      reconfirmationDueAt: this.shiftDate(service.reconfirmationDueAt, shiftMs),
      description: service.description,
      notes: service.notes,
      qty: service.qty,
      unitCost: service.unitCost,
      unitSell: service.unitSell,
      totalCost: service.totalCost,
      totalSell: service.totalSell,
      status: BookingServiceLifecycleStatus.pending,
      supplierId: service.supplierId,
      supplierName: service.supplierName,
      confirmationStatus: BookingServiceStatus.pending,
      confirmationNumber: null,
      confirmationNotes: null,
      statusNote: null,
      confirmationRequestedAt: null,
      confirmationConfirmedAt: null,
    } as any;
  }

  private mapTemplateComponentToOperationType(component: any) {
    const text = [component.componentType, component.label, component.operationalNotes].filter(Boolean).join(' ').toLowerCase();
    if (component.componentType === 'HOTEL') return 'HOTEL';
    if (component.componentType === 'TRANSPORT') return 'TRANSPORT';
    if (text.includes('guide') || text.includes('escort')) return 'GUIDE';
    if (text.includes('meal') || text.includes('dining') || text.includes('restaurant') || text.includes('lunch') || text.includes('dinner')) return 'DINING';
    if (['EXCURSION_TEMPLATE', 'ACTIVITY', 'TICKET'].includes(component.componentType)) return 'ACTIVITY';
    return 'SERVICE';
  }

  private buildTemplateSnapshot(series: any) {
    return {
      packageTemplateId: series.packageTemplateId || series.packageTemplate?.id || null,
      packageTemplateName: series.packageTemplate?.name || null,
      days: series.packageTemplate?.days?.length || 0,
      components: series.packageTemplate?.components?.length || 0,
    };
  }

  private seriesInclude() {
    return {
      packageTemplate: { include: { days: true, components: true } },
      departures: { include: this.departureInclude(), orderBy: [{ departureDate: 'asc' }, { createdAt: 'asc' }] },
    };
  }

  private departureInclude() {
    return {
      booking: {
        select: {
          id: true,
          bookingRef: true,
          status: true,
          startDate: true,
          endDate: true,
          pax: true,
          roomCount: true,
          passengers: { select: { id: true } },
          roomingEntries: { select: { id: true } },
          vouchers: { select: { id: true, status: true } },
          services: { select: { id: true, operationStatus: true, supplierConfirmationStatus: true } },
        },
      },
    };
  }

  private shiftDate(value: Date | string | null | undefined, shiftMs: number) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return new Date(date.getTime() + shiftMs);
  }

  private dateOrNull(value: string | Date | null | undefined) {
    if (!value) return null;
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) throw new BadRequestException('Invalid date value');
    return parsed;
  }

  private nonNegativeInt(value: number | string | null | undefined, fallback: number | undefined) {
    if (value === undefined || value === null || value === '') return fallback;
    const numeric = Number(value);
    if (!Number.isInteger(numeric) || numeric < 0) throw new BadRequestException('Value must be a non-negative integer');
    return numeric;
  }

  private optional(value: string | null | undefined) {
    const normalized = String(value || '').trim();
    return normalized || null;
  }

  private required(value: string | null | undefined, message: string) {
    const normalized = this.optional(value);
    if (!normalized) throw new BadRequestException(message);
    return normalized;
  }

  private async nextBookingRef(tx: any) {
    const count = await tx.booking.count();
    return `BK-${String(count + 1).padStart(5, '0')}`;
  }

  private randomToken() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

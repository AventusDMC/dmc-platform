import { BadRequestException, Injectable } from '@nestjs/common';
import { requireActorCompanyId, type CompanyScopedActor } from '../auth/company-scope';
import { normalizeOptionalString, requireTrimmedString, throwIfNotFound } from '../common/crud.helpers';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateQuoteItineraryDayDto,
  CreateQuoteItineraryDayItemDto,
  QuoteItineraryAuditActor,
  UpdateQuoteItineraryDayDto,
  UpdateQuoteItineraryDayItemDto,
} from './quote-itinerary.dto';

@Injectable()
export class QuoteItineraryService {
  constructor(private readonly prisma: PrismaService) {}

  private get dayModel() {
    return (this.prisma as any).quoteItineraryDay;
  }

  private get dayItemModel() {
    return (this.prisma as any).quoteItineraryDayItem;
  }

  private get auditLogModel() {
    return (this.prisma as any).quoteItineraryAuditLog;
  }

  async findByQuoteId(quoteId: string, actor: CompanyScopedActor) {
    await this.ensureQuoteExists(quoteId, actor);

    const days = await this.dayModel.findMany({
      where: { quoteId },
      include: {
        dayItems: {
          where: {
            isActive: true,
          },
          include: {
            quoteService: {
              include: {
                service: {
                  include: {
                    serviceType: true,
                  },
                },
                hotel: true,
                contract: true,
                roomCategory: true,
                option: true,
                appliedVehicleRate: {
                  include: {
                    vehicle: true,
                    serviceType: true,
                  },
                },
              },
            },
          },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { dayNumber: 'asc' }, { createdAt: 'asc' }],
    });

    return {
      quoteId,
      days: (days || []).map((day: any) => this.serializeDay(day)),
    };
  }

  async createDay(quoteId: string, data: CreateQuoteItineraryDayDto, actor?: QuoteItineraryAuditActor) {
    await this.ensureQuoteExists(quoteId);
    const normalized = this.normalizeDayInput(data);
    const requiredActor = this.requireActor(actor);

    const createdDay = await this.prisma.$transaction(async (tx) => {
      const txDayModel = (tx as any).quoteItineraryDay;
      const existingDays = await txDayModel.findMany({
        where: { quoteId },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });

      if (existingDays.some((day: any) => day.dayNumber === normalized.dayNumber)) {
        throw new BadRequestException(`Day ${normalized.dayNumber} already exists for this quote`);
      }

      const created = await txDayModel.create({
        data: {
          quoteId,
          dayNumber: normalized.dayNumber,
          title: normalized.title,
          notes: normalized.notes,
          isActive: normalized.isActive,
          sortOrder: existingDays.length,
        },
      });

      await this.resequenceDays(tx, quoteId, this.insertIdAtPosition(existingDays.map((day: any) => day.id), created.id, normalized.sortOrder));
      await this.writeAuditLog(tx, {
        quoteId,
        dayId: created.id,
        action: 'DAY_CREATED',
        oldValue: null,
        newValue: this.formatDaySummary(created),
        actor: requiredActor,
      });

      return created;
    });

    return this.findDayOrThrow(createdDay.id);
  }

  async updateDay(dayId: string, data: UpdateQuoteItineraryDayDto, actor?: QuoteItineraryAuditActor) {
    const existing = await this.findDayOrThrow(dayId);
    const requiredActor = this.requireActor(actor);
    const normalized = this.normalizeDayUpdateInput(data, existing);

    const updatedDay = await this.prisma.$transaction(async (tx) => {
      const txDayModel = (tx as any).quoteItineraryDay;
      const siblings = await txDayModel.findMany({
        where: { quoteId: existing.quoteId },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });

      if (siblings.some((day: any) => day.id !== dayId && day.dayNumber === normalized.dayNumber)) {
        throw new BadRequestException(`Day ${normalized.dayNumber} already exists for this quote`);
      }

      const updated = await txDayModel.update({
        where: { id: dayId },
        data: {
          dayNumber: normalized.dayNumber,
          title: normalized.title,
          notes: normalized.notes,
          isActive: normalized.isActive,
        },
      });

      const siblingIds = siblings.filter((day: any) => day.id !== dayId).map((day: any) => day.id);
      await this.resequenceDays(tx, existing.quoteId, this.insertIdAtPosition(siblingIds, dayId, normalized.sortOrder));
      await this.writeAuditLog(tx, {
        quoteId: existing.quoteId,
        dayId,
        action: 'DAY_UPDATED',
        oldValue: this.formatDaySummary(existing),
        newValue: this.formatDaySummary(updated),
        actor: requiredActor,
      });

      return updated;
    });

    return this.findDayOrThrow(updatedDay.id);
  }

  async removeDay(dayId: string, actor?: QuoteItineraryAuditActor) {
    const existing = await this.findDayOrThrow(dayId);
    const requiredActor = this.requireActor(actor);

    await this.prisma.$transaction(async (tx) => {
      const txDayModel = (tx as any).quoteItineraryDay;
      const siblings = await txDayModel.findMany({
        where: { quoteId: existing.quoteId },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });

      await txDayModel.delete({
        where: { id: dayId },
      });

      await this.resequenceDays(
        tx,
        existing.quoteId,
        siblings.filter((day: any) => day.id !== dayId).map((day: any) => day.id),
      );
      await this.writeAuditLog(tx, {
        quoteId: existing.quoteId,
        dayId,
        action: 'DAY_DELETED',
        oldValue: this.formatDaySummary(existing),
        newValue: null,
        actor: requiredActor,
      });
    });

    return { id: dayId };
  }

  async createDayItem(dayId: string, data: CreateQuoteItineraryDayItemDto, actor?: QuoteItineraryAuditActor) {
    const day = await this.findDayOrThrow(dayId);
    const normalized = this.normalizeDayItemInput(data);
    const requiredActor = this.requireActor(actor);
    const quoteService = await this.findQuoteServiceOrThrow(normalized.quoteServiceId);
    this.assertQuoteServiceBelongsToQuote(quoteService, day.quoteId);

    const createdItem = await this.prisma.$transaction(async (tx) => {
      const txDayItemModel = (tx as any).quoteItineraryDayItem;
      const existingItems = await txDayItemModel.findMany({
        where: { dayId },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });
      const duplicateAssignment = await txDayItemModel.findFirst({
        where: {
          dayId,
          quoteServiceId: normalized.quoteServiceId,
        },
      });

      if (duplicateAssignment) {
        throw new BadRequestException('This quote service is already assigned to the selected itinerary day');
      }

      const created = await txDayItemModel.create({
        data: {
          dayId,
          quoteServiceId: normalized.quoteServiceId,
          notes: normalized.notes,
          isActive: normalized.isActive,
          sortOrder: existingItems.length,
        },
      });

      await this.resequenceDayItems(
        tx,
        dayId,
        this.insertIdAtPosition(existingItems.map((item: any) => item.id), created.id, normalized.sortOrder),
      );
      await this.writeAuditLog(tx, {
        quoteId: day.quoteId,
        dayId,
        itemId: created.id,
        action: 'ITEM_ADDED',
        oldValue: null,
        newValue: this.formatDayItemSummary({
          id: created.id,
          notes: created.notes,
          isActive: created.isActive,
          sortOrder: created.sortOrder,
          quoteService,
        }),
        actor: requiredActor,
      });

      return created;
    });

    return this.findDayItemOrThrow(dayId, createdItem.id);
  }

  async updateDayItem(dayId: string, itemId: string, data: UpdateQuoteItineraryDayItemDto, actor?: QuoteItineraryAuditActor) {
    const existing = await this.findDayItemOrThrow(dayId, itemId);
    const day = existing.day;
    const requiredActor = this.requireActor(actor);
    const normalized = this.normalizeDayItemUpdateInput(data, existing);
    const quoteService =
      normalized.quoteServiceId === existing.quoteServiceId
        ? existing.quoteService
        : await this.findQuoteServiceOrThrow(normalized.quoteServiceId);
    this.assertQuoteServiceBelongsToQuote(quoteService, day.quoteId);

    const updatedItem = await this.prisma.$transaction(async (tx) => {
      const txDayItemModel = (tx as any).quoteItineraryDayItem;
      const siblings = await txDayItemModel.findMany({
        where: { dayId },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });
      const duplicateAssignment = await txDayItemModel.findFirst({
        where: {
          dayId,
          quoteServiceId: normalized.quoteServiceId,
          id: { not: itemId },
        },
      });

      if (duplicateAssignment) {
        throw new BadRequestException('This quote service is already assigned to the selected itinerary day');
      }

      const updated = await txDayItemModel.update({
        where: { id: itemId },
        data: {
          quoteServiceId: normalized.quoteServiceId,
          notes: normalized.notes,
          isActive: normalized.isActive,
        },
      });

      const siblingIds = siblings.filter((item: any) => item.id !== itemId).map((item: any) => item.id);
      await this.resequenceDayItems(tx, dayId, this.insertIdAtPosition(siblingIds, itemId, normalized.sortOrder));
      await this.writeAuditLog(tx, {
        quoteId: day.quoteId,
        dayId,
        itemId,
        action: 'ITEM_UPDATED',
        oldValue: this.formatDayItemSummary(existing),
        newValue: this.formatDayItemSummary({
          id: itemId,
          notes: updated.notes,
          isActive: updated.isActive,
          sortOrder: updated.sortOrder,
          quoteService,
        }),
        actor: requiredActor,
      });

      return updated;
    });

    return this.findDayItemOrThrow(dayId, updatedItem.id);
  }

  async removeDayItem(dayId: string, itemId: string, actor?: QuoteItineraryAuditActor) {
    const existing = await this.findDayItemOrThrow(dayId, itemId);
    const requiredActor = this.requireActor(actor);

    await this.prisma.$transaction(async (tx) => {
      const txDayItemModel = (tx as any).quoteItineraryDayItem;
      const siblings = await txDayItemModel.findMany({
        where: { dayId },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });

      await txDayItemModel.delete({
        where: { id: itemId },
      });

      await this.resequenceDayItems(
        tx,
        dayId,
        siblings.filter((item: any) => item.id !== itemId).map((item: any) => item.id),
      );
      await this.writeAuditLog(tx, {
        quoteId: existing.day.quoteId,
        dayId,
        itemId,
        action: 'ITEM_REMOVED',
        oldValue: this.formatDayItemSummary(existing),
        newValue: null,
        actor: requiredActor,
      });
    });

    return { id: itemId };
  }

  private async ensureQuoteExists(quoteId: string, actor?: CompanyScopedActor) {
    if (actor) {
      requireActorCompanyId(actor);
    }

    const quote = actor
      ? await this.prisma.quote.findFirst({
          where: {
            id: quoteId,
          },
          select: { id: true },
        })
      : await this.prisma.quote.findUnique({
          where: { id: quoteId },
          select: { id: true },
        });

    return throwIfNotFound(quote, 'Quote');
  }

  private async findDayOrThrow(dayId: string) {
    const day = await this.dayModel.findUnique({
      where: { id: dayId },
      include: {
        dayItems: {
          where: {
            isActive: true,
          },
          include: {
            quoteService: {
              include: {
                service: {
                  include: {
                    serviceType: true,
                  },
                },
                hotel: true,
                contract: true,
                roomCategory: true,
                option: true,
                appliedVehicleRate: {
                  include: {
                    vehicle: true,
                    serviceType: true,
                  },
                },
              },
            },
          },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });

    return throwIfNotFound(day, 'Quote itinerary day');
  }

  private async findDayItemOrThrow(dayId: string, itemId: string) {
    const item = await this.dayItemModel.findFirst({
      where: {
        id: itemId,
        dayId,
      },
      include: {
        day: true,
        quoteService: {
          include: {
            service: {
              include: {
                serviceType: true,
              },
            },
            hotel: true,
            contract: true,
            roomCategory: true,
            option: true,
            appliedVehicleRate: {
              include: {
                vehicle: true,
                serviceType: true,
              },
            },
          },
        },
      },
    });

    return throwIfNotFound(item, 'Quote itinerary day item');
  }

  private async findQuoteServiceOrThrow(quoteServiceId: string) {
    const quoteService = await this.prisma.quoteItem.findUnique({
      where: { id: quoteServiceId },
      include: {
        service: {
          include: {
            serviceType: true,
          },
        },
        hotel: true,
        contract: true,
        roomCategory: true,
        option: true,
        appliedVehicleRate: {
          include: {
            vehicle: true,
            serviceType: true,
          },
        },
      },
    });

    return throwIfNotFound(quoteService, 'Quote service');
  }

  private assertQuoteServiceBelongsToQuote(quoteService: any, quoteId: string) {
    if (quoteService.quoteId !== quoteId) {
      throw new BadRequestException('Quote service does not belong to the selected quote');
    }
  }

  private normalizeDayInput(data: CreateQuoteItineraryDayDto) {
    const dayNumber = Number(data.dayNumber);
    const sortOrder = data.sortOrder === undefined ? undefined : Number(data.sortOrder);

    if (!Number.isInteger(dayNumber) || dayNumber < 1) {
      throw new BadRequestException('dayNumber must be a positive whole number');
    }

    if (sortOrder !== undefined && (!Number.isInteger(sortOrder) || sortOrder < 0)) {
      throw new BadRequestException('sortOrder must be zero or greater');
    }

    return {
      dayNumber,
      title: requireTrimmedString(data.title, 'title'),
      notes: normalizeOptionalString(data.notes),
      sortOrder,
      isActive: data.isActive ?? true,
    };
  }

  private normalizeDayUpdateInput(data: UpdateQuoteItineraryDayDto, existing: any) {
    const nextDayNumber = data.dayNumber === undefined ? existing.dayNumber : Number(data.dayNumber);
    const nextSortOrder = data.sortOrder === undefined ? existing.sortOrder : Number(data.sortOrder);

    if (!Number.isInteger(nextDayNumber) || nextDayNumber < 1) {
      throw new BadRequestException('dayNumber must be a positive whole number');
    }

    if (!Number.isInteger(nextSortOrder) || nextSortOrder < 0) {
      throw new BadRequestException('sortOrder must be zero or greater');
    }

    return {
      dayNumber: nextDayNumber,
      title: data.title === undefined ? existing.title : requireTrimmedString(data.title, 'title'),
      notes: data.notes === undefined ? existing.notes : normalizeOptionalString(data.notes),
      sortOrder: nextSortOrder,
      isActive: data.isActive ?? existing.isActive,
    };
  }

  private normalizeDayItemInput(data: CreateQuoteItineraryDayItemDto) {
    const sortOrder = data.sortOrder === undefined ? undefined : Number(data.sortOrder);

    if (sortOrder !== undefined && (!Number.isInteger(sortOrder) || sortOrder < 0)) {
      throw new BadRequestException('sortOrder must be zero or greater');
    }

    return {
      quoteServiceId: requireTrimmedString(data.quoteServiceId, 'quoteServiceId'),
      sortOrder,
      notes: normalizeOptionalString(data.notes),
      isActive: data.isActive ?? true,
    };
  }

  private normalizeDayItemUpdateInput(data: UpdateQuoteItineraryDayItemDto, existing: any) {
    const nextSortOrder = data.sortOrder === undefined ? existing.sortOrder : Number(data.sortOrder);

    if (!Number.isInteger(nextSortOrder) || nextSortOrder < 0) {
      throw new BadRequestException('sortOrder must be zero or greater');
    }

    return {
      quoteServiceId:
        data.quoteServiceId === undefined ? existing.quoteServiceId : requireTrimmedString(data.quoteServiceId, 'quoteServiceId'),
      sortOrder: nextSortOrder,
      notes: data.notes === undefined ? existing.notes : normalizeOptionalString(data.notes),
      isActive: data.isActive ?? existing.isActive,
    };
  }

  private insertIdAtPosition(ids: string[], id: string, requestedPosition?: number) {
    const nextIds = [...ids];
    const nextIndex = requestedPosition === undefined ? nextIds.length : Math.max(0, Math.min(requestedPosition, nextIds.length));
    nextIds.splice(nextIndex, 0, id);
    return nextIds;
  }

  private async resequenceDays(tx: any, quoteId: string, orderedIds: string[]) {
    await Promise.all(
      orderedIds.map((id, index) =>
        (tx as any).quoteItineraryDay.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );

    const remainingDays = await (tx as any).quoteItineraryDay.findMany({
      where: { quoteId },
      select: { id: true },
    });

    const remainingIds = new Set(orderedIds);
    const unsortedIds = remainingDays
      .map((day: any) => day.id)
      .filter((id: string) => !remainingIds.has(id));

    await Promise.all(
      unsortedIds.map((id: string, offset: number) =>
        (tx as any).quoteItineraryDay.update({
          where: { id },
          data: { sortOrder: orderedIds.length + offset },
        }),
      ),
    );
  }

  private async resequenceDayItems(tx: any, dayId: string, orderedIds: string[]) {
    await Promise.all(
      orderedIds.map((id, index) =>
        (tx as any).quoteItineraryDayItem.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );

    const remainingItems = await (tx as any).quoteItineraryDayItem.findMany({
      where: { dayId },
      select: { id: true },
    });

    const remainingIds = new Set(orderedIds);
    const unsortedIds = remainingItems
      .map((item: any) => item.id)
      .filter((id: string) => !remainingIds.has(id));

    await Promise.all(
      unsortedIds.map((id: string, offset: number) =>
        (tx as any).quoteItineraryDayItem.update({
          where: { id },
          data: { sortOrder: orderedIds.length + offset },
        }),
      ),
    );
  }

  private requireActor(actor?: QuoteItineraryAuditActor) {
    if (!actor?.id) {
      throw new BadRequestException('Authenticated actor is required for audited writes');
    }

    return actor;
  }

  private async writeAuditLog(
    prismaClient: any,
    data: {
      quoteId: string;
      dayId?: string | null;
      itemId?: string | null;
      action: string;
      oldValue: string | null;
      newValue: string | null;
      actor: NonNullable<QuoteItineraryAuditActor>;
    },
  ) {
    await prismaClient.quoteItineraryAuditLog.create({
      data: {
        quoteId: data.quoteId,
        dayId: data.dayId ?? null,
        itemId: data.itemId ?? null,
        action: data.action,
        oldValue: data.oldValue,
        newValue: data.newValue,
        actorUserId: data.actor.id,
        actor: data.actor.auditLabel || null,
      },
    });
  }

  private serializeDay(day: any) {
    return {
      id: day.id,
      quoteId: day.quoteId,
      dayNumber: day.dayNumber,
      title: day.title,
      notes: day.notes,
      sortOrder: day.sortOrder,
      isActive: day.isActive,
      createdAt: day.createdAt,
      updatedAt: day.updatedAt,
      dayItems: (day.dayItems || []).map((item: any) => this.serializeDayItem(item)),
    };
  }

  private serializeDayItem(item: any) {
    return {
      id: item.id,
      dayId: item.dayId,
      quoteServiceId: item.quoteServiceId,
      sortOrder: item.sortOrder,
      notes: item.notes,
      isActive: item.isActive,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      quoteService: this.serializeQuoteServiceSummary(item.quoteService),
    };
  }

  private serializeQuoteServiceSummary(quoteService: any) {
    if (!quoteService) {
      return null;
    }

    return {
      id: quoteService.id,
      quoteId: quoteService.quoteId,
      optionId: quoteService.optionId,
      serviceDate: quoteService.serviceDate,
      startTime: quoteService.startTime,
      pickupTime: quoteService.pickupTime,
      pickupLocation: quoteService.pickupLocation,
      meetingPoint: quoteService.meetingPoint,
      quantity: quoteService.quantity,
      paxCount: quoteService.paxCount,
      participantCount: quoteService.participantCount,
      adultCount: quoteService.adultCount,
      childCount: quoteService.childCount,
      roomCount: quoteService.roomCount,
      nightCount: quoteService.nightCount,
      dayCount: quoteService.dayCount,
      pricingDescription: quoteService.pricingDescription,
      reconfirmationRequired: quoteService.reconfirmationRequired,
      reconfirmationDueAt: quoteService.reconfirmationDueAt,
      service: quoteService.service
        ? {
            id: quoteService.service.id,
            name: quoteService.service.name,
            category: quoteService.service.category,
            serviceType: quoteService.service.serviceType
              ? {
                  id: quoteService.service.serviceType.id,
                  name: quoteService.service.serviceType.name,
                  code: quoteService.service.serviceType.code,
                }
              : null,
          }
        : null,
      hotel: quoteService.hotel
        ? {
            id: quoteService.hotel.id,
            name: quoteService.hotel.name,
            city: quoteService.hotel.city,
          }
        : null,
      contract: quoteService.contract
        ? {
            id: quoteService.contract.id,
            name: quoteService.contract.name,
            validFrom: quoteService.contract.validFrom,
            validTo: quoteService.contract.validTo,
            currency: quoteService.contract.currency,
          }
        : null,
      roomCategory: quoteService.roomCategory
        ? {
            id: quoteService.roomCategory.id,
            name: quoteService.roomCategory.name,
            code: quoteService.roomCategory.code,
          }
        : null,
      appliedVehicleRate: quoteService.appliedVehicleRate
        ? {
            id: quoteService.appliedVehicleRate.id,
            routeName: quoteService.appliedVehicleRate.routeName,
            vehicle: quoteService.appliedVehicleRate.vehicle
              ? {
                  id: quoteService.appliedVehicleRate.vehicle.id,
                  name: quoteService.appliedVehicleRate.vehicle.name,
                }
              : null,
            serviceType: quoteService.appliedVehicleRate.serviceType
              ? {
                  id: quoteService.appliedVehicleRate.serviceType.id,
                  name: quoteService.appliedVehicleRate.serviceType.name,
                  code: quoteService.appliedVehicleRate.serviceType.code,
                }
              : null,
          }
        : null,
    };
  }

  private formatDaySummary(day: { dayNumber: number; title: string; isActive?: boolean; sortOrder?: number } | null) {
    if (!day) {
      return null;
    }

    return `Day ${day.dayNumber} | ${day.title} | ${day.isActive === false ? 'Inactive' : 'Active'} | sort ${day.sortOrder ?? 0}`;
  }

  private formatDayItemSummary(item: { id?: string; notes?: string | null; isActive?: boolean; sortOrder?: number; quoteService?: any } | null) {
    if (!item?.quoteService) {
      return null;
    }

    const serviceName = item.quoteService.service?.name || 'Quote service';
    const serviceDate = item.quoteService.serviceDate ? new Date(item.quoteService.serviceDate).toISOString().slice(0, 10) : 'no-date';
    return `${serviceName} | ${serviceDate} | ${item.isActive === false ? 'Inactive' : 'Active'} | sort ${item.sortOrder ?? 0}${item.notes ? ` | ${item.notes}` : ''}`;
  }
}

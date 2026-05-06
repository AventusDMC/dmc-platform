import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type JsonInput = unknown;

function parseDate(value: unknown, field: string) {
  const date = new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`${field} must be a valid date`);
  }
  return date;
}

function optionalDate(value: unknown, field: string) {
  if (value === undefined || value === null || value === '') return undefined;
  return parseDate(value, field);
}

function requiredString(value: unknown, field: string) {
  const text = String(value || '').trim();
  if (!text) {
    throw new BadRequestException(`${field} is required`);
  }
  return text;
}

function optionalString(value: unknown) {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text || null;
}

function optionalNumber(value: unknown, field: string) {
  if (value === undefined || value === null || value === '') return undefined;
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    throw new BadRequestException(`${field} must be a number`);
  }
  return numberValue;
}

function optionalInt(value: unknown, field: string) {
  const numberValue = optionalNumber(value, field);
  if (numberValue === undefined) return undefined;
  if (!Number.isInteger(numberValue)) {
    throw new BadRequestException(`${field} must be a whole number`);
  }
  return numberValue;
}

function asRowsJson(value: JsonInput) {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      throw new BadRequestException('rowsJson must be valid JSON');
    }
  }
  return value ?? [];
}

function asPricingMatrixJson(value: JsonInput) {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      throw new BadRequestException('pricingMatrixJson must be valid JSON');
    }
  }
  return value ?? [];
}

@Injectable()
export class QuoteEngineService {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma as any;
  }

  private quoteInclude() {
    return {
      segments: {
        orderBy: { orderIndex: 'asc' },
        include: {
          days: { orderBy: { dayNumber: 'asc' }, include: { services: true } },
          hotelOptionSets: { orderBy: { sortOrder: 'asc' }, include: { options: true } },
          externalPackageRequests: { include: { supplierQuotes: true } },
          pricingMatrices: true,
        },
      },
      connections: { orderBy: { orderIndex: 'asc' } },
      pricingMatrices: true,
    };
  }

  findQuotes() {
    return this.db.dmcQuote.findMany({
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
      include: {
        segments: { orderBy: { orderIndex: 'asc' } },
        connections: true,
        pricingMatrices: true,
      },
    });
  }

  async findQuote(id: string) {
    const quote = await this.db.dmcQuote.findUnique({ where: { id }, include: this.quoteInclude() });
    if (!quote) {
      throw new NotFoundException('Quote engine quote not found');
    }
    return quote;
  }

  createQuote(body: any) {
    return this.db.dmcQuote.create({
      data: {
        clientName: requiredString(body.clientName, 'clientName'),
        title: requiredString(body.title, 'title'),
        startDate: parseDate(body.startDate, 'startDate'),
        endDate: parseDate(body.endDate, 'endDate'),
        currency: requiredString(body.currency || 'USD', 'currency').toUpperCase(),
        status: String(body.status || 'DRAFT').trim() || 'DRAFT',
      },
      include: this.quoteInclude(),
    });
  }

  async updateQuote(id: string, body: any) {
    await this.findQuote(id);
    return this.db.dmcQuote.update({
      where: { id },
      data: {
        clientName: body.clientName === undefined ? undefined : requiredString(body.clientName, 'clientName'),
        title: body.title === undefined ? undefined : requiredString(body.title, 'title'),
        startDate: optionalDate(body.startDate, 'startDate'),
        endDate: optionalDate(body.endDate, 'endDate'),
        currency: body.currency === undefined ? undefined : requiredString(body.currency, 'currency').toUpperCase(),
        status: body.status === undefined ? undefined : String(body.status || 'DRAFT').trim(),
      },
      include: this.quoteInclude(),
    });
  }

  async removeQuote(id: string) {
    await this.findQuote(id);
    return this.db.dmcQuote.delete({ where: { id } });
  }

  async createSegment(quoteId: string, body: any) {
    await this.findQuote(quoteId);
    return this.db.dmcQuoteSegment.create({
      data: {
        quoteId,
        orderIndex: optionalInt(body.orderIndex, 'orderIndex') ?? 0,
        type: requiredString(body.type, 'type'),
        country: requiredString(body.country, 'country'),
        title: requiredString(body.title, 'title'),
        durationDays: optionalInt(body.durationDays, 'durationDays') ?? 1,
        startDate: optionalDate(body.startDate, 'startDate'),
        endDate: optionalDate(body.endDate, 'endDate'),
        notes: optionalString(body.notes),
      },
    });
  }

  updateSegment(id: string, body: any) {
    return this.db.dmcQuoteSegment.update({
      where: { id },
      data: {
        orderIndex: optionalInt(body.orderIndex, 'orderIndex'),
        type: body.type === undefined ? undefined : requiredString(body.type, 'type'),
        country: body.country === undefined ? undefined : requiredString(body.country, 'country'),
        title: body.title === undefined ? undefined : requiredString(body.title, 'title'),
        durationDays: optionalInt(body.durationDays, 'durationDays'),
        startDate: optionalDate(body.startDate, 'startDate'),
        endDate: optionalDate(body.endDate, 'endDate'),
        notes: optionalString(body.notes),
      },
    });
  }

  removeSegment(id: string) {
    return this.db.dmcQuoteSegment.delete({ where: { id } });
  }

  async reorderSegments(quoteId: string, segmentIds: string[]) {
    await this.findQuote(quoteId);
    if (!Array.isArray(segmentIds)) {
      throw new BadRequestException('segmentIds must be an array');
    }
    await this.db.$transaction(
      segmentIds.map((id, orderIndex) =>
        this.db.dmcQuoteSegment.update({
          where: { id },
          data: { orderIndex },
        }),
      ),
    );
    return this.findQuote(quoteId);
  }

  async createConnection(quoteId: string, body: any) {
    await this.findQuote(quoteId);
    return this.db.dmcQuoteConnection.create({
      data: {
        quoteId,
        fromSegmentId: requiredString(body.fromSegmentId, 'fromSegmentId'),
        toSegmentId: requiredString(body.toSegmentId, 'toSegmentId'),
        orderIndex: optionalInt(body.orderIndex, 'orderIndex') ?? 0,
        type: String(body.type || 'NONE'),
        description: optionalString(body.description),
        costAmount: optionalNumber(body.costAmount, 'costAmount'),
        costCurrency: optionalString(body.costCurrency),
        pricingBasis: optionalString(body.pricingBasis),
      },
    });
  }

  updateConnection(id: string, body: any) {
    return this.db.dmcQuoteConnection.update({
      where: { id },
      data: {
        fromSegmentId: body.fromSegmentId === undefined ? undefined : requiredString(body.fromSegmentId, 'fromSegmentId'),
        toSegmentId: body.toSegmentId === undefined ? undefined : requiredString(body.toSegmentId, 'toSegmentId'),
        orderIndex: optionalInt(body.orderIndex, 'orderIndex'),
        type: optionalString(body.type),
        description: optionalString(body.description),
        costAmount: optionalNumber(body.costAmount, 'costAmount'),
        costCurrency: optionalString(body.costCurrency),
        pricingBasis: optionalString(body.pricingBasis),
      },
    });
  }

  removeConnection(id: string) {
    return this.db.dmcQuoteConnection.delete({ where: { id } });
  }

  createDay(segmentId: string, body: any) {
    return this.db.dmcQuoteDay.create({
      data: {
        segmentId,
        dayNumber: optionalInt(body.dayNumber, 'dayNumber') ?? 1,
        title: requiredString(body.title, 'title'),
        description: optionalString(body.description),
        mealsIncludedText: optionalString(body.mealsIncludedText),
      },
    });
  }

  updateDay(id: string, body: any) {
    return this.db.dmcQuoteDay.update({
      where: { id },
      data: {
        dayNumber: optionalInt(body.dayNumber, 'dayNumber'),
        title: body.title === undefined ? undefined : requiredString(body.title, 'title'),
        description: optionalString(body.description),
        mealsIncludedText: optionalString(body.mealsIncludedText),
      },
    });
  }

  removeDay(id: string) {
    return this.db.dmcQuoteDay.delete({ where: { id } });
  }

  createDayService(dayId: string, body: any) {
    return this.db.dmcQuoteDayService.create({
      data: {
        dayId,
        type: requiredString(body.type, 'type'),
        title: requiredString(body.title, 'title'),
        description: optionalString(body.description),
        supplierId: optionalString(body.supplierId),
        costAmount: optionalNumber(body.costAmount, 'costAmount'),
        costCurrency: optionalString(body.costCurrency),
        pricingBasis: optionalString(body.pricingBasis),
      },
    });
  }

  updateDayService(id: string, body: any) {
    return this.db.dmcQuoteDayService.update({ where: { id }, data: body });
  }

  removeDayService(id: string) {
    return this.db.dmcQuoteDayService.delete({ where: { id } });
  }

  createHotelOptionSet(segmentId: string, body: any) {
    return this.db.dmcQuoteHotelOptionSet.create({
      data: {
        segmentId,
        name: requiredString(body.name, 'name'),
        sortOrder: optionalInt(body.sortOrder, 'sortOrder') ?? 0,
      },
    });
  }

  updateHotelOptionSet(id: string, body: any) {
    return this.db.dmcQuoteHotelOptionSet.update({ where: { id }, data: body });
  }

  removeHotelOptionSet(id: string) {
    return this.db.dmcQuoteHotelOptionSet.delete({ where: { id } });
  }

  createHotelOption(optionSetId: string, body: any) {
    return this.db.dmcQuoteHotelOption.create({
      data: {
        optionSetId,
        city: requiredString(body.city, 'city'),
        hotelId: optionalString(body.hotelId),
        hotelNameSnapshot: requiredString(body.hotelNameSnapshot, 'hotelNameSnapshot'),
        nights: optionalInt(body.nights, 'nights') ?? 1,
        roomType: requiredString(body.roomType, 'roomType'),
        mealPlan: requiredString(body.mealPlan, 'mealPlan'),
      },
    });
  }

  updateHotelOption(id: string, body: any) {
    return this.db.dmcQuoteHotelOption.update({ where: { id }, data: body });
  }

  removeHotelOption(id: string) {
    return this.db.dmcQuoteHotelOption.delete({ where: { id } });
  }

  createExternalRequest(segmentId: string, body: any) {
    return this.db.dmcExternalPackageRequest.create({
      data: {
        segmentId,
        supplierName: requiredString(body.supplierName, 'supplierName'),
        paxRange: requiredString(body.paxRange, 'paxRange'),
        hotelCategory: optionalString(body.hotelCategory),
        boardBasis: optionalString(body.boardBasis),
        itineraryText: optionalString(body.itineraryText),
        notes: optionalString(body.notes),
        status: String(body.status || 'DRAFT'),
      },
    });
  }

  updateExternalRequest(id: string, body: any) {
    return this.db.dmcExternalPackageRequest.update({ where: { id }, data: body });
  }

  removeExternalRequest(id: string) {
    return this.db.dmcExternalPackageRequest.delete({ where: { id } });
  }

  createExternalQuote(requestId: string, body: any) {
    return this.db.dmcExternalPackageQuote.create({
      data: {
        requestId,
        supplierName: requiredString(body.supplierName, 'supplierName'),
        pricingMatrixJson: asPricingMatrixJson(body.pricingMatrixJson),
        singleSupplement: optionalNumber(body.singleSupplement, 'singleSupplement'),
        includesText: optionalString(body.includesText),
        excludesText: optionalString(body.excludesText),
        notes: optionalString(body.notes),
      },
    });
  }

  updateExternalQuote(id: string, body: any) {
    return this.db.dmcExternalPackageQuote.update({
      where: { id },
      data: {
        ...body,
        pricingMatrixJson: body.pricingMatrixJson === undefined ? undefined : asPricingMatrixJson(body.pricingMatrixJson),
      },
    });
  }

  removeExternalQuote(id: string) {
    return this.db.dmcExternalPackageQuote.delete({ where: { id } });
  }

  async upsertPricingMatrix(quoteId: string, body: any) {
    await this.findQuote(quoteId);
    const id = optionalString(body.id);
    const data = {
      quoteId,
      scope: requiredString(body.scope || 'TOTAL_QUOTE', 'scope'),
      segmentId: optionalString(body.segmentId),
      rowsJson: asRowsJson(body.rowsJson),
    };

    if (id) {
      return this.db.dmcQuotePricingMatrix.update({ where: { id }, data });
    }

    return this.db.dmcQuotePricingMatrix.create({ data });
  }

  removePricingMatrix(id: string) {
    return this.db.dmcQuotePricingMatrix.delete({ where: { id } });
  }
}

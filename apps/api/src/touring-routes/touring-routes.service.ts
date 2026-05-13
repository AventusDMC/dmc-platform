import { BadRequestException, Injectable } from '@nestjs/common';
import { normalizeOptionalString, requireTrimmedString, throwIfNotFound } from '../common/crud.helpers';
import { PrismaService } from '../prisma/prisma.service';

type TouringRouteStopInput = {
  order?: number | null;
  city: string;
  location?: string | null;
  notes?: string | null;
};

type TouringRoutePricingInput = {
  supplierId?: string | null;
  vehicleId?: string | null;
  transportServiceTypeId?: string | null;
  pricingBasis?: 'PER_VEHICLE' | 'PER_DAY' | null;
  minPax?: number | null;
  maxPax?: number | null;
  currency?: string | null;
  baseCost: number;
  costPerDay?: number | null;
  includedKm?: number | null;
  includedHours?: number | null;
  extraKmRate?: number | null;
  extraHourRate?: number | null;
  validFrom?: string | Date | null;
  validTo?: string | Date | null;
  active?: boolean;
  notes?: string | null;
};

type TouringRouteInput = {
  code?: string | null;
  name: string;
  startCity: string;
  durationDays?: number | null;
  routeDescription?: string | null;
  mainDestinations?: string[] | null;
  includedKm?: number | null;
  includedHours?: number | null;
  active?: boolean;
  stops?: TouringRouteStopInput[];
  pricings?: TouringRoutePricingInput[];
};

type FindTouringRoutesInput = {
  search?: string;
  active?: boolean;
  limit?: number;
};

function normalizeCode(value: string) {
  return (
    value
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'TOURING_ROUTE'
  );
}

function normalizeOptionalNumber(value: number | null | undefined, fieldLabel: string) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) {
    throw new BadRequestException(`${fieldLabel} must be zero or greater`);
  }
  return numberValue;
}

function normalizeOptionalPositiveInteger(value: number | null | undefined, fieldLabel: string, fallback: number) {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 1) {
    throw new BadRequestException(`${fieldLabel} must be one or greater`);
  }
  return Math.floor(numberValue);
}

@Injectable()
export class TouringRoutesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters: FindTouringRoutesInput = {}) {
    const search = filters.search?.trim();
    const limit =
      filters.limit === undefined ? undefined : Math.min(Math.max(Math.trunc(Number(filters.limit) || 1), 1), 500);

    return (this.prisma as any).touringRoute.findMany({
      where: {
        ...(filters.active === undefined ? {} : { active: filters.active }),
        ...(search
          ? {
              OR: [
                { code: { contains: search, mode: 'insensitive' } },
                { name: { contains: search, mode: 'insensitive' } },
                { startCity: { contains: search, mode: 'insensitive' } },
                { routeDescription: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: this.include(),
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      ...(limit === undefined ? {} : { take: limit }),
    });
  }

  async findOne(id: string) {
    const route = await (this.prisma as any).touringRoute.findUnique({
      where: { id },
      include: this.include(),
    });

    return throwIfNotFound(route, 'Touring route');
  }

  async create(data: TouringRouteInput) {
    const normalized = this.normalizeRouteData(data);
    return (this.prisma as any).touringRoute.create({
      data: normalized,
      include: this.include(),
    });
  }

  async update(id: string, data: Partial<TouringRouteInput>) {
    await this.findOne(id);
    const normalized = this.normalizeRouteData(data, true);

    return (this.prisma as any).touringRoute.update({
      where: { id },
      data: normalized,
      include: this.include(),
    });
  }

  private include() {
    return {
      stops: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] },
      pricings: {
        include: {
          supplier: true,
          vehicle: true,
          transportServiceType: true,
        },
        orderBy: [{ active: 'desc' }, { minPax: 'asc' }, { createdAt: 'asc' }],
      },
    };
  }

  private normalizeRouteData(data: Partial<TouringRouteInput>, partial = false) {
    const name = data.name === undefined && partial ? undefined : requireTrimmedString(String(data.name || ''), 'name');
    const codeSource = data.code || name || '';
    return {
      code: data.code === undefined && partial ? undefined : normalizeCode(codeSource),
      name,
      startCity: data.startCity === undefined && partial ? undefined : requireTrimmedString(String(data.startCity || ''), 'startCity'),
      durationDays:
        data.durationDays === undefined && partial ? undefined : normalizeOptionalPositiveInteger(data.durationDays, 'durationDays', 1),
      routeDescription: data.routeDescription === undefined && partial ? undefined : normalizeOptionalString(data.routeDescription),
      mainDestinations:
        data.mainDestinations === undefined && partial
          ? undefined
          : Array.isArray(data.mainDestinations)
            ? data.mainDestinations.map(String).map((entry) => entry.trim()).filter(Boolean)
            : [],
      includedKm: data.includedKm === undefined && partial ? undefined : normalizeOptionalNumber(data.includedKm, 'includedKm'),
      includedHours:
        data.includedHours === undefined && partial ? undefined : normalizeOptionalNumber(data.includedHours, 'includedHours'),
      active: data.active === undefined ? undefined : Boolean(data.active),
      stops:
        data.stops === undefined
          ? undefined
          : {
              deleteMany: {},
              create: data.stops.map((stop, index) => ({
                order: stop.order === undefined || stop.order === null ? index + 1 : Math.floor(Number(stop.order)),
                city: requireTrimmedString(stop.city, `stops[${index}].city`),
                location: normalizeOptionalString(stop.location),
                notes: normalizeOptionalString(stop.notes),
              })),
            },
      pricings:
        data.pricings === undefined
          ? undefined
          : {
              deleteMany: {},
              create: data.pricings.map((pricing, index) => ({
                supplierId: normalizeOptionalString(pricing.supplierId),
                vehicleId: normalizeOptionalString(pricing.vehicleId),
                transportServiceTypeId: normalizeOptionalString(pricing.transportServiceTypeId),
                pricingBasis: pricing.pricingBasis || 'PER_VEHICLE',
                minPax: normalizeOptionalPositiveInteger(pricing.minPax, `pricings[${index}].minPax`, 1),
                maxPax: normalizeOptionalPositiveInteger(pricing.maxPax, `pricings[${index}].maxPax`, 99),
                currency: normalizeOptionalString(pricing.currency) || 'USD',
                baseCost: normalizeOptionalNumber(pricing.baseCost, `pricings[${index}].baseCost`) ?? 0,
                costPerDay: normalizeOptionalNumber(pricing.costPerDay, `pricings[${index}].costPerDay`),
                includedKm: normalizeOptionalNumber(pricing.includedKm, `pricings[${index}].includedKm`),
                includedHours: normalizeOptionalNumber(pricing.includedHours, `pricings[${index}].includedHours`),
                extraKmRate: normalizeOptionalNumber(pricing.extraKmRate, `pricings[${index}].extraKmRate`),
                extraHourRate: normalizeOptionalNumber(pricing.extraHourRate, `pricings[${index}].extraHourRate`),
                validFrom: pricing.validFrom ? new Date(pricing.validFrom) : null,
                validTo: pricing.validTo ? new Date(pricing.validTo) : null,
                active: pricing.active === undefined ? true : Boolean(pricing.active),
                notes: normalizeOptionalString(pricing.notes),
              })),
            },
    };
  }
}

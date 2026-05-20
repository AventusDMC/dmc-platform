import { BadRequestException, Injectable } from '@nestjs/common';
import {
  blockDelete,
  ensureValidNumber,
  normalizeOptionalString,
  throwIfNotFound,
} from '../common/crud.helpers';
import { PrismaService } from '../prisma/prisma.service';
import { JORDAN_TRANSFER_ROUTE_CODES } from './jordan-transfer-route-library';
import { buildRouteNormalizedKey, formatRouteName, normalizeRouteDisplayName } from './route-normalization';

type FindRoutesInput = {
  search?: string;
  active?: boolean;
  type?: string;
  region?: string;
  overnight?: boolean;
  sicPossible?: boolean;
  longDistance?: boolean;
  guideRecommended?: boolean;
  includeLegacy?: boolean;
  canonicalOnly?: boolean;
  limit?: number;
};

type CreateRouteInput = {
  fromPlaceId: string;
  toPlaceId: string;
  name?: string | null;
  routeType?: string | null;
  durationMinutes?: number | null;
  distanceKm?: number | null;
  notes?: string | null;
  isActive?: boolean;
};

type UpdateRouteInput = Partial<CreateRouteInput>;

const ROUTE_TYPE_TRANSFER = 'TRANSFER_ROUTE';
const ROUTE_TYPE_TOURING = 'TOURING_ROUTE';
const SUPPORTED_ROUTE_TYPES = [ROUTE_TYPE_TRANSFER, ROUTE_TYPE_TOURING] as const;
const SEEDED_JORDAN_TRANSFER_ROUTE_CODES = new Set(JORDAN_TRANSFER_ROUTE_CODES);

function buildRouteName(fromPlaceName: string, toPlaceName: string) {
  return formatRouteName(fromPlaceName, toPlaceName);
}

function normalizeRouteTypeValue(value: string | null | undefined) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
}

function normalizeTransportRouteTypeForWrite(value: string | null | undefined) {
  const normalized = normalizeRouteTypeValue(value);

  if (!normalized) {
    return null;
  }

  if (normalized === ROUTE_TYPE_TRANSFER || normalized === 'TRANSFER' || normalized === 'ROUTE_TRANSFER') {
    return ROUTE_TYPE_TRANSFER;
  }

  if (normalized === ROUTE_TYPE_TOURING || normalized === 'TOURING' || normalized === 'SIGHTSEEING_ROUTE') {
    return ROUTE_TYPE_TOURING;
  }

  if (
    [
      'AIRPORT_TRANSFER',
      'BORDER_TRANSFER',
      'CITY_TRANSFER',
      'INTERCITY',
      'INTERCITY_TRANSFER',
      'LOCAL_TRANSFER',
      'POINT_TO_POINT',
      'PRIVATE_TRANSFER',
    ].includes(normalized)
  ) {
    return ROUTE_TYPE_TRANSFER;
  }

  if (normalized.includes('EXCURSION') || normalized.includes('PRODUCT') || normalized.includes('SELLABLE')) {
    throw new BadRequestException('Excursions must be created as Excursion Templates, not transport routes.');
  }

  throw new BadRequestException('Transport routes only support TRANSFER_ROUTE or TOURING_ROUTE.');
}

function getCanonicalRouteType(routeType: string | null | undefined) {
  try {
    return normalizeTransportRouteTypeForWrite(routeType);
  } catch {
    return null;
  }
}

function hasSellableRouteSignal(value: string) {
  const normalized = value.toLowerCase();
  return /\b(excursion|tour package|sellable|product|activity|full day|half day|sightseeing)\b/.test(normalized);
}

function buildRouteOperationalFlags(route: {
  normalizedKey?: string | null;
  name: string;
  routeType: string | null;
  notes: string | null;
  distanceKm?: number | null;
  durationMinutes?: number | null;
  fromPlace?: { name: string; city?: string | null; region?: string | null } | null;
  toPlace?: { name: string; city?: string | null; region?: string | null } | null;
}) {
  const text = [route.name, route.routeType, route.notes, route.fromPlace?.name, route.toPlace?.name].filter(Boolean).join(' ');
  const canonicalRouteType = getCanonicalRouteType(route.routeType);
  const region = route.fromPlace?.region || route.toPlace?.region || route.fromPlace?.city || route.toPlace?.city || null;
  const overnight = /\bovernight|wadi rum camp|camp\b/i.test(text);
  const sicPossible = /\bsic|seat in coach|shared coach|regular tour\b/i.test(text);
  const longDistance = Number(route.distanceKm || 0) >= 150 || Number(route.durationMinutes || 0) >= 180 || /\bborder|aqaba|petra|wadi rum\b/i.test(text);
  const guideRecommended = /\bguide|guided|sightseeing|touring|petra|jerash|wadi rum|dead sea\b/i.test(text);
  const canonicalRouteCode = getSeededJordanTransferRouteCode(route);
  const isCanonicalTransferRoute =
    canonicalRouteType === ROUTE_TYPE_TRANSFER &&
    Boolean(route.fromPlace?.name && route.toPlace?.name) &&
    (Boolean(canonicalRouteCode) || Boolean(route.normalizedKey));
  const taxonomyReview =
    !canonicalRouteType || hasSellableRouteSignal(text) || isSpecialPricingRouteText(text)
      ? 'REVIEW_ROUTE_TAXONOMY'
      : null;

  return {
    canonicalRouteType,
    isCanonicalTransferRoute,
    canonicalRouteCode,
    selectorLabel: buildTransferRouteSelectorLabel(route, canonicalRouteCode),
    routeOperations: {
      region,
      overnight,
      sicPossible,
      longDistance,
      guideRecommended,
      taxonomyReview,
    },
  };
}

function getSeededJordanTransferRouteCode(route: { notes?: string | null; name?: string | null }) {
  const text = [route.notes, route.name].filter(Boolean).join(' ');
  const code = text.match(/\bJOR-TRF-[A-Z0-9]+-[A-Z0-9]+\b/)?.[0] || null;
  return code && SEEDED_JORDAN_TRANSFER_ROUTE_CODES.has(code) ? code : null;
}

function buildTransferRouteSelectorLabel(
  route: { fromPlace?: { name: string } | null; toPlace?: { name: string } | null; name: string },
  canonicalRouteCode: string | null,
) {
  if (!route.fromPlace?.name || !route.toPlace?.name) {
    return route.name;
  }

  const routeLabel = `${route.fromPlace.name} \u2194 ${route.toPlace.name}`;
  return canonicalRouteCode ? `${canonicalRouteCode} \u00b7 ${routeLabel}` : routeLabel;
}

function isSpecialPricingRouteText(value: string) {
  const normalized = value.toLowerCase();
  const specialPatterns = [
    'extra km',
    'extra kilometer',
    'stationary',
    'per hour',
    'hourly',
    'extra hour',
    'driver overnight',
    'deduct transfer',
    'not part of program',
  ];

  return specialPatterns.some((pattern) => normalized.includes(pattern));
}

function isValidTransferRoute(route: {
  fromPlaceId: string;
  toPlaceId: string;
  name: string;
  routeType: string | null;
  notes: string | null;
  isActive: boolean;
  fromPlace?: { name: string } | null;
  toPlace?: { name: string } | null;
}) {
  if (!route.isActive) {
    return false;
  }

  if (!route.fromPlaceId || !route.toPlaceId || !route.fromPlace?.name || !route.toPlace?.name) {
    return false;
  }

  const routeType = normalizeRouteTypeValue(route.routeType);
  const canonicalRouteType = getCanonicalRouteType(route.routeType);
  const routeText = [route.name, route.routeType, route.fromPlace.name, route.toPlace.name, route.notes]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (
    ['extra-km', 'stationary', 'extra-hour', 'driver-overnight', 'transfer-deduction'].includes(routeType) ||
    isSpecialPricingRouteText(routeText)
  ) {
    return false;
  }

  if (canonicalRouteType !== ROUTE_TYPE_TRANSFER) {
    return false;
  }

  return true;
}

@Injectable()
export class RoutesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters: FindRoutesInput = {}) {
    const search = filters.search?.trim();
    const type = normalizeRouteTypeValue(filters.type);

    if (type && !['ALL', 'DEBUG', 'TRANSFER', 'ROUTE_TRANSFER', ...SUPPORTED_ROUTE_TYPES].includes(type)) {
      throw new BadRequestException('Unsupported route type filter');
    }

    const limit =
      filters.limit === undefined
        ? undefined
        : Math.min(Math.max(Math.trunc(ensureValidNumber(filters.limit, 'limit', { min: 1 })), 1), 500);
    const isTransferFilter = type === 'TRANSFER' || type === 'ROUTE_TRANSFER' || type === ROUTE_TYPE_TRANSFER;

    const routes = await this.prisma.route.findMany({
      where: {
        ...(filters.active === undefined ? {} : { isActive: filters.active }),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { routeType: { contains: search, mode: 'insensitive' } },
                { notes: { contains: search, mode: 'insensitive' } },
                { fromPlace: { is: { name: { contains: search, mode: 'insensitive' } } } },
                { toPlace: { is: { name: { contains: search, mode: 'insensitive' } } } },
                { fromPlace: { is: { city: { contains: search, mode: 'insensitive' } } } },
                { toPlace: { is: { city: { contains: search, mode: 'insensitive' } } } },
              ],
            }
          : {}),
      },
      include: {
        fromPlace: true,
        toPlace: true,
      },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      ...(limit === undefined || isTransferFilter ? {} : { take: limit }),
    });

    const flaggedRoutes = routes.map((route) => ({
      ...route,
      ...buildRouteOperationalFlags(route),
    }));

    let filteredRoutes = flaggedRoutes;

    if (isTransferFilter) {
      filteredRoutes = filteredRoutes.filter(isValidTransferRoute);
      const canonicalOnly = filters.canonicalOnly ?? !filters.includeLegacy;
      if (canonicalOnly) {
        filteredRoutes = filteredRoutes.filter((route) => route.isCanonicalTransferRoute);
      }
    } else if (type === ROUTE_TYPE_TOURING) {
      filteredRoutes = filteredRoutes.filter((route) => route.canonicalRouteType === ROUTE_TYPE_TOURING);
    }

    if (filters.region?.trim()) {
      const region = filters.region.trim().toLowerCase();
      filteredRoutes = filteredRoutes.filter((route) => route.routeOperations.region?.toLowerCase().includes(region));
    }

    for (const [key, value] of [
      ['overnight', filters.overnight],
      ['sicPossible', filters.sicPossible],
      ['longDistance', filters.longDistance],
      ['guideRecommended', filters.guideRecommended],
    ] as const) {
      if (value !== undefined) {
        filteredRoutes = filteredRoutes.filter((route) => route.routeOperations[key] === value);
      }
    }

    const sortedRoutes = filteredRoutes.sort((left, right) => {
      if (left.isCanonicalTransferRoute !== right.isCanonicalTransferRoute) {
        return left.isCanonicalTransferRoute ? -1 : 1;
      }

      return left.name.localeCompare(right.name);
    });

    return limit === undefined ? sortedRoutes : sortedRoutes.slice(0, limit);
  }

  async findOne(id: string) {
    const route = await this.prisma.route.findUnique({
      where: { id },
      include: {
        fromPlace: true,
        toPlace: true,
        _count: {
          select: {
            vehicleRates: true,
          },
        },
      },
    });

    return throwIfNotFound(route, 'Route');
  }

  async create(data: CreateRouteInput) {
    const resolved = await this.resolveRouteDetails(data);
    const existing = await this.prisma.route.findUnique({
      where: { normalizedKey: resolved.normalizedKey },
    });

    if (existing) {
      return this.prisma.route.update({
        where: { id: existing.id },
        data: resolved,
        include: {
          fromPlace: true,
          toPlace: true,
        },
      });
    }

    return this.prisma.route.create({
      data: resolved,
      include: {
        fromPlace: true,
        toPlace: true,
      },
    });
  }

  async duplicate(id: string) {
    await this.findOne(id);
    throw new BadRequestException('Routes are unique by origin and destination and cannot be duplicated');
  }

  async update(id: string, data: UpdateRouteInput) {
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('At least one field is required');
    }

    const existing = await this.findOne(id);
    const resolved = await this.resolveRouteDetails({
      fromPlaceId: data.fromPlaceId ?? existing.fromPlaceId,
      toPlaceId: data.toPlaceId ?? existing.toPlaceId,
      name: data.name === undefined ? existing.name : data.name,
      routeType: data.routeType === undefined ? existing.routeType : data.routeType,
      durationMinutes: data.durationMinutes === undefined ? existing.durationMinutes : data.durationMinutes,
      distanceKm: data.distanceKm === undefined ? existing.distanceKm : data.distanceKm,
      notes: data.notes === undefined ? existing.notes : data.notes,
      isActive: data.isActive === undefined ? existing.isActive : data.isActive,
    });
    const duplicate = await this.prisma.route.findUnique({
      where: { normalizedKey: resolved.normalizedKey },
      select: { id: true },
    });

    if (duplicate && duplicate.id !== id) {
      throw new BadRequestException('Route already exists for this origin and destination');
    }

    return this.prisma.route.update({
      where: { id },
      data: resolved,
      include: {
        fromPlace: true,
        toPlace: true,
      },
    });
  }

  async remove(id: string) {
    const route = await this.findOne(id);

    blockDelete('route', 'vehicle rates', route._count.vehicleRates);

    return this.prisma.route.delete({
      where: { id },
    });
  }

  private async resolveRouteDetails(data: CreateRouteInput) {
    const [fromPlace, toPlace] = await Promise.all([
      this.prisma.place.findUnique({
        where: { id: data.fromPlaceId },
        select: { id: true, name: true },
      }),
      this.prisma.place.findUnique({
        where: { id: data.toPlaceId },
        select: { id: true, name: true },
      }),
    ]);

    if (!fromPlace) {
      throw new BadRequestException('From place not found');
    }

    if (!toPlace) {
      throw new BadRequestException('To place not found');
    }

    const durationMinutes =
      data.durationMinutes === undefined || data.durationMinutes === null
        ? null
        : Math.trunc(ensureValidNumber(data.durationMinutes, 'durationMinutes', { min: 0 }));
    const distanceKm =
      data.distanceKm === undefined || data.distanceKm === null
        ? null
        : ensureValidNumber(data.distanceKm, 'distanceKm', { min: 0 });

    return {
      fromPlaceId: fromPlace.id,
      toPlaceId: toPlace.id,
      name: normalizeRouteDisplayName(data.name, fromPlace.name, toPlace.name),
      normalizedKey: buildRouteNormalizedKey(fromPlace.name, toPlace.name),
      routeType: normalizeTransportRouteTypeForWrite(data.routeType),
      durationMinutes,
      distanceKm,
      notes: normalizeOptionalString(data.notes),
      isActive: data.isActive ?? true,
    };
  }
}

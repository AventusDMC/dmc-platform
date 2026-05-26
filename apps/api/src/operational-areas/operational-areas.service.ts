import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Operational Areas Catalog v1 — CRUD service for the DB-backed dictionary
// of operational movement endpoints. Replaces the hardcoded array that
// previously lived in apps/api/src/route-standards/operational-areas.ts.
//
// The Route Builder, Canonical Builder, Touring Routes, Dispatch, Transfers,
// and Excursion composition all consume this catalog. Codes (AMM, QAIA,
// PET, WR, AQJ, DS, JER, AJL, MAD, NEB, KRK, IRB, ALLENBY, SHB, WAB) drive
// the FROM_TO canonical route-code generator.

export type OperationalAreaType =
  | 'CITY'
  | 'AIRPORT'
  | 'BORDER'
  | 'HOTEL_ZONE'
  | 'TOURISM_SITE'
  | 'CAMP_AREA'
  | 'PORT'
  | 'RESORT_AREA';

export const OPERATIONAL_AREA_TYPES: OperationalAreaType[] = [
  'CITY',
  'AIRPORT',
  'BORDER',
  'HOTEL_ZONE',
  'TOURISM_SITE',
  'CAMP_AREA',
  'PORT',
  'RESORT_AREA',
];

export type OperationalAreaInput = {
  code: string;
  name: string;
  type: OperationalAreaType | string;
  city: string;
  region?: string | null;
  country?: string | null;
  isActive?: boolean;
  airportRouteFlagDefault?: boolean;
  borderCrossingFlagDefault?: boolean;
  mountainRoadFlagDefault?: boolean;
  overnightRiskDefault?: boolean;
};

/** Same UPPER_SNAKE normalization the canonical route-code generator uses. */
export function normalizeAreaCode(value: string | null | undefined): string {
  return String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
}

function requireString(value: string | null | undefined, field: string): string {
  const trimmed = String(value || '').trim();
  if (!trimmed) throw new BadRequestException(`${field} is required`);
  return trimmed;
}

function requireValidType(type: string): OperationalAreaType {
  if (!OPERATIONAL_AREA_TYPES.includes(type as OperationalAreaType)) {
    throw new BadRequestException(
      `type must be one of: ${OPERATIONAL_AREA_TYPES.join(', ')}`,
    );
  }
  return type as OperationalAreaType;
}

function buildCreateData(input: OperationalAreaInput) {
  return {
    code: normalizeAreaCode(requireString(input.code, 'code')),
    name: requireString(input.name, 'name'),
    type: requireValidType(requireString(input.type as string, 'type')),
    city: requireString(input.city, 'city'),
    region: input.region?.trim() || null,
    country: input.country?.trim() || 'Jordan',
    isActive: input.isActive === undefined ? true : Boolean(input.isActive),
    airportRouteFlagDefault: Boolean(input.airportRouteFlagDefault),
    borderCrossingFlagDefault: Boolean(input.borderCrossingFlagDefault),
    mountainRoadFlagDefault: Boolean(input.mountainRoadFlagDefault),
    overnightRiskDefault: Boolean(input.overnightRiskDefault),
  };
}

function buildUpdateData(input: Partial<OperationalAreaInput>) {
  const data: Record<string, unknown> = {};
  if (input.code !== undefined) data.code = normalizeAreaCode(requireString(input.code, 'code'));
  if (input.name !== undefined) data.name = requireString(input.name, 'name');
  if (input.type !== undefined) data.type = requireValidType(requireString(input.type as string, 'type'));
  if (input.city !== undefined) data.city = requireString(input.city, 'city');
  if (input.region !== undefined) data.region = input.region?.trim() || null;
  if (input.country !== undefined) data.country = input.country?.trim() || 'Jordan';
  if (input.isActive !== undefined) data.isActive = Boolean(input.isActive);
  if (input.airportRouteFlagDefault !== undefined) data.airportRouteFlagDefault = Boolean(input.airportRouteFlagDefault);
  if (input.borderCrossingFlagDefault !== undefined) data.borderCrossingFlagDefault = Boolean(input.borderCrossingFlagDefault);
  if (input.mountainRoadFlagDefault !== undefined) data.mountainRoadFlagDefault = Boolean(input.mountainRoadFlagDefault);
  if (input.overnightRiskDefault !== undefined) data.overnightRiskDefault = Boolean(input.overnightRiskDefault);
  return data;
}

// Best-match preference order when a city has multiple areas (Amman →
// Amman City + QAIA). Keep this in sync with the client-side helper in
// admin-web/.../CanonicalBuilderSection.tsx.
const PREFERRED_TYPE_ORDER: OperationalAreaType[] = [
  'CITY',
  'TOURISM_SITE',
  'RESORT_AREA',
  'CAMP_AREA',
  'BORDER',
  'HOTEL_ZONE',
  'PORT',
  'AIRPORT',
];

@Injectable()
export class OperationalAreasService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(filters: { onlyActive?: boolean; type?: string; search?: string } = {}) {
    const where: any = {};
    if (filters.onlyActive) where.isActive = true;
    if (filters.type) where.type = filters.type;
    if (filters.search) {
      const term = filters.search.trim();
      if (term) {
        where.OR = [
          { code: { contains: term, mode: 'insensitive' } },
          { name: { contains: term, mode: 'insensitive' } },
          { city: { contains: term, mode: 'insensitive' } },
        ];
      }
    }
    return (this.prisma as any).operationalArea.findMany({
      where,
      orderBy: [{ isActive: 'desc' }, { type: 'asc' }, { code: 'asc' }],
    });
  }

  async findOne(id: string) {
    const row = await (this.prisma as any).operationalArea.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Operational area not found');
    return row;
  }

  findByCode(code: string) {
    const normalized = normalizeAreaCode(code);
    if (!normalized) return null;
    return (this.prisma as any).operationalArea.findUnique({ where: { code: normalized } });
  }

  /**
   * Best-match for a city name. When multiple areas anchor to the same
   * city (e.g. Amman → Amman City + QAIA), preference order picks the
   * most operationally-likely one (CITY first, then attractions, then
   * borders/airports). Used by the Route Standard edit page to preselect
   * From/To dropdowns from the row's current fromCity/toCity values.
   */
  async findByCity(city: string, options: { preferType?: OperationalAreaType } = {}) {
    if (!city || !city.trim()) return null;
    const rows = await (this.prisma as any).operationalArea.findMany({
      where: { city: { equals: city.trim(), mode: 'insensitive' }, isActive: true },
    });
    if (!rows.length) return null;
    if (rows.length === 1) return rows[0];
    const types: OperationalAreaType[] = options.preferType
      ? [options.preferType, ...PREFERRED_TYPE_ORDER.filter((t) => t !== options.preferType)]
      : PREFERRED_TYPE_ORDER;
    for (const type of types) {
      const found = rows.find((r: any) => r.type === type);
      if (found) return found;
    }
    return rows[0];
  }

  async create(input: OperationalAreaInput) {
    try {
      return await (this.prisma as any).operationalArea.create({ data: buildCreateData(input) });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new BadRequestException(`Operational area code "${normalizeAreaCode(input.code)}" is already in use`);
      }
      throw error;
    }
  }

  async update(id: string, input: Partial<OperationalAreaInput>) {
    await this.findOne(id);
    try {
      return await (this.prisma as any).operationalArea.update({
        where: { id },
        data: buildUpdateData(input),
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new BadRequestException(`Operational area code "${normalizeAreaCode(input.code || '')}" is already in use`);
      }
      throw error;
    }
  }

  async remove(id: string) {
    // Soft-deactivate by default — operational history (Route Standards
    // already referencing this area via fromCity/toCity) stays intact.
    await this.findOne(id);
    return (this.prisma as any).operationalArea.update({
      where: { id },
      data: { isActive: false },
    });
  }
}

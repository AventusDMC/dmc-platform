import { Injectable } from '@nestjs/common';
import { normalizeOptionalString, requireTrimmedString, throwIfNotFound } from '../common/crud.helpers';
import { PrismaService } from '../prisma/prisma.service';

export const POI_LOCALES = ['en', 'pt', 'es', 'ar'] as const;
export type PoiLocale = (typeof POI_LOCALES)[number];

export type PointOfInterestTranslationInput = {
  locale: string;
  title?: string | null;
  shortDescription?: string | null;
  longDescription?: string | null;
};

export type PointOfInterestInput = {
  code?: string | null;
  name: string;
  isActive?: boolean | null;
  sortOrder?: number | null;
  cityId?: string | null;
  operationalAreaId?: string | null;
  activityId?: string | null;
  entranceFeeId?: string | null;
  stopType?: string | null;
  visitDurationMinutes?: number | null;
  guideRecommended?: boolean | null;
  lunchOpportunity?: boolean | null;
  photoStop?: boolean | null;
  viewpoint?: boolean | null;
  religiousSite?: boolean | null;
  imageUrl?: string | null;
  operationalNotes?: string | null;
  translations?: PointOfInterestTranslationInput[];
};

type FindPointsOfInterestInput = {
  search?: string;
  active?: boolean;
  cityId?: string;
  limit?: number;
};

function slugCode(value: string): string {
  return (
    value
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 48) || 'POI'
  );
}

function optionalInteger(value: number | null | undefined): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || (value as unknown) === '') return null;
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) ? parsed : null;
}

@Injectable()
export class PointsOfInterestService {
  constructor(private readonly prisma: PrismaService) {}

  private include() {
    return {
      translations: { orderBy: { locale: 'asc' as const } },
      city: { select: { id: true, name: true, country: true } },
      operationalArea: { select: { id: true, code: true, name: true, type: true } },
      activity: { select: { id: true, name: true } },
      entranceFee: { select: { id: true, siteName: true } },
    };
  }

  async findAll(filters: FindPointsOfInterestInput = {}) {
    const where: Record<string, unknown> = {};
    if (filters.active !== undefined) {
      where.isActive = filters.active;
    }
    if (filters.cityId) {
      where.cityId = filters.cityId;
    }
    if (filters.search && filters.search.trim()) {
      const term = filters.search.trim();
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { code: { contains: term, mode: 'insensitive' } },
      ];
    }
    return (this.prisma as any).pointOfInterest.findMany({
      where,
      include: this.include(),
      orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      take: filters.limit && filters.limit > 0 ? filters.limit : undefined,
    });
  }

  async findOne(id: string) {
    const poi = await (this.prisma as any).pointOfInterest.findUnique({ where: { id }, include: this.include() });
    throwIfNotFound(poi, 'Point of interest');
    return poi;
  }

  async create(data: PointOfInterestInput) {
    return (this.prisma as any).pointOfInterest.create({
      data: this.normalize(data, false),
      include: this.include(),
    });
  }

  async update(id: string, data: Partial<PointOfInterestInput>) {
    await this.findOne(id);
    return (this.prisma as any).pointOfInterest.update({
      where: { id },
      data: this.normalize(data, true),
      include: this.include(),
    });
  }

  private buildTranslations(translations: PointOfInterestTranslationInput[] | undefined, partial: boolean) {
    if (translations === undefined) {
      return undefined;
    }
    const rows = translations
      .filter((entry) => entry && typeof entry.locale === 'string' && entry.locale.trim())
      .map((entry) => ({
        locale: entry.locale.trim().toLowerCase(),
        title: normalizeOptionalString(entry.title),
        shortDescription: normalizeOptionalString(entry.shortDescription),
        longDescription: normalizeOptionalString(entry.longDescription),
      }))
      // Drop fully-empty locale rows so we don't persist blank translations.
      .filter((entry) => entry.title || entry.shortDescription || entry.longDescription);
    return partial ? { deleteMany: {}, create: rows } : { create: rows };
  }

  private normalize(data: Partial<PointOfInterestInput>, partial: boolean) {
    const name = data.name === undefined && partial ? undefined : requireTrimmedString(String(data.name || ''), 'name');
    const codeSource = (data.code && String(data.code).trim()) || name || '';
    return {
      code: data.code === undefined && partial ? undefined : normalizeOptionalString(data.code) || slugCode(codeSource),
      name,
      isActive: data.isActive === undefined ? undefined : Boolean(data.isActive),
      sortOrder: data.sortOrder === undefined ? undefined : Math.floor(Number(data.sortOrder) || 0),
      cityId: data.cityId === undefined && partial ? undefined : normalizeOptionalString(data.cityId),
      operationalAreaId: data.operationalAreaId === undefined && partial ? undefined : normalizeOptionalString(data.operationalAreaId),
      activityId: data.activityId === undefined && partial ? undefined : normalizeOptionalString(data.activityId),
      entranceFeeId: data.entranceFeeId === undefined && partial ? undefined : normalizeOptionalString(data.entranceFeeId),
      stopType: data.stopType === undefined && partial ? undefined : normalizeOptionalString(data.stopType),
      visitDurationMinutes: optionalInteger(data.visitDurationMinutes),
      guideRecommended: data.guideRecommended === undefined ? undefined : Boolean(data.guideRecommended),
      lunchOpportunity: data.lunchOpportunity === undefined ? undefined : Boolean(data.lunchOpportunity),
      photoStop: data.photoStop === undefined ? undefined : Boolean(data.photoStop),
      viewpoint: data.viewpoint === undefined ? undefined : Boolean(data.viewpoint),
      religiousSite: data.religiousSite === undefined ? undefined : Boolean(data.religiousSite),
      imageUrl: data.imageUrl === undefined && partial ? undefined : normalizeOptionalString(data.imageUrl),
      operationalNotes: data.operationalNotes === undefined && partial ? undefined : normalizeOptionalString(data.operationalNotes),
      translations: this.buildTranslations(data.translations, partial),
    };
  }
}

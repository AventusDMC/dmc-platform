import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { RateHawkClient } from './ratehawk.client';
import {
  extractCandidateFields,
  extractImageGallery,
  extractShortDescription,
  extractThumbnailUrl,
  mapAmenities,
  mapCheckInOut,
  mapHighlights,
  starRatingToCategoryName,
} from './ratehawk.mapper';
import type {
  CandidateFilter,
  CandidateListItem,
  CandidateListResponse,
  ImportResult,
  RateHawkHotelRaw,
  RateHawkSyncResult,
} from './ratehawk.types';

// Default countries to sync until the wizard exposes country pickers.
const DEFAULT_COUNTRIES = ['JO', 'AE'];
const RATEHAWK_SUPPLIER_NAME = 'RateHawk Inventory';

@Injectable()
export class RateHawkService {
  private readonly logger = new Logger(RateHawkService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: RateHawkClient,
  ) {}

  status() {
    return {
      mode: this.client.modeLabel(),
      hasCredentials: this.client.hasCredentials(),
      defaultCountries: DEFAULT_COUNTRIES,
    };
  }

  // --- sync ---------------------------------------------------------------
  async sync(countryCodes?: string[]): Promise<RateHawkSyncResult> {
    const countries = (countryCodes && countryCodes.length > 0 ? countryCodes : DEFAULT_COUNTRIES).map(
      (c) => c.toUpperCase(),
    );

    const result: RateHawkSyncResult = {
      fetched: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      errors: [],
    };

    let rows: RateHawkHotelRaw[] = [];
    try {
      rows = await this.client.fetchAllForCountries(countries);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push({ message: `Fetch failed: ${message}` });
      return result;
    }
    result.fetched = rows.length;

    for (const raw of rows) {
      try {
        const fields = extractCandidateFields(raw);
        if (!fields.rateHawkId || !fields.name || !fields.countryCode) {
          result.skipped += 1;
          result.errors.push({
            rateHawkId: fields.rateHawkId ?? undefined,
            message: 'Missing required fields (id / name / country)',
          });
          continue;
        }

        const data: Prisma.RateHawkHotelCandidateUncheckedCreateInput = {
          rateHawkId: fields.rateHawkId,
          name: fields.name,
          countryCode: fields.countryCode,
          cityName: fields.cityName,
          addressLine: fields.addressLine,
          starRating: fields.starRating,
          latitude: fields.latitude,
          longitude: fields.longitude,
          chainName: fields.chainName,
          kind: fields.kind,
          photoCount: fields.photoCount,
          rawJson: raw as unknown as Prisma.InputJsonValue,
          syncedAt: new Date(),
        };

        const existing = await this.prisma.rateHawkHotelCandidate.findUnique({
          where: { rateHawkId: fields.rateHawkId },
          select: { id: true },
        });
        if (existing) {
          await this.prisma.rateHawkHotelCandidate.update({
            where: { rateHawkId: fields.rateHawkId },
            data: {
              name: data.name,
              countryCode: data.countryCode,
              cityName: data.cityName,
              addressLine: data.addressLine,
              starRating: data.starRating,
              latitude: data.latitude,
              longitude: data.longitude,
              chainName: data.chainName,
              kind: data.kind,
              photoCount: data.photoCount,
              rawJson: data.rawJson,
              syncedAt: data.syncedAt,
            },
          });
          result.updated += 1;
        } else {
          await this.prisma.rateHawkHotelCandidate.create({ data });
          result.inserted += 1;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result.errors.push({ rateHawkId: raw.id ?? undefined, message });
        result.skipped += 1;
      }
    }

    this.logger.log(
      `[RateHawk] sync ${this.client.modeLabel()} mode — fetched=${result.fetched} inserted=${result.inserted} updated=${result.updated} skipped=${result.skipped}`,
    );
    return result;
  }

  // --- list candidates -----------------------------------------------------
  async findCandidates(filter: CandidateFilter = {}): Promise<CandidateListResponse> {
    const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200);
    const offset = Math.max(filter.offset ?? 0, 0);

    const where: Prisma.RateHawkHotelCandidateWhereInput = {};
    if (filter.countryCode) {
      where.countryCode = filter.countryCode.toUpperCase();
    }
    if (filter.cityName) {
      where.cityName = { equals: filter.cityName, mode: 'insensitive' };
    }
    if (filter.starRating != null) {
      where.starRating = filter.starRating;
    }
    if (filter.importedOnly) {
      where.importedHotelId = { not: null };
    } else if (filter.notImportedOnly) {
      where.importedHotelId = null;
    }
    if (filter.search) {
      where.OR = [
        { name: { contains: filter.search, mode: 'insensitive' } },
        { chainName: { contains: filter.search, mode: 'insensitive' } },
        { cityName: { contains: filter.search, mode: 'insensitive' } },
      ];
    }

    const [total, rows] = await Promise.all([
      this.prisma.rateHawkHotelCandidate.count({ where }),
      this.prisma.rateHawkHotelCandidate.findMany({
        where,
        orderBy: [{ countryCode: 'asc' }, { cityName: 'asc' }, { starRating: 'desc' }, { name: 'asc' }],
        skip: offset,
        take: limit,
      }),
    ]);

    const items: CandidateListItem[] = rows.map((r) => ({
      id: r.id,
      rateHawkId: r.rateHawkId,
      name: r.name,
      countryCode: r.countryCode,
      cityName: r.cityName,
      addressLine: r.addressLine,
      starRating: r.starRating,
      latitude: r.latitude,
      longitude: r.longitude,
      chainName: r.chainName,
      kind: r.kind,
      photoCount: r.photoCount,
      thumbnailUrl: extractThumbnailUrl(r.rawJson as unknown as RateHawkHotelRaw),
      importedHotelId: r.importedHotelId,
      syncedAt: r.syncedAt.toISOString(),
    }));

    return { total, offset, limit, items };
  }

  async findFacets() {
    // Distinct country / city / star combos so the wizard can show
    // dropdowns without scanning all candidates client-side.
    const rows = await this.prisma.rateHawkHotelCandidate.findMany({
      select: { countryCode: true, cityName: true, starRating: true },
    });
    const countries = new Map<string, number>();
    const cities = new Map<string, { country: string; city: string; count: number }>();
    const stars = new Map<number, number>();
    for (const r of rows) {
      countries.set(r.countryCode, (countries.get(r.countryCode) ?? 0) + 1);
      if (r.cityName) {
        const key = `${r.countryCode}|${r.cityName}`;
        const prev = cities.get(key);
        if (prev) prev.count += 1;
        else cities.set(key, { country: r.countryCode, city: r.cityName, count: 1 });
      }
      if (r.starRating != null) {
        stars.set(r.starRating, (stars.get(r.starRating) ?? 0) + 1);
      }
    }
    return {
      total: rows.length,
      countries: [...countries.entries()]
        .map(([code, count]) => ({ code, count }))
        .sort((a, b) => a.code.localeCompare(b.code)),
      cities: [...cities.values()].sort(
        (a, b) => a.country.localeCompare(b.country) || a.city.localeCompare(b.city),
      ),
      stars: [...stars.entries()]
        .map(([star, count]) => ({ star, count }))
        .sort((a, b) => b.star - a.star),
    };
  }

  // --- import --------------------------------------------------------------
  async importCandidates(candidateIds: string[]): Promise<ImportResult> {
    if (!Array.isArray(candidateIds) || candidateIds.length === 0) {
      throw new BadRequestException('candidateIds is required');
    }
    if (candidateIds.length > 100) {
      throw new BadRequestException('Import at most 100 candidates at a time');
    }

    const result: ImportResult = {
      requested: candidateIds.length,
      created: 0,
      skipped: 0,
      errors: [],
      createdHotelIds: [],
    };

    const supplierId = await this.ensureRateHawkSupplierId();

    for (const candidateId of candidateIds) {
      try {
        const created = await this.importSingleCandidate(candidateId, supplierId);
        if (created) {
          result.created += 1;
          result.createdHotelIds.push(created);
        } else {
          result.skipped += 1;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result.errors.push({ candidateId, message });
        result.skipped += 1;
      }
    }
    return result;
  }

  private async importSingleCandidate(
    candidateId: string,
    supplierId: string,
  ): Promise<string | null> {
    const candidate = await this.prisma.rateHawkHotelCandidate.findUnique({
      where: { id: candidateId },
    });
    if (!candidate) throw new NotFoundException(`Candidate ${candidateId} not found`);
    if (candidate.importedHotelId) return null; // already imported, skip

    const raw = candidate.rawJson as unknown as RateHawkHotelRaw;
    const cityId = candidate.cityName ? await this.ensureCityId(candidate.cityName) : null;
    const hotelCategoryId =
      candidate.starRating != null
        ? await this.ensureHotelCategoryId(starRatingToCategoryName(candidate.starRating))
        : null;

    // Create the Hotel row + factSheet in a transaction so a failure
    // mid-flight doesn't leave a half-imported record.
    const created = await this.prisma.$transaction(async (tx) => {
      const hotel = await tx.hotel.create({
        data: {
          name: candidate.name,
          cityId,
          city: candidate.cityName ?? '',
          category: starRatingToCategoryName(candidate.starRating) ?? '',
          hotelCategoryId,
          supplierId,
        },
      });

      const highlights = mapHighlights(raw);
      const amenities = mapAmenities(raw);
      const { checkInTime, checkOutTime } = mapCheckInOut(raw);
      const shortDescription = extractShortDescription(raw);
      const gallery = extractImageGallery(raw);

      await tx.hotelFactSheet.create({
        data: {
          hotelId: hotel.id,
          shortDescription,
          checkInTime,
          checkOutTime,
          highlightsJson: highlights as unknown as Prisma.InputJsonValue,
          amenitiesJson: amenities as unknown as Prisma.InputJsonValue,
          imageGalleryJson: gallery as unknown as Prisma.InputJsonValue,
        },
      });

      await tx.rateHawkHotelCandidate.update({
        where: { id: candidate.id },
        data: { importedHotelId: hotel.id },
      });

      return hotel.id;
    });

    return created;
  }

  // --- catalog helpers (auto-create city / category / supplier on demand) --
  private async ensureCityId(cityName: string): Promise<string> {
    const existing = await this.prisma.city.findFirst({
      where: { name: { equals: cityName, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existing) return existing.id;
    const created = await this.prisma.city.create({
      data: { name: cityName, latitude: 0, longitude: 0 },
      select: { id: true },
    });
    this.logger.log(`[RateHawk] auto-created city "${cityName}" (${created.id})`);
    return created.id;
  }

  private async ensureHotelCategoryId(name: string | null): Promise<string | null> {
    if (!name) return null;
    const existing = await this.prisma.hotelCategory.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existing) return existing.id;
    const created = await this.prisma.hotelCategory.create({
      data: { name, isActive: true },
      select: { id: true },
    });
    this.logger.log(`[RateHawk] auto-created hotel category "${name}" (${created.id})`);
    return created.id;
  }

  private async ensureRateHawkSupplierId(): Promise<string> {
    const existing = await this.prisma.supplier.findFirst({
      where: { name: { equals: RATEHAWK_SUPPLIER_NAME, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existing) return existing.id;
    const created = await this.prisma.supplier.create({
      data: {
        name: RATEHAWK_SUPPLIER_NAME,
        type: 'hotel',
        notes: 'Auto-created by the RateHawk import wizard. Imported hotels list this as their supplier until the operator assigns the real one on the hotel edit page.',
      },
      select: { id: true },
    });
    this.logger.log(`[RateHawk] auto-created supplier "${RATEHAWK_SUPPLIER_NAME}" (${created.id})`);
    return created.id;
  }
}

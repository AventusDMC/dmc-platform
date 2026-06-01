import { BadRequestException, Injectable } from '@nestjs/common';
import {
  ensureValidNumber,
  normalizeOptionalString,
  requireSupportedCurrency,
  requireTrimmedString,
  throwIfNotFound,
} from '../common/crud.helpers';
import { PrismaService } from '../prisma/prisma.service';

type ActivityPricingBasis = 'PER_PERSON' | 'PER_GROUP';
type ActivityGuideRequirement =
  | 'LOCAL_GUIDE_REQUIRED'
  | 'OFFICIAL_ACCOMPANYING_GUIDE_ALLOWED'
  | 'BOTH_ACCEPTED'
  | 'LOCAL_GUIDE_PLUS_ACCOMPANYING_GUIDE';

type ActivityRateVariantInput = {
  id?: string;
  name: string;
  supplierCompanyId?: string | null;
  durationMinutes?: number | null;
  durationHours?: number | null;
  currency?: string | null;
  costPrice: number;
  sellPrice: number;
  pricingBasis: ActivityPricingBasis;
  minPax?: number | null;
  maxPax?: number | null;
  maxPaxPerUnit?: number | null;
  capacityPricing?: boolean | null;
  active?: boolean;
  notes?: string | null;
  difficulty?: string | null;
  guideRequired?: boolean | null;
  guideRequirement?: ActivityGuideRequirement | null;
  sicPossible?: boolean | null;
  fitnessLevel?: string | null;
  familyFriendly?: boolean | null;
  seasonalRisk?: string | null;
  terrainType?: string | null;
  recommendedPaxRange?: string | null;
  meetingPoint?: string | null;
  startPoint?: string | null;
  endPoint?: string | null;
  operationalNotes?: string | null;
  suitability?: string | null;
  fitnessNotes?: string | null;
  waterNotes?: string | null;
  seasonalNotes?: string | null;
  inclusions?: string | null;
  exclusions?: string | null;
};

type ActivityRateVariantRecord = ActivityRateVariantInput & {
  id: string;
};

type CreateActivityInput = {
  name: string;
  description?: string | null;
  supplierCompanyId: string;
  pricingBasis: ActivityPricingBasis;
  costPrice: number;
  sellPrice: number;
  durationMinutes?: number | null;
  durationHours?: number | null;
  active?: boolean;
  currency?: string | null;
  code?: string | null;
  category?: string | null;
  city?: string | null;
  region?: string | null;
  difficulty?: string | null;
  guideRequired?: boolean | null;
  sicPossible?: boolean | null;
  fitnessLevel?: string | null;
  familyFriendly?: boolean | null;
  seasonalRisk?: string | null;
  terrainType?: string | null;
  recommendedPaxRange?: string | null;
  startPoint?: string | null;
  endPoint?: string | null;
  inclusions?: string | null;
  exclusions?: string | null;
  operationalNotes?: string | null;
  categoryTags?: string[] | null;
  reviewNotes?: string | null;
  // Guided Quote Builder taxonomy — see Activity model comments.
  moodCategory?: string | null;
  experienceType?: string | null;
  operationalIntensity?: string | null;
  religiousSignificance?: boolean | null;
  premiumExperienceFlag?: boolean | null;
  rateVariants?: ActivityRateVariantInput[];
};

type UpdateActivityInput = Partial<CreateActivityInput>;

const VALID_MOOD_CATEGORIES = ['CULTURE', 'ADVENTURE', 'RELIGIOUS', 'RELAXATION', 'FAMILY', 'WELLNESS', 'FOOD_LOCAL'];
const VALID_OPERATIONAL_INTENSITIES = ['RELAXED', 'MODERATE', 'INTENSE'];

// Normalizes a free-text taxonomy value to its canonical uppercase form,
// falling back to null when it is not one of the values the Guided Quote
// Builder groups by (so a typo never silently breaks mood grouping).
function normalizeEnumString(value: string | null | undefined, allowed: string[]): string | null {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim().toUpperCase();
  return allowed.includes(normalized) ? normalized : null;
}

@Injectable()
export class ActivitiesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return (this.prisma as any).activity.findMany({
      include: {
        supplierCompany: true,
        rateVariants: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string) {
    const activity = await (this.prisma as any).activity.findUnique({
      where: { id },
      include: {
        supplierCompany: true,
        rateVariants: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });

    return throwIfNotFound(activity, 'Activity');
  }

  async create(data: CreateActivityInput) {
    await this.ensureSupplierCompanyExists(data.supplierCompanyId);
    await this.ensureRateVariantSupplierCompaniesExist(data.rateVariants);
    await this.ensureActivityCodeAvailable(data.code);
    const defaultVariantCurrency = this.getDefaultActivityCurrency(data);

    return (this.prisma as any).activity.create({
      data: {
        name: requireTrimmedString(data.name, 'name'),
        code: normalizeOptionalString(data.code),
        description: normalizeOptionalString(data.description),
        category: normalizeOptionalString(data.category),
        city: normalizeOptionalString(data.city),
        region: normalizeOptionalString(data.region),
        supplierCompanyId: requireTrimmedString(data.supplierCompanyId, 'supplierCompanyId'),
        pricingBasis: this.normalizePricingBasis(data.pricingBasis),
        costPrice: ensureValidNumber(data.costPrice, 'costPrice', { min: 0 }),
        sellPrice: ensureValidNumber(data.sellPrice, 'sellPrice', { min: 0 }),
        durationMinutes: this.normalizeOptionalPositiveInteger(data.durationMinutes, 'durationMinutes'),
        durationHours: this.normalizeOptionalPositiveNumber(data.durationHours, 'durationHours'),
        difficulty: normalizeOptionalString(data.difficulty),
        guideRequired: data.guideRequired === undefined || data.guideRequired === null ? null : Boolean(data.guideRequired),
        sicPossible: data.sicPossible === undefined || data.sicPossible === null ? false : Boolean(data.sicPossible),
        fitnessLevel: normalizeOptionalString(data.fitnessLevel),
        familyFriendly: data.familyFriendly === undefined || data.familyFriendly === null ? false : Boolean(data.familyFriendly),
        seasonalRisk: normalizeOptionalString(data.seasonalRisk),
        terrainType: normalizeOptionalString(data.terrainType),
        recommendedPaxRange: normalizeOptionalString(data.recommendedPaxRange),
        startPoint: normalizeOptionalString(data.startPoint),
        endPoint: normalizeOptionalString(data.endPoint),
        inclusions: normalizeOptionalString(data.inclusions),
        exclusions: normalizeOptionalString(data.exclusions),
        operationalNotes: normalizeOptionalString(data.operationalNotes),
        categoryTags: this.normalizeCategoryTags(data.categoryTags),
        reviewNotes: normalizeOptionalString(data.reviewNotes),
        moodCategory: normalizeEnumString(data.moodCategory, VALID_MOOD_CATEGORIES),
        experienceType: normalizeOptionalString(data.experienceType),
        operationalIntensity: normalizeEnumString(data.operationalIntensity, VALID_OPERATIONAL_INTENSITIES),
        religiousSignificance:
          data.religiousSignificance === undefined || data.religiousSignificance === null ? false : Boolean(data.religiousSignificance),
        premiumExperienceFlag:
          data.premiumExperienceFlag === undefined || data.premiumExperienceFlag === null ? false : Boolean(data.premiumExperienceFlag),
        active: data.active === undefined ? true : Boolean(data.active),
        rateVariants: this.buildCreateRateVariants(data.rateVariants, defaultVariantCurrency),
      },
      include: {
        supplierCompany: true,
        rateVariants: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });
  }

  async update(id: string, data: UpdateActivityInput) {
    const existingActivity = await this.findOne(id);

    if (data.supplierCompanyId !== undefined) {
      await this.ensureSupplierCompanyExists(data.supplierCompanyId);
    }
    if (data.rateVariants !== undefined) {
      await this.ensureRateVariantSupplierCompaniesExist(data.rateVariants);
    }
    if (data.code !== undefined) {
      await this.ensureActivityCodeAvailable(data.code, id);
    }

    return this.prisma.$transaction(async (tx) => {
      if (data.rateVariants !== undefined) {
        await this.syncRateVariants(tx, id, data.rateVariants, this.getDefaultActivityCurrency(data, existingActivity));
      }

      return (tx as any).activity.update({
        where: { id },
        data: {
          name: data.name === undefined ? undefined : requireTrimmedString(data.name, 'name'),
          code: data.code === undefined ? undefined : normalizeOptionalString(data.code),
          description: data.description === undefined ? undefined : normalizeOptionalString(data.description),
          category: data.category === undefined ? undefined : normalizeOptionalString(data.category),
          city: data.city === undefined ? undefined : normalizeOptionalString(data.city),
          region: data.region === undefined ? undefined : normalizeOptionalString(data.region),
          supplierCompanyId:
            data.supplierCompanyId === undefined ? undefined : requireTrimmedString(data.supplierCompanyId, 'supplierCompanyId'),
          pricingBasis: data.pricingBasis === undefined ? undefined : this.normalizePricingBasis(data.pricingBasis),
          costPrice: data.costPrice === undefined ? undefined : ensureValidNumber(data.costPrice, 'costPrice', { min: 0 }),
          sellPrice: data.sellPrice === undefined ? undefined : ensureValidNumber(data.sellPrice, 'sellPrice', { min: 0 }),
          durationMinutes:
            data.durationMinutes === undefined ? undefined : this.normalizeOptionalPositiveInteger(data.durationMinutes, 'durationMinutes'),
          durationHours: data.durationHours === undefined ? undefined : this.normalizeOptionalPositiveNumber(data.durationHours, 'durationHours'),
          difficulty: data.difficulty === undefined ? undefined : normalizeOptionalString(data.difficulty),
          guideRequired: data.guideRequired === undefined ? undefined : data.guideRequired === null ? null : Boolean(data.guideRequired),
          sicPossible: data.sicPossible === undefined ? undefined : Boolean(data.sicPossible),
          fitnessLevel: data.fitnessLevel === undefined ? undefined : normalizeOptionalString(data.fitnessLevel),
          familyFriendly: data.familyFriendly === undefined ? undefined : Boolean(data.familyFriendly),
          seasonalRisk: data.seasonalRisk === undefined ? undefined : normalizeOptionalString(data.seasonalRisk),
          terrainType: data.terrainType === undefined ? undefined : normalizeOptionalString(data.terrainType),
          recommendedPaxRange:
            data.recommendedPaxRange === undefined ? undefined : normalizeOptionalString(data.recommendedPaxRange),
          startPoint: data.startPoint === undefined ? undefined : normalizeOptionalString(data.startPoint),
          endPoint: data.endPoint === undefined ? undefined : normalizeOptionalString(data.endPoint),
          inclusions: data.inclusions === undefined ? undefined : normalizeOptionalString(data.inclusions),
          exclusions: data.exclusions === undefined ? undefined : normalizeOptionalString(data.exclusions),
          operationalNotes: data.operationalNotes === undefined ? undefined : normalizeOptionalString(data.operationalNotes),
          categoryTags: data.categoryTags === undefined ? undefined : this.normalizeCategoryTags(data.categoryTags),
          reviewNotes: data.reviewNotes === undefined ? undefined : normalizeOptionalString(data.reviewNotes),
          moodCategory: data.moodCategory === undefined ? undefined : normalizeEnumString(data.moodCategory, VALID_MOOD_CATEGORIES),
          experienceType: data.experienceType === undefined ? undefined : normalizeOptionalString(data.experienceType),
          operationalIntensity:
            data.operationalIntensity === undefined ? undefined : normalizeEnumString(data.operationalIntensity, VALID_OPERATIONAL_INTENSITIES),
          religiousSignificance: data.religiousSignificance === undefined ? undefined : Boolean(data.religiousSignificance),
          premiumExperienceFlag: data.premiumExperienceFlag === undefined ? undefined : Boolean(data.premiumExperienceFlag),
          active: data.active === undefined ? undefined : Boolean(data.active),
        },
        include: {
          supplierCompany: true,
          rateVariants: {
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          },
        },
      });
    });
  }

  async duplicate(id: string) {
    const source = await this.findOne(id);

    return (this.prisma as any).activity.create({
      data: {
        name: `${source.name} Copy`,
        code: null,
        description: source.description,
        category: source.category,
        city: source.city,
        region: source.region,
        supplierCompanyId: source.supplierCompanyId,
        pricingBasis: source.pricingBasis,
        costPrice: source.costPrice,
        sellPrice: source.sellPrice,
        durationMinutes: source.durationMinutes,
        durationHours: source.durationHours,
        difficulty: source.difficulty,
        guideRequired: source.guideRequired,
        sicPossible: source.sicPossible,
        fitnessLevel: source.fitnessLevel,
        familyFriendly: source.familyFriendly,
        seasonalRisk: source.seasonalRisk,
        terrainType: source.terrainType,
        recommendedPaxRange: source.recommendedPaxRange,
        startPoint: source.startPoint,
        endPoint: source.endPoint,
        inclusions: source.inclusions,
        exclusions: source.exclusions,
        operationalNotes: source.operationalNotes,
        categoryTags: source.categoryTags,
        reviewNotes: source.reviewNotes,
        moodCategory: source.moodCategory,
        experienceType: source.experienceType,
        operationalIntensity: source.operationalIntensity,
        religiousSignificance: source.religiousSignificance,
        premiumExperienceFlag: source.premiumExperienceFlag,
        active: false,
        rateVariants: this.buildCreateRateVariants(
          (source.rateVariants || []).map((variant: ActivityRateVariantRecord) => ({
            name: variant.name,
            durationMinutes: variant.durationMinutes,
            supplierCompanyId: variant.supplierCompanyId,
            currency: variant.currency,
            pricingBasis: variant.pricingBasis,
            costPrice: variant.costPrice,
            sellPrice: variant.sellPrice,
            minPax: variant.minPax,
            maxPax: variant.maxPax,
            maxPaxPerUnit: variant.maxPaxPerUnit,
            capacityPricing: variant.capacityPricing,
            active: variant.active,
            notes: variant.notes,
            difficulty: variant.difficulty,
            guideRequired: variant.guideRequired,
            guideRequirement: variant.guideRequirement,
            durationHours: variant.durationHours,
            sicPossible: variant.sicPossible,
            fitnessLevel: variant.fitnessLevel,
            familyFriendly: variant.familyFriendly,
            seasonalRisk: variant.seasonalRisk,
            terrainType: variant.terrainType,
            recommendedPaxRange: variant.recommendedPaxRange,
            meetingPoint: variant.meetingPoint,
            startPoint: variant.startPoint,
            endPoint: variant.endPoint,
            operationalNotes: variant.operationalNotes,
            suitability: variant.suitability,
            fitnessNotes: variant.fitnessNotes,
            waterNotes: variant.waterNotes,
            seasonalNotes: variant.seasonalNotes,
            inclusions: variant.inclusions,
            exclusions: variant.exclusions,
          })),
          this.getDefaultActivityCurrency(source),
        ),
      },
      include: {
        supplierCompany: true,
        rateVariants: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });
  }

  async ensurePetraHikingExperiences() {
    const supplier = await this.ensurePetraGuidesCompany();
    const definition = this.getPetraHikingDefinition();
    const existing = await (this.prisma as any).activity.findFirst({
      where: {
        OR: [{ code: definition.code }, { name: { equals: definition.name, mode: 'insensitive' } }],
      },
      include: { rateVariants: true },
    });
    const payload = {
      code: definition.code,
      name: definition.name,
      description: definition.description,
      category: definition.category,
      city: definition.city,
      region: definition.region,
      supplierCompanyId: supplier.id,
      pricingBasis: 'PER_GROUP',
      costPrice: 0,
      sellPrice: 0,
      durationMinutes: null,
      durationHours: null,
      difficulty: 'Varies by trail',
      guideRequired: true,
      sicPossible: false,
      fitnessLevel: 'Moderate to strenuous',
      familyFriendly: false,
      seasonalRisk: 'Heat, daylight, weather, trail condition, and flash-flood risk must be checked before operation.',
      terrainType: 'Petra mountain trails, steps, uneven paths, and exposed viewpoints',
      recommendedPaxRange: '1-12',
      startPoint: 'Petra visitor area or trailhead',
      endPoint: 'Trail-specific endpoint',
      inclusions: 'Guided hiking experience. Entrance tickets are excluded and remain ticketing records.',
      exclusions: 'Petra entrance ticket, meals, water, transport, gratuities, and personal expenses unless separately included.',
      operationalNotes: 'Operational Activity Master for Petra hiking trail experiences. Guides remain separate operational resources.',
      categoryTags: ['Adventure', 'Historical', 'Cultural'],
      reviewNotes: 'Canonical Petra Hiking Activity Master preserved from existing architecture.',
      active: true,
    };

    if (!existing) {
      return (this.prisma as any).activity.create({
        data: {
          ...payload,
          rateVariants: {
            create: definition.variants.map((variant, index) => this.buildPetraHikingVariantData(variant, index)),
          },
        },
        include: {
          supplierCompany: true,
          rateVariants: {
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          },
        },
      });
    }

    return this.prisma.$transaction(async (tx) => {
      await this.syncPetraHikingVariants(tx, existing.id, definition.variants);
      return (tx as any).activity.update({
        where: { id: existing.id },
        data: payload,
        include: {
          supplierCompany: true,
          rateVariants: {
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          },
        },
      });
    });
  }

  private normalizePricingBasis(value: ActivityPricingBasis) {
    const normalized = String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');

    if (normalized !== 'PER_PERSON' && normalized !== 'PER_GROUP') {
      throw new BadRequestException('pricingBasis must be PER_PERSON or PER_GROUP');
    }

    return normalized;
  }

  private normalizeOptionalPositiveInteger(value: number | null | undefined, fieldLabel: string) {
    if (value === undefined || value === null || String(value).trim() === '') {
      return null;
    }

    const normalized = Number(value);

    if (!Number.isFinite(normalized) || normalized < 0) {
      throw new BadRequestException(`${fieldLabel} must be zero or greater`);
    }

    return Math.floor(normalized);
  }

  private normalizeOptionalPositiveNumber(value: number | null | undefined, fieldLabel: string) {
    if (value === undefined || value === null || String(value).trim() === '') {
      return null;
    }

    const normalized = Number(value);

    if (!Number.isFinite(normalized) || normalized < 0) {
      throw new BadRequestException(`${fieldLabel} must be zero or greater`);
    }

    return normalized;
  }

  private normalizeCategoryTags(value: string[] | null | undefined) {
    if (value === undefined) {
      return undefined;
    }
    if (value === null) {
      return null;
    }
    if (!Array.isArray(value)) {
      throw new BadRequestException('categoryTags must be an array');
    }

    return Array.from(new Set(value.map((tag) => normalizeOptionalString(tag)).filter((tag): tag is string => Boolean(tag))));
  }

  private buildCreateRateVariants(variants: ActivityRateVariantInput[] | undefined, defaultCurrency: string) {
    if (variants === undefined) {
      return undefined;
    }

    return {
      create: variants.map((variant, index) => this.buildRateVariantData(variant, index, defaultCurrency)),
    };
  }

  private buildRateVariantData(variant: ActivityRateVariantInput, index: number, defaultCurrency: string) {
    const minPax = this.normalizeOptionalPositiveInteger(variant.minPax, `rateVariants[${index}].minPax`);
    const maxPax = this.normalizeOptionalPositiveInteger(variant.maxPax, `rateVariants[${index}].maxPax`);

    if (minPax !== undefined && minPax !== null && maxPax !== undefined && maxPax !== null && minPax > maxPax) {
      throw new BadRequestException(`rateVariants[${index}].minPax cannot be greater than maxPax`);
    }

    const data: Record<string, unknown> = {
      name: requireTrimmedString(variant.name, `rateVariants[${index}].name`),
      durationMinutes: this.normalizeOptionalPositiveInteger(variant.durationMinutes, `rateVariants[${index}].durationMinutes`),
      pricingBasis: this.normalizePricingBasis(variant.pricingBasis),
      currency: this.normalizeVariantCurrency(variant.currency, defaultCurrency, `rateVariants[${index}].currency`),
      costPrice: ensureValidNumber(variant.costPrice, `rateVariants[${index}].costPrice`, { min: 0 }),
      sellPrice: ensureValidNumber(variant.sellPrice, `rateVariants[${index}].sellPrice`, { min: 0 }),
      maxPaxPerUnit: this.normalizeOptionalPositiveInteger(variant.maxPaxPerUnit, `rateVariants[${index}].maxPaxPerUnit`),
      active: variant.active === undefined ? true : Boolean(variant.active),
      notes: normalizeOptionalString(variant.notes),
      sortOrder: index,
    };
    if (variant.supplierCompanyId !== undefined) {
      data.supplierCompanyId = normalizeOptionalString(variant.supplierCompanyId);
    }
    if (variant.durationHours !== undefined) {
      data.durationHours = this.normalizeOptionalPositiveNumber(variant.durationHours, `rateVariants[${index}].durationHours`);
    }
    if (variant.minPax !== undefined) {
      data.minPax = minPax;
    }
    if (variant.maxPax !== undefined) {
      data.maxPax = maxPax;
    }
    if (variant.capacityPricing !== undefined) {
      data.capacityPricing = Boolean(variant.capacityPricing);
    }
    const optionalTextFields = [
      'difficulty',
      'fitnessLevel',
      'seasonalRisk',
      'terrainType',
      'recommendedPaxRange',
      'meetingPoint',
      'startPoint',
      'endPoint',
      'operationalNotes',
      'suitability',
      'fitnessNotes',
      'waterNotes',
      'seasonalNotes',
      'inclusions',
      'exclusions',
    ] as const;
    for (const field of optionalTextFields) {
      if (variant[field] !== undefined) {
        data[field] = normalizeOptionalString(variant[field]);
      }
    }
    if (variant.guideRequired !== undefined && variant.guideRequired !== null) {
      data.guideRequired = Boolean(variant.guideRequired);
    }
    if (variant.sicPossible !== undefined && variant.sicPossible !== null) {
      data.sicPossible = Boolean(variant.sicPossible);
    }
    if (variant.familyFriendly !== undefined && variant.familyFriendly !== null) {
      data.familyFriendly = Boolean(variant.familyFriendly);
    }
    if (variant.guideRequirement !== undefined) {
      data.guideRequirement = this.normalizeGuideRequirement(variant.guideRequirement);
    }
    return data;
  }

  private async syncRateVariants(tx: any, activityId: string, variants: ActivityRateVariantInput[], defaultCurrency: string) {
    const existingVariants = await tx.activityRateVariant.findMany({
      where: { activityId },
      select: { id: true },
    });
    const existingIds = new Set(existingVariants.map((variant: { id: string }) => variant.id));
    const retainedIds = new Set<string>();

    for (const [index, variant] of variants.entries()) {
      const variantData = this.buildRateVariantData(variant, index, defaultCurrency);

      if (variant.id && existingIds.has(variant.id)) {
        retainedIds.add(variant.id);
        await tx.activityRateVariant.update({
          where: { id: variant.id },
          data: variantData,
        });
      } else {
        await tx.activityRateVariant.create({
          data: {
            ...variantData,
            activityId,
          },
        });
      }
    }

    const removedIds = existingVariants
      .map((variant: { id: string }) => variant.id)
      .filter((variantId: string) => !retainedIds.has(variantId));

    if (removedIds.length > 0) {
      await tx.activityRateVariant.updateMany({
        where: { id: { in: removedIds } },
        data: { active: false },
      });
    }
  }

  private async ensureSupplierCompanyExists(supplierCompanyId: string) {
    const company = await this.prisma.company.findUnique({
      where: {
        id: requireTrimmedString(supplierCompanyId, 'supplierCompanyId'),
      },
      select: {
        id: true,
      },
    });

    if (!company) {
      throw new BadRequestException('Supplier company not found');
    }
  }

  private async ensureActivityCodeAvailable(code: string | null | undefined, excludingActivityId?: string) {
    const normalizedCode = normalizeOptionalString(code);
    if (!normalizedCode) {
      return;
    }

    const existing = await (this.prisma as any).activity.findFirst({
      where: { code: { equals: normalizedCode, mode: 'insensitive' } },
      select: { id: true },
    });

    if (existing && existing.id !== excludingActivityId) {
      throw new BadRequestException(`Activity code ${normalizedCode} already exists`);
    }
  }

  private async ensureRateVariantSupplierCompaniesExist(variants: ActivityRateVariantInput[] | undefined) {
    if (!Array.isArray(variants)) {
      return;
    }

    const supplierCompanyIds = Array.from(
      new Set(variants.map((variant) => normalizeOptionalString(variant.supplierCompanyId)).filter((id): id is string => Boolean(id))),
    );

    if (supplierCompanyIds.length === 0) {
      return;
    }

    const companies = await this.prisma.company.findMany({
      where: { id: { in: supplierCompanyIds } },
      select: { id: true },
    });
    const foundIds = new Set(companies.map((company) => company.id));
    const missingId = supplierCompanyIds.find((id) => !foundIds.has(id));

    if (missingId) {
      throw new BadRequestException(`Rate variant supplier company not found: ${missingId}`);
    }
  }

  private getDefaultActivityCurrency(activity: { currency?: string | null } | null | undefined, fallback?: { currency?: string | null }) {
    return this.normalizeVariantCurrency(activity?.currency ?? fallback?.currency ?? 'USD', 'USD', 'currency');
  }

  private normalizeVariantCurrency(value: string | null | undefined, defaultCurrency: string, fieldLabel: string) {
    return requireSupportedCurrency(value?.trim() || defaultCurrency, fieldLabel);
  }

  private normalizeGuideRequirement(value: ActivityGuideRequirement | null | undefined) {
    if (value === null || value === undefined || String(value).trim() === '') {
      return null;
    }
    const normalized = String(value).trim().toUpperCase() as ActivityGuideRequirement;
    const allowed: ActivityGuideRequirement[] = [
      'LOCAL_GUIDE_REQUIRED',
      'OFFICIAL_ACCOMPANYING_GUIDE_ALLOWED',
      'BOTH_ACCEPTED',
      'LOCAL_GUIDE_PLUS_ACCOMPANYING_GUIDE',
    ];
    if (!allowed.includes(normalized)) {
      throw new BadRequestException('guideRequirement is not supported');
    }
    return normalized;
  }

  private async ensurePetraGuidesCompany() {
    const existing = await this.prisma.company.findFirst({
      where: { name: { equals: 'Local Petra Guides / Official Guides', mode: 'insensitive' } as any },
    } as any);
    if (existing) {
      return existing;
    }
    return this.prisma.company.create({
      data: {
        name: 'Local Petra Guides / Official Guides',
        type: 'supplier',
        country: 'Jordan',
        city: 'Petra',
      } as any,
    });
  }

  private buildPetraHikingVariantData(variant: ActivityRateVariantInput, index: number) {
    return this.buildRateVariantData(
      {
        ...variant,
        pricingBasis: 'PER_GROUP',
        currency: 'JOD',
        costPrice: 0,
        sellPrice: 0,
        active: true,
      },
      index,
      'JOD',
    );
  }

  private async syncPetraHikingVariants(tx: any, activityId: string, variants: ActivityRateVariantInput[]) {
    const existingVariants = await tx.activityRateVariant.findMany({
      where: { activityId },
      select: { id: true, name: true },
    });
    const existingByName = new Map<string, { id: string; name: string }>(
      existingVariants.map((variant: any) => [String(variant.name).toLowerCase(), variant]),
    );
    const retainedIds = new Set<string>();

    for (const [index, variant] of variants.entries()) {
      const existing = existingByName.get(variant.name.toLowerCase());
      const data = this.buildPetraHikingVariantData(variant, index);
      if (existing) {
        retainedIds.add(existing.id);
        await tx.activityRateVariant.update({ where: { id: existing.id }, data });
      } else {
        await tx.activityRateVariant.create({ data: { ...data, activityId } });
      }
    }

    const removedIds = existingVariants.map((variant: any) => variant.id).filter((id: string) => !retainedIds.has(id));
    if (removedIds.length > 0) {
      await tx.activityRateVariant.updateMany({ where: { id: { in: removedIds } }, data: { active: false } });
    }
  }

  private getPetraHikingDefinition() {
    const common = {
      pricingBasis: 'PER_GROUP' as const,
      currency: 'JOD',
      costPrice: 0,
      sellPrice: 0,
      guideRequired: true,
      inclusions: 'Guided hiking experience. Entrance tickets are excluded and remain ticketing records.',
      exclusions: 'Petra entrance ticket, meals, water, transport, gratuities, and personal expenses unless separately included.',
      waterNotes: 'Guests must carry sufficient drinking water; more water is required in warm weather.',
      seasonalNotes: 'Weather, daylight, heat, flash-flood risk, and Petra authority guidance must be checked before operation.',
    };
    return {
      code: 'PETRA_HIKING_EXPERIENCES',
      name: 'Petra Hiking Experiences',
      category: 'Hiking / Adventure / Historical',
      city: 'Petra',
      region: 'South Jordan',
      description:
        'Operational Activity Master for Petra hiking trail experiences. Variants hold trail-specific guide requirements and operational notes. Tickets are not included.',
      variants: [
        {
          ...common,
          name: 'Monastery Trail',
          durationMinutes: 180,
          difficulty: 'Moderate',
          guideRequirement: 'BOTH_ACCEPTED' as const,
          startPoint: 'Petra main trail / basin area',
          endPoint: 'Monastery viewpoint',
          suitability: 'Daytime; sunset suitability depends on return timing and daylight.',
          fitnessNotes: 'Requires stair climbing and moderate endurance.',
          notes: 'Guide required. Local Petra guide or official accompanying guide accepted.',
        },
        {
          ...common,
          name: 'Back Trail',
          durationMinutes: 240,
          difficulty: 'Moderate to challenging',
          guideRequirement: 'LOCAL_GUIDE_REQUIRED' as const,
          startPoint: 'Little Petra / back trail access',
          endPoint: 'Monastery or Petra basin',
          suitability: 'Best in morning; avoid poor weather or low visibility.',
          fitnessNotes: 'Requires good walking fitness and uneven-terrain confidence.',
          notes: 'Local Petra guide required.',
        },
        {
          ...common,
          name: 'High Place of Sacrifice Trail',
          durationMinutes: 180,
          difficulty: 'Moderate to challenging',
          guideRequirement: 'LOCAL_GUIDE_REQUIRED' as const,
          startPoint: 'Petra main trail',
          endPoint: 'High Place of Sacrifice / Wadi Farasa route',
          suitability: 'Morning recommended; exposed sections can be hot.',
          fitnessNotes: 'Steep ascent and uneven steps require steady mobility.',
          notes: 'Local Petra guide required.',
        },
        {
          ...common,
          name: 'Treasury Viewpoint Trail',
          durationMinutes: 120,
          difficulty: 'Moderate',
          guideRequirement: 'LOCAL_GUIDE_REQUIRED' as const,
          startPoint: 'Treasury area',
          endPoint: 'Treasury viewpoint',
          suitability: 'Sunrise and morning light can be suitable where access is permitted.',
          fitnessNotes: 'Short but steep viewpoint access; not suitable for guests with vertigo concerns.',
          notes: 'Local Petra guide required. Access permissions must be checked locally.',
        },
        {
          ...common,
          name: 'Little Petra to Monastery Trail',
          durationMinutes: 300,
          difficulty: 'Challenging',
          guideRequirement: 'LOCAL_GUIDE_REQUIRED' as const,
          startPoint: 'Little Petra',
          endPoint: 'Monastery / Petra basin',
          suitability: 'Morning start required; avoid high heat and unstable weather.',
          fitnessNotes: 'Long hike requiring strong fitness and appropriate footwear.',
          notes: 'Local Petra guide required.',
        },
        {
          ...common,
          name: 'Al Kubtha Trail',
          durationMinutes: 180,
          difficulty: 'Moderate to challenging',
          guideRequirement: 'LOCAL_GUIDE_REQUIRED' as const,
          startPoint: 'Royal Tombs area',
          endPoint: 'Al Kubtha / Treasury overlook',
          suitability: 'Morning or late afternoon depending on heat and daylight.',
          fitnessNotes: 'Steep uphill trail with exposed sections.',
          notes: 'Local Petra guide required.',
        },
        {
          ...common,
          name: 'Jabal Haroun Trail',
          durationMinutes: 480,
          difficulty: 'Strenuous',
          guideRequirement: 'LOCAL_GUIDE_REQUIRED' as const,
          startPoint: 'Petra area trailhead',
          endPoint: 'Jabal Haroun',
          suitability: 'Early morning only; weather and daylight critical.',
          fitnessNotes: 'Demanding full-day hike for fit guests only.',
          notes: 'Local Petra guide required. Operation depends on weather, route condition, and local permissions.',
        },
      ],
    };
  }
}

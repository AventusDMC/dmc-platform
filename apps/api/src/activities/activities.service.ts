import { BadRequestException, Injectable } from '@nestjs/common';
import {
  ensureValidNumber,
  normalizeOptionalString,
  requireTrimmedString,
  throwIfNotFound,
} from '../common/crud.helpers';
import { PrismaService } from '../prisma/prisma.service';

type ActivityPricingBasis = 'PER_PERSON' | 'PER_GROUP';

type ActivityRateVariantInput = {
  id?: string;
  name: string;
  durationMinutes?: number | null;
  costPrice: number;
  sellPrice: number;
  pricingBasis: ActivityPricingBasis;
  maxPaxPerUnit?: number | null;
  active?: boolean;
  notes?: string | null;
};

type CreateActivityInput = {
  name: string;
  description?: string | null;
  supplierCompanyId: string;
  pricingBasis: ActivityPricingBasis;
  costPrice: number;
  sellPrice: number;
  durationMinutes?: number | null;
  active?: boolean;
  rateVariants?: ActivityRateVariantInput[];
};

type UpdateActivityInput = Partial<CreateActivityInput>;

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

    return (this.prisma as any).activity.create({
      data: {
        name: requireTrimmedString(data.name, 'name'),
        description: normalizeOptionalString(data.description),
        supplierCompanyId: requireTrimmedString(data.supplierCompanyId, 'supplierCompanyId'),
        pricingBasis: this.normalizePricingBasis(data.pricingBasis),
        costPrice: ensureValidNumber(data.costPrice, 'costPrice', { min: 0 }),
        sellPrice: ensureValidNumber(data.sellPrice, 'sellPrice', { min: 0 }),
        durationMinutes: this.normalizeOptionalPositiveInteger(data.durationMinutes, 'durationMinutes'),
        active: data.active === undefined ? true : Boolean(data.active),
        rateVariants: this.buildCreateRateVariants(data.rateVariants),
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
    await this.findOne(id);

    if (data.supplierCompanyId !== undefined) {
      await this.ensureSupplierCompanyExists(data.supplierCompanyId);
    }

    return this.prisma.$transaction(async (tx) => {
      if (data.rateVariants !== undefined) {
        await (tx as any).activityRateVariant.deleteMany({ where: { activityId: id } });
      }

      return (tx as any).activity.update({
        where: { id },
        data: {
          name: data.name === undefined ? undefined : requireTrimmedString(data.name, 'name'),
          description: data.description === undefined ? undefined : normalizeOptionalString(data.description),
          supplierCompanyId:
            data.supplierCompanyId === undefined ? undefined : requireTrimmedString(data.supplierCompanyId, 'supplierCompanyId'),
          pricingBasis: data.pricingBasis === undefined ? undefined : this.normalizePricingBasis(data.pricingBasis),
          costPrice: data.costPrice === undefined ? undefined : ensureValidNumber(data.costPrice, 'costPrice', { min: 0 }),
          sellPrice: data.sellPrice === undefined ? undefined : ensureValidNumber(data.sellPrice, 'sellPrice', { min: 0 }),
          durationMinutes:
            data.durationMinutes === undefined ? undefined : this.normalizeOptionalPositiveInteger(data.durationMinutes, 'durationMinutes'),
          active: data.active === undefined ? undefined : Boolean(data.active),
          rateVariants: this.buildCreateRateVariants(data.rateVariants),
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

  private buildCreateRateVariants(variants: ActivityRateVariantInput[] | undefined) {
    if (variants === undefined) {
      return undefined;
    }

    return {
      create: variants.map((variant, index) => ({
        name: requireTrimmedString(variant.name, `rateVariants[${index}].name`),
        durationMinutes: this.normalizeOptionalPositiveInteger(variant.durationMinutes, `rateVariants[${index}].durationMinutes`),
        pricingBasis: this.normalizePricingBasis(variant.pricingBasis),
        costPrice: ensureValidNumber(variant.costPrice, `rateVariants[${index}].costPrice`, { min: 0 }),
        sellPrice: ensureValidNumber(variant.sellPrice, `rateVariants[${index}].sellPrice`, { min: 0 }),
        maxPaxPerUnit: this.normalizeOptionalPositiveInteger(variant.maxPaxPerUnit, `rateVariants[${index}].maxPaxPerUnit`),
        active: variant.active === undefined ? true : Boolean(variant.active),
        notes: normalizeOptionalString(variant.notes),
        sortOrder: index,
      })),
    };
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
}

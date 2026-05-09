import { BadRequestException, Injectable } from '@nestjs/common';
import {
  blockDelete,
  ensureValidNumber,
  normalizeOptionalString,
  normalizeOptionalSupportedCurrency,
  requireTrimmedString,
  requireSupportedCurrency,
  throwIfNotFound,
} from '../common/crud.helpers';
import { PrismaService } from '../prisma/prisma.service';

type TourismFeeMode = 'PER_NIGHT_PER_PERSON' | 'PER_NIGHT_PER_ROOM';
type ServiceRatePricingMode = 'PER_PERSON' | 'PER_GROUP' | 'PER_VEHICLE' | 'PER_DAY' | 'per_vehicle';
type TicketVariantPricingBasis = 'PER_PERSON' | 'PER_GROUP' | 'PER_DAY';

type TicketRateVariantInput = {
  id?: string | null;
  label: string;
  costPrice: number;
  sellPrice?: number | null;
  currency: string;
  pricingBasis: TicketVariantPricingBasis;
  includedInJordanPass?: boolean | null;
  notes?: string | null;
  active?: boolean;
};

type CreateSupplierServiceInput = {
  supplierId: string;
  name: string;
  category?: string | null;
  serviceTypeId?: string | null;
  unitType: 'per_person' | 'per_room' | 'per_vehicle' | 'per_group' | 'per_night' | 'per_day';
  baseCost: number;
  currency: string;
  costBaseAmount?: number;
  costCurrency?: string;
  salesTaxPercent?: number;
  salesTaxIncluded?: boolean;
  serviceChargePercent?: number;
  serviceChargeIncluded?: boolean;
  tourismFeeAmount?: number | null;
  tourismFeeCurrency?: string | null;
  tourismFeeMode?: TourismFeeMode | null;
  ticketRateVariants?: TicketRateVariantInput[];
};

type UpdateSupplierServiceInput = Partial<CreateSupplierServiceInput>;

type CreateServiceRateInput = {
  supplierId?: string | null;
  costBaseAmount: number;
  costCurrency: string;
  pricingMode: ServiceRatePricingMode;
  salesTaxPercent?: number;
  salesTaxIncluded?: boolean;
  serviceChargePercent?: number;
  serviceChargeIncluded?: boolean;
  tourismFeeAmount?: number | null;
  tourismFeeCurrency?: string | null;
  tourismFeeMode?: TourismFeeMode | null;
  maxPaxPerUnit?: number | null;
};

type UpdateServiceRateInput = Partial<CreateServiceRateInput>;

@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const services = await (this.prisma.supplierService as any).findMany({
      include: {
        serviceType: true,
        serviceRates: {
          orderBy: {
            createdAt: 'desc',
          },
        },
        ticketRateVariants: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return services.map((service: any) => this.serializeService(service));
  }

  async findOne(id: string) {
    const service = await (this.prisma.supplierService as any).findUnique({
      where: { id },
      include: {
        serviceType: true,
        serviceRates: {
          orderBy: {
            createdAt: 'desc',
          },
        },
        ticketRateVariants: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
        _count: {
          select: {
            quoteItems: true,
          },
        },
      },
    });

    return this.serializeService(throwIfNotFound(service, 'Service'));
  }

  async create(data: CreateSupplierServiceInput) {
    const serviceTypeDetails = await this.resolveServiceType({
      category: data.category,
      serviceTypeId: data.serviceTypeId,
    });

    const service = await this.prisma.supplierService.create({
      data: {
        supplierId: requireTrimmedString(data.supplierId, 'supplierId'),
        name: requireTrimmedString(data.name, 'name'),
        category: serviceTypeDetails.categoryName,
        serviceTypeId: serviceTypeDetails.serviceTypeId,
        unitType: data.unitType,
        baseCost: ensureValidNumber(data.costBaseAmount ?? data.baseCost, 'baseCost', { min: 0 }),
        currency: requireSupportedCurrency(data.costCurrency ?? data.currency, 'currency'),
        costBaseAmount: ensureValidNumber(data.costBaseAmount ?? data.baseCost, 'costBaseAmount', { min: 0 }),
        costCurrency: requireSupportedCurrency(data.costCurrency ?? data.currency, 'costCurrency'),
        salesTaxPercent: ensureValidNumber(data.salesTaxPercent ?? 0, 'salesTaxPercent', { min: 0 }),
        salesTaxIncluded: Boolean(data.salesTaxIncluded),
        serviceChargePercent: ensureValidNumber(data.serviceChargePercent ?? 0, 'serviceChargePercent', { min: 0 }),
        serviceChargeIncluded: Boolean(data.serviceChargeIncluded),
        tourismFeeAmount:
          data.tourismFeeAmount === undefined || data.tourismFeeAmount === null
            ? null
            : ensureValidNumber(data.tourismFeeAmount, 'tourismFeeAmount', { min: 0 }),
        tourismFeeCurrency: normalizeOptionalSupportedCurrency(data.tourismFeeCurrency ?? null, 'tourismFeeCurrency'),
        tourismFeeMode: data.tourismFeeMode ?? null,
        ticketRateVariants: data.ticketRateVariants
          ? {
              create: data.ticketRateVariants.map((variant, index) => this.buildTicketRateVariantData(variant, index)),
            }
          : undefined,
      } as any,
      include: {
        serviceType: true,
        ticketRateVariants: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });

    return this.serializeService(service as any);
  }

  async update(id: string, data: UpdateSupplierServiceInput) {
    const existing = await this.findOne(id);
    const serviceTypeDetails =
      data.category !== undefined || data.serviceTypeId !== undefined
        ? await this.resolveServiceType({
            category: data.category,
            serviceTypeId: data.serviceTypeId,
            fallbackCategoryName: existing.category,
          })
        : {
            serviceTypeId: existing.serviceTypeId,
            categoryName: existing.category,
          };

    const updateData = {
      supplierId: data.supplierId === undefined ? undefined : requireTrimmedString(data.supplierId, 'supplierId'),
      name: data.name === undefined ? undefined : requireTrimmedString(data.name, 'name'),
      category: serviceTypeDetails.categoryName,
      serviceTypeId: serviceTypeDetails.serviceTypeId,
      unitType: data.unitType,
      baseCost:
        data.baseCost === undefined && data.costBaseAmount === undefined
          ? undefined
          : ensureValidNumber(data.costBaseAmount ?? data.baseCost ?? (existing as any).costBaseAmount ?? existing.baseCost, 'baseCost', { min: 0 }),
      currency:
        data.currency === undefined && data.costCurrency === undefined
          ? undefined
          : requireSupportedCurrency(data.costCurrency ?? data.currency ?? (existing as any).costCurrency ?? existing.currency, 'currency'),
      costBaseAmount:
        data.costBaseAmount === undefined ? undefined : ensureValidNumber(data.costBaseAmount, 'costBaseAmount', { min: 0 }),
      costCurrency:
        data.costCurrency === undefined
          ? undefined
          : requireSupportedCurrency(data.costCurrency, 'costCurrency'),
      salesTaxPercent:
        data.salesTaxPercent === undefined ? undefined : ensureValidNumber(data.salesTaxPercent, 'salesTaxPercent', { min: 0 }),
      salesTaxIncluded: data.salesTaxIncluded === undefined ? undefined : Boolean(data.salesTaxIncluded),
      serviceChargePercent:
        data.serviceChargePercent === undefined
          ? undefined
          : ensureValidNumber(data.serviceChargePercent, 'serviceChargePercent', { min: 0 }),
      serviceChargeIncluded:
        data.serviceChargeIncluded === undefined ? undefined : Boolean(data.serviceChargeIncluded),
      tourismFeeAmount:
        data.tourismFeeAmount === undefined
          ? undefined
          : data.tourismFeeAmount === null
            ? null
            : ensureValidNumber(data.tourismFeeAmount, 'tourismFeeAmount', { min: 0 }),
      tourismFeeCurrency:
        data.tourismFeeCurrency === undefined
          ? undefined
          : normalizeOptionalSupportedCurrency(data.tourismFeeCurrency, 'tourismFeeCurrency'),
      tourismFeeMode: data.tourismFeeMode === undefined ? undefined : data.tourismFeeMode,
    } as any;

    const service = await this.prisma.$transaction(async (tx) => {
      if (data.ticketRateVariants !== undefined) {
        await this.syncTicketRateVariants(tx, id, data.ticketRateVariants);
      }

      return tx.supplierService.update({
        where: { id },
        data: updateData,
        include: {
          serviceType: true,
          ticketRateVariants: {
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          },
        },
      });
    });

    return this.serializeService(service as any);
  }

  async remove(id: string) {
    const service = await this.findOne(id);

    blockDelete('service', 'quote items', service._count.quoteItems);

    return this.prisma.supplierService.delete({
      where: { id },
    });
  }

  async listRates(serviceId: string) {
    await this.ensureServiceExists(serviceId);

    return (this.prisma as any).serviceRate.findMany({
      where: {
        serviceId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async createRate(serviceId: string, data: CreateServiceRateInput) {
    await this.ensureServiceExists(serviceId);

    return (this.prisma as any).serviceRate.create({
      data: {
        serviceId,
        supplierId: data.supplierId === undefined ? undefined : data.supplierId,
        costBaseAmount: ensureValidNumber(data.costBaseAmount, 'costBaseAmount', { min: 0 }),
        costCurrency: requireSupportedCurrency(data.costCurrency, 'costCurrency'),
        pricingMode: this.normalizeServiceRatePricingMode(data.pricingMode),
        salesTaxPercent: ensureValidNumber(data.salesTaxPercent ?? 0, 'salesTaxPercent', { min: 0 }),
        salesTaxIncluded: Boolean(data.salesTaxIncluded),
        serviceChargePercent: ensureValidNumber(data.serviceChargePercent ?? 0, 'serviceChargePercent', { min: 0 }),
        serviceChargeIncluded: Boolean(data.serviceChargeIncluded),
        tourismFeeAmount:
          data.tourismFeeAmount === undefined || data.tourismFeeAmount === null
            ? null
            : ensureValidNumber(data.tourismFeeAmount, 'tourismFeeAmount', { min: 0 }),
        tourismFeeCurrency: normalizeOptionalSupportedCurrency(data.tourismFeeCurrency ?? null, 'tourismFeeCurrency'),
        tourismFeeMode: data.tourismFeeMode ?? null,
        maxPaxPerUnit: this.normalizeOptionalMaxPaxPerUnit(data.maxPaxPerUnit),
      } as any,
    });
  }

  async updateRate(rateId: string, data: UpdateServiceRateInput) {
    const existing = await (this.prisma as any).serviceRate.findUnique({
      where: { id: rateId },
    });

    if (!existing) {
      throw new BadRequestException('Service rate not found');
    }

    return (this.prisma as any).serviceRate.update({
      where: { id: rateId },
      data: {
        supplierId: data.supplierId === undefined ? undefined : data.supplierId,
        costBaseAmount:
          data.costBaseAmount === undefined
            ? undefined
            : ensureValidNumber(data.costBaseAmount, 'costBaseAmount', { min: 0 }),
        costCurrency:
          data.costCurrency === undefined ? undefined : requireSupportedCurrency(data.costCurrency, 'costCurrency'),
        pricingMode:
          data.pricingMode === undefined ? undefined : this.normalizeServiceRatePricingMode(data.pricingMode),
        salesTaxPercent:
          data.salesTaxPercent === undefined ? undefined : ensureValidNumber(data.salesTaxPercent, 'salesTaxPercent', { min: 0 }),
        salesTaxIncluded: data.salesTaxIncluded === undefined ? undefined : Boolean(data.salesTaxIncluded),
        serviceChargePercent:
          data.serviceChargePercent === undefined
            ? undefined
            : ensureValidNumber(data.serviceChargePercent, 'serviceChargePercent', { min: 0 }),
        serviceChargeIncluded:
          data.serviceChargeIncluded === undefined ? undefined : Boolean(data.serviceChargeIncluded),
        tourismFeeAmount:
          data.tourismFeeAmount === undefined
            ? undefined
            : data.tourismFeeAmount === null
              ? null
              : ensureValidNumber(data.tourismFeeAmount, 'tourismFeeAmount', { min: 0 }),
        tourismFeeCurrency:
          data.tourismFeeCurrency === undefined
            ? undefined
            : normalizeOptionalSupportedCurrency(data.tourismFeeCurrency, 'tourismFeeCurrency'),
        tourismFeeMode: data.tourismFeeMode === undefined ? undefined : data.tourismFeeMode,
        maxPaxPerUnit:
          data.maxPaxPerUnit === undefined
            ? undefined
            : this.normalizeOptionalMaxPaxPerUnit(data.maxPaxPerUnit),
      } as any,
    });
  }

  async removeRate(rateId: string) {
    const existing = await (this.prisma as any).serviceRate.findUnique({
      where: { id: rateId },
    });

    if (!existing) {
      throw new BadRequestException('Service rate not found');
    }

    return (this.prisma as any).serviceRate.delete({
      where: { id: rateId },
    });
  }

  private async resolveServiceType(data: {
    category?: string | null;
    serviceTypeId?: string | null;
    fallbackCategoryName?: string;
  }) {
    if (data.serviceTypeId) {
      const category = normalizeOptionalString(data.category);
      const serviceType = await this.prisma.serviceType.findUnique({
        where: { id: data.serviceTypeId },
      });

      if (!serviceType) {
        throw new BadRequestException('Service type not found');
      }

      return {
        serviceTypeId: serviceType.id,
        categoryName: category || serviceType.name,
      };
    }

    const category = normalizeOptionalString(data.category);

    if (category) {
      return {
        serviceTypeId: null,
        categoryName: category,
      };
    }

    if (data.fallbackCategoryName) {
      return {
        serviceTypeId: null,
        categoryName: data.fallbackCategoryName,
      };
    }

    throw new BadRequestException('category is required');
  }

  private serializeService<
    T extends {
      category: string;
      serviceTypeId: string | null;
      serviceType: { id: string; name: string; code: string | null; isActive: boolean } | null;
    },
  >(service: T) {
    return service;
  }

  private buildTicketRateVariantData(variant: TicketRateVariantInput, index: number) {
    return {
      label: requireTrimmedString(variant.label, `ticketRateVariants[${index}].label`),
      costPrice: ensureValidNumber(variant.costPrice, `ticketRateVariants[${index}].costPrice`, { min: 0 }),
      sellPrice:
        variant.sellPrice === undefined || variant.sellPrice === null
          ? null
          : ensureValidNumber(variant.sellPrice, `ticketRateVariants[${index}].sellPrice`, { min: 0 }),
      currency: requireSupportedCurrency(variant.currency, `ticketRateVariants[${index}].currency`),
      pricingBasis: this.normalizeTicketVariantPricingBasis(variant.pricingBasis),
      includedInJordanPass: variant.includedInJordanPass === undefined ? null : variant.includedInJordanPass,
      notes: normalizeOptionalString(variant.notes),
      active: variant.active === undefined ? true : Boolean(variant.active),
      sortOrder: index,
    };
  }

  private async syncTicketRateVariants(tx: any, serviceId: string, variants: TicketRateVariantInput[]) {
    const existingVariants = await tx.ticketRateVariant.findMany({
      where: { serviceId },
      select: { id: true },
    });
    const existingIds = new Set(existingVariants.map((variant: { id: string }) => variant.id));
    const retainedIds = new Set<string>();

    for (const [index, variant] of variants.entries()) {
      const variantData = this.buildTicketRateVariantData(variant, index);

      if (variant.id && existingIds.has(variant.id)) {
        retainedIds.add(variant.id);
        await tx.ticketRateVariant.update({
          where: { id: variant.id },
          data: variantData,
        });
      } else {
        await tx.ticketRateVariant.create({
          data: {
            ...variantData,
            serviceId,
          },
        });
      }
    }

    const removedIds = existingVariants
      .map((variant: { id: string }) => variant.id)
      .filter((variantId: string) => !retainedIds.has(variantId));

    if (removedIds.length > 0) {
      await tx.ticketRateVariant.updateMany({
        where: { id: { in: removedIds } },
        data: { active: false },
      });
    }
  }

  private async ensureServiceExists(serviceId: string) {
    const service = await this.prisma.supplierService.findUnique({
      where: { id: serviceId },
      select: { id: true },
    });

    if (!service) {
      throw new BadRequestException('Service not found');
    }

    return service;
  }

  private normalizeServiceRatePricingMode(value: string) {
    if (value === 'PER_VEHICLE' || value === 'per_vehicle') {
      return 'PER_GROUP';
    }

    if (value === 'PER_PERSON' || value === 'PER_GROUP' || value === 'PER_DAY') {
      return value;
    }

    throw new BadRequestException('Unsupported service rate pricing mode');
  }

  private normalizeTicketVariantPricingBasis(value: string) {
    if (value === 'PER_PERSON' || value === 'PER_GROUP' || value === 'PER_DAY') {
      return value;
    }

    throw new BadRequestException('Unsupported ticket variant pricing basis');
  }

  private normalizeOptionalMaxPaxPerUnit(value: number | null | undefined) {
    if (value === null || value === undefined) {
      return null;
    }

    const normalized = ensureValidNumber(value, 'maxPaxPerUnit', { min: 0 });
    return Math.floor(normalized);
  }
}

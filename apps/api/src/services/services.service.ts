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
type ServiceRatePricingMode = 'PER_PERSON' | 'PER_GROUP' | 'PER_DAY';

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
      } as any,
      include: {
        serviceType: true,
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

    const service = await this.prisma.supplierService.update({
      where: { id },
      data: {
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
      } as any,
      include: {
        serviceType: true,
      },
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
    if (value === 'PER_PERSON' || value === 'PER_GROUP' || value === 'PER_DAY') {
      return value;
    }

    throw new BadRequestException('Unsupported service rate pricing mode');
  }
}

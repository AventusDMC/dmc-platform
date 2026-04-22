import { BadRequestException, Injectable } from '@nestjs/common';
import {
  blockDelete,
  ensureValidNumber,
  normalizeOptionalString,
  requireTrimmedString,
  throwIfNotFound,
} from '../common/crud.helpers';
import { PrismaService } from '../prisma/prisma.service';

type CreateSupplierServiceInput = {
  supplierId: string;
  name: string;
  category?: string | null;
  serviceTypeId?: string | null;
  unitType: 'per_person' | 'per_room' | 'per_vehicle' | 'per_group' | 'per_night' | 'per_day';
  baseCost: number;
  currency: string;
};

type UpdateSupplierServiceInput = Partial<CreateSupplierServiceInput>;

@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const services = await this.prisma.supplierService.findMany({
      include: {
        serviceType: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return services.map((service) => this.serializeService(service));
  }

  async findOne(id: string) {
    const service = await this.prisma.supplierService.findUnique({
      where: { id },
      include: {
        serviceType: true,
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
        baseCost: ensureValidNumber(data.baseCost, 'baseCost', { min: 0 }),
        currency: requireTrimmedString(data.currency, 'currency').toUpperCase(),
      },
      include: {
        serviceType: true,
      },
    });

    return this.serializeService(service);
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
        baseCost: data.baseCost === undefined ? undefined : ensureValidNumber(data.baseCost, 'baseCost', { min: 0 }),
        currency:
          data.currency === undefined ? undefined : requireTrimmedString(data.currency, 'currency').toUpperCase(),
      },
      include: {
        serviceType: true,
      },
    });

    return this.serializeService(service);
  }

  async remove(id: string) {
    const service = await this.findOne(id);

    blockDelete('service', 'quote items', service._count.quoteItems);

    return this.prisma.supplierService.delete({
      where: { id },
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
}

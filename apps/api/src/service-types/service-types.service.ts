import { BadRequestException, Injectable } from '@nestjs/common';
import {
  blockDelete,
  normalizeOptionalString,
  requireTrimmedString,
  throwIfNotFound,
} from '../common/crud.helpers';
import { PrismaService } from '../prisma/prisma.service';

type FindServiceTypesInput = {
  search?: string;
  active?: boolean;
};

type CreateServiceTypeInput = {
  name: string;
  code?: string | null;
  isActive?: boolean;
};

type UpdateServiceTypeInput = Partial<CreateServiceTypeInput>;

@Injectable()
export class ServiceTypesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(filters: FindServiceTypesInput = {}) {
    const search = filters.search?.trim();

    return this.prisma.serviceType.findMany({
      where: {
        ...(filters.active === undefined ? {} : { isActive: filters.active }),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { code: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string) {
    const serviceType = await this.prisma.serviceType.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            supplierServices: true,
          },
        },
      },
    });

    return throwIfNotFound(serviceType, 'Service type');
  }

  async create(data: CreateServiceTypeInput) {
    const name = requireTrimmedString(data.name, 'name');
    const code = normalizeOptionalString(data.code) ?? null;
    await this.ensureUnique(name, code);

    return this.prisma.serviceType.create({
      data: {
        name,
        code,
        isActive: data.isActive ?? true,
      },
    });
  }

  async update(id: string, data: UpdateServiceTypeInput) {
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('At least one field is required');
    }

    const existing = await this.findOne(id);
    const name = data.name === undefined ? existing.name : requireTrimmedString(data.name, 'name');
    const code = data.code === undefined ? existing.code ?? null : normalizeOptionalString(data.code) ?? null;
    await this.ensureUnique(name, code, id);

    const serviceType = await this.prisma.serviceType.update({
      where: { id },
      data: {
        name,
        code,
        isActive: data.isActive,
      },
    });

    if (name !== existing.name) {
      await this.prisma.supplierService.updateMany({
        where: { serviceTypeId: id },
        data: { category: name },
      });
    }

    return serviceType;
  }

  async remove(id: string) {
    const serviceType = await this.findOne(id);

    blockDelete('service type', 'services', serviceType._count.supplierServices);

    return this.prisma.serviceType.delete({
      where: { id },
    });
  }

  private async ensureUnique(name: string, code: string | null, excludeId?: string) {
    const [existingName, existingCode] = await Promise.all([
      this.prisma.serviceType.findFirst({
        where: {
          name: {
            equals: name,
            mode: 'insensitive',
          },
          ...(excludeId ? { NOT: { id: excludeId } } : {}),
        },
      }),
      code
        ? this.prisma.serviceType.findFirst({
            where: {
              code: {
                equals: code,
                mode: 'insensitive',
              },
              ...(excludeId ? { NOT: { id: excludeId } } : {}),
            },
          })
        : Promise.resolve(null),
    ]);

    if (existingName) {
      throw new BadRequestException('Service type already exists');
    }

    if (existingCode) {
      throw new BadRequestException('Service type code already exists');
    }
  }
}

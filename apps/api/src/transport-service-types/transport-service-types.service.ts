import { Injectable } from '@nestjs/common';
import { blockDelete, throwIfNotFound } from '../common/crud.helpers';
import { PrismaService } from '../prisma/prisma.service';

type CreateTransportServiceTypeInput = {
  name: string;
  code: string;
};

type UpdateTransportServiceTypeInput = Partial<CreateTransportServiceTypeInput>;

@Injectable()
export class TransportServiceTypesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.transportServiceType.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string) {
    const serviceType = await this.prisma.transportServiceType.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            vehicleRates: true,
          },
        },
      },
    });

    return throwIfNotFound(serviceType, 'Transport service type');
  }

  create(data: CreateTransportServiceTypeInput) {
    return this.prisma.transportServiceType.create({
      data: {
        name: data.name.trim(),
        code: data.code.trim().toUpperCase(),
      },
    });
  }

  async update(id: string, data: UpdateTransportServiceTypeInput) {
    await this.findOne(id);

    return this.prisma.transportServiceType.update({
      where: { id },
      data: {
        name: data.name === undefined ? undefined : data.name.trim(),
        code: data.code === undefined ? undefined : data.code.trim().toUpperCase(),
      },
    });
  }

  async remove(id: string) {
    const serviceType = await this.findOne(id);

    blockDelete('transport service type', 'vehicle rates', serviceType._count.vehicleRates);

    return this.prisma.transportServiceType.delete({
      where: { id },
    });
  }
}

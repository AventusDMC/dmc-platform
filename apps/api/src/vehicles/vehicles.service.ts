import { Injectable } from '@nestjs/common';
import { blockDelete, ensureValidNumber, throwIfNotFound } from '../common/crud.helpers';
import { PrismaService } from '../prisma/prisma.service';

type CreateVehicleInput = {
  supplierId: string;
  name: string;
  maxPax: number;
  luggageCapacity: number;
};

type UpdateVehicleInput = Partial<CreateVehicleInput>;

@Injectable()
export class VehiclesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.vehicle.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            vehicleRates: true,
          },
        },
      },
    });

    return throwIfNotFound(vehicle, 'Vehicle');
  }

  create(data: CreateVehicleInput) {
    return this.prisma.vehicle.create({
      data: {
        supplierId: data.supplierId.trim(),
        name: data.name.trim(),
        maxPax: ensureValidNumber(data.maxPax, 'maxPax', { min: 1 }),
        luggageCapacity: ensureValidNumber(data.luggageCapacity, 'luggageCapacity', { min: 0 }),
      },
    });
  }

  async update(id: string, data: UpdateVehicleInput) {
    await this.findOne(id);

    return this.prisma.vehicle.update({
      where: { id },
      data: {
        supplierId: data.supplierId === undefined ? undefined : data.supplierId.trim(),
        name: data.name === undefined ? undefined : data.name.trim(),
        maxPax: data.maxPax === undefined ? undefined : ensureValidNumber(data.maxPax, 'maxPax', { min: 1 }),
        luggageCapacity:
          data.luggageCapacity === undefined
            ? undefined
            : ensureValidNumber(data.luggageCapacity, 'luggageCapacity', { min: 0 }),
      },
    });
  }

  async remove(id: string) {
    const vehicle = await this.findOne(id);

    blockDelete('vehicle', 'vehicle rates', vehicle._count.vehicleRates);

    return this.prisma.vehicle.delete({
      where: { id },
    });
  }
}

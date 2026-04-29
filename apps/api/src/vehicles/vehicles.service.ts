import { Injectable } from '@nestjs/common';
import { blockDelete, ensureValidNumber, throwIfNotFound } from '../common/crud.helpers';
import { resolveOperationalSupplier } from '../common/supplier-resolver';
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

  async findAll() {
    const vehicles = await this.prisma.vehicle.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });

    return Promise.all(vehicles.map((vehicle) => this.serializeVehicle(vehicle)));
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

    return this.serializeVehicle(throwIfNotFound(vehicle, 'Vehicle'));
  }

  async create(data: CreateVehicleInput) {
    await this.warnUnresolvedSupplierId(data.supplierId, 'create');

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
    if (data.supplierId !== undefined) {
      await this.warnUnresolvedSupplierId(data.supplierId, 'update');
    }

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

  private async serializeVehicle<T extends { supplierId: string; supplierName?: string | null; resolvedSupplierId?: string | null }>(vehicle: T) {
    const supplier = await resolveOperationalSupplier({
      supplierId: vehicle.resolvedSupplierId ?? vehicle.supplierId,
      supplierName: vehicle.supplierName ?? vehicle.supplierId,
      prisma: this.prisma,
    });

    return {
      ...vehicle,
      supplierName: supplier.supplierName,
      supplierStatus: supplier.supplierStatus,
    };
  }

  private async warnUnresolvedSupplierId(supplierId: string | null | undefined, action: 'create' | 'update') {
    const supplier = await resolveOperationalSupplier({
      supplierId,
      prisma: this.prisma,
    });

    if (supplier.supplierStatus === 'unresolved') {
      console.warn('[vehicles] unresolved supplierId on catalog write', {
        action,
        supplierId,
      });
    }
  }
}

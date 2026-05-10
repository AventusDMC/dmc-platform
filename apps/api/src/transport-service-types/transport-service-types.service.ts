import { Injectable } from '@nestjs/common';
import { blockDelete, throwIfNotFound } from '../common/crud.helpers';
import type { CanonicalTransportPricingMode } from '../common/transport-pricing-mode-normalization';
import { PrismaService } from '../prisma/prisma.service';

type CreateTransportServiceTypeInput = {
  name: string;
  code: string;
  classification?: 'ROUTE_TRANSFER' | 'FULL_DAY' | 'HALF_DAY' | 'DAILY_PACKAGE' | 'ADD_ON';
};

type UpdateTransportServiceTypeInput = Partial<CreateTransportServiceTypeInput>;

@Injectable()
export class TransportServiceTypesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    await this.ensureCorePricingModeServiceTypes();

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
        classification: data.classification || 'ROUTE_TRANSFER',
      } as any,
    });
  }

  async update(id: string, data: UpdateTransportServiceTypeInput) {
    await this.findOne(id);

    return this.prisma.transportServiceType.update({
      where: { id },
      data: {
        name: data.name === undefined ? undefined : data.name.trim(),
        code: data.code === undefined ? undefined : data.code.trim().toUpperCase(),
        classification: data.classification,
      } as any,
    });
  }

  async remove(id: string) {
    const serviceType = await this.findOne(id);

    blockDelete('transport service type', 'vehicle rates', serviceType._count.vehicleRates);

    return this.prisma.transportServiceType.delete({
      where: { id },
    });
  }

  private async ensureCorePricingModeServiceTypes() {
    const entries: Array<{
      name: CanonicalTransportPricingMode;
      code: string;
      classification: 'ROUTE_TRANSFER' | 'FULL_DAY' | 'HALF_DAY' | 'ADD_ON';
    }> = [
      { name: 'Airport Transfer', code: 'AIRPORT_TRANSFER', classification: 'ROUTE_TRANSFER' },
      { name: 'Point-to-Point', code: 'POINT_TO_POINT', classification: 'ROUTE_TRANSFER' },
      { name: 'Half Day', code: 'HALF_DAY', classification: 'HALF_DAY' },
      { name: 'Full Day', code: 'FULL_DAY', classification: 'FULL_DAY' },
      { name: 'Day Tour', code: 'DAY_TOUR', classification: 'FULL_DAY' },
      { name: 'Stationary / Waiting', code: 'STATIONARY_WAITING', classification: 'ADD_ON' },
      { name: 'Extra Hour', code: 'EXTRA_HOUR', classification: 'ADD_ON' },
      { name: 'Extra KM', code: 'EXTRA_KM', classification: 'ADD_ON' },
    ];

    for (const entry of entries) {
      const existing = await this.prisma.transportServiceType.findFirst({
        where: {
          OR: [
            { name: { equals: entry.name, mode: 'insensitive' } },
            { code: { equals: entry.code, mode: 'insensitive' } },
          ],
        },
      });

      if (existing) {
        continue;
      }

      await this.prisma.transportServiceType.create({
        data: entry as any,
      });
    }
  }
}

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type DriverInput = {
  fullName: string;
  phone?: string | null;
  licenseNumber?: string | null;
  languages?: string[] | string | null;
  active?: boolean | null;
  supplierId?: string | null;
  notes?: string | null;
};

@Injectable()
export class DriversService {
  constructor(private readonly prisma: PrismaService) {}

  // List drivers, optionally filtered. Used by the operations grid dropdown
  // (filter by `supplierId` to scope the dropdown to the supplier already
  // assigned on the service) and by the future /drivers admin page.
  findAll(filter?: { supplierId?: string | null; active?: boolean }) {
    const where: Record<string, unknown> = {};
    if (filter?.supplierId) where.supplierId = filter.supplierId;
    if (filter?.active !== undefined) where.active = filter.active;
    return (this.prisma as any).driver.findMany({
      where,
      include: {
        bookingServices: {
          where: { status: { not: 'cancelled' as any } },
          select: {
            id: true,
            bookingId: true,
            description: true,
            serviceDate: true,
            pickupTime: true,
            startTime: true,
            booking: { select: { bookingRef: true } },
          },
          orderBy: [{ serviceDate: 'asc' }, { createdAt: 'asc' }],
        },
      },
      orderBy: [{ active: 'desc' }, { fullName: 'asc' }],
    });
  }

  create(data: DriverInput) {
    const fullName = this.normalizeRequiredText(data.fullName, 'Driver full name is required');
    return (this.prisma as any).driver.create({
      data: {
        fullName,
        phone: this.normalizeOptionalText(data.phone),
        licenseNumber: this.normalizeOptionalText(data.licenseNumber),
        languages: this.parseList(data.languages),
        active: data.active === undefined || data.active === null ? true : Boolean(data.active),
        supplierId: this.normalizeOptionalText(data.supplierId),
        notes: this.normalizeOptionalText(data.notes),
      },
    });
  }

  async update(id: string, data: Partial<DriverInput>) {
    await this.assertDriver(id);
    return (this.prisma as any).driver.update({
      where: { id },
      data: {
        fullName:
          data.fullName === undefined
            ? undefined
            : this.normalizeRequiredText(data.fullName, 'Driver full name is required'),
        phone: data.phone === undefined ? undefined : this.normalizeOptionalText(data.phone),
        licenseNumber:
          data.licenseNumber === undefined ? undefined : this.normalizeOptionalText(data.licenseNumber),
        languages: data.languages === undefined ? undefined : this.parseList(data.languages),
        active: data.active === undefined || data.active === null ? undefined : Boolean(data.active),
        supplierId: data.supplierId === undefined ? undefined : this.normalizeOptionalText(data.supplierId),
        notes: data.notes === undefined ? undefined : this.normalizeOptionalText(data.notes),
      },
    });
  }

  private async assertDriver(id: string) {
    const driver = await (this.prisma as any).driver.findUnique({ where: { id } });
    if (!driver) throw new NotFoundException('Driver not found');
    return driver;
  }

  private normalizeRequiredText(value: string | null | undefined, message: string) {
    const normalized = this.normalizeOptionalText(value);
    if (!normalized) throw new BadRequestException(message);
    return normalized;
  }

  private normalizeOptionalText(value: string | null | undefined) {
    const normalized = String(value || '').trim();
    return normalized || null;
  }

  private parseList(value: string[] | string | null | undefined) {
    if (Array.isArray(value)) {
      return value.map((entry) => this.normalizeOptionalText(entry)).filter(Boolean) as string[];
    }
    return String(value || '')
      .split(/\r?\n|,/)
      .map((entry) => this.normalizeOptionalText(entry))
      .filter(Boolean) as string[];
  }
}

import { Injectable } from '@nestjs/common';
import { normalizeOptionalString, throwIfNotFound } from '../common/crud.helpers';
import { PrismaService } from '../prisma/prisma.service';

type CreateSupplierInput = {
  name: string;
  type: 'hotel' | 'transport' | 'activity' | 'guide' | 'other';
  email?: string;
  phone?: string;
  notes?: string;
};

type UpdateSupplierInput = {
  name?: string;
  type?: 'hotel' | 'transport' | 'activity' | 'guide' | 'other';
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
};

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.supplier.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  create(data: CreateSupplierInput) {
    return this.prisma.supplier.create({
      data: {
        name: data.name.trim(),
        type: data.type,
        email: normalizeOptionalString(data.email),
        phone: normalizeOptionalString(data.phone),
        notes: normalizeOptionalString(data.notes),
      },
    });
  }

  async update(id: string, data: UpdateSupplierInput) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id },
    });

    throwIfNotFound(supplier, 'Supplier');

    return this.prisma.supplier.update({
      where: { id },
      data: {
        name: data.name === undefined ? undefined : data.name.trim(),
        type: data.type,
        email: data.email === undefined ? undefined : normalizeOptionalString(data.email ?? undefined),
        phone: data.phone === undefined ? undefined : normalizeOptionalString(data.phone ?? undefined),
        notes: data.notes === undefined ? undefined : normalizeOptionalString(data.notes ?? undefined),
      },
    });
  }

  async remove(id: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id },
    });

    throwIfNotFound(supplier, 'Supplier');

    return this.prisma.supplier.delete({
      where: { id },
    });
  }
}

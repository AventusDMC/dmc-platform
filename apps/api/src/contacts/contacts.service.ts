import { BadRequestException, Injectable } from '@nestjs/common';
import { blockDelete, normalizeOptionalString, throwIfNotFound } from '../common/crud.helpers';
import { PrismaService } from '../prisma/prisma.service';

type CreateContactInput = {
  companyId: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  title?: string;
};

type UpdateContactInput = {
  companyId?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  title?: string;
};

@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.contact.findMany({
      include: {
        company: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string) {
    const contact = await this.prisma.contact.findUnique({
      where: { id },
      include: {
        company: true,
        _count: {
          select: {
            quotes: true,
          },
        },
      },
    });

    return throwIfNotFound(contact, 'Contact');
  }

  async create(data: CreateContactInput) {
    const company = await this.prisma.company.findUnique({
      where: { id: data.companyId },
    });

    if (!company) {
      throw new BadRequestException('Company not found');
    }

    return this.prisma.contact.create({
      data: {
        companyId: data.companyId,
        firstName: data.firstName,
        lastName: data.lastName,
        email: normalizeOptionalString(data.email),
        phone: normalizeOptionalString(data.phone),
        title: normalizeOptionalString(data.title),
      },
      include: {
        company: true,
      },
    });
  }

  async update(id: string, data: UpdateContactInput) {
    const contact = await this.findOne(id);
    const companyId = data.companyId ?? contact.companyId;

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      throw new BadRequestException('Company not found');
    }

    if (companyId !== contact.companyId && contact._count.quotes > 0) {
      throw new BadRequestException('Cannot move contact because linked quotes exist');
    }

    return this.prisma.contact.update({
      where: { id },
      data: {
        companyId,
        firstName: data.firstName === undefined ? undefined : data.firstName.trim(),
        lastName: data.lastName === undefined ? undefined : data.lastName.trim(),
        email: normalizeOptionalString(data.email),
        phone: normalizeOptionalString(data.phone),
        title: normalizeOptionalString(data.title),
      },
      include: {
        company: true,
      },
    });
  }

  async remove(id: string) {
    const contact = await this.findOne(id);

    blockDelete('contact', 'quotes', contact._count.quotes);

    return this.prisma.contact.delete({
      where: { id },
    });
  }
}

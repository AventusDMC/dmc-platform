import { BadRequestException, Injectable } from '@nestjs/common';
import { requireActorCompanyId, type CompanyScopedActor } from '../auth/company-scope';
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

  findAll(actor?: CompanyScopedActor) {
    requireActorCompanyId(actor);
    return this.prisma.contact.findMany({
      include: {
        company: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string, actor?: CompanyScopedActor) {
    requireActorCompanyId(actor);
    const contact = await this.prisma.contact.findFirst({
      where: {
        id,
      },
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

  async create(data: CreateContactInput, actor?: CompanyScopedActor) {
    requireActorCompanyId(actor);
    const contactCompanyId = data.companyId?.trim();

    const company = await this.prisma.company.findFirst({
      where: { id: contactCompanyId },
    });

    if (!company) {
      throw new BadRequestException('Company not found');
    }

    return this.prisma.contact.create({
      data: {
        companyId: contactCompanyId,
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        email: normalizeOptionalString(data.email),
        phone: normalizeOptionalString(data.phone),
        title: normalizeOptionalString(data.title),
      },
      include: {
        company: true,
      },
    });
  }

  async update(id: string, data: UpdateContactInput, actor?: CompanyScopedActor) {
    requireActorCompanyId(actor);
    const contact = await this.findOne(id, actor);
    const nextCompanyId = data.companyId?.trim() || contact.companyId;

    const company = await this.prisma.company.findFirst({
      where: { id: nextCompanyId },
    });

    if (!company) {
      throw new BadRequestException('Company not found');
    }

    if (nextCompanyId !== contact.companyId && contact._count.quotes > 0) {
      throw new BadRequestException('Cannot move contact because linked quotes exist');
    }

    return this.prisma.contact.update({
      where: { id: contact.id },
      data: {
        companyId: nextCompanyId,
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

  async remove(id: string, actor?: CompanyScopedActor) {
    const contact = await this.findOne(id, actor);

    blockDelete('contact', 'quotes', contact._count.quotes);

    return this.prisma.contact.delete({
      where: { id: contact.id },
    });
  }
}

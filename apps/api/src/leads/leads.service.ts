import { BadRequestException, Injectable } from '@nestjs/common';
import { normalizeOptionalString, throwIfNotFound } from '../common/crud.helpers';
import { PrismaService } from '../prisma/prisma.service';

type CreateLeadInput = {
  inquiry: string;
  source?: string;
  status?: string;
};

type UpdateLeadInput = {
  inquiry?: string;
  source?: string;
  status?: string;
};

type ConvertLeadInput = {
  companyName: string;
  contactName: string;
  email?: string;
};

@Injectable()
export class LeadsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.lead.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string) {
    const lead = await this.prisma.lead.findUnique({
      where: { id },
    });

    return throwIfNotFound(lead, 'Lead');
  }

  create(data: CreateLeadInput) {
    return this.prisma.lead.create({
      data: {
        inquiry: data.inquiry,
        source: normalizeOptionalString(data.source),
        status: data.status || 'new',
      },
    });
  }

  async update(id: string, data: UpdateLeadInput) {
    await this.findOne(id);

    return this.prisma.lead.update({
      where: { id },
      data: {
        inquiry: data.inquiry,
        source: normalizeOptionalString(data.source),
        status: data.status,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    return this.prisma.lead.delete({
      where: { id },
    });
  }

  async convert(id: string, data: ConvertLeadInput) {
    const lead = await this.findOne(id);

    if (lead.status === 'converted') {
      throw new BadRequestException('Lead already converted');
    }

    const companyName = data.companyName.trim();
    const contactName = data.contactName.trim();
    const email = normalizeOptionalString(data.email);

    if (!companyName || !contactName) {
      throw new BadRequestException('Company name and contact name are required');
    }

    const [firstName, ...lastNameParts] = contactName.split(/\s+/);
    const lastName = lastNameParts.join(' ') || 'Lead';

    return this.prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name: companyName,
        },
      });

      const contact = await tx.contact.create({
        data: {
          companyId: company.id,
          firstName,
          lastName,
          email,
        },
        include: {
          company: true,
        },
      });

      const updatedLead = await tx.lead.update({
        where: { id },
        data: {
          companyId: company.id,
          status: 'converted',
        },
      });

      return {
        lead: updatedLead,
        company,
        contact,
      };
    });
  }
}

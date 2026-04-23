import { BadRequestException, Injectable } from '@nestjs/common';
import { requireActorCompanyId, type CompanyScopedActor } from '../auth/company-scope';
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

  findAll(actor?: CompanyScopedActor) {
    const companyId = requireActorCompanyId(actor);
    return this.prisma.lead.findMany({
      where: {
        companyId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string, actor?: CompanyScopedActor) {
    const companyId = requireActorCompanyId(actor);
    const lead = await this.prisma.lead.findFirst({
      where: {
        id,
        companyId,
      },
    });

    return throwIfNotFound(lead, 'Lead');
  }

  create(data: CreateLeadInput, actor?: CompanyScopedActor) {
    const companyId = requireActorCompanyId(actor);
    return this.prisma.lead.create({
      data: {
        companyId,
        inquiry: data.inquiry,
        source: normalizeOptionalString(data.source),
        status: data.status || 'new',
      },
    });
  }

  async update(id: string, data: UpdateLeadInput, actor?: CompanyScopedActor) {
    const lead = await this.findOne(id, actor);

    return this.prisma.lead.update({
      where: { id: lead.id },
      data: {
        inquiry: data.inquiry,
        source: normalizeOptionalString(data.source),
        status: data.status,
      },
    });
  }

  async remove(id: string, actor?: CompanyScopedActor) {
    const lead = await this.findOne(id, actor);

    return this.prisma.lead.delete({
      where: { id: lead.id },
    });
  }

  async convert(id: string, data: ConvertLeadInput, actor?: CompanyScopedActor) {
    const companyId = requireActorCompanyId(actor);
    const lead = await this.findOne(id, actor);

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
      const company = await tx.company.findFirst({
        where: {
          id: companyId,
        },
      });

      if (!company) {
        throw new BadRequestException('Company not found');
      }

      const contact = await tx.contact.create({
        data: {
          companyId,
          firstName,
          lastName,
          email,
        },
        include: {
          company: true,
        },
      });

      const updatedLead = await tx.lead.update({
        where: { id: lead.id },
        data: {
          companyId,
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

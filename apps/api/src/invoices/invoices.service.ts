import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { requireActorCompanyId, type CompanyScopedActor } from '../auth/company-scope';

type InvoiceStatusValue = 'DRAFT' | 'ISSUED' | 'PAID' | 'CANCELLED';
type QuoteStatusValue = 'DRAFT' | 'READY' | 'SENT' | 'ACCEPTED' | 'CONFIRMED' | 'REVISION_REQUESTED' | 'EXPIRED' | 'CANCELLED';

type AuditActor = {
  userId: string;
  label?: string | null;
} | null;

const INVOICE_STATUS_TRANSITIONS: Record<InvoiceStatusValue, InvoiceStatusValue[]> = {
  DRAFT: [],
  ISSUED: ['PAID', 'CANCELLED'],
  PAID: [],
  CANCELLED: [],
};

@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(actor?: CompanyScopedActor) {
    const companyId = requireActorCompanyId(actor);
    return (this.prisma as any).invoice.findMany({
      where: {
        quote: {
          clientCompanyId: companyId,
        },
      },
      include: {
        quote: {
          include: {
            clientCompany: true,
            contact: true,
            booking: {
              select: {
                id: true,
                status: true,
              },
            },
          },
        },
      },
      orderBy: [{ dueDate: 'asc' }, { id: 'desc' }],
    });
  }

  findOne(id: string, actor?: CompanyScopedActor) {
    const companyId = requireActorCompanyId(actor);
    return (this.prisma as any).invoice.findFirst({
      where: {
        id,
        quote: {
          clientCompanyId: companyId,
        },
      },
      include: {
        quote: {
          include: {
            clientCompany: true,
            contact: true,
            booking: {
              select: {
                id: true,
                status: true,
              },
            },
          },
        },
        auditLogs: {
          orderBy: [{ createdAt: 'desc' }],
        },
      },
    });
  }

  async updateStatus(
    id: string,
    data: {
      status: InvoiceStatusValue;
      note?: string | null;
      actor?: AuditActor;
      companyActor?: CompanyScopedActor;
    },
  ) {
    const companyId = requireActorCompanyId(data.companyActor);
    const invoice = await (this.prisma as any).invoice.findFirst({
      where: {
        id,
        quote: {
          clientCompanyId: companyId,
        },
      },
      select: {
        id: true,
        quoteId: true,
        status: true,
      } as any,
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (data.status === invoice.status) {
      const existing = await this.findOne(id, data.companyActor);

      if (!existing) {
        throw new NotFoundException('Invoice not found');
      }

      return existing;
    }

    const currentStatus = invoice.status as InvoiceStatusValue;
    const allowedTransitions = INVOICE_STATUS_TRANSITIONS[currentStatus];

    if (!allowedTransitions.includes(data.status)) {
      throw new BadRequestException(`Invoice cannot move from ${currentStatus} to ${data.status}`);
    }

    await this.prisma.$transaction(async (tx) => {
      await (tx as any).invoice.update({
        where: { id },
        data: {
          status: data.status,
        },
      });

      await (tx as any).invoiceAuditLog.create({
        data: {
          invoiceId: invoice.id,
          quoteId: invoice.quoteId,
          action: 'invoice_status_updated',
          oldValue: currentStatus,
          newValue: data.status,
          note: data.note?.trim() || null,
          actorUserId: this.normalizeActorUserId(data.actor),
          actor: this.normalizeActorLabel(data.actor),
        },
      });

      if (data.status === 'PAID') {
        await (tx as any).quote.update({
          where: { id: invoice.quoteId },
          data: {
            status: 'CONFIRMED' as QuoteStatusValue,
          },
        });
      }
    });

    const updated = await this.findOne(id, data.companyActor);

    if (!updated) {
      throw new NotFoundException('Invoice not found');
    }

    return updated;
  }

  markPaid(id: string, data: { note?: string | null; actor?: AuditActor; companyActor?: CompanyScopedActor }) {
    return this.updateStatus(id, {
      status: 'PAID',
      note: data.note,
      actor: data.actor,
      companyActor: data.companyActor,
    });
  }

  cancel(id: string, data: { note?: string | null; actor?: AuditActor; companyActor?: CompanyScopedActor }) {
    return this.updateStatus(id, {
      status: 'CANCELLED',
      note: data.note,
      actor: data.actor,
      companyActor: data.companyActor,
    });
  }

  private normalizeActorUserId(actor?: AuditActor) {
    const actorUserId = actor?.userId?.trim() || '';
    return actorUserId || null;
  }

  private normalizeActorLabel(actor?: AuditActor) {
    const label = actor?.label?.trim() || '';
    return label || null;
  }
}

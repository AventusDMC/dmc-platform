import { Controller, Get, NotFoundException, Param, Patch, Body, Post, Res, StreamableFile } from '@nestjs/common';
import { Actor, Roles } from '../auth/auth.decorators';
import { AuthenticatedActor } from '../auth/auth.types';
import { InvoicesService } from './invoices.service';

type UpdateInvoiceStatusBody = {
  status: 'DRAFT' | 'ISSUED' | 'PAID' | 'CANCELLED';
  note?: string | null;
};

type InvoiceActionBody = {
  note?: string | null;
};

type CreateInvoicePaymentBody = {
  paymentDate?: string | null;
  amount: number;
  currency?: string | null;
  method?: 'bank' | 'cash' | 'card' | null;
  reference?: string | null;
  notes?: string | null;
};

type SendInvoiceBody = {
  email?: string | null;
  allowCancelled?: boolean | null;
};

type SendReminderBody = {
  email?: string | null;
};

@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  private toAuditActor(actor: AuthenticatedActor | null | undefined) {
    if (!actor) {
      return null;
    }

    return {
      userId: actor.id,
      label: actor.auditLabel,
    };
  }

  @Get()
  @Roles('admin', 'viewer', 'finance')
  findAll(@Actor() actor: AuthenticatedActor) {
    return this.invoicesService.findAll(actor);
  }

  @Get(':id')
  @Roles('admin', 'viewer', 'finance')
  async findOne(@Param('id') id: string, @Actor() actor: AuthenticatedActor) {
    const invoice = await this.invoicesService.findOne(id, actor);

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    return invoice;
  }

  @Get(':id/pdf')
  @Roles('admin', 'finance')
  async downloadPdf(
    @Param('id') id: string,
    @Actor() actor: AuthenticatedActor,
    @Res({ passthrough: true }) response: any,
  ) {
    const invoice = await this.invoicesService.findOne(id, actor);

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    const pdfBuffer = await this.invoicesService.generatePdf(id, actor);
    const fileName =
      `${invoice.invoiceNumber || 'invoice'}`
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'invoice';

    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', `attachment; filename="${fileName}.pdf"`);

    return new StreamableFile(pdfBuffer);
  }

  @Patch(':id/status')
  @Roles('admin', 'finance')
  updateStatus(
    @Param('id') id: string,
    @Body() body: UpdateInvoiceStatusBody,
    @Actor() actor: AuthenticatedActor,
  ) {
    return this.invoicesService.updateStatus(id, {
      status: body.status,
      note: body.note === undefined ? undefined : body.note || null,
      actor: this.toAuditActor(actor),
      companyActor: actor,
    });
  }

  @Patch(':id/mark-paid')
  @Roles('admin', 'finance')
  markPaid(
    @Param('id') id: string,
    @Body() body: InvoiceActionBody,
    @Actor() actor: AuthenticatedActor,
  ) {
    return this.invoicesService.markPaid(id, {
      note: body.note === undefined ? undefined : body.note || null,
      actor: this.toAuditActor(actor),
      companyActor: actor,
    });
  }

  @Patch(':id/cancel')
  @Roles('admin', 'finance')
  cancel(
    @Param('id') id: string,
    @Body() body: InvoiceActionBody,
    @Actor() actor: AuthenticatedActor,
  ) {
    return this.invoicesService.cancel(id, {
      note: body.note === undefined ? undefined : body.note || null,
      actor: this.toAuditActor(actor),
      companyActor: actor,
    });
  }

  @Post(':id/payments')
  @Roles('admin', 'finance')
  createPayment(
    @Param('id') id: string,
    @Body() body: CreateInvoicePaymentBody,
    @Actor() actor: AuthenticatedActor,
  ) {
    return this.invoicesService.createPayment(id, {
      paymentDate: body.paymentDate === undefined ? undefined : body.paymentDate || null,
      amount: Number(body.amount),
      currency: body.currency === undefined ? undefined : body.currency || null,
      method: body.method === undefined ? undefined : body.method || null,
      reference: body.reference === undefined ? undefined : body.reference || null,
      notes: body.notes === undefined ? undefined : body.notes || null,
      actor: this.toAuditActor(actor),
      companyActor: actor,
    });
  }

  @Post(':id/send')
  @Roles('admin', 'finance')
  sendInvoice(
    @Param('id') id: string,
    @Body() body: SendInvoiceBody,
    @Actor() actor: AuthenticatedActor,
  ) {
    return this.invoicesService.sendInvoice(id, {
      email: body.email === undefined ? undefined : body.email || null,
      allowCancelled: body.allowCancelled === undefined ? undefined : Boolean(body.allowCancelled),
      actor: this.toAuditActor(actor),
      companyActor: actor,
    });
  }

  @Post(':id/send-reminder')
  @Roles('admin', 'finance')
  sendReminder(
    @Param('id') id: string,
    @Body() body: SendReminderBody,
    @Actor() actor: AuthenticatedActor,
  ) {
    return this.invoicesService.sendReminder(id, {
      email: body.email === undefined ? undefined : body.email || null,
      actor: this.toAuditActor(actor),
      companyActor: actor,
    });
  }
}

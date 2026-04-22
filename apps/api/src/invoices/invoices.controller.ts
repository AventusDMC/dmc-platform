import { Controller, Get, NotFoundException, Param, Patch, Body } from '@nestjs/common';
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
  @Roles('admin', 'sales', 'finance')
  findAll() {
    return this.invoicesService.findAll();
  }

  @Get(':id')
  @Roles('admin', 'sales', 'finance')
  async findOne(@Param('id') id: string) {
    const invoice = await this.invoicesService.findOne(id);

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    return invoice;
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
    });
  }
}

import { Body, Controller, Get, Param, Patch, Res, StreamableFile } from '@nestjs/common';
import { Actor, Roles } from '../auth/auth.decorators';
import { AuthenticatedActor } from '../auth/auth.types';
import { BookingsService } from './bookings.service';

type UpdateVoucherStatusBody = {
  status: 'DRAFT' | 'ISSUED' | 'CANCELLED';
};

@Controller('vouchers')
export class VouchersController {
  constructor(private readonly bookingsService: BookingsService) {}

  private toAuditActor(actor: AuthenticatedActor | null | undefined) {
    if (!actor) {
      return null;
    }

    return {
      userId: actor.id,
      label: actor.auditLabel,
    };
  }

  @Get(':id/pdf')
  @Roles('admin', 'operations')
  async downloadVoucherPdf(
    @Param('id') id: string,
    @Actor() actor: AuthenticatedActor,
    @Res({ passthrough: true }) response: any,
  ) {
    const pdfBuffer = await this.bookingsService.generateServiceVoucherPdf(id, actor);
    const safeFileName =
      `${id}-voucher`
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'service-voucher';

    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', `attachment; filename="${safeFileName}.pdf"`);

    return new StreamableFile(pdfBuffer);
  }

  @Patch(':id/status')
  @Roles('admin', 'operations')
  updateVoucherStatus(
    @Param('id') id: string,
    @Body() body: UpdateVoucherStatusBody,
    @Actor() actor: AuthenticatedActor,
  ) {
    return this.bookingsService.updateVoucherStatus(id, body.status, this.toAuditActor(actor), actor);
  }
}

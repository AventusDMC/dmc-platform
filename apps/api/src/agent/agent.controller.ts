import { Body, Controller, Get, NotFoundException, Param, Post, Res, StreamableFile } from '@nestjs/common';
import { Actor, Roles } from '../auth/auth.decorators';
import { AuthenticatedActor } from '../auth/auth.types';
import { AgentService } from './agent.service';

@Controller('agent')
@Roles('agent', 'admin')
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Get('me')
  getMe(@Actor() actor: AuthenticatedActor) {
    return this.agentService.getMe(actor);
  }

  @Get('quotes')
  getQuotes(@Actor() actor: AuthenticatedActor) {
    return this.agentService.getQuotes(actor);
  }

  @Get('quotes/:id')
  async getQuote(@Param('id') id: string, @Actor() actor: AuthenticatedActor) {
    const quote = await this.agentService.getQuote(id, actor);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    return quote;
  }

  @Get('bookings')
  getBookings(@Actor() actor: AuthenticatedActor) {
    return this.agentService.getBookings(actor);
  }

  @Get('bookings/:id')
  async getBooking(@Param('id') id: string, @Actor() actor: AuthenticatedActor) {
    const booking = await this.agentService.getBooking(id, actor);

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    return booking;
  }

  @Post('bookings/:id/amendment-requests')
  requestBookingAmendment(
    @Param('id') id: string,
    @Body() body: { amendmentType?: string | null; notes?: string | null },
    @Actor() actor: AuthenticatedActor,
  ) {
    return this.agentService.requestBookingAmendment(id, actor, {
      amendmentType: body.amendmentType,
      notes: body.notes,
    });
  }

  @Get('bookings/:id/voucher/pdf')
  async downloadBookingVoucherPdf(
    @Param('id') id: string,
    @Actor() actor: AuthenticatedActor,
    @Res({ passthrough: true }) response: any,
  ) {
    const pdfBuffer = await this.agentService.getBookingVoucherPdf(id, actor);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', 'attachment; filename="booking-voucher.pdf"');

    return new StreamableFile(pdfBuffer);
  }

  @Get('invoices')
  getInvoices(@Actor() actor: AuthenticatedActor) {
    return this.agentService.getInvoices(actor);
  }

  @Get('invoices/:id/pdf')
  async downloadInvoicePdf(
    @Param('id') id: string,
    @Actor() actor: AuthenticatedActor,
    @Res({ passthrough: true }) response: any,
  ) {
    const pdfBuffer = await this.agentService.getInvoicePdf(id, actor);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', 'attachment; filename="invoice.pdf"');

    return new StreamableFile(pdfBuffer);
  }

  @Get('departures')
  getDepartures(@Actor() actor: AuthenticatedActor) {
    return this.agentService.getDepartures(actor);
  }

  @Get('proposals')
  getProposals(@Actor() actor: AuthenticatedActor) {
    return this.agentService.getProposals(actor);
  }
}

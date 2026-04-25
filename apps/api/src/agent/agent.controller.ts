import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
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

  @Get('invoices')
  getInvoices(@Actor() actor: AuthenticatedActor) {
    return this.agentService.getInvoices(actor);
  }

  @Get('proposals')
  getProposals(@Actor() actor: AuthenticatedActor) {
    return this.agentService.getProposals(actor);
  }
}

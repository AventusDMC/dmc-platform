import { Controller, Get, Param } from '@nestjs/common';
import { Roles } from '../auth/auth.decorators';
import { QuoteIntelligenceService } from './quote-intelligence.service';

@Controller('quotes/:id/operational-intelligence')
export class QuoteIntelligenceController {
  constructor(private readonly intelligence: QuoteIntelligenceService) {}

  // Operational intelligence overlay for a single quote — risk score,
  // supplier reliability flags, capacity warnings, complexity insight.
  // Sales + operations + admin can see (sales needs it most).
  @Get()
  @Roles('admin', 'operations', 'agent', 'agent_admin')
  forQuote(@Param('id') id: string) {
    return this.intelligence.getIntelligence(id);
  }
}

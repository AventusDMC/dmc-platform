import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../auth/auth.decorators';
import { FinancialIntelligenceService } from './financial-intelligence.service';
import { IntelligenceService } from './intelligence.service';

@Controller('operations/intelligence')
export class IntelligenceController {
  constructor(
    private readonly intelligence: IntelligenceService,
    private readonly financialIntelligence: FinancialIntelligenceService,
  ) {}

  // One fat dashboard payload — performance + bottlenecks + capacity
  // forecast + heatmap + trends + warnings. Range bounded to 7-90 days.
  @Get()
  @Roles('admin', 'operations')
  dashboard(@Query('rangeDays') rangeDays?: string) {
    return this.intelligence.getDashboard({ rangeDays: rangeDays ? Number(rangeDays) : undefined });
  }

  // Financial convergence dashboard — heuristic cost-leakage estimates per
  // incident, supplier reliability scoring, margin leakage breakdown, SLA
  // exposure, preferred + risk suppliers, top-cost rows, alerts. Lives at
  // /operations/intelligence/financial.
  @Get('financial')
  @Roles('admin', 'operations', 'finance')
  financialDashboard(@Query('rangeDays') rangeDays?: string) {
    return this.financialIntelligence.getDashboard({ rangeDays: rangeDays ? Number(rangeDays) : undefined });
  }
}

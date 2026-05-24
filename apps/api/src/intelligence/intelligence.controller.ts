import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../auth/auth.decorators';
import { IntelligenceService } from './intelligence.service';

@Controller('operations/intelligence')
export class IntelligenceController {
  constructor(private readonly intelligence: IntelligenceService) {}

  // One fat dashboard payload — performance + bottlenecks + capacity
  // forecast + heatmap + trends + warnings. Range bounded to 7-90 days.
  @Get()
  @Roles('admin', 'operations')
  dashboard(@Query('rangeDays') rangeDays?: string) {
    return this.intelligence.getDashboard({ rangeDays: rangeDays ? Number(rangeDays) : undefined });
  }
}

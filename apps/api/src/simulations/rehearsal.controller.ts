import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../auth/auth.decorators';
import { RehearsalScoringService } from './rehearsal-scoring.service';

@Controller('operations/rehearsal')
export class RehearsalController {
  constructor(private readonly rehearsal: RehearsalScoringService) {}

  // List rehearsal scenarios for the picker on /operations/rehearsal.
  @Get('scenarios')
  @Roles('admin', 'operations')
  scenarios() {
    return this.rehearsal.listScenarios();
  }

  // Live scorecard over a recent time window. The frontend records the
  // rehearsal start timestamp in URL state and computes sinceMinutes from
  // it; this endpoint returns the scorecard for that window.
  @Get('scorecard')
  @Roles('admin', 'operations')
  scorecard(@Query('sinceMinutes') sinceMinutes?: string, @Query('actor') actor?: string) {
    return this.rehearsal.getScorecard({
      sinceMinutes: sinceMinutes ? Number(sinceMinutes) : undefined,
      actor: actor || undefined,
    });
  }
}

import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Actor, Roles } from '../auth/auth.decorators';
import type { AuthenticatedActor } from '../auth/auth.types';
import { RecoveryService } from './recovery.service';

@Controller('bookings/services/:serviceId/recovery')
export class RecoveryController {
  constructor(private readonly recovery: RecoveryService) {}

  // GET .../suggestions — alternative suppliers / drivers / vehicles / guides
  // available to swap in for this incident. Used by the recovery action panel.
  @Get('suggestions')
  @Roles('admin', 'operations')
  suggestions(@Param('serviceId') serviceId: string) {
    return this.recovery.getSuggestions(serviceId);
  }

  // GET .../impact — downstream-affected operations / passengers / rooming /
  // vouchers within the same booking. Used by the cascading impact view.
  @Get('impact')
  @Roles('admin', 'operations')
  impact(@Param('serviceId') serviceId: string) {
    return this.recovery.getImpact(serviceId);
  }

  @Post('delay')
  @Roles('admin', 'operations')
  delay(
    @Param('serviceId') serviceId: string,
    @Body() body: { minutes?: number | string; reason?: string },
    @Actor() actor: AuthenticatedActor,
  ) {
    return this.recovery.delayService(serviceId, {
      minutes: Number(body.minutes),
      reason: body.reason || null,
      actor,
    });
  }

  @Post('escalate')
  @Roles('admin', 'operations')
  escalate(
    @Param('serviceId') serviceId: string,
    @Body() body: { severity?: string; notes?: string },
    @Actor() actor: AuthenticatedActor,
  ) {
    return this.recovery.escalateOps(serviceId, {
      severity: String(body.severity || '').toUpperCase() as any,
      notes: body.notes || null,
      actor,
    });
  }

  @Post('request-replacement')
  @Roles('admin', 'operations')
  requestReplacement(
    @Param('serviceId') serviceId: string,
    @Body() body: { target?: string; reason?: string },
    @Actor() actor: AuthenticatedActor,
  ) {
    return this.recovery.requestReplacement(serviceId, {
      target: String(body.target || '').toUpperCase() as any,
      reason: body.reason || null,
      actor,
    });
  }
}

@Controller('operations/recovery')
export class RecoveryMetricsController {
  constructor(private readonly recovery: RecoveryService) {}

  @Get('metrics')
  @Roles('admin', 'operations')
  metrics(@Query('rangeDays') rangeDays?: string) {
    return this.recovery.getRecoveryMetrics({ rangeDays: rangeDays ? Number(rangeDays) : undefined });
  }
}

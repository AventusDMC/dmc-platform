import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Actor, Roles } from '../auth/auth.decorators';
import type { AuthenticatedActor } from '../auth/auth.types';
import { SimulationsService, SimulationScenarioKey } from './simulations.service';

@Controller('operations/simulation')
export class SimulationsController {
  constructor(private readonly simulations: SimulationsService) {}

  // List available scenarios for the /operations/simulation page.
  @Get('scenarios')
  @Roles('admin', 'operations')
  listScenarios() {
    return this.simulations.listScenarios();
  }

  // Apply a scenario to a booking. The simulation page POSTs with the
  // scenario key in the URL and { bookingId } in the body.
  @Post('scenarios/:key')
  @Roles('admin', 'operations')
  applyScenario(
    @Param('key') key: string,
    @Body() body: { bookingId?: string },
    @Actor() actor: AuthenticatedActor,
  ) {
    return this.simulations.applyScenario(
      key as SimulationScenarioKey,
      String(body.bookingId || '').trim(),
      actor?.email || actor?.id || 'unknown',
    );
  }
}

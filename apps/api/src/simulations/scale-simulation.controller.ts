import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Actor, Roles } from '../auth/auth.decorators';
import type { AuthenticatedActor } from '../auth/auth.types';
import { ScalePresetKey, ScaleSimulationService } from './scale-simulation.service';

@Controller('operations/simulation/scale')
export class ScaleSimulationController {
  constructor(private readonly scale: ScaleSimulationService) {}

  // List available presets for the /operations/simulation/scale page.
  @Get('presets')
  @Roles('admin', 'operations')
  listPresets() {
    return this.scale.listPresets();
  }

  // Current synthetic data status — drives the "X synthetic services
  // active" indicator + the disable-apply-button check.
  @Get('status')
  @Roles('admin', 'operations')
  status() {
    return this.scale.getStatus();
  }

  // Apply a preset — refuses if synthetic data already exists.
  @Post('presets/:key')
  @Roles('admin', 'operations')
  applyPreset(@Param('key') key: string, @Actor() actor: AuthenticatedActor) {
    return this.scale.applyPreset(key as ScalePresetKey, actor?.email || actor?.id || null);
  }

  // Cleanup — deletes every synthetic service tagged with scaleSimMarker.
  @Post('clear')
  @Roles('admin', 'operations')
  clear() {
    return this.scale.clearSynthetic();
  }
}

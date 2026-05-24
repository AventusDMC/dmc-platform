import { Controller, Get, Param, Query } from '@nestjs/common';
import { Roles } from '../auth/auth.decorators';
import { ResourcesService } from './resources.service';

@Controller('operations/resources')
export class ResourcesController {
  constructor(private readonly resources: ResourcesService) {}

  // GET /operations/resources/conflicts?rangeDays=14
  // Resource Conflict Center landing data — driver / vehicle / guide
  // conflicts across all bookings in the window.
  @Get('conflicts')
  @Roles('admin', 'operations')
  conflicts(@Query('rangeDays') rangeDays?: string) {
    return this.resources.findConflicts({ rangeDays: rangeDays ? Number(rangeDays) : undefined });
  }

  // GET /operations/resources/utilization?rangeDays=7
  // Aggregate utilization % per resource type for the metrics row.
  @Get('utilization')
  @Roles('admin', 'operations')
  utilization(@Query('rangeDays') rangeDays?: string) {
    return this.resources.getUtilization({ rangeDays: rangeDays ? Number(rangeDays) : undefined });
  }

  // GET /operations/resources/timeline/:type/:id?rangeDays=14
  // Per-resource chronological assignment list with overlap markers.
  @Get('timeline/:type/:id')
  @Roles('admin', 'operations')
  timeline(
    @Param('type') type: 'driver' | 'vehicle' | 'guide',
    @Param('id') id: string,
    @Query('rangeDays') rangeDays?: string,
  ) {
    return this.resources.getTimeline({
      type,
      id,
      rangeDays: rangeDays ? Number(rangeDays) : undefined,
    });
  }
}

import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../auth/auth.decorators';
import { ExecutiveService } from './executive.service';

@Controller('executive/operations')
export class ExecutiveController {
  constructor(private readonly executive: ExecutiveService) {}

  // Executive-level rollup of the entire operational stack. Allow admin +
  // operations + finance to view — same pool that can see the underlying
  // analytics. Range bounded to 7-90 days.
  @Get()
  @Roles('admin', 'operations', 'finance')
  dashboard(@Query('rangeDays') rangeDays?: string) {
    return this.executive.getDashboard({ rangeDays: rangeDays ? Number(rangeDays) : undefined });
  }
}

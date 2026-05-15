import { Controller, Get, Query } from '@nestjs/common';
import { Actor, Roles } from '../auth/auth.decorators';
import { AuthenticatedActor } from '../auth/auth.types';
import { BookingsService } from './bookings.service';

@Controller('operations')
export class OperationsDashboardController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Get('dashboard')
  @Roles('admin', 'operations')
  getDashboard(
    @Actor() actor: AuthenticatedActor,
    @Query('date') date?: string,
    @Query('bookingStatus') bookingStatus?: string,
    @Query('serviceStatus') serviceStatus?: string,
    @Query('serviceType') serviceType?: string,
    @Query('supplier') supplier?: string,
    @Query('department') department?: string,
    @Query('status') status?: string,
  ) {
    return this.bookingsService.getOperationsDashboard({
      actor,
      date,
      bookingStatus,
      serviceStatus,
      serviceType,
      supplier,
      department,
      status,
    });
  }

  @Get('mobile-data')
  @Roles('admin', 'operations')
  getMobileData(@Actor() actor: AuthenticatedActor, @Query('date') date?: string) {
    return this.bookingsService.getOperationsMobileData({
      actor,
      date,
    });
  }
}

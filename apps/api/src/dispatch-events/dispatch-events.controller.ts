import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../auth/auth.decorators';
import { DispatchEventsService, DispatchEventTypeKey } from './dispatch-events.service';

@Controller('dispatch-events')
export class DispatchEventsController {
  constructor(private readonly eventsService: DispatchEventsService) {}

  // Operations + admin both consume — used by /operations/simulation event
  // timeline + (future) per-booking timeline drawer.
  @Get()
  @Roles('admin', 'operations')
  list(
    @Query('bookingId') bookingId?: string,
    @Query('bookingServiceId') bookingServiceId?: string,
    @Query('eventType') eventType?: string,
    @Query('limit') limit?: string,
    @Query('sinceHours') sinceHours?: string,
  ) {
    const since = sinceHours
      ? new Date(Date.now() - Math.max(1, Number(sinceHours)) * 3600_000)
      : undefined;
    return this.eventsService.list({
      bookingId: bookingId || undefined,
      bookingServiceId: bookingServiceId || undefined,
      eventType: (eventType as DispatchEventTypeKey) || undefined,
      limit: limit ? Number(limit) : undefined,
      since,
    });
  }
}

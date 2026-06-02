import { Controller, Get, Param } from '@nestjs/common';
import { Actor, Roles } from '../auth/auth.decorators';
import { AuthenticatedActor } from '../auth/auth.types';
import { BookingSingleSupplementService } from './booking-single-supplement.service';

@Controller('bookings')
export class BookingSingleSupplementController {
  constructor(private readonly singleSupplement: BookingSingleSupplementService) {}

  @Get(':id/single-supplement')
  @Roles('admin', 'operations', 'finance')
  getSingleSupplement(@Param('id') id: string, @Actor() actor: AuthenticatedActor) {
    return this.singleSupplement.compute(id, actor);
  }
}

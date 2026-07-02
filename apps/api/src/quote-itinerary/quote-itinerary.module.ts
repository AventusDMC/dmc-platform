import { Module } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { QuoteItineraryController } from './quote-itinerary.controller';
import { QuoteItineraryV2Controller } from './quote-itinerary-v2.controller';
import { QuoteItineraryService } from './quote-itinerary.service';
import { QuoteItineraryV2Service } from './quote-itinerary-v2.service';

@Module({
  controllers: [QuoteItineraryController, QuoteItineraryV2Controller],
  // AuditService is stateless (depends only on the global PrismaService), so
  // providing it here is a harmless local instance for the V2 edit audit trail.
  providers: [QuoteItineraryService, QuoteItineraryV2Service, AuditService],
})
export class QuoteItineraryModule {}

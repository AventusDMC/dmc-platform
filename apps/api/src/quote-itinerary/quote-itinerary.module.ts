import { Module } from '@nestjs/common';
import { QuoteItineraryController } from './quote-itinerary.controller';
import { QuoteItineraryService } from './quote-itinerary.service';

@Module({
  controllers: [QuoteItineraryController],
  providers: [QuoteItineraryService],
})
export class QuoteItineraryModule {}

import { Body, Controller, Post } from '@nestjs/common';
import { QuotesGuidedService } from './quotes-guided.service';

@Controller('quotes/guided')
export class QuotesGuidedController {
  constructor(private readonly service: QuotesGuidedService) {}

  /**
   * Build per-destination touring-route suggestions + pacing assessment
   * for the Guided Journey Composer panel. POST so callers can pass an
   * arbitrary-length destination array without URL encoding hassles.
   *
   * Pure read — no pricing changes, no writes.
   */
  @Post('suggestions')
  suggestions(@Body() body: { arrivalCity?: string | null; destinations?: string[] }) {
    return this.service.getJourneySuggestions({
      arrivalCity: body?.arrivalCity ?? null,
      destinations: Array.isArray(body?.destinations) ? body.destinations : [],
    });
  }

  /**
   * v2A — Intelligent Hotel Suggestions. Per-destination tiered hotel
   * shortlist (Luxury / Standard / Budget) with operational confidence
   * + recommended meal plan + quick notes. Pure read — never touches
   * pricing.
   */
  @Post('hotel-suggestions')
  hotelSuggestions(@Body() body: { destinations?: string[] }) {
    return this.service.getHotelSuggestionsForJourney({
      destinations: Array.isArray(body?.destinations) ? body.destinations : [],
    });
  }
}

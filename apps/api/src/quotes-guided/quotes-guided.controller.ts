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

  /**
   * v2B — Experiences & Activity Intelligence. Per-destination activity
   * suggestions grouped by travel mood (Culture / Adventure / Religious
   * / Relaxation / Family / Wellness / Food & Local), plus a top-of-
   * journey highlights strip. Pure read — never touches pricing.
   */
  @Post('experience-suggestions')
  experienceSuggestions(@Body() body: { destinations?: string[] }) {
    return this.service.getExperienceSuggestionsForJourney({
      destinations: Array.isArray(body?.destinations) ? body.destinations : [],
    });
  }

  /**
   * v2C — Vehicle & Transport Intelligence. Returns the recommended
   * vehicle class for the journey's pax count + per-leg route
   * confidence overlays (airport / mountain / border / desert) +
   * journey-level transport pacing assessment. Pure read; never
   * touches pricing or dispatch.
   */
  @Post('transport-suggestions')
  transportSuggestions(@Body() body: { arrivalCity?: string | null; destinations?: string[]; paxCount?: number }) {
    return this.service.getTransportSuggestionsForJourney({
      arrivalCity: body?.arrivalCity ?? null,
      destinations: Array.isArray(body?.destinations) ? body.destinations : [],
      paxCount: Number.isFinite(Number(body?.paxCount)) ? Number(body?.paxCount) : 0,
    });
  }
}

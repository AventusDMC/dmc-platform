import { Body, Controller, Get, Post, Query } from '@nestjs/common';

import { Roles } from '../../auth/auth.decorators';
import { RateHawkService } from './ratehawk.service';

// Hotels Engine v2 — RateHawk import endpoints.
//
// /ratehawk/status        → which mode (fixture vs live) + default countries
// /ratehawk/sync          → pull inventory from RateHawk into staging table
// /ratehawk/candidates    → paginated list of staged candidates for the wizard
// /ratehawk/facets        → distinct countries / cities / star counts for filters
// /ratehawk/import        → promote selected candidates into the hotels catalog

@Controller('ratehawk')
export class RateHawkController {
  constructor(private readonly service: RateHawkService) {}

  @Get('status')
  status() {
    return this.service.status();
  }

  @Post('sync')
  @Roles('admin', 'operations')
  sync(@Body() body: { countryCodes?: string[] }) {
    return this.service.sync(body?.countryCodes);
  }

  @Get('candidates')
  candidates(
    @Query('countryCode') countryCode?: string,
    @Query('cityName') cityName?: string,
    @Query('starRating') starRating?: string,
    @Query('importedOnly') importedOnly?: string,
    @Query('notImportedOnly') notImportedOnly?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const parsedStar = starRating ? Number.parseInt(starRating, 10) : NaN;
    return this.service.findCandidates({
      countryCode,
      cityName,
      starRating: Number.isFinite(parsedStar) ? parsedStar : undefined,
      importedOnly: importedOnly === 'true',
      notImportedOnly: notImportedOnly === 'true',
      search,
      limit: limit ? Math.max(1, Math.min(200, Number.parseInt(limit, 10) || 50)) : undefined,
      offset: offset ? Math.max(0, Number.parseInt(offset, 10) || 0) : undefined,
    });
  }

  @Get('facets')
  facets() {
    return this.service.findFacets();
  }

  @Post('import')
  @Roles('admin', 'operations')
  import(@Body() body: { candidateIds: string[] }) {
    return this.service.importCandidates(body?.candidateIds ?? []);
  }
}

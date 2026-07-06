import { Controller, Get } from '@nestjs/common';
import { Actor, Roles } from '../auth/auth.decorators';
import { AuthenticatedActor } from '../auth/auth.types';
import { CatalogService } from './catalog.service';

/**
 * Product Catalog V2 — Slice 1 read-only aggregator route.
 *
 * GET /catalog/v2/summary — every authenticated role is admitted (so the view is
 * shared), and pricing/rate FIGURES are redacted in the service for non-pricing
 * roles (agent / viewer / agent_admin). Unauthenticated requests are blocked by
 * the RolesGuard (a role list is present). Backend-flag-gated and fail-closed
 * inside the service (CATALOG_V2_ENABLED). Read-only — no writes, no send.
 */
@Controller('catalog/v2')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get('summary')
  @Roles('admin', 'operations', 'super_admin', 'finance', 'agent', 'viewer', 'agent_admin')
  getSummary(@Actor() actor: AuthenticatedActor) {
    return this.catalogService.getV2Summary(actor?.role ?? null);
  }
}

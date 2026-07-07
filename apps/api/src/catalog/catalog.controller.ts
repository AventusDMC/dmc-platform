import { Controller, Get } from '@nestjs/common';
import { Actor, Roles } from '../auth/auth.decorators';
import { AuthenticatedActor } from '../auth/auth.types';
import { CatalogService } from './catalog.service';

/**
 * Product Catalog V2 — read-only aggregator route.
 *
 * GET /catalog/v2/summary. Unauthenticated requests are blocked by the RolesGuard
 * (a role list is present). The @Roles list stays broad so the service can apply,
 * in order: (1) the fail-closed CATALOG_V2_ENABLED flag, then (2) the Slice 3
 * INTERNAL-FIRST role gate. The role gate is an EXPLICIT allowlist in the service
 * (admin / operations / super_admin / finance) — done there, not via @Roles,
 * because the RolesGuard coalesces agent_admin→admin, which must be blocked for
 * the first production debut. Pricing redaction in the builder is retained for a
 * future widen-out. Read-only — no writes, no send.
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

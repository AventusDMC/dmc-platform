import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { HotelContractHealthService } from './hotel-contract-health.service';
import type { ConfidenceStatus, ContractSnapshot } from './hotel-contract-health.validators';

// Hotel Contract Stabilization & Trustworthiness v2 — public API.
// Mounted at /hotel-contract-health to keep the routes isolated from
// the existing /hotel-contracts CRUD endpoints. The pricing engine
// never reaches into this controller.

@Controller('hotel-contract-health')
export class HotelContractHealthController {
  constructor(private readonly service: HotelContractHealthService) {}

  // GET /hotel-contract-health/dashboard — counts + section listings.
  @Get('dashboard')
  getDashboard() {
    return this.service.getHealthDashboard();
  }

  // GET /hotel-contract-health/correction-queue?limit=25
  @Get('correction-queue')
  getCorrectionQueue(@Query('limit') limit?: string) {
    return this.service.getCorrectionQueue({
      limit: limit === undefined ? undefined : Number(limit),
    });
  }

  // GET /hotel-contract-health/room-mapping-suggestion?name=Classic+Mountain+View
  @Get('room-mapping-suggestion')
  suggestRoomMapping(@Query('name') name: string) {
    return this.service.suggestRoomMapping(name || '');
  }

  // GET /hotel-contract-health/contracts/:id/validation — full
  // validator output for a single contract.
  @Get('contracts/:id/validation')
  validateContract(@Param('id') id: string) {
    return this.service.validateContract(id);
  }

  // POST /hotel-contract-health/contracts/:id/diff — accepts a candidate
  // snapshot (typically from the re-upload flow) and returns what
  // changed / added / removed. The diff is NEVER applied automatically.
  @Post('contracts/:id/diff')
  diffContract(@Param('id') id: string, @Body() body: ContractSnapshot) {
    return this.service.diffAgainstSnapshot(id, body);
  }

  // PATCH /hotel-contract-health/contracts/:id/confidence — operator-driven
  // confidence updates. The only mutation this controller performs.
  @Patch('contracts/:id/confidence')
  updateConfidence(
    @Param('id') id: string,
    @Body() body: { status: ConfidenceStatus; verifiedBy?: string | null; notes?: string | null },
  ) {
    return this.service.updateConfidence(id, body);
  }
}

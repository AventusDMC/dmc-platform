import { Controller, Get } from '@nestjs/common';
import { Roles } from '../auth/auth.decorators';
import { ProductionReadinessService } from './production-readiness.service';

@Controller('admin/production-readiness')
export class ProductionReadinessController {
  constructor(private readonly readiness: ProductionReadinessService) {}

  // Admin-only platform health view. Returns a single payload with five
  // categorised check sections + an aggregate health score (0-100).
  @Get()
  @Roles('admin')
  dashboard() {
    return this.readiness.getDashboard();
  }
}

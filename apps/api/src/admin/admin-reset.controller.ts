import { Body, Controller, Post } from '@nestjs/common';
import { Roles } from '../auth/auth.decorators';
import { AdminResetService } from './admin-reset.service';

type ResetTestDataBody = {
  confirmation?: string;
};

@Controller('admin')
@Roles('admin')
export class AdminResetController {
  constructor(private readonly adminResetService: AdminResetService) {}

  @Post('reset-test-data')
  resetTestData(@Body() body: ResetTestDataBody) {
    return this.adminResetService.resetTestData(body?.confirmation);
  }
}

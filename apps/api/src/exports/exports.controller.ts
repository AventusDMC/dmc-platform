import { Controller, Get, Query, Res, StreamableFile } from '@nestjs/common';
import { Actor, Roles } from '../auth/auth.decorators';
import { AuthenticatedActor } from '../auth/auth.types';
import { ExportsService } from './exports.service';

@Controller('exports')
export class ExportsController {
  constructor(private readonly exportsService: ExportsService) {}

  @Get('invoices.csv')
  @Roles('admin', 'finance')
  async exportInvoices(
    @Query('startDate') startDate: string | undefined,
    @Query('endDate') endDate: string | undefined,
    @Query('status') status: string | undefined,
    @Actor() actor: AuthenticatedActor,
    @Res({ passthrough: true }) response: any,
  ) {
    const exported = await this.exportsService.exportInvoices({ startDate, endDate, status }, actor);
    this.setCsvHeaders(response, exported.fileName);
    return new StreamableFile(Buffer.from(exported.content, 'utf8'));
  }

  @Get('payments.csv')
  @Roles('admin', 'finance')
  async exportPayments(
    @Query('startDate') startDate: string | undefined,
    @Query('endDate') endDate: string | undefined,
    @Query('status') status: string | undefined,
    @Actor() actor: AuthenticatedActor,
    @Res({ passthrough: true }) response: any,
  ) {
    const exported = await this.exportsService.exportPayments({ startDate, endDate, status }, actor);
    this.setCsvHeaders(response, exported.fileName);
    return new StreamableFile(Buffer.from(exported.content, 'utf8'));
  }

  @Get('supplier-payables.csv')
  @Roles('admin', 'finance')
  async exportSupplierPayables(
    @Query('startDate') startDate: string | undefined,
    @Query('endDate') endDate: string | undefined,
    @Query('status') status: string | undefined,
    @Actor() actor: AuthenticatedActor,
    @Res({ passthrough: true }) response: any,
  ) {
    const exported = await this.exportsService.exportSupplierPayables({ startDate, endDate, status }, actor);
    this.setCsvHeaders(response, exported.fileName);
    return new StreamableFile(Buffer.from(exported.content, 'utf8'));
  }

  private setCsvHeaders(response: any, fileName: string) {
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  }
}

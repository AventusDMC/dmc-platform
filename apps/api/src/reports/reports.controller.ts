import { Controller, Get, Post, Query } from '@nestjs/common';
import { Actor, Roles } from '../auth/auth.decorators';
import { AuthenticatedActor } from '../auth/auth.types';
import { ReportsService } from './reports.service';
import { InvoicesService } from '../invoices/invoices.service';

@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly invoicesService: InvoicesService,
  ) {}

  @Get('booking-summary')
  @Roles('admin', 'finance', 'operations')
  getBookingSummary(
    @Query('startDate') startDate: string | undefined,
    @Query('endDate') endDate: string | undefined,
    @Actor() actor: AuthenticatedActor,
  ) {
    return this.reportsService.getBookingSummary({ startDate, endDate }, actor);
  }

  @Get('monthly-trends')
  @Roles('admin', 'finance', 'operations')
  getMonthlyTrends(
    @Query('startDate') startDate: string | undefined,
    @Query('endDate') endDate: string | undefined,
    @Actor() actor: AuthenticatedActor,
  ) {
    return this.reportsService.getMonthlyTrends({ startDate, endDate }, actor);
  }

  @Get('supplier-performance')
  @Roles('admin', 'finance', 'operations')
  getSupplierPerformance(
    @Query('startDate') startDate: string | undefined,
    @Query('endDate') endDate: string | undefined,
    @Actor() actor: AuthenticatedActor,
  ) {
    return this.reportsService.getSupplierPerformance({ startDate, endDate }, actor);
  }

  @Get('supplier-payables')
  @Roles('admin', 'finance', 'operations')
  getSupplierPayables(@Actor() actor: AuthenticatedActor) {
    return this.reportsService.getSupplierPayables(actor);
  }

  @Get('finance-summary')
  @Roles('admin', 'finance')
  getFinanceSummary(@Actor() actor: AuthenticatedActor) {
    return this.reportsService.getFinanceSummary(actor);
  }

  @Get('alerts')
  @Roles('admin', 'finance', 'operations')
  getAlerts(@Actor() actor: AuthenticatedActor) {
    return this.reportsService.getAlerts(actor);
  }

  @Post('send-overdue-reminders')
  @Roles('admin', 'finance')
  sendOverdueReminders(@Actor() actor: AuthenticatedActor) {
    return this.invoicesService.sendOverdueReminders({
      actor: {
        userId: actor.id,
        label: actor.auditLabel,
      },
      companyActor: actor,
    });
  }
}

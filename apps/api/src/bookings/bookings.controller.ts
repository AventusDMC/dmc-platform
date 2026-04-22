import { Body, Controller, Delete, Get, Headers, NotFoundException, Param, Patch, Post, Query, Res, StreamableFile } from '@nestjs/common';
import { Actor, Public, Roles } from '../auth/auth.decorators';
import { AuthService } from '../auth/auth.service';
import { AuthenticatedActor } from '../auth/auth.types';
import { BookingsService } from './bookings.service';

type AssignBookingServiceSupplierBody = {
  supplierId?: string | null;
  supplierName?: string | null;
};

type UpdateBookingServiceConfirmationBody = {
  confirmationStatus: 'pending' | 'requested' | 'confirmed';
  confirmationNumber?: string | null;
  supplierReference?: string | null;
  notes?: string | null;
};

type UpdateBookingServiceOperationalBody = {
  serviceDate?: string | null;
  startTime?: string | null;
  pickupTime?: string | null;
  pickupLocation?: string | null;
  meetingPoint?: string | null;
  participantCount?: number | null;
  adultCount?: number | null;
  childCount?: number | null;
  supplierReference?: string | null;
  reconfirmationRequired?: boolean | null;
  reconfirmationDueAt?: string | null;
  note?: string | null;
};

type SendBookingDocumentEmailBody = {
  email: string;
  bookingId: string;
  documentType: 'voucher' | 'supplier-confirmation';
};

type UpdateBookingStatusBody = {
  status: 'draft' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
  note: string;
};

type UpdateBookingFinanceBody = {
  clientInvoiceStatus?: 'unbilled' | 'invoiced' | 'paid';
  supplierPaymentStatus?: 'unpaid' | 'scheduled' | 'paid';
};

type CreateBookingPassengerBody = {
  firstName: string;
  lastName: string;
  title?: string | null;
  notes?: string | null;
  isLead?: boolean;
};

type UpdateBookingPassengerBody = {
  firstName?: string;
  lastName?: string;
  title?: string | null;
  notes?: string | null;
  isLead?: boolean;
};

type CreateBookingRoomingEntryBody = {
  roomType?: string | null;
  occupancy?: 'single' | 'double' | 'triple' | 'quad' | 'unknown';
  notes?: string | null;
  sortOrder?: number | null;
};

type UpdateBookingRoomingEntryBody = {
  roomType?: string | null;
  occupancy?: 'single' | 'double' | 'triple' | 'quad' | 'unknown';
  notes?: string | null;
  sortOrder?: number | null;
};

type AssignBookingPassengerToRoomBody = {
  passengerId: string;
};

type ManualBookingServiceActionBody = {
  action: 'cancel' | 'reopen' | 'mark_ready';
  note: string;
};

type BulkBookingServiceActionBody = {
  serviceIds: string[];
  action: 'cancel' | 'reopen' | 'mark_ready' | 'request_confirmation';
  note: string;
};

type SupplierConfirmBookingServiceBody = {
  confirmationNumber?: string | null;
  supplierReference?: string | null;
  notes?: string | null;
};

@Controller('bookings')
export class BookingsController {
  constructor(
    private readonly bookingsService: BookingsService,
    private readonly authService: AuthService,
  ) {}

  private toAuditActor(actor: AuthenticatedActor | null | undefined) {
    if (!actor) {
      return null;
    }

    return {
      userId: actor.id,
      label: actor.auditLabel,
    };
  }

  @Get()
  findAll() {
    return this.bookingsService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const booking = await this.bookingsService.findOne(id);

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    return booking;
  }

  @Get(':id/portal')
  @Public()
  async findPortalBooking(@Param('id') id: string, @Query('token') token?: string) {
    const booking = await this.bookingsService.findPortalBooking(id, token);

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    return booking;
  }

  @Get(':id/supplier-portal')
  @Public()
  async findSupplierPortalBooking(@Param('id') id: string, @Query('token') token?: string) {
    const booking = await this.bookingsService.findSupplierPortalBooking(id, token);

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    return booking;
  }

  @Get(':id/voucher/pdf')
  async downloadVoucherPdf(@Param('id') id: string, @Res({ passthrough: true }) response: any) {
    const booking = await this.bookingsService.findOne(id);

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const pdfBuffer = await this.bookingsService.generateVoucherPdf(id);
    const fileName =
      `${booking.bookingRef || 'booking'}-voucher`
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'booking-voucher';

    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', `attachment; filename="${fileName}.pdf"`);

    return new StreamableFile(pdfBuffer);
  }

  @Get(':id/portal-voucher/pdf')
  @Public()
  async downloadPortalVoucherPdf(
    @Param('id') id: string,
    @Query('token') token: string | undefined,
    @Res({ passthrough: true }) response: any,
  ) {
    const booking = await this.bookingsService.findPortalBooking(id, token);

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const pdfBuffer = await this.bookingsService.generateVoucherPdf(id);
    const fileName =
      `${booking.bookingRef || 'booking'}-voucher`
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'booking-voucher';

    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', `attachment; filename="${fileName}.pdf"`);

    return new StreamableFile(pdfBuffer);
  }

  @Get(':id/supplier-confirmation/pdf')
  async downloadSupplierConfirmationPdf(@Param('id') id: string, @Res({ passthrough: true }) response: any) {
    const booking = await this.bookingsService.findOne(id);

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const pdfBuffer = await this.bookingsService.generateSupplierConfirmationPdf(id);
    const fileName =
      `${booking.bookingRef || 'booking'}-supplier-confirmation`
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'booking-supplier-confirmation';

    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', `attachment; filename="${fileName}.pdf"`);

    return new StreamableFile(pdfBuffer);
  }

  @Post('send-document-email')
  @Roles('admin', 'operations')
  sendDocumentEmail(@Body() body: SendBookingDocumentEmailBody) {
    return this.bookingsService.sendDocumentEmail({
      email: body.email,
      bookingId: body.bookingId,
      documentType: body.documentType,
    });
  }

  @Post(':id/portal-access-token')
  @Roles('admin', 'operations')
  regeneratePortalAccessToken(@Param('id') id: string) {
    return this.bookingsService.regeneratePortalAccessToken(id);
  }

  @Patch(':id/status')
  @Roles('admin', 'operations')
  updateBookingStatus(
    @Param('id') id: string,
    @Body() body: UpdateBookingStatusBody,
    @Actor() actor: AuthenticatedActor,
  ) {
    return this.bookingsService.updateBookingStatus(id, {
      status: body.status,
      note: body.note,
      actor: this.toAuditActor(actor),
    });
  }

  @Patch(':id/finance')
  @Roles('admin', 'finance')
  updateBookingFinance(
    @Param('id') id: string,
    @Body() body: UpdateBookingFinanceBody,
    @Actor() actor: AuthenticatedActor,
  ) {
    return this.bookingsService.updateBookingFinance(id, {
      clientInvoiceStatus: body.clientInvoiceStatus,
      supplierPaymentStatus: body.supplierPaymentStatus,
      actor: this.toAuditActor(actor),
    });
  }

  @Post(':id/passengers')
  @Roles('admin', 'operations')
  createPassenger(
    @Param('id') id: string,
    @Body() body: CreateBookingPassengerBody,
    @Actor() actor: AuthenticatedActor,
  ) {
    return this.bookingsService.createPassenger(id, {
      firstName: body.firstName,
      lastName: body.lastName,
      title: body.title === undefined ? undefined : body.title || null,
      notes: body.notes === undefined ? undefined : body.notes || null,
      isLead: body.isLead === undefined ? undefined : Boolean(body.isLead),
      actor: this.toAuditActor(actor),
    });
  }

  @Patch(':id/passengers/:passengerId')
  @Roles('admin', 'operations')
  updatePassenger(
    @Param('id') id: string,
    @Param('passengerId') passengerId: string,
    @Body() body: UpdateBookingPassengerBody,
    @Actor() actor: AuthenticatedActor,
  ) {
    return this.bookingsService.updatePassenger(id, passengerId, {
      firstName: body.firstName,
      lastName: body.lastName,
      title: body.title === undefined ? undefined : body.title || null,
      notes: body.notes === undefined ? undefined : body.notes || null,
      isLead: body.isLead === undefined ? undefined : Boolean(body.isLead),
      actor: this.toAuditActor(actor),
    });
  }

  @Delete(':id/passengers/:passengerId')
  @Roles('admin', 'operations')
  deletePassenger(
    @Param('id') id: string,
    @Param('passengerId') passengerId: string,
    @Actor() actor: AuthenticatedActor,
  ) {
    return this.bookingsService.deletePassenger(id, passengerId, this.toAuditActor(actor));
  }

  @Post(':id/passengers/:passengerId/set-lead')
  @Roles('admin', 'operations')
  setLeadPassenger(
    @Param('id') id: string,
    @Param('passengerId') passengerId: string,
    @Actor() actor: AuthenticatedActor,
  ) {
    return this.bookingsService.setLeadPassenger(id, passengerId, this.toAuditActor(actor));
  }

  @Post(':id/rooming')
  @Roles('admin', 'operations')
  createRoomingEntry(
    @Param('id') id: string,
    @Body() body: CreateBookingRoomingEntryBody,
    @Actor() actor: AuthenticatedActor,
  ) {
    return this.bookingsService.createRoomingEntry(id, {
      roomType: body.roomType === undefined ? undefined : body.roomType || null,
      occupancy: body.occupancy,
      notes: body.notes === undefined ? undefined : body.notes || null,
      sortOrder: body.sortOrder === undefined || body.sortOrder === null ? undefined : Number(body.sortOrder),
      actor: this.toAuditActor(actor),
    });
  }

  @Patch(':id/rooming/:roomingEntryId')
  @Roles('admin', 'operations')
  updateRoomingEntry(
    @Param('id') id: string,
    @Param('roomingEntryId') roomingEntryId: string,
    @Body() body: UpdateBookingRoomingEntryBody,
    @Actor() actor: AuthenticatedActor,
  ) {
    return this.bookingsService.updateRoomingEntry(id, roomingEntryId, {
      roomType: body.roomType === undefined ? undefined : body.roomType || null,
      occupancy: body.occupancy,
      notes: body.notes === undefined ? undefined : body.notes || null,
      sortOrder: body.sortOrder === undefined || body.sortOrder === null ? undefined : Number(body.sortOrder),
      actor: this.toAuditActor(actor),
    });
  }

  @Delete(':id/rooming/:roomingEntryId')
  @Roles('admin', 'operations')
  deleteRoomingEntry(
    @Param('id') id: string,
    @Param('roomingEntryId') roomingEntryId: string,
    @Actor() actor: AuthenticatedActor,
  ) {
    return this.bookingsService.deleteRoomingEntry(id, roomingEntryId, this.toAuditActor(actor));
  }

  @Post(':id/rooming/:roomingEntryId/assignments')
  @Roles('admin', 'operations')
  assignPassengerToRoom(
    @Param('id') id: string,
    @Param('roomingEntryId') roomingEntryId: string,
    @Body() body: AssignBookingPassengerToRoomBody,
    @Actor() actor: AuthenticatedActor,
  ) {
    return this.bookingsService.assignPassengerToRoom(id, roomingEntryId, body.passengerId, this.toAuditActor(actor));
  }

  @Delete(':id/rooming/:roomingEntryId/assignments/:passengerId')
  @Roles('admin', 'operations')
  unassignPassengerFromRoom(
    @Param('id') id: string,
    @Param('roomingEntryId') roomingEntryId: string,
    @Param('passengerId') passengerId: string,
    @Actor() actor: AuthenticatedActor,
  ) {
    return this.bookingsService.unassignPassengerFromRoom(id, roomingEntryId, passengerId, this.toAuditActor(actor));
  }

  @Patch('services/:serviceId/assign-supplier')
  @Roles('admin', 'operations')
  assignSupplier(
    @Param('serviceId') serviceId: string,
    @Body() body: AssignBookingServiceSupplierBody,
    @Actor() actor: AuthenticatedActor,
  ) {
    return this.bookingsService.assignSupplier(serviceId, {
      supplierId: body.supplierId === undefined ? undefined : body.supplierId || null,
      supplierName: body.supplierName === undefined ? undefined : body.supplierName || null,
      actor: this.toAuditActor(actor),
    });
  }

  @Patch('services/:serviceId/confirmation')
  @Roles('admin', 'operations')
  updateConfirmation(
    @Param('serviceId') serviceId: string,
    @Body() body: UpdateBookingServiceConfirmationBody,
    @Actor() actor: AuthenticatedActor,
  ) {
    return this.bookingsService.updateConfirmation(serviceId, {
      confirmationStatus: body.confirmationStatus,
      confirmationNumber:
        body.confirmationNumber === undefined && body.supplierReference !== undefined
          ? body.supplierReference || null
          : body.confirmationNumber === undefined
            ? undefined
            : body.confirmationNumber || null,
      supplierReference: body.supplierReference === undefined ? undefined : body.supplierReference || null,
      notes: body.notes === undefined ? undefined : body.notes || null,
      actor: this.toAuditActor(actor),
    });
  }

  @Patch('services/:serviceId/operational')
  @Roles('admin', 'operations')
  updateOperationalDetails(
    @Param('serviceId') serviceId: string,
    @Body() body: UpdateBookingServiceOperationalBody,
    @Actor() actor: AuthenticatedActor,
  ) {
    return this.bookingsService.updateOperationalDetails(serviceId, {
      serviceDate: body.serviceDate === undefined ? undefined : body.serviceDate || null,
      startTime: body.startTime === undefined ? undefined : body.startTime || null,
      pickupTime: body.pickupTime === undefined ? undefined : body.pickupTime || null,
      pickupLocation: body.pickupLocation === undefined ? undefined : body.pickupLocation || null,
      meetingPoint: body.meetingPoint === undefined ? undefined : body.meetingPoint || null,
      participantCount: body.participantCount === undefined ? undefined : Number(body.participantCount),
      adultCount: body.adultCount === undefined ? undefined : Number(body.adultCount),
      childCount: body.childCount === undefined ? undefined : Number(body.childCount),
      supplierReference: body.supplierReference === undefined ? undefined : body.supplierReference || null,
      reconfirmationRequired:
        body.reconfirmationRequired === undefined || body.reconfirmationRequired === null
          ? undefined
          : Boolean(body.reconfirmationRequired),
      reconfirmationDueAt: body.reconfirmationDueAt === undefined ? undefined : body.reconfirmationDueAt || null,
      note: body.note === undefined ? undefined : body.note || null,
      actor: this.toAuditActor(actor),
    });
  }

  @Patch('services/:serviceId/supplier-confirm')
  @Public()
  supplierConfirm(
    @Param('serviceId') serviceId: string,
    @Query('token') token?: string,
    @Body() body?: SupplierConfirmBookingServiceBody,
    @Headers() headers?: Record<string, string | string[] | undefined>,
  ) {
    const authenticatedActor =
      headers && (headers.authorization || headers['x-dmc-session']) ? this.authService.requireActor(headers) : null;

    return this.bookingsService.supplierConfirm(
      serviceId,
      {
        token,
        confirmationNumber:
          body?.confirmationNumber === undefined && body?.supplierReference !== undefined
            ? body.supplierReference || null
            : body?.confirmationNumber === undefined
              ? undefined
              : body.confirmationNumber || null,
        supplierReference: body?.supplierReference === undefined ? undefined : body.supplierReference || null,
        notes: body?.notes === undefined ? undefined : body.notes || null,
      },
      this.toAuditActor(authenticatedActor),
    );
  }

  @Patch('services/:serviceId/status')
  @Roles('admin', 'operations')
  updateManualServiceStatus(
    @Param('serviceId') serviceId: string,
    @Body() body: ManualBookingServiceActionBody,
    @Actor() actor: AuthenticatedActor,
  ) {
    return this.bookingsService.updateManualServiceStatus(serviceId, {
      action: body.action,
      note: body.note,
      actor: this.toAuditActor(actor),
    });
  }

  @Post('services/bulk-actions')
  @Roles('admin', 'operations')
  bulkUpdateServiceStatuses(
    @Body() body: BulkBookingServiceActionBody,
    @Actor() actor: AuthenticatedActor,
  ) {
    return this.bookingsService.bulkUpdateServiceStatuses({
      serviceIds: Array.isArray(body.serviceIds) ? body.serviceIds : [],
      action: body.action,
      note: body.note,
      actor: this.toAuditActor(actor),
    });
  }
}

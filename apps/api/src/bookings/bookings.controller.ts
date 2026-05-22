import { BadRequestException, Body, Controller, Delete, Get, Headers, NotFoundException, Param, Patch, Post, Query, Res, StreamableFile } from '@nestjs/common';
import { Actor, Public, Roles } from '../auth/auth.decorators';
import { AuthService } from '../auth/auth.service';
import { AuthenticatedActor } from '../auth/auth.types';
import { BookingsService } from './bookings.service';
import { InvoicesService } from '../invoices/invoices.service';

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

type UpdateSupplierConfirmationBody = {
  supplierConfirmationStatus: 'NOT_SENT' | 'SENT' | 'ACKNOWLEDGED' | 'CONFIRMED' | 'REJECTED' | 'CANCELLED';
  supplierReference?: string | null;
  supplierRemarks?: string | null;
  confirmationDeadline?: string | null;
};

type SupplierConfirmationActionBody = {
  action: 'prepare_email' | 'mark_requested' | 'mark_confirmed' | 'mark_rejected' | 'reconfirm';
  supplierReference?: string | null;
  supplierRemarks?: string | null;
  confirmationDeadline?: string | null;
  reconfirmationDueAt?: string | null;
};

type ApplyBookingOperationalAmendmentBody = {
  amendmentType:
    | 'add_service'
    | 'remove_service'
    | 'change_hotel_category'
    | 'add_extension'
    | 'add_meal'
    | 'add_transfer'
    | 'add_excursion'
    | 'upgrade_service'
    | 'downgrade_service';
  serviceId?: string | null;
  bookingDayId?: string | null;
  serviceType?: string | null;
  operationType?: string | null;
  description?: string | null;
  serviceDate?: string | null;
  participantCount?: number | string | null;
  notes?: string | null;
  hotelCategory?: string | null;
  extensionName?: string | null;
  upgradeLabel?: string | null;
  downgradeLabel?: string | null;
  confirmProtected?: boolean | null;
  roomingImpacted?: boolean | null;
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
  hotelReservationStatus?: string | null;
  blockedRoomCount?: number | null;
  roomTypes?: string[] | string | null;
  releaseDate?: string | null;
  hotelReconfirmationDueAt?: string | null;
  hotelReservationNotes?: string | null;
  primaryHotelName?: string | null;
  alternativeHotels?: string[] | string | null;
  activateAlternativeHotel?: string | null;
  releaseAlternativeHotel?: string | null;
  roomingSent?: boolean | null;
  note?: string | null;
};

type UpdateGuideAssignmentBody = {
  guideId?: string | null;
  assignedTo?: string | null;
  guidePhone?: string | null;
  guideConfirmationStatus?: string | null;
  guideRequiredLanguages?: string[] | string | null;
  guideReportingTime?: string | null;
  pickupTime?: string | null;
  note?: string | null;
};

type UpdateRestaurantAssignmentBody = {
  restaurantId?: string | null;
  mealConfirmationStatus?: string | null;
  mealTiming?: string | null;
  mealSeatingNotes?: string | null;
  mealDietaryRequirements?: string[] | string | null;
  mealOperationalNotes?: string | null;
  participantCount?: number | string | null;
  note?: string | null;
};

type SendBookingDocumentEmailBody = {
  email: string;
  bookingId: string;
  documentType: 'voucher' | 'supplier-confirmation';
};

type SendBookingInvoiceBody = {
  email?: string | null;
  mode?: 'PACKAGE' | 'ITEMIZED';
};

type BookingFinancialDocumentType = 'client-invoice' | 'deposit-invoice' | 'payment-receipt' | 'supplier-payable-summary' | 'credit-note';
const BOOKING_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SendBookingPaymentReminderBody = {
  email?: string | null;
};

type UpdateBookingStatusBody = {
  status: 'draft' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
  note: string;
};

type UpdateBookingFinanceBody = {
  clientInvoiceStatus?: 'unbilled' | 'invoiced' | 'paid';
  supplierPaymentStatus?: 'unpaid' | 'scheduled' | 'paid';
};

type BookingPaymentTypeBody = 'CLIENT' | 'SUPPLIER';
type BookingPaymentStatusBody = 'PENDING' | 'PAID';
type BookingPaymentMethodBody = 'bank' | 'cash' | 'card' | 'bank_transfer' | 'cliq' | 'mb_way' | 'credit_card' | 'custom_manual';

type CreateBookingPaymentBody = {
  type: BookingPaymentTypeBody;
  amount: number;
  currency?: string | null;
  status?: BookingPaymentStatusBody;
  method?: BookingPaymentMethodBody | null;
  reference?: string | null;
  dueDate?: string | null;
  paidAt?: string | null;
  notes?: string | null;
};

type UpdateBookingPaymentBody = {
  amount?: number;
  currency?: string | null;
  status?: BookingPaymentStatusBody;
  method?: BookingPaymentMethodBody | null;
  reference?: string | null;
  dueDate?: string | null;
  paidAt?: string | null;
  notes?: string | null;
};

type MarkBookingPaymentPaidBody = {
  paidAt?: string | null;
};

type ConfirmBookingPaymentsBatchBody = {
  paymentIds?: string[];
  paidAt?: string | null;
};

type SendBookingPaymentRemindersBatchBody = {
  bookingIds?: string[];
  paymentIds?: string[];
};

type CreateBookingPassengerBody = {
  fullName?: string;
  firstName: string;
  lastName: string;
  title?: string | null;
  gender?: string | null;
  dateOfBirth?: string | null;
  nationality?: string | null;
  passportNumber?: string | null;
  passportIssueDate?: string | null;
  passportExpiryDate?: string | null;
  arrivalFlight?: string | null;
  departureFlight?: string | null;
  entryPoint?: string | null;
  visaStatus?: string | null;
  roomingNotes?: string | null;
  notes?: string | null;
  isLead?: boolean;
};

type UpdateBookingPassengerBody = {
  fullName?: string;
  firstName?: string;
  lastName?: string;
  title?: string | null;
  gender?: string | null;
  dateOfBirth?: string | null;
  nationality?: string | null;
  passportNumber?: string | null;
  passportIssueDate?: string | null;
  passportExpiryDate?: string | null;
  arrivalFlight?: string | null;
  departureFlight?: string | null;
  entryPoint?: string | null;
  visaStatus?: string | null;
  roomingNotes?: string | null;
  notes?: string | null;
  isLead?: boolean;
};

type CreateBookingRoomingEntryBody = {
  roomType?: string | null;
  occupancy?: 'single' | 'double' | 'triple' | 'quad' | 'unknown' | 'SGL' | 'DBL' | 'TWN' | 'TWIN' | 'TRPL' | 'CHILD_WITH_BED' | 'CHILD_NO_BED' | 'child_with_bed' | 'child_no_bed';
  notes?: string | null;
  sortOrder?: number | null;
};

type UpdateBookingRoomingEntryBody = {
  roomType?: string | null;
  occupancy?: 'single' | 'double' | 'triple' | 'quad' | 'unknown' | 'SGL' | 'DBL' | 'TWN' | 'TWIN' | 'TRPL' | 'CHILD_WITH_BED' | 'CHILD_NO_BED' | 'child_with_bed' | 'child_no_bed';
  notes?: string | null;
  sortOrder?: number | null;
};

type AssignBookingPassengerToRoomBody = {
  passengerId: string;
};

type ManualBookingServiceActionBody = {
  action?: 'cancel' | 'reopen' | 'mark_ready';
  status?: string;
  note?: string;
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

type BookingOperationServiceBody = {
  type?: 'TRANSPORT' | 'GUIDE' | 'HOTEL' | 'ACTIVITY' | 'SERVICE' | 'TICKET' | 'EXTERNAL_PACKAGE';
  supplierId?: string | null;
  referenceId?: string | null;
  assignedTo?: string | null;
  guidePhone?: string | null;
  vehicleId?: string | null;
  pickupTime?: string | null;
  confirmationNumber?: string | null;
  notes?: string | null;
  status?: 'PENDING' | 'REQUESTED' | 'CONFIRMED' | 'REJECTED' | 'CANCELLED' | 'VOUCHER_SENT' | 'OPERATIONAL_READY' | 'COMPLETED' | 'DONE';
};

type CreateServiceVoucherBody = {
  notes?: string | null;
};

@Controller('bookings')
export class BookingsController {
  constructor(
    private readonly bookingsService: BookingsService,
    private readonly authService: AuthService,
    private readonly invoicesService: InvoicesService,
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
  findAll(@Actor() actor: AuthenticatedActor) {
    return this.bookingsService.findAll(actor);
  }

  @Get('dashboard/finance')
  @Roles('admin', 'finance', 'operations')
  getFinanceDashboard(@Actor() actor: AuthenticatedActor) {
    return this.bookingsService.getFinanceDashboard(actor);
  }

  @Get('reconciliation/payment-proofs')
  @Roles('admin', 'finance', 'operations')
  getPaymentProofReconciliationQueue(@Actor() actor: AuthenticatedActor) {
    return this.bookingsService.getPaymentProofReconciliationQueue(actor);
  }

  @Get('reconciliation/payment-proofs/summary')
  @Roles('admin', 'finance', 'operations')
  getPaymentProofReconciliationSummary(@Actor() actor: AuthenticatedActor) {
    return this.bookingsService.getPaymentProofReconciliationSummary(actor);
  }

  @Get('reconciliation/payment-proofs/performance')
  @Roles('admin', 'finance', 'operations')
  getPaymentProofReconciliationPerformance(@Actor() actor: AuthenticatedActor) {
    return this.bookingsService.getPaymentProofReconciliationPerformance(actor);
  }

  @Get('operations/supplier-confirmations')
  @Roles('admin', 'operations')
  getSupplierConfirmationQueues(
    @Actor() actor: AuthenticatedActor,
    @Query('serviceType') serviceType?: string,
  ) {
    return this.bookingsService.getSupplierConfirmationQueues({
      actor,
      serviceType: serviceType || null,
    });
  }

  @Get(':id/operations-grid')
  @Roles('admin', 'operations')
  async getOperationalServiceGrid(@Param('id') id: string, @Actor() actor: AuthenticatedActor) {
    const grid = await this.bookingsService.getOperationalServiceGrid(id, actor);

    if (!grid) {
      throw new NotFoundException('Booking not found');
    }

    return grid;
  }

  @Post('reconciliation/payment-proofs/confirm')
  @Roles('admin', 'finance')
  confirmPaymentProofBatch(
    @Body() body: ConfirmBookingPaymentsBatchBody,
    @Actor() actor: AuthenticatedActor,
  ) {
    return this.bookingsService.confirmPaymentProofBatch({
      paymentIds: Array.isArray(body.paymentIds) ? body.paymentIds : [],
      paidAt: body.paidAt === undefined ? undefined : body.paidAt || null,
      actor: this.toAuditActor(actor),
      companyActor: actor,
    });
  }

  @Post('reconciliation/payment-proofs/remind')
  @Roles('admin', 'finance')
  sendPaymentProofReminderBatch(
    @Body() body: SendBookingPaymentRemindersBatchBody,
    @Actor() actor: AuthenticatedActor,
  ) {
    return this.bookingsService.sendPaymentProofReminderBatch({
      bookingIds: Array.isArray(body.bookingIds) ? body.bookingIds : [],
      paymentIds: Array.isArray(body.paymentIds) ? body.paymentIds : [],
      actor: this.toAuditActor(actor),
      companyActor: actor,
    });
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Actor() actor: AuthenticatedActor) {
    const booking = await this.bookingsService.findOne(id, actor);

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
  @Roles('admin', 'operations')
  async downloadVoucherPdf(
    @Param('id') id: string,
    @Actor() actor: AuthenticatedActor,
    @Res({ passthrough: true }) response: any,
  ) {
    const booking = await this.bookingsService.findOne(id, actor);

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const pdfBuffer = await this.bookingsService.generateVoucherPdf(id, actor, booking);
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

    const pdfBuffer = await this.bookingsService.generateVoucherPdf(id, undefined, booking);
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
  @Roles('admin', 'operations')
  async downloadSupplierConfirmationPdf(
    @Param('id') id: string,
    @Actor() actor: AuthenticatedActor,
    @Res({ passthrough: true }) response: any,
  ) {
    const booking = await this.bookingsService.findOne(id, actor);

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const pdfBuffer = await this.bookingsService.generateSupplierConfirmationPdf(id, actor, booking);
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

  @Get(':id/guarantee-letter')
  @Roles('admin', 'operations')
  async downloadGuaranteeLetterPdf(
    @Param('id') id: string,
    @Actor() actor: AuthenticatedActor,
    @Res({ passthrough: true }) response: any,
  ) {
    const pdfBuffer = await this.bookingsService.generateGuaranteeLetterPdf(id, actor);
    const fileName =
      `${id}-guarantee-letter`
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'booking-guarantee-letter';

    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', `attachment; filename="${fileName}.pdf"`);

    return new StreamableFile(pdfBuffer);
  }

  @Get(':id/invoice/pdf')
  @Roles('admin', 'finance', 'operations')
  async downloadInvoicePdf(
    @Param('id') id: string,
    @Query('mode') mode: string | undefined,
    @Res({ passthrough: true }) response: any,
  ) {
    const booking = await this.bookingsService.findOne(id);

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const normalizedMode = mode === 'PACKAGE' ? 'PACKAGE' : 'ITEMIZED';
    const pdfBuffer = await this.bookingsService.generateInvoicePdf(id, normalizedMode);
    const fileName =
      `${booking.bookingRef || 'booking'}-invoice`
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'booking-invoice';

    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', `attachment; filename="${fileName}.pdf"`);

    return new StreamableFile(pdfBuffer);
  }

  @Get(':id/financial-documents/:documentType/pdf')
  @Roles('admin', 'finance', 'operations')
  async downloadFinancialDocumentPdf(
    @Param('id') id: string,
    @Param('documentType') documentType: string,
    @Query('mode') mode: string | undefined,
    @Res({ passthrough: true }) response: any,
  ) {
    if (!id || !BOOKING_UUID_PATTERN.test(id)) {
      throw new BadRequestException('Financial document download requires a booking UUID. Booking references/codes are display-only.');
    }

    const booking = await this.bookingsService.findOne(id);

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const normalizedDocumentType = this.normalizeFinancialDocumentType(documentType);
    const normalizedMode = mode === 'PACKAGE' ? 'PACKAGE' : 'ITEMIZED';
    const pdfBuffer = await this.bookingsService.generateFinancialDocumentPdf(id, normalizedDocumentType, normalizedMode);
    const fileName =
      `${booking.bookingRef || 'booking'}-${normalizedDocumentType}`
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'booking-financial-document';

    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', `attachment; filename="${fileName}.pdf"`);

    return new StreamableFile(pdfBuffer);
  }

  private normalizeFinancialDocumentType(value: string): BookingFinancialDocumentType {
    if (
      value === 'client-invoice' ||
      value === 'deposit-invoice' ||
      value === 'payment-receipt' ||
      value === 'supplier-payable-summary' ||
      value === 'credit-note'
    ) {
      return value;
    }

    throw new BadRequestException('Unsupported financial document type');
  }

  @Get(':id/passengers/export')
  @Roles('admin', 'operations')
  async downloadPassengerManifestExcel(
    @Param('id') id: string,
    @Actor() actor: AuthenticatedActor,
    @Res({ passthrough: true }) response: any,
  ) {
    const exportFile = await this.bookingsService.exportPassengerManifestExcel(id, actor);
    response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    response.setHeader('Content-Disposition', `attachment; filename="${exportFile.fileName}"`);
    return new StreamableFile(exportFile.buffer);
  }

  @Post('send-document-email')
  @Roles('admin', 'operations')
  sendDocumentEmail(@Body() body: SendBookingDocumentEmailBody, @Actor() actor: AuthenticatedActor) {
    return this.bookingsService.sendDocumentEmail({
      email: body.email,
      bookingId: body.bookingId,
      documentType: body.documentType,
      companyActor: actor,
    });
  }

  @Post(':id/invoice/send')
  @Roles('admin', 'finance', 'operations')
  sendInvoice(
    @Param('id') id: string,
    @Body() body: SendBookingInvoiceBody,
    @Actor() actor: AuthenticatedActor,
  ) {
    return this.bookingsService.sendInvoice(id, {
      email: body.email === undefined ? undefined : body.email || null,
      mode: body.mode,
      actor: this.toAuditActor(actor),
      companyActor: actor,
    });
  }

  @Post(':id/invoice')
  @Roles('admin', 'finance')
  generateInvoice(
    @Param('id') id: string,
    @Actor() actor: AuthenticatedActor,
  ) {
    if (!id || !BOOKING_UUID_PATTERN.test(id)) {
      throw new BadRequestException('Invoice generation requires a booking UUID. Booking references/codes are display-only.');
    }

    return this.invoicesService.generateForBooking(id, {
      actor: this.toAuditActor(actor),
      companyActor: actor,
    });
  }

  @Post(':id/payments/reminder')
  @Roles('admin', 'finance', 'operations')
  sendPaymentReminder(
    @Param('id') id: string,
    @Body() body: SendBookingPaymentReminderBody,
    @Actor() actor: AuthenticatedActor,
  ) {
    return this.bookingsService.sendPaymentReminder(id, {
      email: body.email === undefined ? undefined : body.email || null,
      actor: this.toAuditActor(actor),
      companyActor: actor,
    });
  }

  @Post(':id/portal-access-token')
  @Roles('admin', 'operations')
  regeneratePortalAccessToken(@Param('id') id: string, @Actor() actor: AuthenticatedActor) {
    return this.bookingsService.regeneratePortalAccessToken(id, actor);
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
      companyActor: actor,
    });
  }

  @Patch(':id/cancel')
  @Roles('admin', 'operations')
  cancelBooking(@Param('id') id: string, @Actor() actor: AuthenticatedActor) {
    return this.bookingsService.cancelBooking(id, {
      actor: this.toAuditActor(actor),
      companyActor: actor,
    });
  }

  @Post(':id/amend')
  @Roles('admin', 'operations')
  amendBooking(@Param('id') id: string, @Actor() actor: AuthenticatedActor) {
    return this.bookingsService.amendBooking(id, {
      actor: this.toAuditActor(actor),
      companyActor: actor,
    });
  }

  @Post(':id/operational-amendments')
  @Roles('admin', 'operations')
  applyOperationalAmendment(
    @Param('id') id: string,
    @Body() body: ApplyBookingOperationalAmendmentBody = {} as ApplyBookingOperationalAmendmentBody,
    @Actor() actor: AuthenticatedActor,
  ) {
    return this.bookingsService.applyOperationalAmendment(id, {
      amendmentType: body.amendmentType,
      serviceId: body.serviceId === undefined ? undefined : body.serviceId || null,
      bookingDayId: body.bookingDayId === undefined ? undefined : body.bookingDayId || null,
      serviceType: body.serviceType === undefined ? undefined : body.serviceType || null,
      operationType: body.operationType === undefined ? undefined : body.operationType || null,
      description: body.description === undefined ? undefined : body.description || null,
      serviceDate: body.serviceDate === undefined ? undefined : body.serviceDate || null,
      participantCount: body.participantCount === undefined || body.participantCount === null ? undefined : Number(body.participantCount),
      notes: body.notes === undefined ? undefined : body.notes || null,
      hotelCategory: body.hotelCategory === undefined ? undefined : body.hotelCategory || null,
      extensionName: body.extensionName === undefined ? undefined : body.extensionName || null,
      upgradeLabel: body.upgradeLabel === undefined ? undefined : body.upgradeLabel || null,
      downgradeLabel: body.downgradeLabel === undefined ? undefined : body.downgradeLabel || null,
      confirmProtected: Boolean(body.confirmProtected),
      roomingImpacted: Boolean(body.roomingImpacted),
      actor: this.toAuditActor(actor),
      companyActor: actor,
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
      companyActor: actor,
    });
  }

  @Get(':id/payments')
  @Roles('admin', 'finance')
  listPayments(@Param('id') id: string, @Actor() actor: AuthenticatedActor) {
    return this.bookingsService.listPayments(id, actor);
  }

  @Post(':id/payments')
  @Roles('admin', 'finance')
  createPayment(
    @Param('id') id: string,
    @Body() body: CreateBookingPaymentBody,
    @Actor() actor: AuthenticatedActor,
  ) {
    return this.bookingsService.createPayment(id, {
      type: body.type,
      amount: body.amount,
      currency: body.currency === undefined ? undefined : body.currency || null,
      status: body.status,
      method: body.method === undefined ? undefined : body.method || null,
      reference: body.reference === undefined ? undefined : body.reference || null,
      dueDate: body.dueDate === undefined ? undefined : body.dueDate || null,
      paidAt: body.paidAt === undefined ? undefined : body.paidAt || null,
      notes: body.notes === undefined ? undefined : body.notes || null,
      actor: this.toAuditActor(actor),
      companyActor: actor,
    });
  }

  @Patch(':id/payments/:paymentId')
  @Roles('admin', 'finance')
  updatePayment(
    @Param('id') id: string,
    @Param('paymentId') paymentId: string,
    @Body() body: UpdateBookingPaymentBody,
    @Actor() actor: AuthenticatedActor,
  ) {
    return this.bookingsService.updatePayment(id, paymentId, {
      amount: body.amount === undefined ? undefined : Number(body.amount),
      currency: body.currency === undefined ? undefined : body.currency || null,
      status: body.status,
      method: body.method === undefined ? undefined : body.method || null,
      reference: body.reference === undefined ? undefined : body.reference || null,
      dueDate: body.dueDate === undefined ? undefined : body.dueDate || null,
      paidAt: body.paidAt === undefined ? undefined : body.paidAt || null,
      notes: body.notes === undefined ? undefined : body.notes || null,
      actor: this.toAuditActor(actor),
      companyActor: actor,
    });
  }

  @Post(':id/payments/:paymentId/mark-paid')
  @Roles('admin', 'finance')
  markPaymentPaid(
    @Param('id') id: string,
    @Param('paymentId') paymentId: string,
    @Body() body: MarkBookingPaymentPaidBody,
    @Actor() actor: AuthenticatedActor,
  ) {
    return this.bookingsService.markPaymentPaid(id, paymentId, {
      paidAt: body.paidAt === undefined ? undefined : body.paidAt || null,
      actor: this.toAuditActor(actor),
      companyActor: actor,
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
      fullName: body.fullName,
      firstName: body.firstName,
      lastName: body.lastName,
      title: body.title === undefined ? undefined : body.title || null,
      gender: body.gender === undefined ? undefined : body.gender || null,
      dateOfBirth: body.dateOfBirth === undefined ? undefined : body.dateOfBirth || null,
      nationality: body.nationality === undefined ? undefined : body.nationality || null,
      passportNumber: body.passportNumber === undefined ? undefined : body.passportNumber || null,
      passportIssueDate: body.passportIssueDate === undefined ? undefined : body.passportIssueDate || null,
      passportExpiryDate: body.passportExpiryDate === undefined ? undefined : body.passportExpiryDate || null,
      arrivalFlight: body.arrivalFlight === undefined ? undefined : body.arrivalFlight || null,
      departureFlight: body.departureFlight === undefined ? undefined : body.departureFlight || null,
      entryPoint: body.entryPoint === undefined ? undefined : body.entryPoint || null,
      visaStatus: body.visaStatus === undefined ? undefined : body.visaStatus || null,
      roomingNotes: body.roomingNotes === undefined ? undefined : body.roomingNotes || null,
      notes: body.notes === undefined ? undefined : body.notes || null,
      isLead: body.isLead === undefined ? undefined : Boolean(body.isLead),
      actor: this.toAuditActor(actor),
      companyActor: actor,
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
      fullName: body.fullName,
      firstName: body.firstName,
      lastName: body.lastName,
      title: body.title === undefined ? undefined : body.title || null,
      gender: body.gender === undefined ? undefined : body.gender || null,
      dateOfBirth: body.dateOfBirth === undefined ? undefined : body.dateOfBirth || null,
      nationality: body.nationality === undefined ? undefined : body.nationality || null,
      passportNumber: body.passportNumber === undefined ? undefined : body.passportNumber || null,
      passportIssueDate: body.passportIssueDate === undefined ? undefined : body.passportIssueDate || null,
      passportExpiryDate: body.passportExpiryDate === undefined ? undefined : body.passportExpiryDate || null,
      arrivalFlight: body.arrivalFlight === undefined ? undefined : body.arrivalFlight || null,
      departureFlight: body.departureFlight === undefined ? undefined : body.departureFlight || null,
      entryPoint: body.entryPoint === undefined ? undefined : body.entryPoint || null,
      visaStatus: body.visaStatus === undefined ? undefined : body.visaStatus || null,
      roomingNotes: body.roomingNotes === undefined ? undefined : body.roomingNotes || null,
      notes: body.notes === undefined ? undefined : body.notes || null,
      isLead: body.isLead === undefined ? undefined : Boolean(body.isLead),
      actor: this.toAuditActor(actor),
      companyActor: actor,
    });
  }

  @Delete(':id/passengers/:passengerId')
  @Roles('admin', 'operations')
  deletePassenger(
    @Param('id') id: string,
    @Param('passengerId') passengerId: string,
    @Actor() actor: AuthenticatedActor,
  ) {
    return this.bookingsService.deletePassenger(id, passengerId, this.toAuditActor(actor), actor);
  }

  @Post(':id/passengers/:passengerId/set-lead')
  @Roles('admin', 'operations')
  setLeadPassenger(
    @Param('id') id: string,
    @Param('passengerId') passengerId: string,
    @Actor() actor: AuthenticatedActor,
  ) {
    return this.bookingsService.setLeadPassenger(id, passengerId, this.toAuditActor(actor), actor);
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
      companyActor: actor,
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
      companyActor: actor,
    });
  }

  @Delete(':id/rooming/:roomingEntryId')
  @Roles('admin', 'operations')
  deleteRoomingEntry(
    @Param('id') id: string,
    @Param('roomingEntryId') roomingEntryId: string,
    @Actor() actor: AuthenticatedActor,
  ) {
    return this.bookingsService.deleteRoomingEntry(id, roomingEntryId, this.toAuditActor(actor), actor);
  }

  @Post(':id/rooming/:roomingEntryId/assignments')
  @Roles('admin', 'operations')
  assignPassengerToRoom(
    @Param('id') id: string,
    @Param('roomingEntryId') roomingEntryId: string,
    @Body() body: AssignBookingPassengerToRoomBody,
    @Actor() actor: AuthenticatedActor,
  ) {
    return this.bookingsService.assignPassengerToRoom(id, roomingEntryId, body.passengerId, this.toAuditActor(actor), actor);
  }

  @Delete(':id/rooming/:roomingEntryId/assignments/:passengerId')
  @Roles('admin', 'operations')
  unassignPassengerFromRoom(
    @Param('id') id: string,
    @Param('roomingEntryId') roomingEntryId: string,
    @Param('passengerId') passengerId: string,
    @Actor() actor: AuthenticatedActor,
  ) {
    return this.bookingsService.unassignPassengerFromRoom(id, roomingEntryId, passengerId, this.toAuditActor(actor), actor);
  }

  @Get(':id/days/:dayId/services')
  @Roles('admin', 'operations')
  listBookingServicesByDay(
    @Param('id') id: string,
    @Param('dayId') dayId: string,
    @Actor() actor: AuthenticatedActor,
  ) {
    return this.bookingsService.listBookingServicesByDay(id, dayId, actor);
  }

  @Post(':id/days/:dayId/services')
  @Roles('admin', 'operations')
  createBookingService(
    @Param('id') id: string,
    @Param('dayId') dayId: string,
    @Body() body: BookingOperationServiceBody,
    @Actor() actor: AuthenticatedActor,
  ) {
    return this.bookingsService.createBookingService(id, dayId, {
      type: body.type || '',
      supplierId: body.supplierId === undefined ? undefined : body.supplierId || null,
      referenceId: body.referenceId === undefined ? undefined : body.referenceId || null,
      assignedTo: body.assignedTo === undefined ? undefined : body.assignedTo || null,
      guidePhone: body.guidePhone === undefined ? undefined : body.guidePhone || null,
      vehicleId: body.vehicleId === undefined ? undefined : body.vehicleId || null,
      pickupTime: body.pickupTime === undefined ? undefined : body.pickupTime || null,
      confirmationNumber: body.confirmationNumber === undefined ? undefined : body.confirmationNumber || null,
      notes: body.notes === undefined ? undefined : body.notes || null,
      status: body.status === undefined ? undefined : body.status || null,
      actor: this.toAuditActor(actor),
      companyActor: actor,
    });
  }

  @Patch(':id/days/:dayId/services/:serviceId')
  @Roles('admin', 'operations')
  updateBookingService(
    @Param('id') id: string,
    @Param('dayId') dayId: string,
    @Param('serviceId') serviceId: string,
    @Body() body: BookingOperationServiceBody,
    @Actor() actor: AuthenticatedActor,
  ) {
    return this.bookingsService.updateBookingService(id, dayId, serviceId, {
      type: body.type === undefined ? undefined : body.type || null,
      supplierId: body.supplierId === undefined ? undefined : body.supplierId || null,
      referenceId: body.referenceId === undefined ? undefined : body.referenceId || null,
      assignedTo: body.assignedTo === undefined ? undefined : body.assignedTo || null,
      guidePhone: body.guidePhone === undefined ? undefined : body.guidePhone || null,
      vehicleId: body.vehicleId === undefined ? undefined : body.vehicleId || null,
      pickupTime: body.pickupTime === undefined ? undefined : body.pickupTime || null,
      confirmationNumber: body.confirmationNumber === undefined ? undefined : body.confirmationNumber || null,
      notes: body.notes === undefined ? undefined : body.notes || null,
      status: body.status === undefined ? undefined : body.status || null,
      actor: this.toAuditActor(actor),
      companyActor: actor,
    });
  }

  @Delete(':id/days/:dayId/services/:serviceId')
  @Roles('admin', 'operations')
  deleteBookingService(
    @Param('id') id: string,
    @Param('dayId') dayId: string,
    @Param('serviceId') serviceId: string,
    @Actor() actor: AuthenticatedActor,
  ) {
    return this.bookingsService.deleteBookingService(id, dayId, serviceId, this.toAuditActor(actor), actor);
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
      companyActor: actor,
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
      companyActor: actor,
    });
  }

  @Patch('services/:serviceId/supplier-confirmation')
  @Roles('admin', 'operations')
  updateSupplierConfirmation(
    @Param('serviceId') serviceId: string,
    @Body() body: UpdateSupplierConfirmationBody,
    @Actor() actor: AuthenticatedActor,
  ) {
    return this.bookingsService.updateSupplierConfirmation(serviceId, {
      supplierConfirmationStatus: body.supplierConfirmationStatus,
      supplierReference: body.supplierReference === undefined ? undefined : body.supplierReference || null,
      supplierRemarks: body.supplierRemarks === undefined ? undefined : body.supplierRemarks || null,
      confirmationDeadline: body.confirmationDeadline === undefined ? undefined : body.confirmationDeadline || null,
      actor: this.toAuditActor(actor),
      companyActor: actor,
    });
  }

  @Patch('services/:serviceId/guide-assignment')
  @Roles('admin', 'operations')
  updateGuideAssignment(
    @Param('serviceId') serviceId: string,
    @Body() body: UpdateGuideAssignmentBody,
    @Actor() actor: AuthenticatedActor,
  ) {
    return this.bookingsService.updateGuideAssignment(serviceId, {
      guideId: body.guideId === undefined ? undefined : body.guideId || null,
      assignedTo: body.assignedTo === undefined ? undefined : body.assignedTo || null,
      guidePhone: body.guidePhone === undefined ? undefined : body.guidePhone || null,
      guideConfirmationStatus: body.guideConfirmationStatus === undefined ? undefined : body.guideConfirmationStatus || null,
      guideRequiredLanguages: body.guideRequiredLanguages === undefined ? undefined : body.guideRequiredLanguages,
      guideReportingTime: body.guideReportingTime === undefined ? undefined : body.guideReportingTime || null,
      pickupTime: body.pickupTime === undefined ? undefined : body.pickupTime || null,
      note: body.note === undefined ? undefined : body.note || null,
      actor: this.toAuditActor(actor),
      companyActor: actor,
    });
  }

  @Patch('services/:serviceId/restaurant-assignment')
  @Roles('admin', 'operations')
  updateRestaurantAssignment(
    @Param('serviceId') serviceId: string,
    @Body() body: UpdateRestaurantAssignmentBody,
    @Actor() actor: AuthenticatedActor,
  ) {
    return this.bookingsService.updateRestaurantAssignment(serviceId, {
      restaurantId: body.restaurantId === undefined ? undefined : body.restaurantId || null,
      mealConfirmationStatus: body.mealConfirmationStatus === undefined ? undefined : body.mealConfirmationStatus || null,
      mealTiming: body.mealTiming === undefined ? undefined : body.mealTiming || null,
      mealSeatingNotes: body.mealSeatingNotes === undefined ? undefined : body.mealSeatingNotes || null,
      mealDietaryRequirements: body.mealDietaryRequirements === undefined ? undefined : body.mealDietaryRequirements,
      mealOperationalNotes: body.mealOperationalNotes === undefined ? undefined : body.mealOperationalNotes || null,
      participantCount: body.participantCount === undefined ? undefined : body.participantCount,
      note: body.note === undefined ? undefined : body.note || null,
      actor: this.toAuditActor(actor),
      companyActor: actor,
    });
  }

  @Patch('services/:serviceId/supplier-confirmation/action')
  @Roles('admin', 'operations')
  supplierConfirmationAction(
    @Param('serviceId') serviceId: string,
    @Body() body: SupplierConfirmationActionBody,
    @Actor() actor: AuthenticatedActor,
  ) {
    return this.bookingsService.performSupplierConfirmationAction(serviceId, {
      action: body.action,
      supplierReference: body.supplierReference === undefined ? undefined : body.supplierReference || null,
      supplierRemarks: body.supplierRemarks === undefined ? undefined : body.supplierRemarks || null,
      confirmationDeadline: body.confirmationDeadline === undefined ? undefined : body.confirmationDeadline || null,
      reconfirmationDueAt: body.reconfirmationDueAt === undefined ? undefined : body.reconfirmationDueAt || null,
      actor: this.toAuditActor(actor),
      companyActor: actor,
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
      hotelReservationStatus: body.hotelReservationStatus === undefined ? undefined : body.hotelReservationStatus || null,
      blockedRoomCount: body.blockedRoomCount === undefined ? undefined : Number(body.blockedRoomCount),
      roomTypes: body.roomTypes === undefined ? undefined : body.roomTypes,
      releaseDate: body.releaseDate === undefined ? undefined : body.releaseDate || null,
      hotelReconfirmationDueAt: body.hotelReconfirmationDueAt === undefined ? undefined : body.hotelReconfirmationDueAt || null,
      hotelReservationNotes: body.hotelReservationNotes === undefined ? undefined : body.hotelReservationNotes || null,
      primaryHotelName: body.primaryHotelName === undefined ? undefined : body.primaryHotelName || null,
      alternativeHotels: body.alternativeHotels === undefined ? undefined : body.alternativeHotels,
      activateAlternativeHotel: body.activateAlternativeHotel === undefined ? undefined : body.activateAlternativeHotel || null,
      releaseAlternativeHotel: body.releaseAlternativeHotel === undefined ? undefined : body.releaseAlternativeHotel || null,
      roomingSent: body.roomingSent === undefined || body.roomingSent === null ? undefined : Boolean(body.roomingSent),
      note: body.note === undefined ? undefined : body.note || null,
      actor: this.toAuditActor(actor),
      companyActor: actor,
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
    if (body.status) {
      return this.bookingsService.updateOperationalServiceStatus(serviceId, {
        status: body.status,
        note: body.note || null,
        actor: this.toAuditActor(actor),
        companyActor: actor,
      });
    }

    if (!body.action) {
      throw new BadRequestException('Booking service status or action is required');
    }

    return this.bookingsService.updateManualServiceStatus(serviceId, {
      action: body.action,
      note: body.note || '',
      actor: this.toAuditActor(actor),
      companyActor: actor,
    });
  }

  @Post(':id/services/:serviceId/voucher')
  @Roles('admin', 'operations')
  createServiceVoucher(
    @Param('id') id: string,
    @Param('serviceId') serviceId: string,
    @Body() body: CreateServiceVoucherBody,
    @Actor() actor: AuthenticatedActor,
  ) {
    return this.bookingsService.createServiceVoucher(id, serviceId, {
      notes: body.notes === undefined ? undefined : body.notes || null,
      actor: this.toAuditActor(actor),
      companyActor: actor,
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
      companyActor: actor,
    });
  }
}

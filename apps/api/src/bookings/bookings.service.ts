import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  BookingAuditEntityType,
  BookingRoomOccupancy,
  BookingServiceLifecycleStatus,
  BookingServiceStatus,
  BookingStatus,
  Prisma,
} from '@prisma/client';
import { randomBytes } from 'crypto';
import PDFDocument = require('pdfkit');
import nodemailer = require('nodemailer');
import { PrismaService } from '../prisma/prisma.service';
import { buildFinanceBadge } from './booking-finance-badge';
import { buildOperationsBadge } from './booking-operations-badge';
import { buildRoomingBadge } from './booking-rooming-badge';

type BookingPdfQuoteItem = {
  id?: string;
  itineraryId?: string | null;
  quantity?: number | null;
  pricingDescription?: string | null;
  service?: {
    name?: string | null;
    category?: string | null;
  } | null;
  appliedVehicleRate?: {
    routeName?: string | null;
    vehicle?: {
      name?: string | null;
    } | null;
    serviceType?: {
      name?: string | null;
    } | null;
  } | null;
  hotel?: {
    name?: string | null;
  } | null;
  contract?: {
    name?: string | null;
  } | null;
  seasonName?: string | null;
  roomCategory?: {
    name?: string | null;
  } | null;
  occupancyType?: string | null;
  mealPlan?: string | null;
};

type BookingPdfSnapshot = {
  bookingType?: string | null;
  title?: string | null;
  roomCount?: number;
  nightCount?: number;
  itineraries?: Array<{
    id?: string;
    dayNumber?: number | null;
    title?: string | null;
    description?: string | null;
  }>;
  quoteItems?: BookingPdfQuoteItem[];
};

type BookingPdfContact = {
  title?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

type BookingPdfCompany = {
  name?: string | null;
};

type BookingDocumentType = 'voucher' | 'supplier-confirmation';
type ClientInvoiceStatusValue = 'unbilled' | 'invoiced' | 'paid';
type SupplierPaymentStatusValue = 'unpaid' | 'scheduled' | 'paid';
type AuditActor =
  | {
      userId?: string | null;
      label?: string | null;
    }
  | null
  | undefined;
type BookingMutationClient = Prisma.TransactionClient | PrismaService;
const CLIENT_INVOICE_STATUSES = ['unbilled', 'invoiced', 'paid'] as const;
const SUPPLIER_PAYMENT_STATUSES = ['unpaid', 'scheduled', 'paid'] as const;

@Injectable()
export class BookingsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.booking
      .findMany({
        include: {
          passengers: {
            select: {
              id: true,
              roomingAssignments: {
                select: {
                  bookingRoomingEntryId: true,
                },
              },
            },
          },
          roomingEntries: {
            select: {
              id: true,
              occupancy: true,
              assignments: {
                select: {
                  bookingPassenger: {
                    select: {
                      id: true,
                    },
                  },
                },
              },
            },
          },
          auditLogs: {
            orderBy: {
              createdAt: 'desc',
            },
            take: 8,
          },
          services: {
            include: {
              auditLogs: {
                orderBy: {
                  createdAt: 'desc',
                },
                take: 8,
              },
            },
            orderBy: [
              { serviceOrder: 'asc' },
              { id: 'asc' },
            ],
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      })
      .then((bookings) => bookings.map((booking) => this.attachFinanceSummary(booking)));
  }

  findOne(id: string) {
    return this.prisma.booking.findUnique({
      where: { id },
      include: {
        quote: {
          include: {
            clientCompany: true,
            brandCompany: true,
            contact: true,
          },
        },
        acceptedVersion: true,
        auditLogs: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 12,
        },
        passengers: {
          orderBy: [
            { isLead: 'desc' },
            { createdAt: 'asc' },
          ],
          include: {
            roomingAssignments: {
              select: {
                bookingRoomingEntryId: true,
              },
            },
          },
        },
        roomingEntries: {
          orderBy: [
            { sortOrder: 'asc' },
            { createdAt: 'asc' },
          ],
          include: {
            assignments: {
              include: {
                bookingPassenger: true,
              },
              orderBy: {
                createdAt: 'asc',
              },
            },
          },
        },
        services: {
          include: {
            auditLogs: {
              orderBy: {
                createdAt: 'desc',
              },
              take: 6,
            },
          },
          orderBy: [
            { serviceOrder: 'asc' },
            { id: 'asc' },
          ],
        },
      },
    }).then((booking) => {
      if (!booking) {
        return null;
      }

      return {
        ...booking,
        finance: this.buildBookingFinanceSummary(booking),
        operations: this.buildBookingOperationsSummary(booking.services),
        rooming: this.buildBookingRoomingSummary({
          expectedRoomCount: booking.roomCount,
          passengers: booking.passengers,
          roomingEntries: booking.roomingEntries,
        }),
        quote: {
          ...booking.quote,
          company: booking.quote.clientCompany,
          clientCompany: booking.quote.clientCompany,
          brandCompany: booking.quote.brandCompany ?? booking.quote.clientCompany,
        },
        sourceQuoteId: booking.quoteId,
      };
      });
  }

  findPortalBooking(id: string, token?: string) {
    if (!token?.trim()) {
      return Promise.resolve(null);
    }

    return this.prisma.booking
      .findFirst({
        where: {
          id,
          accessToken: token.trim(),
        },
        select: {
          id: true,
          bookingRef: true,
          adults: true,
          children: true,
          roomCount: true,
          nightCount: true,
          snapshotJson: true,
          contactSnapshotJson: true,
          services: {
            orderBy: [{ serviceOrder: 'asc' }, { id: 'asc' }],
            select: {
              id: true,
              description: true,
              confirmationStatus: true,
              confirmationNumber: true,
            },
          },
        },
      })
      .then((booking) => booking || null);
  }

  findSupplierPortalBooking(id: string, token?: string) {
    if (!token?.trim()) {
      return Promise.resolve(null);
    }

    return this.prisma.booking
      .findFirst({
        where: {
          id,
          accessToken: token.trim(),
        },
        select: {
          id: true,
          bookingRef: true,
          adults: true,
          children: true,
          services: {
            where: {
              OR: [{ supplierId: { not: null } }, { supplierName: { not: null } }],
            },
            orderBy: [{ supplierName: 'asc' }, { serviceOrder: 'asc' }, { id: 'asc' }],
            select: {
              id: true,
              description: true,
              serviceType: true,
              serviceDate: true,
              startTime: true,
              pickupTime: true,
              pickupLocation: true,
              meetingPoint: true,
              participantCount: true,
              adultCount: true,
              childCount: true,
              supplierReference: true,
              supplierId: true,
              supplierName: true,
              confirmationStatus: true,
              confirmationNumber: true,
              confirmationNotes: true,
              notes: true,
            },
          },
        },
      })
      .then((booking) => {
        if (!booking) {
          return null;
        }

        const supplierGroups = booking.services
          .reduce<
            Array<{
              key: string;
              supplierId: string | null;
              supplierName: string;
              services: typeof booking.services;
            }>
          >((groups, service) => {
            const key = service.supplierId || service.supplierName || service.id;
            const existingGroup = groups.find((group) => group.key === key);

            if (existingGroup) {
              existingGroup.services.push(service);
              return groups;
            }

            groups.push({
              key,
              supplierId: service.supplierId,
              supplierName: service.supplierName || 'Unnamed supplier',
              services: [service],
            });

            return groups;
          }, [])
          .sort((a, b) => a.supplierName.localeCompare(b.supplierName));

        return {
          id: booking.id,
          bookingRef: booking.bookingRef,
          adults: booking.adults,
          children: booking.children,
          supplierGroups,
        };
      });
  }

  async regeneratePortalAccessToken(id: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      select: {
        id: true,
        accessToken: true,
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    return this.prisma.booking.update({
      where: { id },
      data: {
        accessToken: this.generateBookingAccessToken(),
      },
      select: {
        id: true,
        accessToken: true,
      },
    });
  }

  async updateBookingStatus(
    id: string,
    data: {
      status: BookingStatus | 'draft' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
      note: string;
      actor?: AuditActor;
    },
  ) {
    const note = this.normalizeManualOverrideNote(data.note, 'Booking status update note is required');
    const actor = data.actor;

    return this.prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id },
        select: {
          id: true,
          status: true,
          services: {
            select: {
              id: true,
              description: true,
              serviceType: true,
              serviceDate: true,
              status: true,
              confirmationStatus: true,
              supplierId: true,
              supplierName: true,
              totalCost: true,
              totalSell: true,
            },
          },
        },
      });

      if (!booking) {
        throw new NotFoundException('Booking not found');
      }

      this.assertAllowedBookingStatusTransition(booking.status, data.status);
      this.assertBookingStatusReadiness(booking, data.status);

      const updatedBooking = await tx.booking.update({
        where: { id },
        data: {
          status: data.status,
          statusNote: note,
        },
      });

      await this.createAuditLog(tx, {
        bookingId: booking.id,
        entityType: BookingAuditEntityType.booking,
        entityId: booking.id,
        action: 'booking_status_updated',
        oldValue: booking.status,
        newValue: data.status,
        note,
        actor,
      });

      return updatedBooking;
    });
  }

  async updateBookingFinance(
    id: string,
    data: {
      clientInvoiceStatus?: ClientInvoiceStatusValue;
      supplierPaymentStatus?: SupplierPaymentStatusValue;
      actor?: AuditActor;
    },
  ) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      select: {
        id: true,
        clientInvoiceStatus: true,
        supplierPaymentStatus: true,
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const nextClientInvoiceStatus =
      data.clientInvoiceStatus === undefined
        ? booking.clientInvoiceStatus
        : this.normalizeClientInvoiceStatus(data.clientInvoiceStatus);
    const nextSupplierPaymentStatus =
      data.supplierPaymentStatus === undefined
        ? booking.supplierPaymentStatus
        : this.normalizeSupplierPaymentStatus(data.supplierPaymentStatus);

    if (
      nextClientInvoiceStatus === booking.clientInvoiceStatus &&
      nextSupplierPaymentStatus === booking.supplierPaymentStatus
    ) {
      return this.findOne(id);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id },
        data: {
          clientInvoiceStatus: nextClientInvoiceStatus,
          supplierPaymentStatus: nextSupplierPaymentStatus,
        },
      });

      await this.createAuditLog(tx, {
        bookingId: id,
        entityType: BookingAuditEntityType.booking,
        entityId: id,
        action: 'booking_finance_status_updated',
        oldValue: this.formatBookingFinanceStatusSummary(booking.clientInvoiceStatus, booking.supplierPaymentStatus),
        newValue: this.formatBookingFinanceStatusSummary(nextClientInvoiceStatus, nextSupplierPaymentStatus),
        actor: data.actor,
      });
    });

    return this.findOne(id);
  }

  async createPassenger(
    bookingId: string,
    data: {
      firstName: string;
      lastName: string;
      title?: string | null;
      notes?: string | null;
      isLead?: boolean;
      actor?: AuditActor;
    },
  ) {
    const firstName = this.normalizeRequiredText(data.firstName, 'Passenger first name is required');
    const lastName = this.normalizeRequiredText(data.lastName, 'Passenger last name is required');
    const title = this.normalizeOptionalText(data.title);
    const notes = this.normalizeOptionalText(data.notes);
    const shouldSetLead = Boolean(data.isLead);

    return this.prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        select: { id: true },
      });

      if (!booking) {
        throw new NotFoundException('Booking not found');
      }

      if (shouldSetLead) {
        await tx.bookingPassenger.updateMany({
          where: { bookingId },
          data: { isLead: false },
        });
      }

      const passenger = await tx.bookingPassenger.create({
        data: {
          bookingId,
          firstName,
          lastName,
          title,
          notes,
          isLead: shouldSetLead,
        },
      });

      await this.createAuditLog(tx, {
        bookingId,
        entityType: BookingAuditEntityType.booking,
        entityId: passenger.id,
        action: 'booking_passenger_created',
        newValue: this.formatPassengerAuditValue(passenger),
        actor: data.actor,
      });

      return passenger;
    });
  }

  async updatePassenger(
    bookingId: string,
    passengerId: string,
    data: {
      firstName?: string;
      lastName?: string;
      title?: string | null;
      notes?: string | null;
      isLead?: boolean;
      actor?: AuditActor;
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const passenger = await tx.bookingPassenger.findUnique({
        where: { id: passengerId },
        select: {
          id: true,
          bookingId: true,
          firstName: true,
          lastName: true,
          title: true,
          notes: true,
          isLead: true,
        },
      });

      if (!passenger || passenger.bookingId !== bookingId) {
        throw new NotFoundException('Booking passenger not found');
      }

      const nextFirstName =
        data.firstName === undefined
          ? passenger.firstName
          : this.normalizeRequiredText(data.firstName, 'Passenger first name is required');
      const nextLastName =
        data.lastName === undefined
          ? passenger.lastName
          : this.normalizeRequiredText(data.lastName, 'Passenger last name is required');
      const nextTitle = data.title === undefined ? passenger.title : this.normalizeOptionalText(data.title);
      const nextNotes = data.notes === undefined ? passenger.notes : this.normalizeOptionalText(data.notes);
      const nextIsLead = data.isLead === undefined ? passenger.isLead : Boolean(data.isLead);

      if (nextIsLead) {
        await tx.bookingPassenger.updateMany({
          where: {
            bookingId,
            NOT: { id: passengerId },
          },
          data: { isLead: false },
        });
      }

      const updatedPassenger = await tx.bookingPassenger.update({
        where: { id: passengerId },
        data: {
          firstName: nextFirstName,
          lastName: nextLastName,
          title: nextTitle,
          notes: nextNotes,
          isLead: nextIsLead,
        },
      });

      await this.createAuditLog(tx, {
        bookingId,
        entityType: BookingAuditEntityType.booking,
        entityId: passengerId,
        action: 'booking_passenger_updated',
        oldValue: this.formatPassengerAuditValue(passenger),
        newValue: this.formatPassengerAuditValue(updatedPassenger),
        actor: data.actor,
      });

      return updatedPassenger;
    });
  }

  async deletePassenger(bookingId: string, passengerId: string, actor?: AuditActor) {
    return this.prisma.$transaction(async (tx) => {
      const passenger = await tx.bookingPassenger.findUnique({
        where: { id: passengerId },
        select: {
          id: true,
          bookingId: true,
          firstName: true,
          lastName: true,
          title: true,
          isLead: true,
          roomingAssignments: {
            select: {
              bookingRoomingEntryId: true,
            },
          },
        },
      });

      if (!passenger || passenger.bookingId !== bookingId) {
        throw new NotFoundException('Booking passenger not found');
      }

      if (passenger.roomingAssignments.length > 0) {
        throw new BadRequestException('Unassign the passenger from rooming before deleting the passenger record.');
      }

      await tx.bookingPassenger.delete({
        where: { id: passengerId },
      });

      await this.createAuditLog(tx, {
        bookingId,
        entityType: BookingAuditEntityType.booking,
        entityId: passengerId,
        action: 'booking_passenger_deleted',
        oldValue: this.formatPassengerAuditValue(passenger),
        actor,
      });

      return { id: passengerId };
    });
  }

  async setLeadPassenger(bookingId: string, passengerId: string, actor?: AuditActor) {
    return this.prisma.$transaction(async (tx) => {
      const passenger = await tx.bookingPassenger.findUnique({
        where: { id: passengerId },
        select: {
          id: true,
          bookingId: true,
          firstName: true,
          lastName: true,
          title: true,
          isLead: true,
        },
      });

      if (!passenger || passenger.bookingId !== bookingId) {
        throw new NotFoundException('Booking passenger not found');
      }

      if (passenger.isLead) {
        return passenger;
      }

      await tx.bookingPassenger.updateMany({
        where: { bookingId },
        data: { isLead: false },
      });

      const updatedPassenger = await tx.bookingPassenger.update({
        where: { id: passengerId },
        data: { isLead: true },
      });

      await this.createAuditLog(tx, {
        bookingId,
        entityType: BookingAuditEntityType.booking,
        entityId: passengerId,
        action: 'booking_passenger_lead_set',
        oldValue: this.formatPassengerAuditValue(passenger),
        newValue: this.formatPassengerAuditValue(updatedPassenger),
        actor,
      });

      return updatedPassenger;
    });
  }

  async createRoomingEntry(
    bookingId: string,
    data: {
      roomType?: string | null;
      occupancy?: BookingRoomOccupancy | 'single' | 'double' | 'triple' | 'quad' | 'unknown';
      notes?: string | null;
      sortOrder?: number;
      actor?: AuditActor;
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        select: {
          id: true,
          roomingEntries: {
            select: { sortOrder: true },
            orderBy: { sortOrder: 'desc' },
            take: 1,
          },
        },
      });

      if (!booking) {
        throw new NotFoundException('Booking not found');
      }

      const roomType = this.normalizeOptionalText(data.roomType);
      const occupancy = this.normalizeRoomOccupancy(data.occupancy);
      const notes = this.normalizeOptionalText(data.notes);
      const sortOrder =
        data.sortOrder === undefined
          ? Number(booking.roomingEntries[0]?.sortOrder ?? booking.roomingEntries.length) + 1
          : this.normalizeSortOrder(data.sortOrder);

      const roomingEntry = await tx.bookingRoomingEntry.create({
        data: {
          bookingId,
          roomType,
          occupancy,
          notes,
          sortOrder,
        },
      });

      await this.createAuditLog(tx, {
        bookingId,
        entityType: BookingAuditEntityType.booking,
        entityId: roomingEntry.id,
        action: 'booking_rooming_entry_created',
        newValue: this.formatRoomingEntryAuditValue(roomingEntry),
        actor: data.actor,
      });

      return roomingEntry;
    });
  }

  async updateRoomingEntry(
    bookingId: string,
    roomingEntryId: string,
    data: {
      roomType?: string | null;
      occupancy?: BookingRoomOccupancy | 'single' | 'double' | 'triple' | 'quad' | 'unknown';
      notes?: string | null;
      sortOrder?: number;
      actor?: AuditActor;
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const roomingEntry = await tx.bookingRoomingEntry.findUnique({
        where: { id: roomingEntryId },
        select: {
          id: true,
          bookingId: true,
          roomType: true,
          occupancy: true,
          notes: true,
          sortOrder: true,
        },
      });

      if (!roomingEntry || roomingEntry.bookingId !== bookingId) {
        throw new NotFoundException('Booking rooming entry not found');
      }

      const nextRoomType = data.roomType === undefined ? roomingEntry.roomType : this.normalizeOptionalText(data.roomType);
      const nextOccupancy = data.occupancy === undefined ? roomingEntry.occupancy : this.normalizeRoomOccupancy(data.occupancy);
      const nextNotes = data.notes === undefined ? roomingEntry.notes : this.normalizeOptionalText(data.notes);
      const nextSortOrder =
        data.sortOrder === undefined ? roomingEntry.sortOrder : this.normalizeSortOrder(data.sortOrder);

      const currentAssignmentCount = await tx.bookingRoomingAssignment.count({
        where: {
          bookingRoomingEntryId: roomingEntryId,
        },
      });
      const nextCapacity = this.getRoomOccupancyCapacity(nextOccupancy);

      if (nextCapacity !== null && currentAssignmentCount > nextCapacity) {
        throw new BadRequestException('Room occupancy cannot be reduced below the number of assigned passengers.');
      }

      const updatedRoomingEntry = await tx.bookingRoomingEntry.update({
        where: { id: roomingEntryId },
        data: {
          roomType: nextRoomType,
          occupancy: nextOccupancy,
          notes: nextNotes,
          sortOrder: nextSortOrder,
        },
      });

      await this.createAuditLog(tx, {
        bookingId,
        entityType: BookingAuditEntityType.booking,
        entityId: roomingEntryId,
        action: 'booking_rooming_entry_updated',
        oldValue: this.formatRoomingEntryAuditValue(roomingEntry),
        newValue: this.formatRoomingEntryAuditValue(updatedRoomingEntry),
        actor: data.actor,
      });

      return updatedRoomingEntry;
    });
  }

  async deleteRoomingEntry(bookingId: string, roomingEntryId: string, actor?: AuditActor) {
    return this.prisma.$transaction(async (tx) => {
      const roomingEntry = await tx.bookingRoomingEntry.findUnique({
        where: { id: roomingEntryId },
        select: {
          id: true,
          bookingId: true,
          roomType: true,
          occupancy: true,
          notes: true,
          sortOrder: true,
          assignments: {
            select: {
              id: true,
            },
          },
        },
      });

      if (!roomingEntry || roomingEntry.bookingId !== bookingId) {
        throw new NotFoundException('Booking rooming entry not found');
      }

      if (roomingEntry.assignments.length > 0) {
        throw new BadRequestException('Unassign passengers from the room before deleting the rooming entry.');
      }

      await tx.bookingRoomingEntry.delete({
        where: { id: roomingEntryId },
      });

      await this.createAuditLog(tx, {
        bookingId,
        entityType: BookingAuditEntityType.booking,
        entityId: roomingEntryId,
        action: 'booking_rooming_entry_deleted',
        oldValue: this.formatRoomingEntryAuditValue(roomingEntry),
        actor,
      });

      return { id: roomingEntryId };
    });
  }

  async assignPassengerToRoom(bookingId: string, roomingEntryId: string, passengerId: string, actor?: AuditActor) {
    const normalizedPassengerId = this.normalizeRequiredText(passengerId, 'Passenger is required for room assignment');

    return this.prisma.$transaction(async (tx) => {
      const [roomingEntry, passenger] = await Promise.all([
        tx.bookingRoomingEntry.findUnique({
          where: { id: roomingEntryId },
          select: {
            id: true,
            bookingId: true,
            roomType: true,
            occupancy: true,
            sortOrder: true,
            assignments: {
              select: {
                bookingPassengerId: true,
              },
            },
          },
        }),
        tx.bookingPassenger.findUnique({
          where: { id: normalizedPassengerId },
          select: {
            id: true,
            bookingId: true,
            firstName: true,
            lastName: true,
            title: true,
            roomingAssignments: {
              select: {
                bookingRoomingEntryId: true,
              },
            },
          },
        }),
      ]);

      if (!roomingEntry || roomingEntry.bookingId !== bookingId) {
        throw new NotFoundException('Booking rooming entry not found');
      }

      if (!passenger || passenger.bookingId !== bookingId) {
        throw new NotFoundException('Booking passenger not found');
      }

      if (roomingEntry.assignments.some((assignment) => assignment.bookingPassengerId === normalizedPassengerId)) {
        throw new BadRequestException('Passenger is already assigned to this room.');
      }

      if (passenger.roomingAssignments.length > 0) {
        throw new BadRequestException('Passenger is already assigned to another room. Unassign them first.');
      }

      const capacity = this.getRoomOccupancyCapacity(roomingEntry.occupancy);
      if (capacity !== null && roomingEntry.assignments.length >= capacity) {
        throw new BadRequestException(`This room is already at its ${this.formatRoomOccupancy(roomingEntry.occupancy).toLowerCase()} occupancy limit.`);
      }

      await tx.bookingRoomingAssignment.create({
        data: {
          bookingRoomingEntryId: roomingEntryId,
          bookingPassengerId: normalizedPassengerId,
        },
      });

      await this.createAuditLog(tx, {
        bookingId,
        entityType: BookingAuditEntityType.booking,
        entityId: roomingEntryId,
        action: 'booking_rooming_assignment_created',
        oldValue: this.formatRoomingEntryAuditValue(roomingEntry),
        newValue: `${this.formatPassengerAuditValue(passenger)} assigned to ${this.formatRoomingEntryAuditValue(roomingEntry)}`,
        actor,
      });

      return { bookingRoomingEntryId: roomingEntryId, bookingPassengerId: normalizedPassengerId };
    });
  }

  async unassignPassengerFromRoom(bookingId: string, roomingEntryId: string, passengerId: string, actor?: AuditActor) {
    const normalizedPassengerId = this.normalizeRequiredText(passengerId, 'Passenger is required for room assignment removal');

    return this.prisma.$transaction(async (tx) => {
      const [roomingEntry, passenger, assignment] = await Promise.all([
        tx.bookingRoomingEntry.findUnique({
          where: { id: roomingEntryId },
          select: {
            id: true,
            bookingId: true,
            roomType: true,
            occupancy: true,
            sortOrder: true,
          },
        }),
        tx.bookingPassenger.findUnique({
          where: { id: normalizedPassengerId },
          select: {
            id: true,
            bookingId: true,
            firstName: true,
            lastName: true,
            title: true,
          },
        }),
        tx.bookingRoomingAssignment.findUnique({
          where: {
            bookingRoomingEntryId_bookingPassengerId: {
              bookingRoomingEntryId: roomingEntryId,
              bookingPassengerId: normalizedPassengerId,
            },
          },
          select: {
            id: true,
          },
        }),
      ]);

      if (!roomingEntry || roomingEntry.bookingId !== bookingId) {
        throw new NotFoundException('Booking rooming entry not found');
      }

      if (!passenger || passenger.bookingId !== bookingId) {
        throw new NotFoundException('Booking passenger not found');
      }

      if (!assignment) {
        throw new NotFoundException('Passenger is not assigned to this room');
      }

      await tx.bookingRoomingAssignment.delete({
        where: { id: assignment.id },
      });

      await this.createAuditLog(tx, {
        bookingId,
        entityType: BookingAuditEntityType.booking,
        entityId: roomingEntryId,
        action: 'booking_rooming_assignment_deleted',
        oldValue: `${this.formatPassengerAuditValue(passenger)} assigned to ${this.formatRoomingEntryAuditValue(roomingEntry)}`,
        newValue: this.formatRoomingEntryAuditValue(roomingEntry),
        actor,
      });

      return { bookingRoomingEntryId: roomingEntryId, bookingPassengerId: normalizedPassengerId };
    });
  }

  assignSupplier(
    bookingServiceId: string,
    data: { supplierId?: string | null; supplierName?: string | null; actor?: AuditActor },
  ) {
    const actor = data.actor;

    return this.prisma.bookingService
      .findUnique({
        where: { id: bookingServiceId },
        select: {
          id: true,
          bookingId: true,
          serviceType: true,
          serviceDate: true,
          status: true,
          totalCost: true,
          totalSell: true,
          confirmationStatus: true,
          supplierId: true,
          supplierName: true,
        },
      })
      .then(async (bookingService) => {
        if (!bookingService) {
          throw new NotFoundException('Booking service not found');
        }

        if (!data.supplierId) {
          const nextSupplierName = data.supplierName ?? null;
          const nextStatus = this.resolveBookingServiceLifecycleStatus({
            currentStatus: bookingService.status,
            serviceType: bookingService.serviceType,
            serviceDate: bookingService.serviceDate,
            supplierId: null,
            supplierName: nextSupplierName,
            totalCost: bookingService.totalCost,
            totalSell: bookingService.totalSell,
            confirmationStatus: bookingService.confirmationStatus,
          });

          return this.prisma.$transaction(async (tx) => {
            const updatedBookingService = await tx.bookingService.update({
              where: { id: bookingServiceId },
              data: {
                supplierId: null,
                supplierName: nextSupplierName,
                status: nextStatus,
              },
            });

            await this.createAuditLog(tx, {
              bookingId: bookingService.bookingId,
              bookingServiceId: bookingService.id,
              entityType: BookingAuditEntityType.booking_service,
              entityId: bookingService.id,
              action: 'service_supplier_assigned',
              oldValue: this.formatSupplierAuditValue(bookingService.supplierId, bookingService.supplierName),
              newValue: this.formatSupplierAuditValue(null, nextSupplierName),
              actor,
            });

            await this.createServiceLifecycleAuditIfChanged(tx, {
              bookingId: bookingService.bookingId,
              bookingServiceId: bookingService.id,
              oldStatus: bookingService.status,
              newStatus: nextStatus,
              action: 'service_status_recalculated',
              actor,
            });

            return updatedBookingService;
          });
        }

        return this.prisma.supplier
          .findUnique({
            where: { id: data.supplierId },
            select: {
              id: true,
              name: true,
            },
          })
          .then((supplier) => {
            if (!supplier) {
              throw new NotFoundException('Supplier not found');
            }

            const nextStatus = this.resolveBookingServiceLifecycleStatus({
              currentStatus: bookingService.status,
              serviceType: bookingService.serviceType,
              serviceDate: bookingService.serviceDate,
              supplierId: supplier.id,
              supplierName: supplier.name,
              totalCost: bookingService.totalCost,
              totalSell: bookingService.totalSell,
              confirmationStatus: bookingService.confirmationStatus,
            });

            return this.prisma.$transaction(async (tx) => {
              const updatedBookingService = await tx.bookingService.update({
                where: { id: bookingServiceId },
                data: {
                  supplierId: supplier.id,
                  supplierName: supplier.name,
                  status: nextStatus,
                },
              });

              await this.createAuditLog(tx, {
                bookingId: bookingService.bookingId,
                bookingServiceId: bookingService.id,
                entityType: BookingAuditEntityType.booking_service,
                entityId: bookingService.id,
                action: 'service_supplier_assigned',
                oldValue: this.formatSupplierAuditValue(bookingService.supplierId, bookingService.supplierName),
                newValue: this.formatSupplierAuditValue(supplier.id, supplier.name),
                actor,
              });

              await this.createServiceLifecycleAuditIfChanged(tx, {
                bookingId: bookingService.bookingId,
                bookingServiceId: bookingService.id,
                oldStatus: bookingService.status,
                newStatus: nextStatus,
                action: 'service_status_recalculated',
                actor,
              });

              return updatedBookingService;
            });
          });
      });
  }

  updateConfirmation(
    bookingServiceId: string,
    data: {
      confirmationStatus: 'pending' | 'requested' | 'confirmed';
      confirmationNumber?: string | null;
      supplierReference?: string | null;
      notes?: string | null;
      actor?: AuditActor;
    },
  ) {
    const actor = data.actor;

    return this.prisma.bookingService
      .findUnique({
        where: { id: bookingServiceId },
        select: {
          id: true,
          bookingId: true,
          serviceType: true,
          serviceDate: true,
          startTime: true,
          pickupTime: true,
          pickupLocation: true,
          meetingPoint: true,
          participantCount: true,
          adultCount: true,
          childCount: true,
          supplierReference: true,
          status: true,
          totalCost: true,
          totalSell: true,
          supplierId: true,
          supplierName: true,
          confirmationRequestedAt: true,
          confirmationStatus: true,
          confirmationNumber: true,
          confirmationNotes: true,
          supplier: {
            select: {
              email: true,
            },
          },
        },
      })
      .then(async (bookingService) => {
        if (!bookingService) {
          throw new NotFoundException('Booking service not found');
        }

        const supplierReference =
          data.supplierReference === undefined
            ? data.confirmationNumber === undefined
              ? undefined
              : data.confirmationNumber
            : data.supplierReference;

        this.assertConfirmationWorkflowRequirements({
          serviceType: bookingService.serviceType,
          confirmationStatus: data.confirmationStatus,
          supplierReference: supplierReference ?? bookingService.supplierReference ?? bookingService.confirmationNumber,
          note: data.notes ?? bookingService.confirmationNotes ?? null,
          serviceDate: bookingService.serviceDate,
          startTime: bookingService.startTime,
          pickupTime: bookingService.pickupTime,
          pickupLocation: bookingService.pickupLocation,
          meetingPoint: bookingService.meetingPoint,
          participantCount: bookingService.participantCount,
          adultCount: bookingService.adultCount,
          childCount: bookingService.childCount,
          status: bookingService.status,
          supplierId: bookingService.supplierId,
          supplierName: bookingService.supplierName,
          totalCost: bookingService.totalCost,
          totalSell: bookingService.totalSell,
          currentConfirmationStatus: bookingService.confirmationStatus,
        });

        const nextStatus = this.resolveBookingServiceLifecycleStatus({
          currentStatus: bookingService.status,
          serviceType: bookingService.serviceType,
          serviceDate: bookingService.serviceDate,
          supplierId: bookingService.supplierId,
          supplierName: bookingService.supplierName,
          totalCost: bookingService.totalCost,
          totalSell: bookingService.totalSell,
          confirmationStatus: data.confirmationStatus,
        });

        const updatedBookingService = await this.prisma.$transaction(async (tx) => {
          const updatedService = await tx.bookingService.update({
            where: { id: bookingServiceId },
            data: {
              confirmationStatus: data.confirmationStatus,
              confirmationNumber: supplierReference ?? data.confirmationNumber ?? null,
              supplierReference: supplierReference ?? null,
              confirmationNotes: data.notes ?? null,
              confirmationRequestedAt:
                data.confirmationStatus === BookingServiceStatus.pending
                  ? null
                  : bookingService.confirmationRequestedAt ?? new Date(),
              confirmationConfirmedAt:
                data.confirmationStatus === BookingServiceStatus.confirmed ? new Date() : null,
              status: nextStatus,
            },
          });

          await this.createAuditLog(tx, {
            bookingId: bookingService.bookingId,
            bookingServiceId: bookingService.id,
            entityType: BookingAuditEntityType.booking_service,
            entityId: bookingService.id,
            action: 'service_confirmation_updated',
            oldValue: bookingService.confirmationStatus,
            newValue: data.confirmationStatus,
            note: data.notes ?? null,
            actor,
          });

          await this.createServiceLifecycleAuditIfChanged(tx, {
            bookingId: bookingService.bookingId,
            bookingServiceId: bookingService.id,
            oldStatus: bookingService.status,
            newStatus: nextStatus,
            action: 'service_status_recalculated',
            note: data.notes ?? null,
            actor,
          });

          return updatedService;
        });

        const shouldAutoSendSupplierConfirmation =
          bookingService.confirmationStatus !== 'requested' &&
          data.confirmationStatus === 'requested' &&
          Boolean(bookingService.supplier?.email);

        if (shouldAutoSendSupplierConfirmation) {
          try {
            await this.sendDocumentEmail({
              email: bookingService.supplier!.email!,
              bookingId: bookingService.bookingId,
              documentType: 'supplier-confirmation',
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to send supplier confirmation email';

            console.error('Supplier confirmation auto-email failed', {
              bookingServiceId,
              bookingId: bookingService.bookingId,
              supplierEmail: bookingService.supplier!.email!,
              message,
            });

            return {
              ...updatedBookingService,
              warning: `Confirmation updated, but supplier confirmation email failed: ${message}`,
            };
          }
        }

        return updatedBookingService;
      });
  }

  async supplierConfirm(
    bookingServiceId: string,
    data: {
      token?: string;
      confirmationNumber?: string | null;
      supplierReference?: string | null;
      notes?: string | null;
    },
    actor?: AuditActor,
  ) {
    const normalizedToken = data.token?.trim();

    if (!normalizedToken) {
      throw new BadRequestException('Access token is required');
    }

    const bookingService = await this.prisma.bookingService.findFirst({
      where: {
        id: bookingServiceId,
        booking: {
          accessToken: normalizedToken,
        },
      },
      select: {
        id: true,
      },
    });

    if (!bookingService) {
      throw new NotFoundException('Booking service not found');
    }

    return this.prisma.$transaction(async (tx) => {
      const currentService = await tx.bookingService.findUnique({
        where: { id: bookingServiceId },
        select: {
          id: true,
          bookingId: true,
          serviceType: true,
          serviceDate: true,
          startTime: true,
          pickupTime: true,
          pickupLocation: true,
          meetingPoint: true,
          participantCount: true,
          adultCount: true,
          childCount: true,
          supplierReference: true,
          status: true,
          confirmationStatus: true,
          confirmationNumber: true,
          confirmationNotes: true,
          supplierId: true,
          supplierName: true,
          totalCost: true,
          totalSell: true,
        },
      });

      if (!currentService) {
        throw new NotFoundException('Booking service not found');
      }

      const supplierReference =
        data.supplierReference === undefined
          ? data.confirmationNumber === undefined
            ? currentService.supplierReference ?? currentService.confirmationNumber
            : data.confirmationNumber
          : data.supplierReference;

      this.assertConfirmationWorkflowRequirements({
        serviceType: currentService.serviceType,
        confirmationStatus: BookingServiceStatus.confirmed,
        supplierReference,
        note: data.notes ?? currentService.confirmationNotes ?? null,
        serviceDate: currentService.serviceDate,
        startTime: currentService.startTime,
        pickupTime: currentService.pickupTime,
        pickupLocation: currentService.pickupLocation,
        meetingPoint: currentService.meetingPoint,
        participantCount: currentService.participantCount,
        adultCount: currentService.adultCount,
        childCount: currentService.childCount,
        status: currentService.status,
        supplierId: currentService.supplierId,
        supplierName: currentService.supplierName,
        totalCost: currentService.totalCost,
        totalSell: currentService.totalSell,
        currentConfirmationStatus: currentService.confirmationStatus,
      });

      const updatedService = await tx.bookingService.update({
        where: {
          id: bookingServiceId,
        },
        data: {
          confirmationStatus: BookingServiceStatus.confirmed,
          confirmationNumber: supplierReference ?? null,
          supplierReference: supplierReference ?? null,
          confirmationNotes: data.notes ?? currentService.confirmationNotes ?? null,
          confirmationRequestedAt: new Date(),
          confirmationConfirmedAt: new Date(),
          status: BookingServiceLifecycleStatus.confirmed,
        },
      });

      await this.createAuditLog(tx, {
        bookingId: currentService.bookingId,
        bookingServiceId: currentService.id,
        entityType: BookingAuditEntityType.booking_service,
        entityId: currentService.id,
        action: 'service_supplier_confirmed',
        oldValue: currentService.confirmationStatus,
        newValue: BookingServiceStatus.confirmed,
        actor,
      });

      await this.createServiceLifecycleAuditIfChanged(tx, {
        bookingId: currentService.bookingId,
        bookingServiceId: currentService.id,
        oldStatus: currentService.status,
        newStatus: BookingServiceLifecycleStatus.confirmed,
        action: 'service_status_recalculated',
        actor,
      });

      return updatedService;
    });
  }

  async updateOperationalDetails(
    bookingServiceId: string,
    data: {
      serviceDate?: string | null;
      startTime?: string | null;
      pickupTime?: string | null;
      pickupLocation?: string | null;
      meetingPoint?: string | null;
      participantCount?: number | null;
      adultCount?: number | null;
      childCount?: number | null;
      supplierReference?: string | null;
      reconfirmationRequired?: boolean;
      reconfirmationDueAt?: string | null;
      note?: string | null;
      actor?: AuditActor;
    },
  ) {
    const actor = data.actor;
    const bookingService = await this.prisma.bookingService.findUnique({
      where: { id: bookingServiceId },
      select: {
        id: true,
        bookingId: true,
        serviceType: true,
        serviceDate: true,
        startTime: true,
        pickupTime: true,
        pickupLocation: true,
        meetingPoint: true,
        participantCount: true,
        adultCount: true,
        childCount: true,
        supplierReference: true,
        reconfirmationRequired: true,
        reconfirmationDueAt: true,
        status: true,
        totalCost: true,
        totalSell: true,
        supplierId: true,
        supplierName: true,
        confirmationStatus: true,
      },
    });

    if (!bookingService) {
      throw new NotFoundException('Booking service not found');
    }

    const counts = this.normalizeActivityOperationalCounts({
      participantCount: data.participantCount,
      adultCount: data.adultCount,
      childCount: data.childCount,
      currentParticipantCount: bookingService.participantCount,
      currentAdultCount: bookingService.adultCount,
      currentChildCount: bookingService.childCount,
    });
    const serviceDate = data.serviceDate === undefined ? bookingService.serviceDate : this.normalizeDateTimeInput(data.serviceDate);
    const startTime = data.startTime === undefined ? bookingService.startTime : this.normalizeTimeInput(data.startTime, 'Start time');
    const pickupTime = data.pickupTime === undefined ? bookingService.pickupTime : this.normalizeTimeInput(data.pickupTime, 'Pickup time');
    const pickupLocation =
      data.pickupLocation === undefined ? bookingService.pickupLocation : this.normalizeOptionalText(data.pickupLocation);
    const meetingPoint =
      data.meetingPoint === undefined ? bookingService.meetingPoint : this.normalizeOptionalText(data.meetingPoint);
    const supplierReference =
      data.supplierReference === undefined ? bookingService.supplierReference : this.normalizeOptionalText(data.supplierReference);
    const reconfirmationRequired =
      data.reconfirmationRequired === undefined ? bookingService.reconfirmationRequired : Boolean(data.reconfirmationRequired);
    const reconfirmationDueAt = reconfirmationRequired
      ? data.reconfirmationDueAt === undefined
        ? bookingService.reconfirmationDueAt
        : this.normalizeDateTimeInput(data.reconfirmationDueAt)
      : null;
    const note = this.normalizeOptionalText(data.note);
    const nextStatus = this.resolveBookingServiceLifecycleStatus({
      currentStatus: bookingService.status,
      serviceType: bookingService.serviceType,
      serviceDate,
      supplierId: bookingService.supplierId,
      supplierName: bookingService.supplierName,
      totalCost: bookingService.totalCost,
      totalSell: bookingService.totalSell,
      confirmationStatus: bookingService.confirmationStatus,
    });

    return this.prisma.$transaction(async (tx) => {
      const updatedService = await tx.bookingService.update({
        where: { id: bookingServiceId },
        data: {
          serviceDate,
          startTime,
          pickupTime,
          pickupLocation,
          meetingPoint,
          participantCount: counts.participantCount,
          adultCount: counts.adultCount,
          childCount: counts.childCount,
          supplierReference,
          confirmationNumber: supplierReference ?? null,
          reconfirmationRequired,
          reconfirmationDueAt,
          status: nextStatus,
        },
      });

      await this.createAuditLog(tx, {
        bookingId: bookingService.bookingId,
        bookingServiceId: bookingService.id,
        entityType: BookingAuditEntityType.booking_service,
        entityId: bookingService.id,
        action: 'service_operational_details_updated',
        oldValue: this.buildOperationalAuditSummary(bookingService),
        newValue: this.buildOperationalAuditSummary({
          ...bookingService,
          serviceDate,
          startTime,
          pickupTime,
          pickupLocation,
          meetingPoint,
          participantCount: counts.participantCount,
          adultCount: counts.adultCount,
          childCount: counts.childCount,
          supplierReference,
          reconfirmationRequired,
          reconfirmationDueAt,
        }),
        note,
        actor,
      });

      await this.createServiceLifecycleAuditIfChanged(tx, {
        bookingId: bookingService.bookingId,
        bookingServiceId: bookingService.id,
        oldStatus: bookingService.status,
        newStatus: nextStatus,
        action: 'service_status_recalculated',
        note,
        actor,
      });

      return updatedService;
    });
  }

  async updateManualServiceStatus(
    bookingServiceId: string,
    data: {
      action: 'cancel' | 'reopen' | 'mark_ready';
      note: string;
      actor?: AuditActor;
    },
  ) {
    const note = this.normalizeManualOverrideNote(data.note, 'Manual service action note is required');
    const actor = data.actor;
    const bookingService = await this.prisma.bookingService.findUnique({
      where: { id: bookingServiceId },
      select: {
        id: true,
        bookingId: true,
        serviceType: true,
        serviceDate: true,
        startTime: true,
        pickupTime: true,
        pickupLocation: true,
        meetingPoint: true,
        participantCount: true,
        adultCount: true,
        childCount: true,
        status: true,
        totalCost: true,
        totalSell: true,
        supplierId: true,
        supplierName: true,
        confirmationStatus: true,
      },
    });

    if (!bookingService) {
      throw new NotFoundException('Booking service not found');
    }

    return this.applyManualServiceAction(this.prisma, bookingService, data.action, note, actor);
  }

  async bulkUpdateServiceStatuses(data: {
    serviceIds: string[];
    action: 'cancel' | 'reopen' | 'mark_ready' | 'request_confirmation';
    note: string;
    actor?: AuditActor;
  }) {
    const serviceIds = Array.from(new Set(data.serviceIds.map((serviceId) => serviceId.trim()).filter(Boolean)));
    const note = this.normalizeManualOverrideNote(data.note, 'Bulk action note is required');
    const actor = data.actor;

    if (serviceIds.length === 0) {
      throw new BadRequestException('Select at least one booking service');
    }

    const bookingServices = await this.prisma.bookingService.findMany({
      where: {
        id: {
          in: serviceIds,
        },
      },
      select: {
        id: true,
        bookingId: true,
        serviceType: true,
        serviceDate: true,
        status: true,
        totalCost: true,
        totalSell: true,
        supplierId: true,
        supplierName: true,
        confirmationStatus: true,
        confirmationRequestedAt: true,
        supplier: {
          select: {
            email: true,
          },
        },
      },
    });

    if (bookingServices.length !== serviceIds.length) {
      throw new NotFoundException('One or more booking services were not found');
    }

    const orderedServices = serviceIds.map((serviceId) => {
      const bookingService = bookingServices.find((service) => service.id === serviceId);

      if (!bookingService) {
        throw new NotFoundException('One or more booking services were not found');
      }

      return bookingService;
    });

    const emailTasks: Array<{ bookingId: string; bookingServiceId: string; email: string }> = [];
    const skipped: Array<{ serviceId: string; reason: string }> = [];
    let updatedCount = 0;

    for (const bookingService of orderedServices) {
      try {
        await this.prisma.$transaction(async (tx) => {
          if (data.action === 'request_confirmation') {
            await this.applyBulkRequestConfirmation(tx, bookingService, note, actor);

            if (bookingService.confirmationStatus !== BookingServiceStatus.requested && bookingService.supplier?.email) {
              emailTasks.push({
                bookingId: bookingService.bookingId,
                bookingServiceId: bookingService.id,
                email: bookingService.supplier.email,
              });
            }

            return;
          }

          await this.applyManualServiceAction(tx, bookingService, data.action, note, actor);
        });
        updatedCount += 1;
      } catch (error) {
        const reason =
          error instanceof BadRequestException
            ? this.extractBadRequestMessage(error)
            : error instanceof Error
              ? error.message
              : 'Service could not be processed';
        skipped.push({
          serviceId: bookingService.id,
          reason,
        });

        await this.createAuditLog(this.prisma, {
          bookingId: bookingService.bookingId,
          bookingServiceId: bookingService.id,
          entityType: BookingAuditEntityType.booking_service,
          entityId: bookingService.id,
          action: 'service_bulk_action_skipped',
          oldValue: bookingService.status,
          newValue: data.action,
          note: reason,
          actor,
        });
      }
    }

    const warnings: string[] = [];

    for (const task of emailTasks) {
      try {
        await this.sendDocumentEmail({
          email: task.email,
          bookingId: task.bookingId,
          documentType: 'supplier-confirmation',
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to send supplier confirmation email';

        console.error('Bulk supplier confirmation auto-email failed', {
          bookingServiceId: task.bookingServiceId,
          bookingId: task.bookingId,
          supplierEmail: task.email,
          message,
        });

        warnings.push(`${task.bookingServiceId}: ${message}`);
      }
    }

    return {
      updatedCount,
      skippedCount: skipped.length,
      skipped,
      warning:
        warnings.length > 0
          ? `Bulk action completed, but ${warnings.length} supplier confirmation email${warnings.length === 1 ? '' : 's'} failed.`
          : undefined,
    };
  }

  private async applyManualServiceAction(
    prismaClient: BookingMutationClient,
    bookingService: {
      id: string;
      bookingId: string;
      serviceType: string;
      serviceDate: Date | null;
      startTime?: string | null;
      pickupTime?: string | null;
      pickupLocation?: string | null;
      meetingPoint?: string | null;
      participantCount?: number | null;
      adultCount?: number | null;
      childCount?: number | null;
      status: BookingServiceLifecycleStatus;
      totalCost: number;
      totalSell: number;
      supplierId: string | null;
      supplierName: string | null;
      confirmationStatus: BookingServiceStatus;
    },
    action: 'cancel' | 'reopen' | 'mark_ready',
    note: string,
    actor?: AuditActor,
  ) {
    let nextStatus: BookingServiceLifecycleStatus;

    if (action === 'cancel') {
      nextStatus = BookingServiceLifecycleStatus.cancelled;
    } else if (action === 'mark_ready') {
      if (bookingService.status === BookingServiceLifecycleStatus.cancelled) {
        throw new BadRequestException('Reopen the cancelled service before marking it ready');
      }

      if (bookingService.confirmationStatus === BookingServiceStatus.confirmed) {
        throw new BadRequestException('Confirmed services cannot be moved back to ready manually');
      }

      this.assertCanMarkReady(bookingService);
      nextStatus = BookingServiceLifecycleStatus.ready;
    } else {
      nextStatus = this.resolveBookingServiceLifecycleStatus({
        currentStatus: undefined,
        serviceType: bookingService.serviceType,
        serviceDate: bookingService.serviceDate,
        supplierId: bookingService.supplierId,
        supplierName: bookingService.supplierName,
        totalCost: bookingService.totalCost,
        totalSell: bookingService.totalSell,
        confirmationStatus: bookingService.confirmationStatus,
      });
    }

    const updatedService = await prismaClient.bookingService.update({
      where: { id: bookingService.id },
      data: {
        status: nextStatus,
        statusNote: note,
      },
    });

    await this.createAuditLog(prismaClient, {
      bookingId: bookingService.bookingId,
      bookingServiceId: bookingService.id,
      entityType: BookingAuditEntityType.booking_service,
      entityId: bookingService.id,
      action: `service_${action}`,
      oldValue: bookingService.status,
      newValue: nextStatus,
      note,
      actor,
    });

    return updatedService;
  }

  private async applyBulkRequestConfirmation(
    prismaClient: BookingMutationClient,
    bookingService: {
      id: string;
      bookingId: string;
      serviceType: string;
      serviceDate: Date | null;
      status: BookingServiceLifecycleStatus;
      totalCost: number;
      totalSell: number;
      supplierId: string | null;
      supplierName: string | null;
      confirmationStatus: BookingServiceStatus;
      confirmationRequestedAt: Date | null;
    },
    note: string,
    actor?: AuditActor,
  ) {
    this.assertCanRequestConfirmation(bookingService);

    const nextStatus = this.resolveBookingServiceLifecycleStatus({
      currentStatus: bookingService.status,
      serviceType: bookingService.serviceType,
      serviceDate: bookingService.serviceDate,
      supplierId: bookingService.supplierId,
      supplierName: bookingService.supplierName,
      totalCost: bookingService.totalCost,
      totalSell: bookingService.totalSell,
      confirmationStatus: BookingServiceStatus.requested,
    });

    const updatedService = await prismaClient.bookingService.update({
      where: { id: bookingService.id },
      data: {
        confirmationStatus: BookingServiceStatus.requested,
        confirmationNotes: note,
        confirmationRequestedAt: new Date(),
        confirmationConfirmedAt: null,
        status: nextStatus,
      },
    });

    await this.createAuditLog(prismaClient, {
      bookingId: bookingService.bookingId,
      bookingServiceId: bookingService.id,
      entityType: BookingAuditEntityType.booking_service,
      entityId: bookingService.id,
      action: 'service_request_confirmation',
      oldValue: bookingService.confirmationStatus,
      newValue: BookingServiceStatus.requested,
      note,
      actor,
    });

    await this.createServiceLifecycleAuditIfChanged(prismaClient, {
      bookingId: bookingService.bookingId,
      bookingServiceId: bookingService.id,
      oldStatus: bookingService.status,
      newStatus: nextStatus,
      action: 'service_status_recalculated',
      note,
      actor,
    });

    return updatedService;
  }

  private async createServiceLifecycleAuditIfChanged(
    prismaClient: BookingMutationClient,
    values: {
      bookingId: string;
      bookingServiceId: string;
      oldStatus: BookingServiceLifecycleStatus;
      newStatus: BookingServiceLifecycleStatus;
      action: string;
      note?: string | null;
      actor?: AuditActor;
    },
  ) {
    if (values.oldStatus === values.newStatus) {
      return;
    }

    await this.createAuditLog(prismaClient, {
      bookingId: values.bookingId,
      bookingServiceId: values.bookingServiceId,
      entityType: BookingAuditEntityType.booking_service,
      entityId: values.bookingServiceId,
      action: values.action,
      oldValue: values.oldStatus,
      newValue: values.newStatus,
      note: values.note,
      actor: values.actor,
    });
  }

  private async createAuditLog(
    prismaClient: BookingMutationClient,
    values: {
      bookingId: string;
      bookingServiceId?: string | null;
      entityType: BookingAuditEntityType;
      entityId: string;
      action: string;
      oldValue?: string | null;
      newValue?: string | null;
      note?: string | null;
      actor?: AuditActor;
    },
  ) {
    await prismaClient.bookingAuditLog.create({
      data: {
        bookingId: values.bookingId,
        bookingServiceId: values.bookingServiceId ?? null,
        entityType: values.entityType,
        entityId: values.entityId,
        action: values.action,
        oldValue: values.oldValue ?? null,
        newValue: values.newValue ?? null,
        note: values.note?.trim() || null,
        actorUserId: this.normalizeActorUserId(values.actor),
        actor: this.normalizeActorLabel(values.actor),
      },
    });
  }

  private formatSupplierAuditValue(supplierId?: string | null, supplierName?: string | null) {
    if (supplierName?.trim()) {
      return supplierId ? `${supplierName.trim()} (${supplierId})` : supplierName.trim();
    }

    if (supplierId?.trim()) {
      return supplierId.trim();
    }

    return 'unassigned';
  }

  private resolveBookingServiceLifecycleStatus(values: {
    currentStatus?: BookingServiceLifecycleStatus;
    serviceType?: string | null;
    serviceDate?: Date | string | null;
    supplierId?: string | null;
    supplierName?: string | null;
    totalCost?: number | null;
    totalSell?: number | null;
    confirmationStatus: BookingServiceStatus;
  }) {
    if (values.currentStatus === BookingServiceLifecycleStatus.cancelled) {
      return BookingServiceLifecycleStatus.cancelled;
    }

    if (values.confirmationStatus === BookingServiceStatus.confirmed) {
      return BookingServiceLifecycleStatus.confirmed;
    }

    if (values.confirmationStatus === BookingServiceStatus.requested) {
      return BookingServiceLifecycleStatus.in_progress;
    }

    const hasSupplier = Boolean(values.supplierId || values.supplierName?.trim());
    const hasPricing = Number(values.totalCost || 0) > 0 && Number(values.totalSell || 0) > 0;
    const hasDate = !this.isActivityService(values.serviceType) || Boolean(values.serviceDate);

    if (hasSupplier && hasPricing && hasDate) {
      return BookingServiceLifecycleStatus.ready;
    }

    return BookingServiceLifecycleStatus.pending;
  }

  private getAllowedBookingStatusTransitions(currentStatus: BookingStatus) {
    if (currentStatus === BookingStatus.draft) {
      return [BookingStatus.confirmed, BookingStatus.cancelled];
    }

    if (currentStatus === BookingStatus.confirmed) {
      return [BookingStatus.in_progress, BookingStatus.cancelled];
    }

    if (currentStatus === BookingStatus.in_progress) {
      return [BookingStatus.completed, BookingStatus.cancelled];
    }

    return [] as BookingStatus[];
  }

  private assertAllowedBookingStatusTransition(currentStatus: BookingStatus, nextStatus: BookingStatus) {
    if (currentStatus === nextStatus) {
      throw new BadRequestException(`Booking is already ${currentStatus.replace('_', ' ')}`);
    }

    const allowedTransitions = this.getAllowedBookingStatusTransitions(currentStatus);

    if (!allowedTransitions.includes(nextStatus)) {
      const formattedCurrent = currentStatus.replace('_', ' ');
      const allowedLabel =
        allowedTransitions.length > 0
          ? allowedTransitions.map((status) => status.replace('_', ' ')).join(', ')
          : 'no further transitions';
      throw new BadRequestException(
        `Invalid booking status transition from ${formattedCurrent}. Allowed next statuses: ${allowedLabel}.`,
      );
    }
  }

  private assertBookingStatusReadiness(
    booking: {
      status: BookingStatus;
      services: Array<{
        id: string;
        description: string;
        serviceType: string;
        serviceDate: Date | null;
        status: BookingServiceLifecycleStatus;
        confirmationStatus: BookingServiceStatus;
        supplierId: string | null;
        supplierName: string | null;
        totalCost: number;
        totalSell: number;
      }>;
    },
    nextStatus: BookingStatus,
  ) {
    if (nextStatus === BookingStatus.in_progress) {
      const notReadyServices = booking.services.filter((service) => !this.isServiceOperationallyReady(service));

      if (notReadyServices.length > 0) {
        throw new BadRequestException(
          `Cannot move booking to in progress until all required services are operationally ready. Remaining blockers: ${this.formatBookingServiceBlockers(notReadyServices)}.`,
        );
      }
    }

    if (nextStatus === BookingStatus.completed) {
      const incompleteServices = booking.services.filter((service) => !this.isServiceComplete(service));

      if (incompleteServices.length > 0) {
        throw new BadRequestException(
          `Cannot complete booking until all active services are completed or supplier-confirmed. Remaining blockers: ${this.formatBookingServiceBlockers(incompleteServices)}.`,
        );
      }
    }
  }

  private assertCanRequestConfirmation(values: {
    serviceType: string;
    serviceDate: Date | null;
    startTime?: string | null;
    pickupTime?: string | null;
    pickupLocation?: string | null;
    meetingPoint?: string | null;
    participantCount?: number | null;
    adultCount?: number | null;
    childCount?: number | null;
    status: BookingServiceLifecycleStatus;
    supplierId: string | null;
    supplierName: string | null;
    totalCost: number;
    totalSell: number;
    confirmationStatus: BookingServiceStatus;
  }) {
    if (values.status === BookingServiceLifecycleStatus.cancelled) {
      throw new BadRequestException('Cancelled services cannot be sent for confirmation.');
    }

    if (values.confirmationStatus === BookingServiceStatus.confirmed) {
      throw new BadRequestException('Confirmed services do not need another confirmation request.');
    }

    if (!values.supplierId && !values.supplierName?.trim()) {
      throw new BadRequestException('Assign a supplier before requesting confirmation.');
    }

    if (Number(values.totalCost || 0) <= 0 || Number(values.totalSell || 0) <= 0) {
      throw new BadRequestException('Pricing must be set before requesting confirmation.');
    }

    if (this.isActivityService(values.serviceType)) {
      const missing = this.getMissingActivityConfirmationData(values);

      if (missing.length > 0) {
        throw new BadRequestException(`Activity services need ${missing.join(', ')} before requesting confirmation.`);
      }
    }
  }

  private isServiceOperationallyReady(values: {
    serviceType: string;
    serviceDate: Date | null;
    status: BookingServiceLifecycleStatus;
    supplierId: string | null;
    supplierName: string | null;
    totalCost: number;
    totalSell: number;
  }) {
    if (values.status === BookingServiceLifecycleStatus.cancelled) {
      return true;
    }

    const hasSupplier = Boolean(values.supplierId || values.supplierName?.trim());
    const hasPricing = Number(values.totalCost || 0) > 0 && Number(values.totalSell || 0) > 0;
    const hasDate = !this.isActivityService(values.serviceType) || Boolean(values.serviceDate);
    const statusReady =
      values.status === BookingServiceLifecycleStatus.ready ||
      values.status === BookingServiceLifecycleStatus.in_progress ||
      values.status === BookingServiceLifecycleStatus.confirmed;

    return hasSupplier && hasPricing && hasDate && statusReady;
  }

  private isServiceComplete(values: {
    status: BookingServiceLifecycleStatus;
    confirmationStatus: BookingServiceStatus;
  }) {
    if (values.status === BookingServiceLifecycleStatus.cancelled) {
      return true;
    }

    return (
      values.status === BookingServiceLifecycleStatus.confirmed &&
      values.confirmationStatus === BookingServiceStatus.confirmed
    );
  }

  private formatBookingServiceBlockers(
    services: Array<{
      description: string;
      serviceType?: string | null;
      serviceDate?: Date | null;
      status: BookingServiceLifecycleStatus;
      supplierId?: string | null;
      supplierName?: string | null;
      totalCost?: number;
      totalSell?: number;
      confirmationStatus?: BookingServiceStatus;
    }>,
  ) {
    return services
      .slice(0, 3)
      .map((service) => {
        const reasons: string[] = [];
        if (!service.supplierId && !service.supplierName?.trim()) {
          reasons.push('supplier missing');
        }
        if (Number(service.totalCost || 0) <= 0 || Number(service.totalSell || 0) <= 0) {
          reasons.push('pricing missing');
        }
        if (this.isActivityService(service.serviceType) && !service.serviceDate) {
          reasons.push('date missing');
        }
        if (
          service.status !== BookingServiceLifecycleStatus.ready &&
          service.status !== BookingServiceLifecycleStatus.in_progress &&
          service.status !== BookingServiceLifecycleStatus.confirmed &&
          service.status !== BookingServiceLifecycleStatus.cancelled
        ) {
          reasons.push(`status ${service.status.replace('_', ' ')}`);
        }
        if (
          service.confirmationStatus !== undefined &&
          service.confirmationStatus !== BookingServiceStatus.confirmed &&
          service.status === BookingServiceLifecycleStatus.in_progress
        ) {
          reasons.push(`confirmation ${service.confirmationStatus}`);
        }

        return `${service.description} (${reasons.join(', ') || 'not ready'})`;
      })
      .join('; ');
  }

  private assertCanMarkReady(values: {
    serviceType: string;
    serviceDate: Date | null;
    supplierId: string | null;
    supplierName: string | null;
    totalCost: number;
    totalSell: number;
  }) {
    if (!values.supplierId && !values.supplierName?.trim()) {
      throw new BadRequestException('Assign a supplier before marking the service ready.');
    }

    if (Number(values.totalCost || 0) <= 0 || Number(values.totalSell || 0) <= 0) {
      throw new BadRequestException('Pricing must be set before marking the service ready.');
    }

    if (this.isActivityService(values.serviceType) && !values.serviceDate) {
      throw new BadRequestException('Activity services need a service date before they can be marked ready.');
    }
  }

  private assertConfirmationWorkflowRequirements(values: {
    serviceType: string;
    confirmationStatus: 'pending' | 'requested' | 'confirmed';
    supplierReference?: string | null;
    note?: string | null;
    serviceDate: Date | null;
    startTime?: string | null;
    pickupTime?: string | null;
    pickupLocation?: string | null;
    meetingPoint?: string | null;
    participantCount?: number | null;
    adultCount?: number | null;
    childCount?: number | null;
    status: BookingServiceLifecycleStatus;
    supplierId: string | null;
    supplierName: string | null;
    totalCost: number;
    totalSell: number;
    currentConfirmationStatus: BookingServiceStatus;
  }) {
    if (values.confirmationStatus === BookingServiceStatus.requested) {
      this.assertCanRequestConfirmation({
        serviceType: values.serviceType,
        serviceDate: values.serviceDate,
        startTime: values.startTime,
        pickupTime: values.pickupTime,
        pickupLocation: values.pickupLocation,
        meetingPoint: values.meetingPoint,
        participantCount: values.participantCount,
        adultCount: values.adultCount,
        childCount: values.childCount,
        status: values.status,
        supplierId: values.supplierId,
        supplierName: values.supplierName,
        totalCost: values.totalCost,
        totalSell: values.totalSell,
        confirmationStatus: values.currentConfirmationStatus,
      });
    }

    if (
      values.confirmationStatus === BookingServiceStatus.confirmed &&
      this.isActivityService(values.serviceType) &&
      !values.supplierReference?.trim() &&
      !values.note?.trim()
    ) {
      throw new BadRequestException('Activity services need a supplier reference or confirmation note before they can be confirmed.');
    }
  }

  private isActivityService(serviceType?: string | null) {
    const normalized = serviceType?.trim().toLowerCase() || '';

    return (
      normalized.includes('activity') ||
      normalized.includes('tour') ||
      normalized.includes('excursion') ||
      normalized.includes('experience') ||
      normalized.includes('sightseeing')
    );
  }

  private getMissingActivityConfirmationData(values: {
    serviceDate: Date | null;
    startTime?: string | null;
    pickupTime?: string | null;
    pickupLocation?: string | null;
    meetingPoint?: string | null;
    participantCount?: number | null;
    adultCount?: number | null;
    childCount?: number | null;
  }) {
    const missing: string[] = [];

    if (!values.serviceDate) {
      missing.push('service date');
    }

    if (Number(values.participantCount || 0) <= 0 && Number(values.adultCount || 0) + Number(values.childCount || 0) <= 0) {
      missing.push('participant counts');
    }

    if (!values.startTime?.trim() && !values.pickupTime?.trim()) {
      missing.push('start or pickup time');
    }

    if (!values.pickupLocation?.trim() && !values.meetingPoint?.trim()) {
      missing.push('pickup location or meeting point');
    }

    return missing;
  }

  private normalizeTimeInput(value: string | null | undefined, fieldLabel: string) {
    const normalized = this.normalizeOptionalText(value);

    if (!normalized) {
      return null;
    }

    if (!/^\d{2}:\d{2}$/.test(normalized)) {
      throw new BadRequestException(`${fieldLabel} must use HH:MM format.`);
    }

    return normalized;
  }

  private normalizeOptionalText(value: string | null | undefined) {
    const normalized = value?.trim() || '';
    return normalized ? normalized.slice(0, 250) : null;
  }

  private normalizeDateTimeInput(value: string | Date | null | undefined) {
    if (!value) {
      return null;
    }

    const parsed = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Invalid date value.');
    }

    return parsed;
  }

  private normalizeActivityOperationalCounts(values: {
    participantCount?: number | null;
    adultCount?: number | null;
    childCount?: number | null;
    currentParticipantCount?: number | null;
    currentAdultCount?: number | null;
    currentChildCount?: number | null;
  }) {
    const adultCount = this.normalizeCountValue(values.adultCount, values.currentAdultCount);
    const childCount = this.normalizeCountValue(values.childCount, values.currentChildCount);
    let participantCount = this.normalizeCountValue(values.participantCount, values.currentParticipantCount);
    const computedCount = adultCount + childCount;

    if (computedCount > 0) {
      participantCount = computedCount;
    }

    return {
      participantCount,
      adultCount,
      childCount,
    };
  }

  private normalizeCountValue(value: number | null | undefined, fallback: number | null | undefined) {
    if (value === undefined) {
      return Math.max(0, Number(fallback ?? 0));
    }

    if (value === null) {
      return 0;
    }

    const normalized = Number(value);

    if (!Number.isFinite(normalized) || normalized < 0) {
      throw new BadRequestException('Participant counts must be zero or greater.');
    }

    return Math.floor(normalized);
  }

  private buildOperationalAuditSummary(values: {
    serviceDate?: Date | null;
    startTime?: string | null;
    pickupTime?: string | null;
    pickupLocation?: string | null;
    meetingPoint?: string | null;
    participantCount?: number | null;
    adultCount?: number | null;
    childCount?: number | null;
    supplierReference?: string | null;
    reconfirmationRequired?: boolean;
    reconfirmationDueAt?: Date | null;
  }) {
    return [
      values.serviceDate ? `date=${values.serviceDate.toISOString()}` : 'date=-',
      values.startTime ? `start=${values.startTime}` : 'start=-',
      values.pickupTime ? `pickup=${values.pickupTime}` : 'pickup=-',
      values.pickupLocation ? `pickup_location=${values.pickupLocation}` : 'pickup_location=-',
      values.meetingPoint ? `meeting_point=${values.meetingPoint}` : 'meeting_point=-',
      `pax=${Math.max(0, Number(values.participantCount ?? 0))}`,
      `adults=${Math.max(0, Number(values.adultCount ?? 0))}`,
      `children=${Math.max(0, Number(values.childCount ?? 0))}`,
      values.supplierReference ? `supplier_ref=${values.supplierReference}` : 'supplier_ref=-',
      values.reconfirmationRequired ? 'reconfirm=yes' : 'reconfirm=no',
      values.reconfirmationDueAt ? `reconfirm_due=${values.reconfirmationDueAt.toISOString()}` : 'reconfirm_due=-',
    ].join(' | ');
  }

  private extractBadRequestMessage(error: BadRequestException) {
    const response = error.getResponse();

    if (typeof response === 'string') {
      return response;
    }

    if (response && typeof response === 'object' && 'message' in response) {
      const message = (response as { message?: string | string[] }).message;
      if (Array.isArray(message)) {
        return message.join(', ');
      }
      if (typeof message === 'string') {
        return message;
      }
    }

    return error.message;
  }

  private normalizeManualOverrideNote(value: string | null | undefined, errorMessage: string) {
    const note = value?.trim() || '';

    if (note.length < 3) {
      throw new BadRequestException(errorMessage);
    }

    return note;
  }

  private normalizeActorLabel(value: AuditActor) {
    const actor = value?.label?.trim() || '';
    return actor ? actor.slice(0, 120) : null;
  }

  private normalizeActorUserId(value: AuditActor) {
    const actorUserId = value?.userId?.trim() || '';
    return actorUserId || null;
  }

  private normalizeClientInvoiceStatus(value: ClientInvoiceStatusValue | string) {
    const normalized = String(value || '').trim().toLowerCase() as ClientInvoiceStatusValue;

    if (!CLIENT_INVOICE_STATUSES.includes(normalized)) {
      throw new BadRequestException('Unsupported client invoice status');
    }

    return normalized;
  }

  private normalizeSupplierPaymentStatus(value: SupplierPaymentStatusValue | string) {
    const normalized = String(value || '').trim().toLowerCase() as SupplierPaymentStatusValue;

    if (!SUPPLIER_PAYMENT_STATUSES.includes(normalized)) {
      throw new BadRequestException('Unsupported supplier payment status');
    }

    return normalized;
  }

  private normalizeRequiredText(value: string | null | undefined, errorMessage: string) {
    const normalized = value?.trim() || '';

    if (!normalized) {
      throw new BadRequestException(errorMessage);
    }

    return normalized;
  }

  private normalizeSortOrder(value: number | string | null | undefined) {
    const numericValue = Number(value);

    if (!Number.isInteger(numericValue) || numericValue < 0) {
      throw new BadRequestException('Room sort order must be a zero-or-positive whole number.');
    }

    return numericValue;
  }

  private normalizeRoomOccupancy(
    value?: BookingRoomOccupancy | 'single' | 'double' | 'triple' | 'quad' | 'unknown' | null,
  ) {
    const normalized = String(value || 'unknown').trim().toLowerCase() as BookingRoomOccupancy;
    const allowedValues = Object.values(BookingRoomOccupancy) as BookingRoomOccupancy[];

    if (!allowedValues.includes(normalized)) {
      throw new BadRequestException('Unsupported room occupancy value');
    }

    return normalized;
  }

  private getRoomOccupancyCapacity(value: BookingRoomOccupancy | 'single' | 'double' | 'triple' | 'quad' | 'unknown') {
    if (value === BookingRoomOccupancy.single) {
      return 1;
    }

    if (value === BookingRoomOccupancy.double) {
      return 2;
    }

    if (value === BookingRoomOccupancy.triple) {
      return 3;
    }

    if (value === BookingRoomOccupancy.quad) {
      return 4;
    }

    return null;
  }

  private formatRoomOccupancy(value: BookingRoomOccupancy | 'single' | 'double' | 'triple' | 'quad' | 'unknown') {
    if (value === BookingRoomOccupancy.unknown) {
      return 'Unknown';
    }

    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  private formatPassengerAuditValue(values: {
    title?: string | null;
    firstName: string;
    lastName: string;
    isLead?: boolean;
  }) {
    const name = [values.title, values.firstName, values.lastName].filter(Boolean).join(' ').trim();
    return values.isLead ? `${name} (lead)` : name;
  }

  private formatRoomingEntryAuditValue(values: {
    roomType?: string | null;
    occupancy: BookingRoomOccupancy | 'single' | 'double' | 'triple' | 'quad' | 'unknown';
    sortOrder: number;
  }) {
    const roomLabel = values.roomType?.trim() || `Room ${values.sortOrder}`;
    return `${roomLabel} | ${this.formatRoomOccupancy(values.occupancy)}`;
  }

  private attachFinanceSummary<
    T extends {
      clientInvoiceStatus: ClientInvoiceStatusValue;
      supplierPaymentStatus: SupplierPaymentStatusValue;
      pricingSnapshotJson: Prisma.JsonValue;
      snapshotJson: Prisma.JsonValue;
      roomCount: number;
      passengers: Array<{
        id: string;
        roomingAssignments: Array<{
          bookingRoomingEntryId: string;
        }>;
      }>;
      roomingEntries: Array<{
        id: string;
        occupancy: BookingRoomOccupancy | 'single' | 'double' | 'triple' | 'quad' | 'unknown';
        assignments: Array<{
          bookingPassenger: {
            id: string;
          };
        }>;
      }>;
      services: Array<{
        confirmationStatus: 'pending' | 'requested' | 'confirmed';
        serviceType: string | null;
        serviceDate: string | Date | null;
        startTime: string | null;
        pickupTime: string | null;
        pickupLocation: string | null;
        meetingPoint: string | null;
        reconfirmationRequired: boolean;
        reconfirmationDueAt: string | Date | null;
        status: BookingServiceLifecycleStatus;
        totalCost: number;
        totalSell: number;
      }>;
    },
  >(booking: T) {
    return {
      ...booking,
      finance: this.buildBookingFinanceSummary(booking),
      operations: this.buildBookingOperationsSummary(booking.services),
      rooming: this.buildBookingRoomingSummary({
        expectedRoomCount: booking.roomCount,
        passengers: booking.passengers,
        roomingEntries: booking.roomingEntries,
      }),
    };
  }

  private buildBookingFinanceSummary(values: {
    clientInvoiceStatus: ClientInvoiceStatusValue;
    supplierPaymentStatus: SupplierPaymentStatusValue;
    pricingSnapshotJson: Prisma.JsonValue;
    snapshotJson: Prisma.JsonValue;
    services: Array<{
      status: BookingServiceLifecycleStatus;
      totalCost: number;
      totalSell: number;
    }>;
  }) {
    const pricingSnapshot = (values.pricingSnapshotJson || {}) as {
      totalCost?: number | null;
      totalSell?: number | null;
    };
    const snapshot = (values.snapshotJson || {}) as {
      totalCost?: number | null;
      totalSell?: number | null;
      quoteItems?: Array<{
        totalCost?: number | null;
      }>;
    };
    const activeServices = values.services.filter((service) => service.status !== BookingServiceLifecycleStatus.cancelled);
    const quotedTotalCost = this.roundMoney(
      Number(pricingSnapshot.totalCost ?? snapshot.totalCost ?? this.sumSnapshotQuoteItemCosts(snapshot.quoteItems)),
    );
    const quotedTotalSell = this.roundMoney(Number(pricingSnapshot.totalSell ?? snapshot.totalSell ?? 0));
    const realizedTotalCost = this.roundMoney(
      activeServices.reduce((sum, service) => sum + Number(service.totalCost || 0), 0),
    );
    const realizedTotalSell = this.roundMoney(
      activeServices.reduce((sum, service) => sum + Number(service.totalSell || 0), 0),
    );
    const quotedMargin = this.roundMoney(quotedTotalSell - quotedTotalCost);
    const realizedMargin = this.roundMoney(realizedTotalSell - realizedTotalCost);
    const quotedMarginPercent = quotedTotalSell > 0 ? Number(((quotedMargin / quotedTotalSell) * 100).toFixed(2)) : 0;
    const realizedMarginPercent = realizedTotalSell > 0 ? Number(((realizedMargin / realizedTotalSell) * 100).toFixed(2)) : 0;
    const hasNegativeMargin = realizedTotalSell > 0 && realizedMargin < 0;
    const hasLowMargin = realizedTotalSell > 0 && (realizedMargin < 0 || realizedMarginPercent < 10);
    const hasLowMarginWarning = realizedTotalSell > 0 && realizedMargin >= 0 && realizedMarginPercent < 10;
    const hasUnpaidClientBalance = realizedTotalSell > 0 && values.clientInvoiceStatus !== 'paid';
    const hasUnpaidSupplierObligation = realizedTotalCost > 0 && values.supplierPaymentStatus !== 'paid';

    return {
      quotedTotalSell,
      quotedTotalCost,
      quotedMargin,
      quotedMarginPercent,
      realizedTotalSell,
      realizedTotalCost,
      realizedMargin,
      realizedMarginPercent,
      clientInvoiceStatus: values.clientInvoiceStatus,
      supplierPaymentStatus: values.supplierPaymentStatus,
      hasLowMargin,
      hasUnpaidClientBalance,
      hasUnpaidSupplierObligation,
      badge: buildFinanceBadge({
        hasUnpaidClientBalance,
        hasUnpaidSupplierObligation,
        hasNegativeMargin,
        hasLowMargin: hasLowMarginWarning,
      }),
    };
  }

  private buildBookingOperationsSummary(
    services: Array<{
      confirmationStatus: 'pending' | 'requested' | 'confirmed';
      serviceType: string | null;
      serviceDate: string | Date | null;
      startTime: string | null;
      pickupTime: string | null;
      pickupLocation: string | null;
      meetingPoint: string | null;
      reconfirmationRequired: boolean;
      reconfirmationDueAt: string | Date | null;
      status: BookingServiceLifecycleStatus;
    }>,
  ) {
    return {
      badge: buildOperationsBadge(
        services.map((service) => ({
          confirmationStatus: service.confirmationStatus,
          serviceType: service.serviceType,
          serviceDate: service.serviceDate,
          startTime: service.startTime,
          pickupTime: service.pickupTime,
          pickupLocation: service.pickupLocation,
          meetingPoint: service.meetingPoint,
          reconfirmationRequired: service.reconfirmationRequired,
          reconfirmationDueAt: service.reconfirmationDueAt,
          status: service.status,
        })),
      ),
    };
  }

  private buildBookingRoomingSummary(values: {
    expectedRoomCount: number;
    passengers: Array<{
      id: string;
      roomingAssignments: Array<{
        bookingRoomingEntryId: string;
      }>;
    }>;
    roomingEntries: Array<{
      id: string;
      occupancy: BookingRoomOccupancy | 'single' | 'double' | 'triple' | 'quad' | 'unknown';
      assignments: Array<{
        bookingPassenger: {
          id: string;
        };
      }>;
    }>;
  }) {
    return {
      badge: buildRoomingBadge({
        expectedRoomCount: values.expectedRoomCount,
        passengers: values.passengers.map((passenger) => ({
          id: passenger.id,
          roomingAssignments: passenger.roomingAssignments.map((assignment) => ({
            bookingRoomingEntryId: assignment.bookingRoomingEntryId,
          })),
        })),
        roomingEntries: values.roomingEntries.map((entry) => ({
          id: entry.id,
          occupancy: entry.occupancy,
          assignments: entry.assignments.map((assignment) => ({
            bookingPassenger: {
              id: assignment.bookingPassenger.id,
            },
          })),
        })),
      }),
    };
  }

  private sumSnapshotQuoteItemCosts(
    items:
      | Array<{
          totalCost?: number | null;
        }>
      | undefined,
  ) {
    return this.roundMoney((items || []).reduce((sum, item) => sum + Number(item?.totalCost || 0), 0));
  }

  private roundMoney(value: number) {
    return Number(Number(value || 0).toFixed(2));
  }

  private formatBookingFinanceStatusSummary(
    clientInvoiceStatus: ClientInvoiceStatusValue,
    supplierPaymentStatus: SupplierPaymentStatusValue,
  ) {
    return `client ${clientInvoiceStatus}; supplier ${supplierPaymentStatus}`;
  }

  async generateVoucherPdf(id: string) {
    const booking = await this.findOne(id);

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const snapshot = (booking.snapshotJson || {}) as BookingPdfSnapshot;
    const contactSnapshot = (booking.contactSnapshotJson || {}) as BookingPdfContact;
    const clientSnapshot = (booking.clientSnapshotJson || {}) as BookingPdfCompany;
    const totalPax = Number(booking.adults || 0) + Number(booking.children || 0);
    const sortedDays = [...(snapshot.itineraries || [])].sort((a, b) => (a.dayNumber || 0) - (b.dayNumber || 0));
    const leadPassenger =
      booking.passengers?.find((passenger) => passenger.isLead) ||
      booking.passengers?.[0] ||
      null;
    const passengerCount = booking.passengers?.length || 0;
    const roomingCount = booking.roomingEntries?.length || 0;

    return this.createPdf((doc) => {
      this.writeDocumentTitle(doc, 'Booking Voucher', booking.bookingRef || 'Booking');
      this.writeMetaLine(
        doc,
        [
          snapshot.title || null,
          this.formatBookingType((booking.bookingType || snapshot.bookingType || 'FIT') as string),
          `${totalPax} pax`,
          `${snapshot.roomCount || booking.roomCount || 0} rooms`,
          this.formatNightCountLabel(snapshot.nightCount || booking.nightCount || 0),
        ].filter(Boolean).join(' | '),
      );

      this.writeSectionTitle(doc, 'Guest And Trip Summary');
      this.writeKeyValue(
        doc,
        'Lead guest',
        leadPassenger ? this.formatFullName(leadPassenger) : this.formatFullName(contactSnapshot),
      );
      this.writeKeyValue(doc, 'Client', clientSnapshot.name || 'Client');
      this.writeKeyValue(doc, 'Booking type', this.formatBookingType((booking.bookingType || snapshot.bookingType || 'FIT') as string));
      this.writeKeyValue(doc, 'Guests', `${totalPax} pax`);
      this.writeKeyValue(doc, 'Rooms', String(snapshot.roomCount || booking.roomCount || 0));
      this.writeKeyValue(doc, 'Duration', this.formatNightCountLabel(snapshot.nightCount || booking.nightCount || 0));
      if (passengerCount > 0) {
        this.writeKeyValue(doc, 'Passenger list', `${passengerCount} passenger${passengerCount === 1 ? '' : 's'}`);
      }
      if (roomingCount > 0) {
        this.writeKeyValue(doc, 'Rooming entries', `${roomingCount} room${roomingCount === 1 ? '' : 's'}`);
      }

      this.writeSectionTitle(doc, 'Booking Services');
      if ((booking.services || []).length === 0) {
        this.writeBodyLine(doc, 'No booking services available for this voucher.');
      } else {
        for (const service of booking.services || []) {
          this.writeListItem(doc, service.description || 'Service', [
            `Supplier: ${service.supplierName || 'To be advised'}`,
            `Confirmation: ${this.formatConfirmationStatus(service.confirmationStatus)}${service.confirmationNumber ? ` (${service.confirmationNumber})` : ''}`,
          ]);
        }
      }

      this.writeSectionTitle(doc, 'Itinerary By Day');
      if (sortedDays.length === 0) {
        this.writeBodyLine(doc, 'Detailed itinerary will be provided separately.');
        return;
      }

      for (const day of sortedDays) {
        this.ensurePageSpace(doc, 90);
        doc.font('Helvetica-Bold').fontSize(12).fillColor('#111111').text(`Day ${day.dayNumber || '-'} | ${day.title || 'Itinerary Day'}`);
        if (day.description) {
          this.writeBodyLine(doc, day.description);
        }

        const dayItems = (snapshot.quoteItems || []).filter((item) => item.itineraryId === day.id);
        if (dayItems.length === 0) {
          this.writeBodyLine(doc, 'No services assigned to this day.');
          continue;
        }

        for (const item of dayItems) {
          this.writeListItem(doc, item.service?.name?.trim() || 'Service', [
            [item.service?.category, this.getVoucherItemSummary(item)].filter(Boolean).join(' | '),
          ]);
        }
      }
    });
  }

  async generateSupplierConfirmationPdf(id: string) {
    const booking = await this.findOne(id);

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const snapshot = (booking.snapshotJson || {}) as BookingPdfSnapshot;
    const totalPax = Number(booking.adults || 0) + Number(booking.children || 0);
    const quoteItemMap = new Map((snapshot.quoteItems || []).filter((item): item is BookingPdfQuoteItem & { id: string } => Boolean(item.id)).map((item) => [item.id, item]));
    const itineraryMap = new Map(
      (snapshot.itineraries || [])
        .filter((day): day is { id: string; dayNumber: number; title?: string | null; description?: string | null } => Boolean(day.id) && Number.isFinite(day.dayNumber))
        .map((day) => [day.id, day]),
    );
    const supplierGroups = (booking.services || [])
      .filter((service) => service.supplierId || service.supplierName)
      .reduce<Array<{ key: string; supplierName: string; services: any[] }>>((groups, service) => {
        const key = service.supplierId || service.supplierName || service.id;
        const existing = groups.find((group) => group.key === key);

        if (existing) {
          existing.services.push(service);
          return groups;
        }

        groups.push({
          key,
          supplierName: service.supplierName || 'Unnamed supplier',
          services: [service],
        });

        return groups;
      }, [])
      .sort((a, b) => a.supplierName.localeCompare(b.supplierName));

    return this.createPdf((doc) => {
      this.writeDocumentTitle(doc, 'Supplier Confirmation Sheet', booking.bookingRef || 'Booking');
      this.writeMetaLine(doc, `${totalPax} pax | ${supplierGroups.length} supplier groups`);
      this.writeBodyLine(
        doc,
        'Please review the services below, confirm availability, and advise any pending items or operational remarks directly against each service.',
      );

      if (supplierGroups.length === 0) {
        this.writeSectionTitle(doc, 'Supplier');
        this.writeBodyLine(doc, 'No supplier-assigned services available for this confirmation sheet.');
        return;
      }

      for (const group of supplierGroups) {
        this.writeSectionTitle(doc, group.supplierName);

        for (const service of group.services) {
          const quoteItem = service.sourceQuoteItemId ? quoteItemMap.get(service.sourceQuoteItemId) : null;
          const day = quoteItem?.itineraryId ? itineraryMap.get(quoteItem.itineraryId) : null;
          const context = day ? `Day ${day.dayNumber} | ${day.title || 'Itinerary Day'}` : 'Outside itinerary';
          const detail = this.getSupplierServiceDetail(service.description || 'Service', quoteItem);
          const notes = [service.notes, service.confirmationNotes].filter(Boolean).join(' | ') || '-';
          const status = this.formatConfirmationStatus(service.confirmationStatus);
          const statusText = service.confirmationStatus === 'confirmed' ? status : `${status} - action required`;

          this.writeListItem(doc, detail.title, [
            detail.detail || null,
            `Booking Ref: ${booking.bookingRef || '-'}`,
            `Service Day / Context: ${context}`,
            `Pax: ${totalPax}`,
            `Notes: ${notes}`,
            `Confirmation Status: ${statusText}`,
          ]);
        }
      }
    });
  }

  async sendDocumentEmail(input: {
    email: string;
    bookingId: string;
    documentType: BookingDocumentType;
  }) {
    const email = input.email.trim();

    if (!email) {
      throw new BadRequestException('Email address is required');
    }

    const booking = await this.findOne(input.bookingId);
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const documentLabel =
      input.documentType === 'supplier-confirmation' ? 'Supplier Confirmation Sheet' : 'Booking Voucher';
    const attachmentBaseName =
      input.documentType === 'supplier-confirmation'
        ? `${booking.bookingRef || 'booking'}-supplier-confirmation`
        : `${booking.bookingRef || 'booking'}-voucher`;
    const attachmentFileName = `${attachmentBaseName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'booking-document'}.pdf`;
    const pdfBuffer =
      input.documentType === 'supplier-confirmation'
        ? await this.generateSupplierConfirmationPdf(input.bookingId)
        : await this.generateVoucherPdf(input.bookingId);

    const transporter = this.createMailTransport();
    const fromAddress = process.env.BOOKING_DOCUMENTS_EMAIL_FROM || process.env.SMTP_FROM || 'noreply@localhost';
    const info = await transporter.sendMail({
      from: fromAddress,
      to: email,
      subject: `${documentLabel} - ${booking.bookingRef || 'Booking'}`,
      text: `Please find attached the ${documentLabel.toLowerCase()} for booking reference ${booking.bookingRef || input.bookingId}.`,
      attachments: [
        {
          filename: attachmentFileName,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });

    return {
      ok: true,
      email,
      bookingId: input.bookingId,
      documentType: input.documentType,
      messageId: info.messageId || null,
      preview: 'message' in info && Buffer.isBuffer(info.message) ? info.message.toString('utf8') : null,
    };
  }

  private createPdf(write: (doc: PDFKit.PDFDocument) => void) {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
    });
    const buffers: Buffer[] = [];

    const pdfBufferPromise = new Promise<Buffer>((resolve, reject) => {
      doc.on('data', (chunk) => buffers.push(chunk as Buffer));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);
    });

    write(doc);
    doc.end();

    return pdfBufferPromise;
  }

  private writeDocumentTitle(doc: PDFKit.PDFDocument, eyebrow: string, title: string) {
    doc.font('Helvetica').fontSize(10).fillColor('#0f766e').text(eyebrow.toUpperCase());
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(22).fillColor('#111111').text(title);
    doc.moveDown(0.5);
  }

  private writeMetaLine(doc: PDFKit.PDFDocument, text: string) {
    if (!text.trim()) {
      return;
    }

    doc.font('Helvetica').fontSize(10).fillColor('#555555').text(text);
    doc.moveDown(0.9);
  }

  private writeSectionTitle(doc: PDFKit.PDFDocument, title: string) {
    this.ensurePageSpace(doc, 60);
    doc.font('Helvetica-Bold').fontSize(13).fillColor('#111111').text(title);
    doc.moveDown(0.45);
  }

  private writeKeyValue(doc: PDFKit.PDFDocument, label: string, value: string) {
    this.ensurePageSpace(doc, 24);
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#111111').text(`${label}: `, {
      continued: true,
    });
    doc.font('Helvetica').text(value || '-');
  }

  private writeBodyLine(doc: PDFKit.PDFDocument, text: string) {
    this.ensurePageSpace(doc, 30);
    doc.font('Helvetica').fontSize(10).fillColor('#333333').text(text);
    doc.moveDown(0.45);
  }

  private writeListItem(doc: PDFKit.PDFDocument, title: string, lines: Array<string | null>) {
    this.ensurePageSpace(doc, 70);
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#111111').text(title);

    for (const line of lines.filter(Boolean)) {
      doc.font('Helvetica').fontSize(10).fillColor('#333333').text(String(line), {
        indent: 14,
      });
    }

    doc.moveDown(0.6);
  }

  private ensurePageSpace(doc: PDFKit.PDFDocument, minimumHeight: number) {
    if (doc.y + minimumHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
    }
  }

  private formatFullName(contact: { firstName?: string | null; lastName?: string | null } | null | undefined) {
    return [contact?.firstName, contact?.lastName].filter(Boolean).join(' ').trim() || 'Lead guest';
  }

  private formatNightCountLabel(value: number) {
    return `${value} night${value === 1 ? '' : 's'}`;
  }

  private formatBookingType(value: string) {
    return String(value || 'FIT').trim().toUpperCase();
  }

  private formatConfirmationStatus(status: 'pending' | 'requested' | 'confirmed') {
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  private getVoucherItemSummary(item: BookingPdfQuoteItem) {
    if (
      item.hotel?.name &&
      item.contract?.name &&
      item.seasonName &&
      item.roomCategory?.name &&
      item.occupancyType &&
      item.mealPlan
    ) {
      return `${item.hotel.name} | ${item.contract.name} | ${item.seasonName} | ${item.roomCategory.name} | ${item.occupancyType} / ${item.mealPlan}`;
    }

    if (item.appliedVehicleRate) {
      return [item.appliedVehicleRate.routeName, item.appliedVehicleRate.vehicle?.name, item.appliedVehicleRate.serviceType?.name]
        .filter(Boolean)
        .join(' | ');
    }

    return item.pricingDescription || `Qty ${item.quantity || 1}`;
  }

  private getSupplierServiceDetail(title: string, quoteItem: BookingPdfQuoteItem | null | undefined) {
    const clean = (value: string) =>
      value
        .replace(/\bDescription:\s*/gi, '')
        .replace(/\bNotes:\s*/gi, '')
        .replace(/\s*\|\s*/g, ' | ')
        .replace(/\s+/g, ' ')
        .trim();
    const seen = new Set<string>();
    const detailParts = [
      quoteItem?.appliedVehicleRate
        ? [quoteItem.appliedVehicleRate.routeName, quoteItem.appliedVehicleRate.vehicle?.name, quoteItem.appliedVehicleRate.serviceType?.name]
            .filter(Boolean)
            .join(' | ')
        : null,
      quoteItem?.pricingDescription || null,
    ].filter((part): part is string => {
      const normalized = clean(part || '');
      if (!normalized) {
        return false;
      }
      const key = normalized.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });

    return {
      title: clean(title) || 'Service',
      detail: detailParts.join(' | '),
    };
  }

  private createMailTransport() {
    if (process.env.SMTP_HOST) {
      const port = Number(process.env.SMTP_PORT || 587);
      const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465;
      const user = process.env.SMTP_USER;
      const pass = process.env.SMTP_PASS;

      return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure,
        auth: user ? { user, pass } : undefined,
      });
    }

    return nodemailer.createTransport({
      streamTransport: true,
      buffer: true,
      newline: 'unix',
    });
  }

  private generateBookingAccessToken() {
    return randomBytes(24).toString('hex');
  }
}

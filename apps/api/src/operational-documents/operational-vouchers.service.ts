import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { VoucherType } from '@prisma/client';
import { requireActorCompanyId, type CompanyScopedActor } from '../auth/company-scope';
import { resolveServiceTaxonomyGroup } from '../common/service-taxonomy';
import { PrismaService } from '../prisma/prisma.service';

type OperationalVoucherKind = 'HOTEL' | 'TRANSPORT' | 'SERVICE' | 'ACTIVITY' | 'GUIDE' | 'EXTERNAL_PACKAGE';

type HotelVoucherPassenger = {
  id: string;
  name: string;
};

type HotelVoucherRoom = {
  id: string;
  label: string;
  roomType: string | null;
  occupancy: string;
  notes: string | null;
  passengers: HotelVoucherPassenger[];
};

export type HotelOperationalVoucherPreview = {
  id: string;
  kind: OperationalVoucherKind;
  status: string;
  booking: {
    id: string;
    bookingRef: string;
    quoteId: string;
    title: string;
    pax: number;
  };
  service: {
    id: string;
    sourceQuoteItemId: string | null;
    description: string;
    confirmationNumber: string | null;
    supplierReference: string | null;
  };
  itineraryDay: {
    id: string | null;
    dayNumber: number | null;
    title: string | null;
    date: string | null;
    notes: string | null;
  };
  hotel: {
    name: string;
    city: string;
    supplierName: string | null;
  };
  stay: {
    checkIn: string | null;
    checkOut: string | null;
    nights: number;
  };
  roomingSummary: string;
  rooms: HotelVoucherRoom[];
  passengers: HotelVoucherPassenger[];
  occupancy: string;
  mealPlan: string;
  roomCategory: string;
  operationalNotes: string[];
  supplierNotes: string[];
  source: {
    quoteItemId: string | null;
    itineraryDayId: string | null;
    generatedFrom: 'live-operational-data';
  };
};

export type QuoteOperationalVoucherPreview = {
  id: string;
  kind: 'HOTEL' | 'TRANSPORT' | 'SERVICE';
  status: 'PREVIEW';
  voucher: {
    type: 'HOTEL' | 'TRANSPORT' | 'SERVICE';
    quoteItemId: string;
    quoteDayId: string | null;
    operationalStatus: 'DRAFT';
    remarks: string[];
  };
  quote: {
    id: string;
    quoteNumber: string | null;
    title: string;
    pax: number;
  };
  itineraryDay: {
    id: string | null;
    dayNumber: number | null;
    title: string | null;
    notes: string | null;
  };
  hotel?: {
    name: string;
    city: string | null;
    roomingSummary: string;
    rooms: HotelVoucherRoom[];
    passengers: HotelVoucherPassenger[];
    mealPlan: string;
    roomCategory: string;
    occupancy: string;
    checkIn: string | null;
    checkOut: string | null;
    pax: number;
  };
  transport?: {
    route: string;
    serviceType: string;
    pickup: string | null;
    dropoff: string | null;
    vehicle: string | null;
    pax: number;
  };
  service?: {
    name: string;
    category: string | null;
    serviceType: string | null;
    operationalNotes: string[];
    pax: number;
  };
  source: {
    quoteItemId: string;
    itineraryDayId: string | null;
    packageTemplateId: string | null;
    packageTemplateDayId: string | null;
    packageTemplateComponentId: string | null;
    generatedFrom: 'live-operational-quote-data';
  };
};

@Injectable()
export class OperationalVouchersService {
  constructor(private readonly prisma: PrismaService) {}

  async getQuoteItemVoucherPreview(quoteItemId: string, actor?: CompanyScopedActor): Promise<QuoteOperationalVoucherPreview> {
    const companyId = requireActorCompanyId(actor);
    const item = await this.prisma.quoteItem.findFirst({
      where: {
        id: quoteItemId,
        quote: {
          clientCompanyId: companyId,
        },
      },
      include: {
        quote: {
          include: {
            passengers: {
              orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
            },
            roomingGroups: {
              include: {
                hotelQuoteItem: {
                  include: {
                    hotel: true,
                    roomCategory: true,
                  },
                },
                assignments: {
                  include: {
                    quotePassenger: true,
                  },
                  orderBy: { createdAt: 'asc' },
                },
              },
              orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
            },
          },
        },
        itinerary: true,
        quoteItineraryDayItems: {
          include: {
            day: true,
          },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
        service: {
          include: {
            serviceType: true,
            entranceFee: true,
          },
        },
        hotel: true,
        roomCategory: true,
        appliedVehicleRate: {
          include: {
            vehicle: true,
            serviceType: true,
            route: {
              include: {
                fromPlace: true,
                toPlace: true,
              },
            },
            fromPlace: true,
            toPlace: true,
          },
        },
      },
    } as any);

    if (!item) {
      throw new NotFoundException('Quote item not found');
    }

    const kind = this.resolveQuoteVoucherKind(item);
    if (!kind) {
      throw new BadRequestException('Only hotel, transport, and operational service quote items support voucher previews in phase 1');
    }

    const quote = (item as any).quote;
    const plannerDay = (item as any).quoteItineraryDayItems?.find((entry: any) => entry.day)?.day || null;
    const legacyDay = (item as any).itinerary || null;
    const itineraryDay = plannerDay || legacyDay || null;
    const remarks = this.compactTextList([
      item.pricingDescription,
      item.meetingPoint,
      item.pickupLocation,
      item.externalInternalNotes,
    ]);
    const base = {
      id: `quote-item-${item.id}`,
      kind,
      status: 'PREVIEW' as const,
      voucher: {
        type: kind,
        quoteItemId: item.id,
        quoteDayId: itineraryDay?.id || null,
        operationalStatus: 'DRAFT' as const,
        remarks,
      },
      quote: {
        id: quote.id,
        quoteNumber: quote.quoteNumber || null,
        title: quote.title,
        pax: this.getQuoteItemPax(item, quote),
      },
      itineraryDay: {
        id: itineraryDay?.id || null,
        dayNumber: itineraryDay?.dayNumber ?? null,
        title: itineraryDay?.title || null,
        notes: itineraryDay?.notes || itineraryDay?.description || null,
      },
      source: {
        quoteItemId: item.id,
        itineraryDayId: itineraryDay?.id || item.itineraryId || null,
        packageTemplateId: (item as any).packageTemplateId || null,
        packageTemplateDayId: (item as any).packageTemplateDayId || null,
        packageTemplateComponentId: (item as any).packageTemplateComponentId || null,
        generatedFrom: 'live-operational-quote-data' as const,
      },
    };

    if (kind === 'HOTEL') {
      return {
        ...base,
        hotel: this.buildQuoteHotelVoucherSection(item, quote, itineraryDay),
      };
    }

    if (kind === 'TRANSPORT') {
      return {
        ...base,
        transport: this.buildQuoteTransportVoucherSection(item),
      };
    }

    return {
      ...base,
      service: this.buildQuoteServiceVoucherSection(item, remarks),
    };
  }

  async getHotelVoucherPreview(voucherId: string, actor?: CompanyScopedActor): Promise<HotelOperationalVoucherPreview> {
    const companyId = requireActorCompanyId(actor);
    const voucher = await (this.prisma.voucher as any).findFirst({
      where: {
        id: voucherId,
        bookingService: {
          booking: {
            quote: {
              clientCompanyId: companyId,
            },
          },
        },
      },
      include: {
        supplier: true,
        bookingService: {
          include: {
            bookingDay: true,
            supplier: true,
          },
        },
        booking: {
          include: {
            quote: {
              include: {
                quoteItems: {
                  include: {
                    hotel: true,
                    roomCategory: true,
                    service: true,
                  },
                  orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
                },
                itineraryDays: {
                  orderBy: [{ sortOrder: 'asc' }, { dayNumber: 'asc' }],
                },
                roomingGroups: {
                  include: {
                    itineraryDay: true,
                    hotelQuoteItem: {
                      include: {
                        hotel: true,
                        roomCategory: true,
                      },
                    },
                    assignments: {
                      include: {
                        quotePassenger: true,
                      },
                      orderBy: { createdAt: 'asc' },
                    },
                  },
                  orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
                },
                passengers: {
                  orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
                },
              },
            },
            passengers: {
              orderBy: [{ isLead: 'desc' }, { createdAt: 'asc' }],
            },
            roomingEntries: {
              include: {
                assignments: {
                  include: {
                    bookingPassenger: true,
                  },
                  orderBy: { createdAt: 'asc' },
                },
              },
              orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
            },
          },
        },
      },
    });

    if (!voucher) {
      throw new NotFoundException('Voucher not found');
    }

    if (voucher.type !== VoucherType.HOTEL) {
      throw new BadRequestException('Only hotel vouchers are supported by this preview endpoint in phase 1');
    }

    const booking = voucher.booking;
    const service = voucher.bookingService;
    const quote = booking.quote;
    const snapshot = (booking.snapshotJson || {}) as any;
    const quoteItem = this.resolveHotelQuoteItem(quote?.quoteItems || [], service);
    const itineraryDay = this.resolveItineraryDay(quote?.itineraryDays || [], quoteItem, service);
    const roomingGroups = (quote?.roomingGroups || []).filter((group: any) => {
      if (quoteItem?.id && group.hotelQuoteItemId === quoteItem.id) {
        return true;
      }
      if (itineraryDay?.id && group.itineraryDayId === itineraryDay.id && group.hotelQuoteItem?.hotelId === quoteItem?.hotelId) {
        return true;
      }
      return false;
    });
    const rooms = roomingGroups.length > 0
      ? roomingGroups.map((group: any, index: number) => this.mapQuoteRoomingGroup(group, index))
      : (booking.roomingEntries || []).map((entry: any, index: number) => this.mapBookingRoomingEntry(entry, index));
    const passengers = this.resolvePassengers(quote?.passengers || [], booking.passengers || [], rooms);
    const hotelName =
      this.cleanText(quoteItem?.hotel?.name) ||
      this.cleanText(voucher.supplier?.name) ||
      this.cleanText(service.supplierName) ||
      this.cleanText(service.description) ||
      'Hotel';
    const city = this.cleanText(quoteItem?.hotel?.city) || this.extractCityFromSnapshot(snapshot, quoteItem?.itineraryId) || '';
    const checkIn = this.formatDateOnly(service.serviceDate || service.bookingDay?.date || booking.startDate || snapshot.travelStartDate || null);
    const checkOut = this.formatDateOnly(this.resolveCheckOutDate({ checkIn, quoteItem, booking, snapshot }));
    const nights = Math.max(0, Number(quoteItem?.nightCount || booking.nightCount || snapshot.nightCount || 0));
    const operationalNotes = this.compactTextList([
      service.notes,
      service.bookingDay?.notes,
      itineraryDay?.notes,
      quoteItem?.pricingDescription,
      voucher.notes,
    ]);
    const supplierNotes = this.compactTextList([
      service.confirmationNotes,
      service.supplierReference,
      quoteItem?.service?.notes,
      voucher.supplier?.notes,
    ]);
    const roomCategory = this.cleanText(quoteItem?.roomCategory?.name) || this.firstNonEmpty(rooms.map((room: HotelVoucherRoom) => room.roomType)) || 'Room category pending';
    const occupancy = this.cleanText(quoteItem?.occupancyType) || this.summarizeOccupancy(rooms);
    const mealPlan = this.cleanText(quoteItem?.mealPlan) || 'Meal plan pending';

    return {
      id: voucher.id,
      kind: 'HOTEL',
      status: voucher.status,
      booking: {
        id: booking.id,
        bookingRef: booking.bookingRef,
        quoteId: booking.quoteId,
        title: this.cleanText(snapshot.title) || this.cleanText(quote?.title) || booking.bookingRef,
        pax: Number(booking.pax || booking.adults + booking.children || passengers.length || 0),
      },
      service: {
        id: service.id,
        sourceQuoteItemId: service.sourceQuoteItemId || null,
        description: service.description,
        confirmationNumber: service.confirmationNumber || null,
        supplierReference: service.supplierReference || null,
      },
      itineraryDay: {
        id: itineraryDay?.id || service.bookingDay?.id || null,
        dayNumber: itineraryDay?.dayNumber ?? service.bookingDay?.dayNumber ?? null,
        title: itineraryDay?.title || service.bookingDay?.title || null,
        date: this.formatDateOnly(service.bookingDay?.date || service.serviceDate || null),
        notes: itineraryDay?.notes || service.bookingDay?.notes || null,
      },
      hotel: {
        name: hotelName,
        city,
        supplierName: this.cleanText(voucher.supplier?.name) || this.cleanText(service.supplierName),
      },
      stay: {
        checkIn,
        checkOut,
        nights,
      },
      roomingSummary: this.buildRoomingSummary(rooms),
      rooms,
      passengers,
      occupancy,
      mealPlan,
      roomCategory,
      operationalNotes,
      supplierNotes,
      source: {
        quoteItemId: quoteItem?.id || service.sourceQuoteItemId || null,
        itineraryDayId: itineraryDay?.id || quoteItem?.itineraryId || null,
        generatedFrom: 'live-operational-data',
      },
    };
  }

  private resolveHotelQuoteItem(quoteItems: any[], service: any) {
    if (service.sourceQuoteItemId) {
      const direct = quoteItems.find((item) => item.id === service.sourceQuoteItemId);
      if (direct) return direct;
    }

    return quoteItems.find((item) => item.hotelId || item.hotel || item.mealPlan || item.roomCategoryId) || null;
  }

  private resolveQuoteVoucherKind(item: any): 'HOTEL' | 'TRANSPORT' | 'SERVICE' | null {
    if (item.hotelId || item.hotel || item.mealPlan || item.roomCategoryId) {
      return 'HOTEL';
    }

    const taxonomyGroup = item.service ? resolveServiceTaxonomyGroup(item.service) : null;
    if (taxonomyGroup === 'transport' || item.appliedVehicleRateId || item.appliedVehicleRate) {
      return 'TRANSPORT';
    }

    if (taxonomyGroup === 'operationalAssistance' || taxonomyGroup === 'guide' || taxonomyGroup === 'other') {
      return 'SERVICE';
    }

    const serviceText = [item.service?.name, item.service?.category, item.service?.serviceType?.name, item.service?.serviceType?.code]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (/\b(meet|assist|fast track|porter|sim|wheelchair|airport assistance|border assistance|escort|guide)\b/.test(serviceText)) {
      return 'SERVICE';
    }

    return null;
  }

  private buildQuoteHotelVoucherSection(item: any, quote: any, itineraryDay: any) {
    const roomingGroups = (quote.roomingGroups || []).filter((group: any) => {
      if (group.hotelQuoteItemId === item.id) {
        return true;
      }
      return itineraryDay?.id && group.itineraryDayId === itineraryDay.id && group.hotelQuoteItem?.hotelId === item.hotelId;
    });
    const rooms = roomingGroups.map((group: any, index: number) => this.mapQuoteRoomingGroup(group, index));
    const passengers = this.resolvePassengers(quote.passengers || [], [], rooms);
    const checkIn = this.formatDateOnly(item.serviceDate || null);
    const checkOut = this.formatDateOnly(this.resolveCheckOutDate({ checkIn, quoteItem: item, booking: {}, snapshot: { nightCount: item.nightCount } }));

    return {
      name: this.cleanText(item.hotel?.name) || this.cleanText(item.service?.name) || 'Hotel',
      city: this.cleanText(item.hotel?.city),
      roomingSummary: this.buildRoomingSummary(rooms),
      rooms,
      passengers,
      mealPlan: this.cleanText(item.mealPlan) || 'Meal plan pending',
      roomCategory: this.cleanText(item.roomCategory?.name) || 'Room category pending',
      occupancy: this.cleanText(item.occupancyType) || this.summarizeOccupancy(rooms),
      checkIn,
      checkOut,
      pax: this.getQuoteItemPax(item, quote),
    };
  }

  private buildQuoteTransportVoucherSection(item: any) {
    const rate = item.appliedVehicleRate;
    const routeName =
      this.cleanText(rate?.routeName) ||
      this.cleanText(rate?.route?.name) ||
      [rate?.fromPlace?.name, rate?.toPlace?.name].filter(Boolean).join(' to ') ||
      this.cleanText(item.pricingDescription) ||
      'Route pending';

    return {
      route: routeName,
      serviceType: this.cleanText(rate?.serviceType?.name) || this.cleanText(item.service?.serviceType?.name) || this.cleanText(item.service?.name) || 'Transport service',
      pickup: this.cleanText(item.pickupTime) || this.cleanText(item.startTime),
      dropoff: this.cleanText(item.meetingPoint) || this.cleanText(item.pickupLocation),
      vehicle: this.cleanText(rate?.vehicle?.name),
      pax: this.getQuoteItemPax(item, item.quote),
    };
  }

  private buildQuoteServiceVoucherSection(item: any, remarks: string[]) {
    return {
      name: this.cleanText(item.customServiceName) || this.cleanText(item.service?.name) || 'Operational service',
      category: this.cleanText(item.service?.category),
      serviceType: this.cleanText(item.service?.serviceType?.name),
      operationalNotes: this.compactTextList([
        item.pickupTime ? `Pickup time: ${item.pickupTime}` : null,
        item.pickupLocation ? `Pickup location: ${item.pickupLocation}` : null,
        item.meetingPoint ? `Meeting point: ${item.meetingPoint}` : null,
        ...remarks,
      ]),
      pax: this.getQuoteItemPax(item, item.quote),
    };
  }

  private getQuoteItemPax(item: any, quote: any) {
    return Math.max(1, Number((item.paxCount ?? item.participantCount ?? (Number(quote?.adults ?? 0) + Number(quote?.children ?? 0))) || 1));
  }

  private resolveItineraryDay(days: any[], quoteItem: any, service: any) {
    if (quoteItem?.itineraryId) {
      const day = days.find((entry) => entry.id === quoteItem.itineraryId);
      if (day) return day;
    }

    if (service.bookingDay?.dayNumber) {
      return days.find((entry) => entry.dayNumber === service.bookingDay.dayNumber) || null;
    }

    return null;
  }

  private mapQuoteRoomingGroup(group: any, index: number): HotelVoucherRoom {
    return {
      id: group.id,
      label: group.temporaryRoomLabel || `Room ${index + 1}`,
      roomType: group.roomType || group.hotelQuoteItem?.roomCategory?.name || null,
      occupancy: this.formatOccupancy(group.occupancyType),
      notes: group.notes || null,
      passengers: (group.assignments || []).map((assignment: any) => ({
        id: assignment.quotePassenger.id,
        name: this.formatName(assignment.quotePassenger),
      })),
    };
  }

  private mapBookingRoomingEntry(entry: any, index: number): HotelVoucherRoom {
    return {
      id: entry.id,
      label: entry.roomType || `Room ${entry.sortOrder || index + 1}`,
      roomType: entry.roomType || null,
      occupancy: this.formatOccupancy(entry.occupancy),
      notes: entry.notes || null,
      passengers: (entry.assignments || []).map((assignment: any) => ({
        id: assignment.bookingPassenger.id,
        name: this.formatName(assignment.bookingPassenger),
      })),
    };
  }

  private resolvePassengers(quotePassengers: any[], bookingPassengers: any[], rooms: HotelVoucherRoom[]) {
    const roomPassengerIds = new Set(rooms.flatMap((room) => room.passengers.map((passenger) => passenger.id)));
    const source = quotePassengers.length > 0 ? quotePassengers : bookingPassengers;
    const mapped = source.map((passenger) => ({
      id: passenger.id,
      name: this.formatName(passenger),
    }));
    const roomOnlyPassengers = rooms
      .flatMap((room) => room.passengers)
      .filter((passenger) => !mapped.some((entry) => entry.id === passenger.id));

    return [...mapped, ...roomOnlyPassengers].sort((left, right) => {
      if (roomPassengerIds.has(left.id) !== roomPassengerIds.has(right.id)) {
        return roomPassengerIds.has(left.id) ? -1 : 1;
      }
      return left.name.localeCompare(right.name);
    });
  }

  private resolveCheckOutDate(input: { checkIn: string | null; quoteItem: any; booking: any; snapshot: any }) {
    if (input.booking.endDate) {
      return input.booking.endDate;
    }

    if (!input.checkIn) {
      return null;
    }

    const nights = Number(input.quoteItem?.nightCount || input.booking.nightCount || input.snapshot.nightCount || 0);
    if (!Number.isFinite(nights) || nights <= 0) {
      return null;
    }

    const checkIn = new Date(`${input.checkIn}T00:00:00.000Z`);
    checkIn.setUTCDate(checkIn.getUTCDate() + nights);
    return checkIn;
  }

  private buildRoomingSummary(rooms: HotelVoucherRoom[]) {
    if (rooms.length === 0) {
      return 'Rooming pending';
    }

    const counts = rooms.reduce<Record<string, number>>((summary, room) => {
      const key = room.occupancy || 'Pending';
      summary[key] = (summary[key] || 0) + 1;
      return summary;
    }, {});

    return Object.entries(counts)
      .map(([occupancy, count]) => `${count} ${occupancy}`)
      .join(' / ');
  }

  private summarizeOccupancy(rooms: HotelVoucherRoom[]) {
    return this.buildRoomingSummary(rooms);
  }

  private extractCityFromSnapshot(snapshot: any, itineraryId?: string | null) {
    const day = (snapshot?.itineraries || []).find((entry: any) => itineraryId && entry.id === itineraryId);
    return this.cleanText(day?.city) || this.cleanText(day?.destination) || null;
  }

  private firstNonEmpty(values: Array<string | null | undefined>) {
    return values.map((value) => this.cleanText(value)).find(Boolean) || null;
  }

  private compactTextList(values: Array<string | null | undefined>) {
    const seen = new Set<string>();
    return values
      .map((value) => this.cleanText(value))
      .filter((value): value is string => {
        if (!value) return false;
        const key = value.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  private cleanText(value: unknown) {
    const normalized = String(value ?? '').trim();
    return normalized || null;
  }

  private formatName(passenger: any) {
    return [passenger.title, passenger.fullName || null, !passenger.fullName ? passenger.firstName : null, !passenger.fullName ? passenger.lastName : null]
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim() || 'Passenger';
  }

  private formatOccupancy(value: unknown) {
    const normalized = String(value || 'unknown').trim().toLowerCase();
    if (normalized === 'sgl') return 'Single';
    if (normalized === 'dbl') return 'Double';
    if (normalized === 'tpl') return 'Triple';
    if (normalized === 'single') return 'Single';
    if (normalized === 'double') return 'Double';
    if (normalized === 'triple') return 'Triple';
    if (normalized === 'quad') return 'Quad';
    return 'Pending';
  }

  private formatDateOnly(value: string | Date | null | undefined) {
    if (!value) {
      return null;
    }

    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    return parsed.toISOString().slice(0, 10);
  }
}

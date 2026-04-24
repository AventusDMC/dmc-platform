import {
  HotelMealPlan,
  HotelOccupancyType,
  PrismaClient,
  ServiceUnitType,
  TransportPricingMode,
} from '@prisma/client';
import { calculateMultiCurrencyQuoteItemPricing } from '../src/quotes/multi-currency-pricing';

const prisma = new PrismaClient();

const TARGET_QUOTE_NUMBER = 'Q-2026-0005';
const TARGET_QUOTE_TITLE = 'Demo FIT Quote - Multi Currency QA';
const BRAND_COMPANY_NAME = 'Demo Brand - Desert Compass Jordan';

type NamedRecord = {
  id: string;
  name: string;
};

type RouteRecord = NamedRecord & {
  fromPlaceId: string;
  toPlaceId: string;
};

type RouteFixture = {
  fromName: string;
  toName: string;
  durationMinutes: number;
  distanceKm: number;
};

function normalizeKey(value: string) {
  return value.trim().toLowerCase();
}

async function upsertCompany(data: {
  name: string;
  type: string;
  website?: string;
  country?: string;
  city?: string;
  primaryColor?: string;
}) {
  const existing = await prisma.company.findFirst({
    where: {
      name: {
        equals: data.name,
        mode: 'insensitive',
      },
    },
  });

  if (existing) {
    return prisma.company.update({
      where: { id: existing.id },
      data,
    });
  }

  return prisma.company.create({ data });
}

async function upsertContact(
  companyId: string,
  data: {
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
    title?: string;
  },
) {
  const existing = data.email
    ? await prisma.contact.findFirst({
        where: {
          companyId,
          email: {
            equals: data.email,
            mode: 'insensitive',
          },
        },
      })
    : null;

  if (existing) {
    return prisma.contact.update({
      where: { id: existing.id },
      data,
    });
  }

  return prisma.contact.create({
    data: {
      companyId,
      ...data,
    },
  });
}

async function resolveAdminTenant() {
  const preferredEmail = process.env.DEMO_SEED_USER_EMAIL?.trim().toLowerCase();
  const adminRole = await prisma.role.findFirst({
    where: {
      name: 'admin',
    },
    select: {
      id: true,
      name: true,
    },
  });

  if (!adminRole) {
    throw new Error('Admin role was not found.');
  }

  const adminUser = preferredEmail
    ? await prisma.user.findFirst({
        where: {
          email: {
            equals: preferredEmail,
            mode: 'insensitive',
          },
        },
        select: {
          id: true,
          email: true,
          companyId: true,
          roleId: true,
        },
      })
    : await prisma.user.findFirst({
        where: {
          roleId: adminRole.id,
        },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          email: true,
          companyId: true,
          roleId: true,
        },
      });

  if (!adminUser?.companyId) {
    throw new Error(
      preferredEmail
        ? `No user with email ${preferredEmail} and a valid companyId was found.`
        : 'No admin user with a valid companyId was found.',
    );
  }

  const company = await prisma.company.findUnique({
    where: {
      id: adminUser.companyId,
    },
    select: {
      id: true,
      name: true,
    },
  });

  if (!company) {
    throw new Error(`Company ${adminUser.companyId} for admin user ${adminUser.email} was not found.`);
  }

  return {
    userId: adminUser.id,
    email: adminUser.email,
    companyId: adminUser.companyId,
    companyName: company.name,
    role: adminRole.name,
  };
}

async function createItineraryDays(
  quoteId: string,
  days: Array<{ dayNumber: number; title: string; description: string }>,
) {
  return Promise.all(
    days.map((day) =>
      prisma.itinerary.create({
        data: {
          quoteId,
          dayNumber: day.dayNumber,
          title: day.title,
          description: day.description,
        },
      }),
    ),
  );
}

async function syncQuoteItineraryFromQuoteItems(quoteId: string) {
  const quoteItineraryDayModel = (prisma as any).quoteItineraryDay;
  const quoteItineraryDayItemModel = (prisma as any).quoteItineraryDayItem;
  const quoteItineraryAuditLogModel = (prisma as any).quoteItineraryAuditLog;
  const existingDays = await quoteItineraryDayModel.findMany({
    where: { quoteId },
    select: { id: true },
  });

  if (existingDays.length > 0) {
    await quoteItineraryDayItemModel.deleteMany({
      where: {
        dayId: {
          in: existingDays.map((day: { id: string }) => day.id),
        },
      },
    });
  }

  await quoteItineraryAuditLogModel.deleteMany({
    where: { quoteId },
  });
  await quoteItineraryDayModel.deleteMany({
    where: { quoteId },
  });

  const itineraries = await prisma.itinerary.findMany({
    where: { quoteId },
    orderBy: [{ dayNumber: 'asc' }, { createdAt: 'asc' }],
  });
  const quoteItems = await prisma.quoteItem.findMany({
    where: {
      quoteId,
      optionId: null,
      itineraryId: {
        not: null,
      },
    },
    orderBy: [{ serviceDate: 'asc' }, { createdAt: 'asc' }],
  });

  const itemsByItineraryId = new Map<string, typeof quoteItems>();
  for (const item of quoteItems) {
    if (!item.itineraryId) {
      continue;
    }

    const current = itemsByItineraryId.get(item.itineraryId) || [];
    current.push(item);
    itemsByItineraryId.set(item.itineraryId, current);
  }

  for (const itinerary of itineraries) {
    const day = await quoteItineraryDayModel.create({
      data: {
        quoteId,
        dayNumber: itinerary.dayNumber,
        title: itinerary.title,
        notes: itinerary.description,
        sortOrder: itinerary.dayNumber,
        isActive: true,
      },
    });

    const dayItems = itemsByItineraryId.get(itinerary.id) || [];
    for (const [index, item] of dayItems.entries()) {
      await quoteItineraryDayItemModel.create({
        data: {
          dayId: day.id,
          quoteServiceId: item.id,
          sortOrder: index + 1,
          notes: item.pricingDescription,
          isActive: true,
        },
      });
    }
  }
}

async function deleteQuoteScenario(quoteId: string) {
  const quoteItineraryDayModel = (prisma as any).quoteItineraryDay;
  const quoteItineraryDayItemModel = (prisma as any).quoteItineraryDayItem;
  const quoteItineraryAuditLogModel = (prisma as any).quoteItineraryAuditLog;

  const existing = await prisma.quote.findUnique({
    where: { id: quoteId },
    select: {
      id: true,
      invoice: {
        select: {
          id: true,
        },
      },
      booking: {
        select: {
          id: true,
        },
      },
      itineraries: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!existing) {
    return;
  }

  if (existing.booking) {
    await prisma.bookingRoomingAssignment.deleteMany({
      where: {
        bookingRoomingEntry: {
          bookingId: existing.booking.id,
        },
      },
    });
    await prisma.bookingRoomingEntry.deleteMany({
      where: { bookingId: existing.booking.id },
    });
    await prisma.bookingPassenger.deleteMany({
      where: { bookingId: existing.booking.id },
    });
    await prisma.bookingAuditLog.deleteMany({
      where: { bookingId: existing.booking.id },
    });
    await prisma.bookingService.deleteMany({
      where: { bookingId: existing.booking.id },
    });
    await prisma.booking.delete({
      where: { id: existing.booking.id },
    });
  }

  if (existing.invoice) {
    await prisma.invoiceAuditLog.deleteMany({
      where: { invoiceId: existing.invoice.id },
    });
    await prisma.invoice.delete({
      where: { id: existing.invoice.id },
    });
  }

  const quoteItineraryDays = await quoteItineraryDayModel.findMany({
    where: { quoteId },
    select: { id: true },
  });
  if (quoteItineraryDays.length > 0) {
    await quoteItineraryDayItemModel.deleteMany({
      where: {
        dayId: {
          in: quoteItineraryDays.map((day: { id: string }) => day.id),
        },
      },
    });
  }

  await quoteItineraryAuditLogModel.deleteMany({
    where: { quoteId },
  });
  await quoteItineraryDayModel.deleteMany({
    where: { quoteId },
  });
  await prisma.quoteItem.deleteMany({
    where: { quoteId },
  });
  await prisma.quoteScenario.deleteMany({
    where: { quoteId },
  });
  await prisma.quotePricingSlab.deleteMany({
    where: { quoteId },
  });
  await prisma.quoteOption.deleteMany({
    where: { quoteId },
  });
  await prisma.itineraryImage.deleteMany({
    where: {
      itineraryId: {
        in: existing.itineraries.map((itinerary) => itinerary.id),
      },
    },
  });
  await prisma.itinerary.deleteMany({
    where: { quoteId },
  });
  await prisma.quoteVersion.deleteMany({
    where: { quoteId },
  });
  await prisma.quote.delete({
    where: { id: quoteId },
  });
}

async function upsertLookupRecord<T extends NamedRecord>(
  findExisting: () => Promise<T | null>,
  updateExisting: (id: string) => Promise<T>,
  createRecord: () => Promise<T>,
) {
  const existing = await findExisting();
  if (existing) {
    return updateExisting(existing.id);
  }

  return createRecord();
}

function calculatePricingUnits(args: {
  unitType: ServiceUnitType;
  quantity: number;
  paxCount: number;
  roomCount: number;
  nightCount: number;
  dayCount: number;
  isHotel: boolean;
  isTransport: boolean;
  transportPricingMode?: TransportPricingMode | null;
  unitCount?: number | null;
}) {
  if (args.isHotel) {
    return Math.max(1, args.quantity) * Math.max(1, args.roomCount) * Math.max(1, args.nightCount);
  }

  if (args.isTransport && args.transportPricingMode === TransportPricingMode.capacity_unit && args.unitCount) {
    return args.unitCount;
  }

  switch (args.unitType) {
    case ServiceUnitType.per_person:
      return args.quantity * args.paxCount;
    case ServiceUnitType.per_room:
      return args.quantity * args.roomCount;
    case ServiceUnitType.per_night:
      return args.quantity * args.nightCount;
    case ServiceUnitType.per_day:
      return args.quantity * args.dayCount;
    case ServiceUnitType.per_group:
    case ServiceUnitType.per_vehicle:
    default:
      return args.quantity;
  }
}

function buildPricingDescription(input: {
  type: 'transport' | 'hotel' | 'activity';
  routeName?: string;
  vehicleName?: string;
  transportLabel?: string;
  contractName?: string;
  seasonName?: string;
  roomCategoryName?: string;
  occupancyType?: string;
  mealPlan?: string;
  serviceName?: string;
  meetingPoint?: string | null;
}) {
  if (input.type === 'transport') {
    return `${input.transportLabel || 'Transfer'} | ${input.routeName || 'Route to be confirmed'} | ${input.vehicleName || 'Vehicle to be confirmed'} | Per vehicle`;
  }

  if (input.type === 'hotel') {
    return `${input.contractName} | ${input.seasonName} | ${input.roomCategoryName} | ${input.occupancyType} | ${input.mealPlan}`;
  }

  const suffix = input.meetingPoint ? ` | Meet at ${input.meetingPoint}` : '';
  return `${input.serviceName || 'Activity'}${suffix}`;
}

async function createQuoteItemRecord(args: {
  quoteId: string;
  itineraryId: string;
  service: {
    id: string;
    category: string;
    unitType: ServiceUnitType;
    serviceTypeId?: string | null;
  };
  quoteCurrency: 'USD' | 'EUR' | 'JOD';
  quantity: number;
  paxCount: number;
  roomCount?: number | null;
  nightCount?: number | null;
  dayCount?: number | null;
  participantCount?: number | null;
  adultCount?: number | null;
  childCount?: number | null;
  markupPercent: number;
  serviceDate?: Date | null;
  startTime?: string | null;
  meetingPoint?: string | null;
  pickupTime?: string | null;
  pickupLocation?: string | null;
  hotelId?: string | null;
  contractId?: string | null;
  seasonName?: string | null;
  roomCategoryId?: string | null;
  occupancyType?: HotelOccupancyType | null;
  mealPlan?: HotelMealPlan | null;
  routeId?: string | null;
  appliedVehicleRateId?: string | null;
  pricingDescription: string;
  supplierPricing: {
    costBaseAmount: number;
    costCurrency: string;
    salesTaxPercent?: number | null;
    salesTaxIncluded?: boolean | null;
    serviceChargePercent?: number | null;
    serviceChargeIncluded?: boolean | null;
    tourismFeeAmount?: number | null;
    tourismFeeCurrency?: string | null;
    tourismFeeMode?: 'PER_NIGHT_PER_PERSON' | 'PER_NIGHT_PER_ROOM' | null;
  };
  transportPricingMode?: TransportPricingMode | null;
  unitCount?: number | null;
}) {
  const isHotel = args.service.category.toLowerCase() === 'accommodation';
  const isTransport = args.service.category.toLowerCase() === 'transport';
  const roomCount = Math.max(1, args.roomCount ?? 1);
  const nightCount = Math.max(1, args.nightCount ?? 1);
  const dayCount = Math.max(1, args.dayCount ?? 1);
  const paxCount = Math.max(1, args.paxCount);
  const pricingUnits = calculatePricingUnits({
    unitType: args.service.unitType,
    quantity: args.quantity,
    paxCount,
    roomCount,
    nightCount,
    dayCount,
    isHotel,
    isTransport,
    transportPricingMode: args.transportPricingMode,
    unitCount: args.unitCount,
  });

  const pricing = calculateMultiCurrencyQuoteItemPricing({
    supplierPricing: args.supplierPricing,
    pricingUnits: {
      pricingUnits,
      roomCount,
      nightCount,
      paxCount,
    },
    quoteCurrency: args.quoteCurrency,
    markupPercent: args.markupPercent,
    legacyPricing: {
      totalCost: 0,
      totalSell: 0,
      currency: args.supplierPricing.costCurrency,
    },
  });

  return prisma.quoteItem.create({
    data: {
      quoteId: args.quoteId,
      serviceId: args.service.id,
      itineraryId: args.itineraryId,
      quantity: args.quantity,
      paxCount,
      participantCount: args.participantCount ?? null,
      adultCount: args.adultCount ?? null,
      childCount: args.childCount ?? null,
      roomCount: args.roomCount ?? null,
      nightCount: args.nightCount ?? null,
      dayCount: args.dayCount ?? null,
      markupPercent: args.markupPercent,
      totalCost: pricing.totalCost,
      totalSell: pricing.totalSell,
      appliedVehicleRateId: args.appliedVehicleRateId ?? null,
      currency: args.quoteCurrency,
      quoteCurrency: args.quoteCurrency,
      pricingDescription: args.pricingDescription,
      serviceDate: args.serviceDate ?? null,
      startTime: args.startTime ?? null,
      pickupTime: args.pickupTime ?? null,
      pickupLocation: args.pickupLocation ?? null,
      meetingPoint: args.meetingPoint ?? null,
      reconfirmationRequired: false,
      reconfirmationDueAt: null,
      hotelId: args.hotelId ?? null,
      contractId: args.contractId ?? null,
      seasonName: args.seasonName ?? null,
      mealPlan: args.mealPlan ?? null,
      roomCategoryId: args.roomCategoryId ?? null,
      occupancyType: args.occupancyType ?? null,
      baseCost: pricing.totalCost,
      costBaseAmount: args.supplierPricing.costBaseAmount,
      costCurrency: args.supplierPricing.costCurrency,
      salesTaxPercent: args.supplierPricing.salesTaxPercent ?? 0,
      salesTaxIncluded: Boolean(args.supplierPricing.salesTaxIncluded),
      serviceChargePercent: args.supplierPricing.serviceChargePercent ?? 0,
      serviceChargeIncluded: Boolean(args.supplierPricing.serviceChargeIncluded),
      tourismFeeAmount: args.supplierPricing.tourismFeeAmount ?? null,
      tourismFeeCurrency: args.supplierPricing.tourismFeeCurrency ?? null,
      tourismFeeMode: args.supplierPricing.tourismFeeMode ?? null,
      fxRate: pricing.fxRate,
      fxFromCurrency: pricing.fxFromCurrency,
      fxToCurrency: pricing.fxToCurrency,
      fxRateDate: pricing.fxRateDate,
      overrideCost: null,
      useOverride: false,
    },
  });
}

async function seedTargetDemoQuote() {
  let exitCode = 0;

  try {
    console.log('starting demo quote seed');
    await prisma.$connect();
    console.log('connected to database');

    const conflictingQuote = await prisma.quote.findFirst({
      where: {
        quoteNumber: TARGET_QUOTE_NUMBER,
      },
      select: {
        id: true,
        title: true,
      },
    });

    if (conflictingQuote && conflictingQuote.title !== TARGET_QUOTE_TITLE) {
      throw new Error(`Quote number ${TARGET_QUOTE_NUMBER} already belongs to "${conflictingQuote.title}".`);
    }

    const existingTarget = await prisma.quote.findFirst({
      where: {
        OR: [{ quoteNumber: TARGET_QUOTE_NUMBER }, { title: TARGET_QUOTE_TITLE }],
      },
      select: {
        id: true,
      },
    });

    const mode = existingTarget ? 'updated' : 'created';

    if (existingTarget) {
      await deleteQuoteScenario(existingTarget.id);
    }

    const accommodationType = await upsertLookupRecord(
      () => prisma.serviceType.findFirst({ where: { code: { equals: 'HOTEL', mode: 'insensitive' } } }),
      (id) => prisma.serviceType.update({ where: { id }, data: { name: 'Accommodation', code: 'HOTEL', isActive: true } }),
      () => prisma.serviceType.create({ data: { name: 'Accommodation', code: 'HOTEL', isActive: true } }),
    );
    const transportType = await upsertLookupRecord(
      () => prisma.serviceType.findFirst({ where: { code: { equals: 'TRANSPORT', mode: 'insensitive' } } }),
      (id) => prisma.serviceType.update({ where: { id }, data: { name: 'Transport', code: 'TRANSPORT', isActive: true } }),
      () => prisma.serviceType.create({ data: { name: 'Transport', code: 'TRANSPORT', isActive: true } }),
    );
    const sightseeingType = await upsertLookupRecord(
      () => prisma.serviceType.findFirst({ where: { code: { equals: 'ACTIVITY', mode: 'insensitive' } } }),
      (id) => prisma.serviceType.update({ where: { id }, data: { name: 'Sightseeing', code: 'ACTIVITY', isActive: true } }),
      () => prisma.serviceType.create({ data: { name: 'Sightseeing', code: 'ACTIVITY', isActive: true } }),
    );

    const arrivalTransferType = await upsertLookupRecord(
      () => prisma.transportServiceType.findFirst({ where: { code: { equals: 'ARR', mode: 'insensitive' } } }),
      (id) => prisma.transportServiceType.update({ where: { id }, data: { name: 'Arrival Transfer', code: 'ARR' } }),
      () => prisma.transportServiceType.create({ data: { name: 'Arrival Transfer', code: 'ARR' } }),
    );
    const departureTransferType = await upsertLookupRecord(
      () => prisma.transportServiceType.findFirst({ where: { code: { equals: 'DEP', mode: 'insensitive' } } }),
      (id) => prisma.transportServiceType.update({ where: { id }, data: { name: 'Departure Transfer', code: 'DEP' } }),
      () => prisma.transportServiceType.create({ data: { name: 'Departure Transfer', code: 'DEP' } }),
    );
    const intercityTransferType = await upsertLookupRecord(
      () => prisma.transportServiceType.findFirst({ where: { code: { equals: 'INT', mode: 'insensitive' } } }),
      (id) => prisma.transportServiceType.update({ where: { id }, data: { name: 'Intercity Transfer', code: 'INT' } }),
      () => prisma.transportServiceType.create({ data: { name: 'Intercity Transfer', code: 'INT' } }),
    );

    const cityRecords = Object.fromEntries(
      await Promise.all(
        ['Amman', 'Petra', 'Wadi Rum'].map(async (name) => {
          const record = await upsertLookupRecord(
            () => prisma.city.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } }),
            (id) => prisma.city.update({ where: { id }, data: { name, country: 'Jordan', isActive: true } }),
            () => prisma.city.create({ data: { name, country: 'Jordan', isActive: true } }),
          );
          return [normalizeKey(name), record] as const;
        }),
      ),
    ) as Record<string, NamedRecord>;

    const placeTypeRecords = Object.fromEntries(
      await Promise.all(
        ['Airport', 'City Center', 'Visitor Center', 'Camp Area'].map(async (name) => {
          const record = await upsertLookupRecord(
            () => prisma.placeType.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } }),
            (id) => prisma.placeType.update({ where: { id }, data: { name, isActive: true } }),
            () => prisma.placeType.create({ data: { name, isActive: true } }),
          );
          return [normalizeKey(name), record] as const;
        }),
      ),
    ) as Record<string, NamedRecord>;

    const places = Object.fromEntries(
      await Promise.all(
        [
          { name: 'Queen Alia International Airport', type: 'airport', city: 'Amman', placeType: 'Airport' },
          { name: 'Amman City Center', type: 'city-center', city: 'Amman', placeType: 'City Center' },
          { name: 'Petra Visitor Center', type: 'visitor-center', city: 'Petra', placeType: 'Visitor Center' },
          { name: 'Wadi Rum Camp Area', type: 'camp-area', city: 'Wadi Rum', placeType: 'Camp Area' },
        ].map(async (entry) => {
          const city = cityRecords[normalizeKey(entry.city)];
          const placeType = placeTypeRecords[normalizeKey(entry.placeType)];
          const record = await upsertLookupRecord(
            () => prisma.place.findFirst({ where: { name: { equals: entry.name, mode: 'insensitive' } } }),
            (id) =>
              prisma.place.update({
                where: { id },
                data: {
                  name: entry.name,
                  type: entry.type,
                  city: entry.city,
                  country: 'Jordan',
                  cityId: city.id,
                  placeTypeId: placeType.id,
                  isActive: true,
                },
              }),
            () =>
              prisma.place.create({
                data: {
                  name: entry.name,
                  type: entry.type,
                  city: entry.city,
                  country: 'Jordan',
                  cityId: city.id,
                  placeTypeId: placeType.id,
                  isActive: true,
                },
              }),
          );
          return [normalizeKey(entry.name), record] as const;
        }),
      ),
    ) as Record<string, NamedRecord>;

    const suppliers = Object.fromEntries(
      await Promise.all(
        [
          { name: 'The House Boutique Suites Amman', type: 'hotel' },
          { name: 'Petra Moon Hotel', type: 'hotel' },
          { name: 'Sun City Camp Wadi Rum', type: 'hotel' },
          { name: 'Desert Compass Transport', type: 'transport' },
          { name: 'Desert Compass Experiences', type: 'experience' },
        ].map(async (entry) => {
          const record = await upsertLookupRecord(
            () => prisma.supplier.findFirst({ where: { name: { equals: entry.name, mode: 'insensitive' } } }),
            (id) => prisma.supplier.update({ where: { id }, data: { name: entry.name, type: entry.type } }),
            () => prisma.supplier.create({ data: { name: entry.name, type: entry.type } }),
          );
          return [normalizeKey(entry.name), record] as const;
        }),
      ),
    ) as Record<string, NamedRecord>;

    const hotelCategories = Object.fromEntries(
      await Promise.all(
        ['4 Star', 'Desert Camp'].map(async (name) => {
          const record = await upsertLookupRecord(
            () => prisma.hotelCategory.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } }),
            (id) => prisma.hotelCategory.update({ where: { id }, data: { name, isActive: true } }),
            () => prisma.hotelCategory.create({ data: { name, isActive: true } }),
          );
          return [normalizeKey(name), record] as const;
        }),
      ),
    ) as Record<string, NamedRecord>;

    const hotels = Object.fromEntries(
      await Promise.all(
        [
          { name: 'The House Boutique Suites Amman', city: 'Amman', category: '4 Star', supplier: 'The House Boutique Suites Amman' },
          { name: 'Petra Moon Hotel', city: 'Petra', category: '4 Star', supplier: 'Petra Moon Hotel' },
          { name: 'Sun City Camp Wadi Rum', city: 'Wadi Rum', category: 'Desert Camp', supplier: 'Sun City Camp Wadi Rum' },
        ].map(async (entry) => {
          const city = cityRecords[normalizeKey(entry.city)];
          const category = hotelCategories[normalizeKey(entry.category)];
          const supplier = suppliers[normalizeKey(entry.supplier)];
          const record = await upsertLookupRecord(
            () => prisma.hotel.findFirst({ where: { name: { equals: entry.name, mode: 'insensitive' } } }),
            (id) =>
              prisma.hotel.update({
                where: { id },
                data: {
                  name: entry.name,
                  city: entry.city,
                  category: entry.category,
                  supplierId: supplier.id,
                  cityId: city.id,
                  hotelCategoryId: category.id,
                },
              }),
            () =>
              prisma.hotel.create({
                data: {
                  name: entry.name,
                  city: entry.city,
                  category: entry.category,
                  supplierId: supplier.id,
                  cityId: city.id,
                  hotelCategoryId: category.id,
                },
              }),
          );
          return [normalizeKey(entry.name), record] as const;
        }),
      ),
    ) as Record<string, NamedRecord>;

    const roomCategories = Object.fromEntries(
      await Promise.all(
        [
          { hotel: 'The House Boutique Suites Amman', name: 'Standard Room', code: 'STD' },
          { hotel: 'Petra Moon Hotel', name: 'Standard Room', code: 'STD' },
          { hotel: 'Sun City Camp Wadi Rum', name: 'Standard Tent', code: 'STD' },
        ].map(async (entry) => {
          const hotel = hotels[normalizeKey(entry.hotel)];
          const record = await upsertLookupRecord(
            () =>
              prisma.hotelRoomCategory.findFirst({
                where: {
                  hotelId: hotel.id,
                  name: { equals: entry.name, mode: 'insensitive' },
                },
              }),
            (id) =>
              prisma.hotelRoomCategory.update({
                where: { id },
                data: {
                  hotelId: hotel.id,
                  name: entry.name,
                  code: entry.code,
                  description: `Demo room category for ${entry.hotel}.`,
                  isActive: true,
                },
              }),
            () =>
              prisma.hotelRoomCategory.create({
                data: {
                  hotelId: hotel.id,
                  name: entry.name,
                  code: entry.code,
                  description: `Demo room category for ${entry.hotel}.`,
                  isActive: true,
                },
              }),
          );
          return [normalizeKey(`${hotel.id}:${entry.name}`), record] as const;
        }),
      ),
    ) as Record<string, NamedRecord>;

    const season = await upsertLookupRecord(
      () => prisma.season.findFirst({ where: { name: 'Spring 2026' } }),
      (id) => prisma.season.update({ where: { id }, data: { name: 'Spring 2026' } }),
      () => prisma.season.create({ data: { name: 'Spring 2026' } }),
    );

    const vehicle = await upsertLookupRecord(
      () =>
        prisma.vehicle.findFirst({
          where: {
            supplierId: suppliers[normalizeKey('Desert Compass Transport')].id,
            name: { equals: 'Hyundai H1 Minivan', mode: 'insensitive' },
          },
        }),
      (id) =>
        prisma.vehicle.update({
          where: { id },
          data: {
            supplierId: suppliers[normalizeKey('Desert Compass Transport')].id,
            name: 'Hyundai H1 Minivan',
            maxPax: 5,
            luggageCapacity: 7,
          },
        }),
      () =>
        prisma.vehicle.create({
          data: {
            supplierId: suppliers[normalizeKey('Desert Compass Transport')].id,
            name: 'Hyundai H1 Minivan',
            maxPax: 5,
            luggageCapacity: 7,
          },
        }),
    );

    const routeFixtures: RouteFixture[] = [
      { fromName: 'Queen Alia International Airport', toName: 'Amman City Center', durationMinutes: 45, distanceKm: 35 },
      { fromName: 'Amman City Center', toName: 'Petra Visitor Center', durationMinutes: 210, distanceKm: 235 },
      { fromName: 'Petra Visitor Center', toName: 'Wadi Rum Camp Area', durationMinutes: 120, distanceKm: 110 },
      { fromName: 'Wadi Rum Camp Area', toName: 'Queen Alia International Airport', durationMinutes: 240, distanceKm: 320 },
    ];

    const routes = Object.fromEntries(
      await Promise.all(
        routeFixtures.map(async ({ fromName, toName, durationMinutes, distanceKm }) => {
          const fromPlace = places[normalizeKey(fromName)];
          const toPlace = places[normalizeKey(toName)];
          const routeName = `${fromName} - ${toName}`;
          const record = await upsertLookupRecord(
            () =>
              prisma.route.findFirst({
                where: {
                  fromPlaceId: fromPlace.id,
                  toPlaceId: toPlace.id,
                },
              }),
            (id) =>
              prisma.route.update({
                where: { id },
                data: {
                  fromPlaceId: fromPlace.id,
                  toPlaceId: toPlace.id,
                  name: routeName,
                  routeType: 'private-transfer',
                  durationMinutes,
                  distanceKm,
                  notes: 'Targeted demo route for multi-currency QA.',
                  isActive: true,
                },
              }),
            () =>
              prisma.route.create({
                data: {
                  fromPlaceId: fromPlace.id,
                  toPlaceId: toPlace.id,
                  name: routeName,
                  routeType: 'private-transfer',
                  durationMinutes,
                  distanceKm,
                  notes: 'Targeted demo route for multi-currency QA.',
                  isActive: true,
                },
              }),
          );
          return [normalizeKey(routeName), { id: record.id, name: routeName, fromPlaceId: fromPlace.id, toPlaceId: toPlace.id }] as const;
        }),
      ),
    ) as Record<string, RouteRecord>;

    for (const entry of [
      { route: 'Queen Alia International Airport - Amman City Center', serviceTypeId: arrivalTransferType.id, price: 75 },
      { route: 'Amman City Center - Petra Visitor Center', serviceTypeId: intercityTransferType.id, price: 230 },
      { route: 'Petra Visitor Center - Wadi Rum Camp Area', serviceTypeId: intercityTransferType.id, price: 170 },
      { route: 'Wadi Rum Camp Area - Queen Alia International Airport', serviceTypeId: departureTransferType.id, price: 260 },
    ]) {
      const route = routes[normalizeKey(entry.route)];
      const existingRule = await prisma.transportPricingRule.findFirst({
        where: {
          routeId: route.id,
          transportServiceTypeId: entry.serviceTypeId,
          vehicleId: vehicle.id,
          minPax: 3,
          maxPax: 5,
        },
      });

      const ruleData = {
        routeId: route.id,
        transportServiceTypeId: entry.serviceTypeId,
        vehicleId: vehicle.id,
        pricingMode: TransportPricingMode.per_vehicle,
        minPax: 3,
        maxPax: 5,
        unitCapacity: null,
        baseCost: entry.price,
        discountPercent: 0,
        currency: 'USD',
        isActive: true,
      };

      if (existingRule) {
        await prisma.transportPricingRule.update({
          where: { id: existingRule.id },
          data: ruleData,
        });
      } else {
        await prisma.transportPricingRule.create({
          data: ruleData,
        });
      }

      const existingVehicleRate = await prisma.vehicleRate.findFirst({
        where: {
          routeId: route.id,
          serviceTypeId: entry.serviceTypeId,
          vehicleId: vehicle.id,
          minPax: 3,
          maxPax: 5,
        },
      });

      const vehicleRateData = {
        vehicleId: vehicle.id,
        serviceTypeId: entry.serviceTypeId,
        routeId: route.id,
        fromPlaceId: route.fromPlaceId,
        toPlaceId: route.toPlaceId,
        routeName: route.name,
        minPax: 3,
        maxPax: 5,
        price: entry.price,
        currency: 'USD',
        validFrom: new Date('2026-01-01T00:00:00.000Z'),
        validTo: new Date('2026-12-31T23:59:59.999Z'),
      };

      if (existingVehicleRate) {
        await prisma.vehicleRate.update({
          where: { id: existingVehicleRate.id },
          data: vehicleRateData,
        });
      } else {
        await prisma.vehicleRate.create({
          data: vehicleRateData,
        });
      }
    }

    const transportService = await upsertLookupRecord(
      () =>
        prisma.supplierService.findFirst({
          where: {
            supplierId: suppliers[normalizeKey('Desert Compass Transport')].id,
            name: { equals: 'Jordan Private Transfer Service', mode: 'insensitive' },
          },
        }),
      (id) =>
        prisma.supplierService.update({
          where: { id },
          data: {
            supplierId: suppliers[normalizeKey('Desert Compass Transport')].id,
            name: 'Jordan Private Transfer Service',
            category: 'Transport',
            serviceTypeId: transportType.id,
            unitType: ServiceUnitType.per_vehicle,
            baseCost: 0,
            currency: 'USD',
            costBaseAmount: 0,
            costCurrency: 'USD',
            salesTaxPercent: 0,
            salesTaxIncluded: false,
            serviceChargePercent: 0,
            serviceChargeIncluded: false,
            tourismFeeAmount: null,
            tourismFeeCurrency: null,
            tourismFeeMode: null,
          },
        }),
      () =>
        prisma.supplierService.create({
          data: {
            supplierId: suppliers[normalizeKey('Desert Compass Transport')].id,
            name: 'Jordan Private Transfer Service',
            category: 'Transport',
            serviceTypeId: transportType.id,
            unitType: ServiceUnitType.per_vehicle,
            baseCost: 0,
            currency: 'USD',
            costBaseAmount: 0,
            costCurrency: 'USD',
          },
        }),
    );

    const accommodationService = await upsertLookupRecord(
      () =>
        prisma.supplierService.findFirst({
          where: {
            name: { equals: 'Jordan Contracted Hotel Night', mode: 'insensitive' },
            serviceTypeId: accommodationType.id,
          },
        }),
      (id) =>
        prisma.supplierService.update({
          where: { id },
          data: {
            supplierId: suppliers[normalizeKey('The House Boutique Suites Amman')].id,
            name: 'Jordan Contracted Hotel Night',
            category: 'Accommodation',
            serviceTypeId: accommodationType.id,
            unitType: ServiceUnitType.per_room,
            baseCost: 0,
            currency: 'JOD',
            costBaseAmount: 0,
            costCurrency: 'JOD',
            salesTaxPercent: 0,
            salesTaxIncluded: false,
            serviceChargePercent: 0,
            serviceChargeIncluded: false,
          },
        }),
      () =>
        prisma.supplierService.create({
          data: {
            supplierId: suppliers[normalizeKey('The House Boutique Suites Amman')].id,
            name: 'Jordan Contracted Hotel Night',
            category: 'Accommodation',
            serviceTypeId: accommodationType.id,
            unitType: ServiceUnitType.per_room,
            baseCost: 0,
            currency: 'JOD',
            costBaseAmount: 0,
            costCurrency: 'JOD',
          },
        }),
    );

    const petraExperience = await upsertLookupRecord(
      () => prisma.supplierService.findFirst({ where: { name: { equals: 'Petra Full-Day Guided Experience', mode: 'insensitive' } } }),
      (id) =>
        prisma.supplierService.update({
          where: { id },
          data: {
            supplierId: suppliers[normalizeKey('Desert Compass Experiences')].id,
            name: 'Petra Full-Day Guided Experience',
            category: 'Sightseeing',
            serviceTypeId: sightseeingType.id,
            unitType: ServiceUnitType.per_person,
            baseCost: 92,
            currency: 'EUR',
            costBaseAmount: 92,
            costCurrency: 'EUR',
            salesTaxPercent: 0,
            salesTaxIncluded: false,
            serviceChargePercent: 0,
            serviceChargeIncluded: false,
          },
        }),
      () =>
        prisma.supplierService.create({
          data: {
            supplierId: suppliers[normalizeKey('Desert Compass Experiences')].id,
            name: 'Petra Full-Day Guided Experience',
            category: 'Sightseeing',
            serviceTypeId: sightseeingType.id,
            unitType: ServiceUnitType.per_person,
            baseCost: 92,
            currency: 'EUR',
            costBaseAmount: 92,
            costCurrency: 'EUR',
          },
        }),
    );

    const wadiRumJeepSafari = await upsertLookupRecord(
      () => prisma.supplierService.findFirst({ where: { name: { equals: 'Wadi Rum Sunset Jeep Tour', mode: 'insensitive' } } }),
      (id) =>
        prisma.supplierService.update({
          where: { id },
          data: {
            supplierId: suppliers[normalizeKey('Desert Compass Experiences')].id,
            name: 'Wadi Rum Sunset Jeep Tour',
            category: 'Sightseeing',
            serviceTypeId: sightseeingType.id,
            unitType: ServiceUnitType.per_person,
            baseCost: 48,
            currency: 'USD',
            costBaseAmount: 48,
            costCurrency: 'USD',
            salesTaxPercent: 0,
            salesTaxIncluded: false,
            serviceChargePercent: 0,
            serviceChargeIncluded: false,
          },
        }),
      () =>
        prisma.supplierService.create({
          data: {
            supplierId: suppliers[normalizeKey('Desert Compass Experiences')].id,
            name: 'Wadi Rum Sunset Jeep Tour',
            category: 'Sightseeing',
            serviceTypeId: sightseeingType.id,
            unitType: ServiceUnitType.per_person,
            baseCost: 48,
            currency: 'USD',
            costBaseAmount: 48,
            costCurrency: 'USD',
          },
        }),
    );

    const adminTenant = await resolveAdminTenant();
    console.log(`company/user resolved: ${adminTenant.email} -> ${adminTenant.companyName}`);

    const serviceRateModel = (prisma as any).serviceRate;
    if (serviceRateModel) {
      for (const entry of [
        { serviceId: petraExperience.id, costBaseAmount: 92, costCurrency: 'EUR' },
        { serviceId: wadiRumJeepSafari.id, costBaseAmount: 48, costCurrency: 'USD' },
      ]) {
        const existingRate = await serviceRateModel.findFirst({
          where: {
            serviceId: entry.serviceId,
            pricingMode: 'PER_PERSON',
          },
        });
        const rateData = {
          serviceId: entry.serviceId,
          supplierId: suppliers[normalizeKey('Desert Compass Experiences')].id,
          costBaseAmount: entry.costBaseAmount,
          costCurrency: entry.costCurrency,
          pricingMode: 'PER_PERSON',
          salesTaxPercent: 0,
          salesTaxIncluded: false,
          serviceChargePercent: 0,
          serviceChargeIncluded: false,
          tourismFeeAmount: null,
          tourismFeeCurrency: null,
          tourismFeeMode: null,
        };

        if (existingRate) {
          await serviceRateModel.update({
            where: { id: existingRate.id },
            data: rateData,
          });
        } else {
          await serviceRateModel.create({ data: rateData });
        }
      }
    }

    const hotelContractRecords = [
      {
        hotelName: 'The House Boutique Suites Amman',
        roomCategoryName: 'Standard Room',
        cost: 118,
      },
      {
        hotelName: 'Petra Moon Hotel',
        roomCategoryName: 'Standard Room',
        cost: 132,
      },
      {
        hotelName: 'Sun City Camp Wadi Rum',
        roomCategoryName: 'Standard Tent',
        cost: 142,
      },
    ] as const;

    const hotelContracts = new Map<string, { contractId: string; roomCategoryId: string; hotelId: string }>();

    for (const entry of hotelContractRecords) {
      const hotel = hotels[normalizeKey(entry.hotelName)];
      const roomCategory = roomCategories[normalizeKey(`${hotel.id}:${entry.roomCategoryName}`)];
      const existingContract = await prisma.hotelContract.findFirst({
        where: {
          hotelId: hotel.id,
          name: { equals: 'Jordan Multi-Currency Demo 2026', mode: 'insensitive' },
        },
      });
      const contract = existingContract
        ? await prisma.hotelContract.update({
            where: { id: existingContract.id },
            data: {
              hotelId: hotel.id,
              name: 'Jordan Multi-Currency Demo 2026',
              validFrom: new Date('2026-01-01T00:00:00.000Z'),
              validTo: new Date('2026-12-31T23:59:59.999Z'),
              currency: 'JOD',
            },
          })
        : await prisma.hotelContract.create({
            data: {
              hotelId: hotel.id,
              name: 'Jordan Multi-Currency Demo 2026',
              validFrom: new Date('2026-01-01T00:00:00.000Z'),
              validTo: new Date('2026-12-31T23:59:59.999Z'),
              currency: 'JOD',
            },
          });

      const existingRate = await prisma.hotelRate.findFirst({
        where: {
          contractId: contract.id,
          seasonId: season.id,
          roomCategoryId: roomCategory.id,
          occupancyType: HotelOccupancyType.DBL,
          mealPlan: HotelMealPlan.BB,
        },
      });

      const rateData = {
        contractId: contract.id,
        seasonId: season.id,
        seasonName: season.name,
        roomCategoryId: roomCategory.id,
        occupancyType: HotelOccupancyType.DBL,
        pricingMode: 'PER_ROOM_PER_NIGHT' as const,
        mealPlan: HotelMealPlan.BB,
        currency: 'JOD',
        cost: entry.cost,
        costBaseAmount: entry.cost,
        costCurrency: 'JOD',
        salesTaxPercent: 16,
        salesTaxIncluded: true,
        serviceChargePercent: 10,
        serviceChargeIncluded: false,
        tourismFeeAmount: 7,
        tourismFeeCurrency: 'JOD',
        tourismFeeMode: 'PER_NIGHT_PER_PERSON' as const,
      };

      if (existingRate) {
        await prisma.hotelRate.update({
          where: { id: existingRate.id },
          data: rateData,
        });
      } else {
        await prisma.hotelRate.create({
          data: rateData,
        });
      }

      hotelContracts.set(normalizeKey(entry.hotelName), {
        contractId: contract.id,
        roomCategoryId: roomCategory.id,
        hotelId: hotel.id,
      });
    }

    const brandCompany = await upsertCompany({
      name: BRAND_COMPANY_NAME,
      type: 'dmc',
      website: 'https://desertcompass.example',
      country: 'Jordan',
      city: 'Amman',
      primaryColor: '#0F766E',
    });
    const contact = await upsertContact(adminTenant.companyId, {
      firstName: 'Marco',
      lastName: 'Conti',
      email: 'demo.multi.currency@demo.local',
      phone: '+390212345678',
      title: 'FIT Product Manager',
    });

    const quote = await prisma.quote.create({
      data: {
        clientCompanyId: adminTenant.companyId,
        contactId: contact.id,
        bookingType: 'FIT',
        title: TARGET_QUOTE_TITLE,
        description: 'Multi-currency Jordan QA quote covering Amman, Petra, and Wadi Rum with EUR quote pricing.',
        totalPrice: 0,
        quoteCurrency: 'EUR',
        status: 'DRAFT',
        adults: 4,
        children: 0,
        roomCount: 2,
        nightCount: 3,
        totalCost: 0,
        totalSell: 0,
        pricePerPax: 0,
        quoteNumber: TARGET_QUOTE_NUMBER,
        pricingType: 'simple',
        pricingMode: 'FIXED',
        fixedPricePerPerson: 0,
        inclusionsText:
          'Accommodation, airport and intercity transfers, Petra full-day visit, Wadi Rum jeep tour, and on-ground coordination.',
        exclusionsText:
          'International flights, visas, travel insurance, lunches, dinners unless mentioned, and personal expenses.',
        termsNotesText:
          'Targeted demo quote for multi-currency pricing QA. Rates remain subject to final availability and confirmation.',
        travelStartDate: new Date('2026-05-21T00:00:00.000Z'),
        validUntil: new Date('2026-05-10T23:59:59.999Z'),
        brandCompanyId: brandCompany.id,
      },
    });

    const itineraryDays = await createItineraryDays(quote.id, [
      {
        dayNumber: 1,
        title: 'Arrival in Amman',
        description: 'Arrival at Queen Alia International Airport, private transfer to Amman, and overnight stay.',
      },
      {
        dayNumber: 2,
        title: 'Petra Full-Day Visit',
        description: 'Private transfer to Petra with a full-day guided visit and overnight stay.',
      },
      {
        dayNumber: 3,
        title: 'Petra to Wadi Rum',
        description: 'Transfer to Wadi Rum, jeep tour through the desert, and overnight camp stay.',
      },
      {
        dayNumber: 4,
        title: 'Departure',
        description: 'Private departure transfer from Wadi Rum to Queen Alia International Airport.',
      },
    ]);
    const itineraryByDay = new Map(itineraryDays.map((day) => [day.dayNumber, day]));

    const arrivalVehicleRate = await prisma.vehicleRate.findFirstOrThrow({
      where: {
        routeId: routes[normalizeKey('Queen Alia International Airport - Amman City Center')].id,
        serviceTypeId: arrivalTransferType.id,
        vehicleId: vehicle.id,
        minPax: { lte: 4 },
        maxPax: { gte: 4 },
      },
    });
    const ammanPetraVehicleRate = await prisma.vehicleRate.findFirstOrThrow({
      where: {
        routeId: routes[normalizeKey('Amman City Center - Petra Visitor Center')].id,
        serviceTypeId: intercityTransferType.id,
        vehicleId: vehicle.id,
        minPax: { lte: 4 },
        maxPax: { gte: 4 },
      },
    });
    const petraWadiVehicleRate = await prisma.vehicleRate.findFirstOrThrow({
      where: {
        routeId: routes[normalizeKey('Petra Visitor Center - Wadi Rum Camp Area')].id,
        serviceTypeId: intercityTransferType.id,
        vehicleId: vehicle.id,
        minPax: { lte: 4 },
        maxPax: { gte: 4 },
      },
    });
    const departureVehicleRate = await prisma.vehicleRate.findFirstOrThrow({
      where: {
        routeId: routes[normalizeKey('Wadi Rum Camp Area - Queen Alia International Airport')].id,
        serviceTypeId: departureTransferType.id,
        vehicleId: vehicle.id,
        minPax: { lte: 4 },
        maxPax: { gte: 4 },
      },
    });

    const createdItems = [];

    createdItems.push(
      await createQuoteItemRecord({
        quoteId: quote.id,
        itineraryId: itineraryByDay.get(1)!.id,
        service: {
          id: transportService.id,
          category: 'Transport',
          unitType: ServiceUnitType.per_vehicle,
        },
        quoteCurrency: 'EUR',
        quantity: 1,
        paxCount: 4,
        roomCount: 2,
        nightCount: 3,
        dayCount: 1,
        markupPercent: 18,
        appliedVehicleRateId: arrivalVehicleRate.id,
        routeId: routes[normalizeKey('Queen Alia International Airport - Amman City Center')].id,
        pricingDescription: buildPricingDescription({
          type: 'transport',
          transportLabel: 'Arrival Transfer',
          routeName: routes[normalizeKey('Queen Alia International Airport - Amman City Center')].name,
          vehicleName: vehicle.name,
        }),
        supplierPricing: {
          costBaseAmount: arrivalVehicleRate.price,
          costCurrency: arrivalVehicleRate.currency,
        },
        transportPricingMode: TransportPricingMode.per_vehicle,
      }),
    );

    createdItems.push(
      await createQuoteItemRecord({
        quoteId: quote.id,
        itineraryId: itineraryByDay.get(1)!.id,
        service: {
          id: accommodationService.id,
          category: 'Accommodation',
          unitType: ServiceUnitType.per_room,
        },
        quoteCurrency: 'EUR',
        quantity: 1,
        paxCount: 4,
        roomCount: 2,
        nightCount: 1,
        dayCount: 1,
        markupPercent: 16,
        hotelId: hotelContracts.get(normalizeKey('The House Boutique Suites Amman'))!.hotelId,
        contractId: hotelContracts.get(normalizeKey('The House Boutique Suites Amman'))!.contractId,
        seasonName: season.name,
        roomCategoryId: hotelContracts.get(normalizeKey('The House Boutique Suites Amman'))!.roomCategoryId,
        occupancyType: HotelOccupancyType.DBL,
        mealPlan: HotelMealPlan.BB,
        pricingDescription: buildPricingDescription({
          type: 'hotel',
          contractName: 'Jordan Multi-Currency Demo 2026',
          seasonName: season.name,
          roomCategoryName: 'Standard Room',
          occupancyType: 'DBL',
          mealPlan: 'BB',
        }),
        supplierPricing: {
          costBaseAmount: 118,
          costCurrency: 'JOD',
          salesTaxPercent: 16,
          salesTaxIncluded: true,
          serviceChargePercent: 10,
          serviceChargeIncluded: false,
          tourismFeeAmount: 7,
          tourismFeeCurrency: 'JOD',
          tourismFeeMode: 'PER_NIGHT_PER_PERSON',
        },
      }),
    );

    createdItems.push(
      await createQuoteItemRecord({
        quoteId: quote.id,
        itineraryId: itineraryByDay.get(2)!.id,
        service: {
          id: petraExperience.id,
          category: 'Sightseeing',
          unitType: ServiceUnitType.per_person,
        },
        quoteCurrency: 'EUR',
        quantity: 4,
        paxCount: 4,
        roomCount: 2,
        nightCount: 3,
        dayCount: 1,
        participantCount: 4,
        adultCount: 4,
        childCount: 0,
        serviceDate: new Date('2026-05-22T00:00:00.000Z'),
        startTime: '09:00',
        meetingPoint: 'Petra Visitor Center',
        markupPercent: 20,
        pricingDescription: buildPricingDescription({
          type: 'activity',
          serviceName: 'Petra Full-Day Guided Experience',
          meetingPoint: 'Petra Visitor Center',
        }),
        supplierPricing: {
          costBaseAmount: 92,
          costCurrency: 'EUR',
        },
      }),
    );

    createdItems.push(
      await createQuoteItemRecord({
        quoteId: quote.id,
        itineraryId: itineraryByDay.get(2)!.id,
        service: {
          id: transportService.id,
          category: 'Transport',
          unitType: ServiceUnitType.per_vehicle,
        },
        quoteCurrency: 'EUR',
        quantity: 1,
        paxCount: 4,
        roomCount: 2,
        nightCount: 3,
        dayCount: 1,
        markupPercent: 18,
        appliedVehicleRateId: ammanPetraVehicleRate.id,
        routeId: routes[normalizeKey('Amman City Center - Petra Visitor Center')].id,
        pricingDescription: buildPricingDescription({
          type: 'transport',
          transportLabel: 'Intercity Transfer',
          routeName: routes[normalizeKey('Amman City Center - Petra Visitor Center')].name,
          vehicleName: vehicle.name,
        }),
        supplierPricing: {
          costBaseAmount: ammanPetraVehicleRate.price,
          costCurrency: ammanPetraVehicleRate.currency,
        },
        transportPricingMode: TransportPricingMode.per_vehicle,
      }),
    );

    createdItems.push(
      await createQuoteItemRecord({
        quoteId: quote.id,
        itineraryId: itineraryByDay.get(2)!.id,
        service: {
          id: accommodationService.id,
          category: 'Accommodation',
          unitType: ServiceUnitType.per_room,
        },
        quoteCurrency: 'EUR',
        quantity: 1,
        paxCount: 4,
        roomCount: 2,
        nightCount: 1,
        dayCount: 1,
        markupPercent: 16,
        hotelId: hotelContracts.get(normalizeKey('Petra Moon Hotel'))!.hotelId,
        contractId: hotelContracts.get(normalizeKey('Petra Moon Hotel'))!.contractId,
        seasonName: season.name,
        roomCategoryId: hotelContracts.get(normalizeKey('Petra Moon Hotel'))!.roomCategoryId,
        occupancyType: HotelOccupancyType.DBL,
        mealPlan: HotelMealPlan.BB,
        pricingDescription: buildPricingDescription({
          type: 'hotel',
          contractName: 'Jordan Multi-Currency Demo 2026',
          seasonName: season.name,
          roomCategoryName: 'Standard Room',
          occupancyType: 'DBL',
          mealPlan: 'BB',
        }),
        supplierPricing: {
          costBaseAmount: 132,
          costCurrency: 'JOD',
          salesTaxPercent: 16,
          salesTaxIncluded: true,
          serviceChargePercent: 10,
          serviceChargeIncluded: false,
          tourismFeeAmount: 7,
          tourismFeeCurrency: 'JOD',
          tourismFeeMode: 'PER_NIGHT_PER_PERSON',
        },
      }),
    );

    createdItems.push(
      await createQuoteItemRecord({
        quoteId: quote.id,
        itineraryId: itineraryByDay.get(3)!.id,
        service: {
          id: wadiRumJeepSafari.id,
          category: 'Sightseeing',
          unitType: ServiceUnitType.per_person,
        },
        quoteCurrency: 'EUR',
        quantity: 4,
        paxCount: 4,
        roomCount: 2,
        nightCount: 3,
        dayCount: 1,
        participantCount: 4,
        adultCount: 4,
        childCount: 0,
        serviceDate: new Date('2026-05-23T00:00:00.000Z'),
        startTime: '16:30',
        meetingPoint: 'Wadi Rum Camp Area',
        markupPercent: 20,
        pricingDescription: buildPricingDescription({
          type: 'activity',
          serviceName: 'Wadi Rum Sunset Jeep Tour',
          meetingPoint: 'Wadi Rum Camp Area',
        }),
        supplierPricing: {
          costBaseAmount: 48,
          costCurrency: 'USD',
        },
      }),
    );

    createdItems.push(
      await createQuoteItemRecord({
        quoteId: quote.id,
        itineraryId: itineraryByDay.get(3)!.id,
        service: {
          id: transportService.id,
          category: 'Transport',
          unitType: ServiceUnitType.per_vehicle,
        },
        quoteCurrency: 'EUR',
        quantity: 1,
        paxCount: 4,
        roomCount: 2,
        nightCount: 3,
        dayCount: 1,
        markupPercent: 18,
        appliedVehicleRateId: petraWadiVehicleRate.id,
        routeId: routes[normalizeKey('Petra Visitor Center - Wadi Rum Camp Area')].id,
        pricingDescription: buildPricingDescription({
          type: 'transport',
          transportLabel: 'Intercity Transfer',
          routeName: routes[normalizeKey('Petra Visitor Center - Wadi Rum Camp Area')].name,
          vehicleName: vehicle.name,
        }),
        supplierPricing: {
          costBaseAmount: petraWadiVehicleRate.price,
          costCurrency: petraWadiVehicleRate.currency,
        },
        transportPricingMode: TransportPricingMode.per_vehicle,
      }),
    );

    createdItems.push(
      await createQuoteItemRecord({
        quoteId: quote.id,
        itineraryId: itineraryByDay.get(3)!.id,
        service: {
          id: accommodationService.id,
          category: 'Accommodation',
          unitType: ServiceUnitType.per_room,
        },
        quoteCurrency: 'EUR',
        quantity: 1,
        paxCount: 4,
        roomCount: 2,
        nightCount: 1,
        dayCount: 1,
        markupPercent: 16,
        hotelId: hotelContracts.get(normalizeKey('Sun City Camp Wadi Rum'))!.hotelId,
        contractId: hotelContracts.get(normalizeKey('Sun City Camp Wadi Rum'))!.contractId,
        seasonName: season.name,
        roomCategoryId: hotelContracts.get(normalizeKey('Sun City Camp Wadi Rum'))!.roomCategoryId,
        occupancyType: HotelOccupancyType.DBL,
        mealPlan: HotelMealPlan.BB,
        pricingDescription: buildPricingDescription({
          type: 'hotel',
          contractName: 'Jordan Multi-Currency Demo 2026',
          seasonName: season.name,
          roomCategoryName: 'Standard Tent',
          occupancyType: 'DBL',
          mealPlan: 'BB',
        }),
        supplierPricing: {
          costBaseAmount: 142,
          costCurrency: 'JOD',
          salesTaxPercent: 16,
          salesTaxIncluded: true,
          serviceChargePercent: 10,
          serviceChargeIncluded: false,
          tourismFeeAmount: 7,
          tourismFeeCurrency: 'JOD',
          tourismFeeMode: 'PER_NIGHT_PER_PERSON',
        },
      }),
    );

    createdItems.push(
      await createQuoteItemRecord({
        quoteId: quote.id,
        itineraryId: itineraryByDay.get(4)!.id,
        service: {
          id: transportService.id,
          category: 'Transport',
          unitType: ServiceUnitType.per_vehicle,
        },
        quoteCurrency: 'EUR',
        quantity: 1,
        paxCount: 4,
        roomCount: 2,
        nightCount: 3,
        dayCount: 1,
        markupPercent: 18,
        appliedVehicleRateId: departureVehicleRate.id,
        routeId: routes[normalizeKey('Wadi Rum Camp Area - Queen Alia International Airport')].id,
        pricingDescription: buildPricingDescription({
          type: 'transport',
          transportLabel: 'Departure Transfer',
          routeName: routes[normalizeKey('Wadi Rum Camp Area - Queen Alia International Airport')].name,
          vehicleName: vehicle.name,
        }),
        supplierPricing: {
          costBaseAmount: departureVehicleRate.price,
          costCurrency: departureVehicleRate.currency,
        },
        transportPricingMode: TransportPricingMode.per_vehicle,
      }),
    );

    await syncQuoteItineraryFromQuoteItems(quote.id);

    const totals = createdItems.reduce(
      (acc, item) => {
        acc.totalSell += item.totalSell;
        acc.totalCost += item.totalCost;
        return acc;
      },
      { totalSell: 0, totalCost: 0 },
    );

    const totalSell = Number(totals.totalSell.toFixed(2));
    const totalCost = Number(totals.totalCost.toFixed(2));
    const pricePerPax = Number((totalSell / 4).toFixed(2));

    await prisma.quote.update({
      where: { id: quote.id },
      data: {
        totalSell,
        totalCost,
        totalPrice: totalSell,
        pricePerPax,
        fixedPricePerPerson: pricePerPax,
      },
    });

    console.log(`quote ${mode}`);
    console.log(`items created: ${createdItems.length}`);

    const finalQuote = await prisma.quote.findUniqueOrThrow({
      where: { id: quote.id },
      select: {
        quoteNumber: true,
        totalSell: true,
        totalCost: true,
        quoteItems: {
          select: {
            id: true,
          },
        },
      },
    });

    console.log(`quoteNumber: ${finalQuote.quoteNumber || TARGET_QUOTE_NUMBER}`);
    console.log(`totalSell: ${finalQuote.totalSell.toFixed(2)}`);
    console.log(`totalCost: ${finalQuote.totalCost.toFixed(2)}`);
    console.log(`itemCount: ${finalQuote.quoteItems.length}`);
    console.log('done');
  } catch (error) {
    exitCode = 1;
    console.error('demo quote seed failed');
    console.error(error);
  } finally {
    await prisma.$disconnect();
    if (exitCode === 0) {
      process.exit(0);
    }
    process.exit(1);
  }
}

void seedTargetDemoQuote();

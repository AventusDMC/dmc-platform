import {
  ChildPolicyChargeBasis,
  HotelCancellationDeadlineUnit,
  HotelCancellationPenaltyType,
  HotelContractChargeBasis,
  HotelContractSupplementType,
  HotelMealPlan,
  HotelOccupancyType,
  HotelRatePricingMode,
  Prisma,
  PrismaClient,
} from '@prisma/client';

const prisma = new PrismaClient();

const CONTRACT_NAME = 'Grand Hyatt Amman 2026';
const SEASON_NAME = 'Grand Hyatt Amman 2026 Full Year';
const HOTEL_NAME = 'Grand Hyatt Amman';
const CITY_NAME = 'Amman';
const COUNTRY_NAME = 'Jordan';
const HOTEL_CATEGORY = '5 Star';
const SUPPLIER_TYPE = 'hotel';
const CURRENCY = 'JOD';
const SALES_TAX_PERCENT = 8;
const SERVICE_CHARGE_PERCENT = 5;
const VALID_FROM = new Date('2026-01-01T00:00:00.000Z');
const VALID_TO = new Date('2026-12-31T23:59:59.999Z');

const roomRates = [
  { name: 'Grand Room', code: 'GRAND', single: 85, double: 95 },
  { name: 'Deluxe Room', code: 'DLX', single: 110, double: 120 },
  { name: 'Grand Club', code: 'GCLB', single: 115, double: 125 },
  { name: 'Grand Suite', code: 'GSUI', single: 175, double: 185 },
] as const;

type DbClient = Prisma.TransactionClient;

async function main() {
  await prisma.$connect();

  try {
    const summary = await prisma.$transaction(
      async (tx) => {
        const city = await findOrCreateCity(tx);
        const hotelCategory = await findOrCreateHotelCategory(tx);
        const supplier = await findOrCreateSupplier(tx);
        const hotel = await findOrCreateHotel(tx, supplier.id, city.id, hotelCategory.id);
        const contract = await findOrCreateContract(tx, hotel.id);
        const season = await tx.season.upsert({
          where: { name: SEASON_NAME },
          update: { name: SEASON_NAME },
          create: { name: SEASON_NAME },
        });

        const roomCategoryMap = new Map<string, string>();
        for (const room of roomRates) {
          const category = await upsertRoomCategory(tx, hotel.id, room.name, room.code);
          roomCategoryMap.set(room.name, category.id);
        }

        await syncMealPlans(tx, contract.id);
        await syncRates(tx, contract.id, season.id, roomCategoryMap);
        await syncSupplements(tx, contract.id);
        await syncCancellationPolicy(tx, contract.id);
        await syncChildPolicy(tx, contract.id);

        return {
          supplier: supplier.name,
          hotel: hotel.name,
          contract: contract.name,
          season: season.name,
          roomCount: roomCategoryMap.size,
        };
      },
      {
        timeout: 30000,
        maxWait: 10000,
      },
    );

    console.log('Grand Hyatt Amman 2026 contract import complete.');
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

async function findOrCreateCity(tx: DbClient) {
  const existing = await tx.city.findFirst({
    where: {
      name: { equals: CITY_NAME, mode: 'insensitive' },
    },
  });

  if (existing) {
    return tx.city.update({
      where: { id: existing.id },
      data: {
        name: CITY_NAME,
        country: COUNTRY_NAME,
        latitude: 31.9539,
        longitude: 35.9106,
        isActive: true,
      },
    });
  }

  return tx.city.create({
    data: {
      name: CITY_NAME,
      country: COUNTRY_NAME,
      latitude: 31.9539,
      longitude: 35.9106,
      isActive: true,
    },
  });
}

async function findOrCreateHotelCategory(tx: DbClient) {
  const existing = await tx.hotelCategory.findFirst({
    where: {
      name: { equals: HOTEL_CATEGORY, mode: 'insensitive' },
    },
  });

  if (existing) {
    return tx.hotelCategory.update({
      where: { id: existing.id },
      data: {
        name: HOTEL_CATEGORY,
        isActive: true,
      },
    });
  }

  return tx.hotelCategory.create({
    data: {
      name: HOTEL_CATEGORY,
      isActive: true,
    },
  });
}

async function findOrCreateSupplier(tx: DbClient) {
  const existing = await tx.supplier.findFirst({
    where: {
      name: { equals: HOTEL_NAME, mode: 'insensitive' },
    },
  });

  const data = {
    name: HOTEL_NAME,
    type: SUPPLIER_TYPE,
    notes:
      'Imported from the Grand Hyatt Amman 2026 contract. Rates are BB and exclude 8% tax plus 5% service charge unless stated otherwise.',
  };

  if (existing) {
    return tx.supplier.update({
      where: { id: existing.id },
      data,
    });
  }

  return tx.supplier.create({ data });
}

async function findOrCreateHotel(
  tx: DbClient,
  supplierId: string,
  cityId: string,
  hotelCategoryId: string,
) {
  const existing = await tx.hotel.findFirst({
    where: {
      name: { equals: HOTEL_NAME, mode: 'insensitive' },
    },
  });

  const data = {
    name: HOTEL_NAME,
    city: CITY_NAME,
    cityId,
    category: HOTEL_CATEGORY,
    hotelCategoryId,
    supplierId,
  };

  if (existing) {
    return tx.hotel.update({
      where: { id: existing.id },
      data,
    });
  }

  return tx.hotel.create({ data });
}

async function findOrCreateContract(tx: DbClient, hotelId: string) {
  const existing = await tx.hotelContract.findFirst({
    where: {
      hotelId,
      name: { equals: CONTRACT_NAME, mode: 'insensitive' },
    },
  });

  const data = {
    hotelId,
    name: CONTRACT_NAME,
    validFrom: VALID_FROM,
    validTo: VALID_TO,
    currency: CURRENCY,
  };

  if (existing) {
    return tx.hotelContract.update({
      where: { id: existing.id },
      data,
    });
  }

  return tx.hotelContract.create({ data });
}

async function upsertRoomCategory(
  tx: DbClient,
  hotelId: string,
  name: string,
  code: string,
) {
  const existing = await tx.hotelRoomCategory.findFirst({
    where: {
      hotelId,
      name: { equals: name, mode: 'insensitive' },
    },
  });

  const description = `${name} imported from the ${CONTRACT_NAME} BB contract.`;
  const data = {
    hotelId,
    name,
    code,
    description,
    isActive: true,
  };

  if (existing) {
    return tx.hotelRoomCategory.update({
      where: { id: existing.id },
      data,
    });
  }

  return tx.hotelRoomCategory.create({ data });
}

async function syncMealPlans(tx: DbClient, contractId: string) {
  const mealPlans = [
    {
      code: HotelMealPlan.BB,
      isDefault: true,
      notes: 'Contracted room rates are bed and breakfast.',
    },
    {
      code: HotelMealPlan.HB,
      isDefault: false,
      notes:
        'Optional meal supplement stored as half-board proxy because the schema requires a concrete meal-plan code.',
    },
  ] as const;

  for (const mealPlan of mealPlans) {
    await tx.hotelContractMealPlan.upsert({
      where: {
        hotelContractId_code: {
          hotelContractId: contractId,
          code: mealPlan.code,
        },
      },
      update: {
        isDefault: mealPlan.isDefault,
        isActive: true,
        notes: mealPlan.notes,
      },
      create: {
        hotelContractId: contractId,
        code: mealPlan.code,
        isDefault: mealPlan.isDefault,
        isActive: true,
        notes: mealPlan.notes,
      },
    });
  }
}

async function syncRates(
  tx: DbClient,
  contractId: string,
  seasonId: string,
  roomCategoryMap: Map<string, string>,
) {
  for (const room of roomRates) {
    const roomCategoryId = roomCategoryMap.get(room.name);
    if (!roomCategoryId) {
      throw new Error(`Missing room category for ${room.name}`);
    }

    const entries = [
      { occupancyType: HotelOccupancyType.SGL, cost: room.single },
      { occupancyType: HotelOccupancyType.DBL, cost: room.double },
    ] as const;

    for (const entry of entries) {
      const existing = await tx.hotelRate.findFirst({
        where: {
          contractId,
          seasonName: SEASON_NAME,
          roomCategoryId,
          occupancyType: entry.occupancyType,
          mealPlan: HotelMealPlan.BB,
        },
      });

      const data = {
        contractId,
        seasonId,
        seasonName: SEASON_NAME,
        roomCategoryId,
        occupancyType: entry.occupancyType,
        mealPlan: HotelMealPlan.BB,
        pricingMode: HotelRatePricingMode.PER_ROOM_PER_NIGHT,
        currency: CURRENCY,
        cost: entry.cost,
        costBaseAmount: entry.cost,
        costCurrency: CURRENCY,
        salesTaxPercent: SALES_TAX_PERCENT,
        salesTaxIncluded: false,
        serviceChargePercent: SERVICE_CHARGE_PERCENT,
        serviceChargeIncluded: false,
      };

      if (existing) {
        await tx.hotelRate.update({
          where: { id: existing.id },
          data,
        });
      } else {
        await tx.hotelRate.create({ data });
      }
    }
  }
}

async function syncSupplements(tx: DbClient, contractId: string) {
  await tx.hotelContractSupplement.deleteMany({
    where: { hotelContractId: contractId },
  });

  const notesSuffix = 'Amounts are exclusive of 8% tax and 5% service charge.';
  await tx.hotelContractSupplement.createMany({
    data: [
      {
        hotelContractId: contractId,
        roomCategoryId: null,
        type: HotelContractSupplementType.EXTRA_BED,
        chargeBasis: HotelContractChargeBasis.PER_NIGHT,
        amount: 20,
        currency: CURRENCY,
        isMandatory: false,
        isActive: true,
        notes: `Extra adult room-only supplement. ${notesSuffix}`,
      },
      {
        hotelContractId: contractId,
        roomCategoryId: null,
        type: HotelContractSupplementType.EXTRA_BREAKFAST,
        chargeBasis: HotelContractChargeBasis.PER_NIGHT,
        amount: 10,
        currency: CURRENCY,
        isMandatory: false,
        isActive: true,
        notes: `Breakfast add-on component to reach the 30 JOD BB extra-adult supplement. ${notesSuffix}`,
      },
      {
        hotelContractId: contractId,
        roomCategoryId: null,
        type: HotelContractSupplementType.EXTRA_DINNER,
        chargeBasis: HotelContractChargeBasis.PER_PERSON,
        amount: 17,
        currency: CURRENCY,
        isMandatory: false,
        isActive: true,
        notes:
          `Optional meal supplement. Children aged 6-12 receive 50% off; children below 6 are free. ${notesSuffix}`,
      },
    ],
  });
}

async function syncCancellationPolicy(tx: DbClient, contractId: string) {
  const existingPolicy = await tx.hotelContractCancellationPolicy.findUnique({
    where: { hotelContractId: contractId },
  });

  if (existingPolicy) {
    await tx.hotelContractCancellationRule.deleteMany({
      where: {
        cancellationPolicyId: existingPolicy.id,
      },
    });
  }

  await tx.hotelContractCancellationPolicy.upsert({
    where: { hotelContractId: contractId },
    update: {
      summary:
        'One night is charged for cancellations made within 2 days prior to arrival by 12 PM Jordan time. No-show is charged at 100% of the entire stay.',
      notes: 'Deadline reference is 12 PM Jordan time.',
      noShowPenaltyType: HotelCancellationPenaltyType.FULL_STAY,
      noShowPenaltyValue: null,
      rules: {
        create: [
          {
            windowFromValue: 2,
            windowToValue: 0,
            deadlineUnit: HotelCancellationDeadlineUnit.DAYS,
            penaltyType: HotelCancellationPenaltyType.NIGHTS,
            penaltyValue: 1,
            isActive: true,
            notes: 'Charge one night when cancelled 2 days prior by 12 PM Jordan time.',
          },
        ],
      },
    },
    create: {
      hotelContractId: contractId,
      summary:
        'One night is charged for cancellations made within 2 days prior to arrival by 12 PM Jordan time. No-show is charged at 100% of the entire stay.',
      notes: 'Deadline reference is 12 PM Jordan time.',
      noShowPenaltyType: HotelCancellationPenaltyType.FULL_STAY,
      noShowPenaltyValue: null,
      rules: {
        create: [
          {
            windowFromValue: 2,
            windowToValue: 0,
            deadlineUnit: HotelCancellationDeadlineUnit.DAYS,
            penaltyType: HotelCancellationPenaltyType.NIGHTS,
            penaltyValue: 1,
            isActive: true,
            notes: 'Charge one night when cancelled 2 days prior by 12 PM Jordan time.',
          },
        ],
      },
    },
  });
}

async function syncChildPolicy(tx: DbClient, contractId: string) {
  const existingPolicy = await tx.hotelContractChildPolicy.findUnique({
    where: { hotelContractId: contractId },
  });

  if (existingPolicy) {
    await tx.hotelContractChildPolicyBand.deleteMany({
      where: {
        childPolicyId: existingPolicy.id,
      },
    });
  }

  await tx.hotelContractChildPolicy.upsert({
    where: { hotelContractId: contractId },
    update: {
      infantMaxAge: 5,
      childMaxAge: 12,
      notes:
        'Children below 6 are free. Optional meal supplements for ages 6-12 are charged at 50% of the adult amount.',
      bands: {
        create: [
          {
            label: 'Child Below 6',
            minAge: 0,
            maxAge: 5,
            chargeBasis: ChildPolicyChargeBasis.FREE,
            chargeValue: null,
            isActive: true,
            notes: 'Child stays free below 6 years old.',
          },
          {
            label: 'Child 6-12 Meal Discount',
            minAge: 6,
            maxAge: 12,
            chargeBasis: ChildPolicyChargeBasis.PERCENT_OF_ADULT,
            chargeValue: 50,
            isActive: true,
            notes: 'Used for optional meal supplements when applicable.',
          },
        ],
      },
    },
    create: {
      hotelContractId: contractId,
      infantMaxAge: 5,
      childMaxAge: 12,
      notes:
        'Children below 6 are free. Optional meal supplements for ages 6-12 are charged at 50% of the adult amount.',
      bands: {
        create: [
          {
            label: 'Child Below 6',
            minAge: 0,
            maxAge: 5,
            chargeBasis: ChildPolicyChargeBasis.FREE,
            chargeValue: null,
            isActive: true,
            notes: 'Child stays free below 6 years old.',
          },
          {
            label: 'Child 6-12 Meal Discount',
            minAge: 6,
            maxAge: 12,
            chargeBasis: ChildPolicyChargeBasis.PERCENT_OF_ADULT,
            chargeValue: 50,
            isActive: true,
            notes: 'Used for optional meal supplements when applicable.',
          },
        ],
      },
    },
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(message);
  process.exit(1);
});

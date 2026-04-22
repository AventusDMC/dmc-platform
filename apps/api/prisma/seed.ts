import { HotelMealPlan, HotelOccupancyType, QuoteOptionPricingMode, QuoteStatus, ServiceUnitType, TransportPricingMode } from '@prisma/client';
import { AuthService } from '../src/auth/auth.service';
import { InvoicesService } from '../src/invoices/invoices.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { PromotionsService } from '../src/promotions/promotions.service';
import { ItinerariesService } from '../src/itineraries/itineraries.service';
import { QuotePricingService } from '../src/quotes/quote-pricing.service';
import { QuotesService } from '../src/quotes/quotes.service';
import { TransportPricingService } from '../src/transport-pricing/transport-pricing.service';

const DEMO_PREFIX = 'Demo ';
const DEMO_BRAND_COMPANY = 'Demo Brand - Desert Compass Jordan';
const DEMO_ACCEPTED_QUOTE_TITLE = 'Demo FIT Quote - Accepted Booking';
const DEMO_SENT_QUOTE_TITLE = 'Demo FIT Quote - Sent Portal';
const DEMO_GROUP_QUOTE_TITLE = 'Demo Group Quote - Jordan Highlights';
const DEMO_REVISION_QUOTE_TITLE = 'Demo FIT Quote - Revision Requested';

type NamedRecord = {
  id: string;
  name: string;
};

type RouteRecord = NamedRecord & {
  fromPlaceId: string;
  toPlaceId: string;
};

async function main() {
  const flags = new Set(process.argv.slice(2));
  const resetOnly = flags.has('--reset-demo');
  const prisma = new PrismaService();
  await prisma.$connect();

  const transportPricingService = new TransportPricingService(prisma);
  const promotionsService = new PromotionsService(prisma);
  const quotePricingService = new QuotePricingService();
  const quotesService = new QuotesService(prisma, transportPricingService, promotionsService, quotePricingService);
  const itinerariesService = new ItinerariesService(prisma);
  const authService = new AuthService(prisma);
  const invoicesService = new InvoicesService(prisma);

  try {
    await seedRolesAndUsers(prisma, authService);
    const serviceTypes = await seedServiceTypes(prisma);
    const hotelCategories = await seedHotelCategories(prisma);
    const cities = await seedCities(prisma);
    const placeTypes = await seedPlaceTypes(prisma);
    const places = await seedPlaces(prisma, cities, placeTypes);
    const suppliers = await seedSuppliers(prisma);
    const services = await seedSupplierServices(prisma, suppliers, serviceTypes);
    const transportServiceTypes = await seedTransportServiceTypes(prisma);
    const vehicles = await seedVehicles(prisma, suppliers);
    const routes = await seedRoutes(prisma, places);
    await seedTransportPricingRules(prisma, routes, transportServiceTypes, vehicles);
    await seedVehicleRates(prisma, routes, transportServiceTypes, vehicles);
    const seasons = await seedSeasons(prisma);
    const hotels = await seedHotels(prisma, suppliers, cities, hotelCategories);
    const roomCategories = await seedHotelRoomCategories(prisma, hotels);
    const contracts = await seedHotelContracts(prisma, hotels);
    await seedHotelRates(prisma, hotels, contracts, roomCategories, seasons);
    await seedHotelContractConfigurations(prisma, hotels, contracts, roomCategories);
    await seedSupportTextTemplates(prisma);
    await seedQuoteBlocks(prisma, services, serviceTypes);
    await resetDemoScenarioData(prisma);

    if (resetOnly) {
      console.log('Demo scenario data reset complete.');
      return;
    }

    const scenarios = await seedDemoScenarios(
      prisma,
      quotesService,
      itinerariesService,
      invoicesService,
      hotels,
      roomCategories,
      contracts,
      services,
      routes,
      transportServiceTypes,
      seasons,
      suppliers,
    );

    console.log('Demo seed complete');
    for (const scenario of scenarios) {
      console.log(`${scenario.label}: ${scenario.summary}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function seedRolesAndUsers(prisma: PrismaService, authService: AuthService) {
  const roles = await Promise.all(
    [
      { name: 'admin', description: 'Platform administrators with full access.' },
      { name: 'sales', description: 'Commercial users managing quotes and pricing.' },
      { name: 'operations', description: 'Operations users managing bookings and workflow actions.' },
      { name: 'finance', description: 'Finance users managing rates and transport pricing.' },
    ].map((role) =>
      prisma.role.upsert({
        where: { name: role.name },
        update: role,
        create: role,
      }),
    ),
  );

  const roleMap = new Map(roles.map((role) => [role.name, role.id]));
  const users = [
    {
      email: 'admin@dmc.local',
      firstName: 'Admin',
      lastName: 'User',
      password: 'admin123',
      role: 'admin',
    },
    {
      email: 'sales@dmc.local',
      firstName: 'Sales',
      lastName: 'User',
      password: 'sales123',
      role: 'sales',
    },
    {
      email: 'operations@dmc.local',
      firstName: 'Operations',
      lastName: 'User',
      password: 'ops123',
      role: 'operations',
    },
    {
      email: 'finance@dmc.local',
      firstName: 'Finance',
      lastName: 'User',
      password: 'finance123',
      role: 'finance',
    },
  ] as const;

  for (const user of users) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {
        firstName: user.firstName,
        lastName: user.lastName,
        password: authService.hashPassword(user.password),
        roleId: roleMap.get(user.role)!,
      },
      create: {
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        password: authService.hashPassword(user.password),
        roleId: roleMap.get(user.role)!,
      },
    });
  }
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase();
}

async function findOrCreateByName<T extends NamedRecord>(
  findOne: (name: string) => Promise<T | null>,
  create: (name: string) => Promise<T>,
  name: string,
) {
  const existing = await findOne(name);
  if (existing) {
    return existing;
  }

  return create(name);
}

async function seedServiceTypes(prisma: PrismaService) {
  const entries = [
    { name: 'Accommodation', code: 'HOTEL' },
    { name: 'Transport', code: 'TRANSPORT' },
    { name: 'Sightseeing', code: 'ACTIVITY' },
    { name: 'Guiding', code: 'GUIDE' },
    { name: 'Dining', code: 'MEAL' },
    { name: 'Meet And Assist', code: 'MEET' },
  ];

  const records = await Promise.all(
    entries.map(async (entry) => {
      const existing = await prisma.serviceType.findFirst({
        where: {
          OR: [
            { name: { equals: entry.name, mode: 'insensitive' } },
            { code: { equals: entry.code, mode: 'insensitive' } },
          ],
        },
      });

      if (existing) {
        return prisma.serviceType.update({
          where: { id: existing.id },
          data: {
            name: entry.name,
            code: entry.code,
            isActive: true,
          },
        });
      }

      return prisma.serviceType.create({
        data: {
          name: entry.name,
          code: entry.code,
          isActive: true,
        },
      });
    }),
  );

  return toRecordMap(records);
}

async function seedHotelCategories(prisma: PrismaService) {
  const entries = ['4 Star', '5 Star', 'Desert Camp'];

  const records = await Promise.all(
    entries.map((name) =>
      findOrCreateByName(
        (currentName) =>
          prisma.hotelCategory.findFirst({
            where: {
              name: {
                equals: currentName,
                mode: 'insensitive',
              },
            },
          }),
        (currentName) =>
          prisma.hotelCategory.create({
            data: {
              name: currentName,
              isActive: true,
            },
          }),
        name,
      ),
    ),
  );

  return toRecordMap(records);
}

async function seedCities(prisma: PrismaService) {
  const entries = ['Amman', 'Dead Sea', 'Petra', 'Wadi Rum', 'Aqaba', 'Jerash'];

  const records = await Promise.all(
    entries.map((name) =>
      findOrCreateByName(
        (currentName) =>
          prisma.city.findFirst({
            where: {
              name: {
                equals: currentName,
                mode: 'insensitive',
              },
            },
          }),
        (currentName) =>
          prisma.city.create({
            data: {
              name: currentName,
              country: 'Jordan',
              isActive: true,
            },
          }),
        name,
      ),
    ),
  );

  return toRecordMap(records);
}

async function seedPlaceTypes(prisma: PrismaService) {
  const entries = ['Airport', 'City Center', 'Hotel Area', 'Archaeological Site', 'Visitor Center', 'Desert Camp', 'Beach'];

  const records = await Promise.all(
    entries.map((name) =>
      findOrCreateByName(
        (currentName) =>
          prisma.placeType.findFirst({
            where: {
              name: {
                equals: currentName,
                mode: 'insensitive',
              },
            },
          }),
        (currentName) =>
          prisma.placeType.create({
            data: {
              name: currentName,
              isActive: true,
            },
          }),
        name,
      ),
    ),
  );

  return toRecordMap(records);
}

async function seedPlaces(
  prisma: PrismaService,
  cities: Record<string, NamedRecord>,
  placeTypes: Record<string, NamedRecord>,
) {
  const entries = [
    { name: 'Queen Alia International Airport', city: 'Amman', type: 'Airport' },
    { name: 'Amman City Center', city: 'Amman', type: 'City Center' },
    { name: 'Jerash Archaeological Site', city: 'Jerash', type: 'Archaeological Site' },
    { name: 'Dead Sea Resort Area', city: 'Dead Sea', type: 'Hotel Area' },
    { name: 'Petra Visitor Center', city: 'Petra', type: 'Visitor Center' },
    { name: 'Wadi Rum Camp Area', city: 'Wadi Rum', type: 'Desert Camp' },
    { name: 'King Hussein International Airport', city: 'Aqaba', type: 'Airport' },
    { name: 'Aqaba City Center', city: 'Aqaba', type: 'City Center' },
    { name: 'Aqaba South Beach', city: 'Aqaba', type: 'Beach' },
  ];

  const records = await Promise.all(
    entries.map(async (entry) => {
      const city = cities[normalizeKey(entry.city)];
      const placeType = placeTypes[normalizeKey(entry.type)];
      const existing = await prisma.place.findFirst({
        where: {
          name: { equals: entry.name, mode: 'insensitive' },
          cityId: city.id,
        },
      });

      if (existing) {
        return prisma.place.update({
          where: { id: existing.id },
          data: {
            type: entry.type,
            city: entry.city,
            country: 'Jordan',
            isActive: true,
            cityId: city.id,
            placeTypeId: placeType.id,
          },
        });
      }

      return prisma.place.create({
        data: {
          name: entry.name,
          type: entry.type,
          city: entry.city,
          country: 'Jordan',
          isActive: true,
          cityId: city.id,
          placeTypeId: placeType.id,
        },
      });
    }),
  );

  return toRecordMap(records);
}

async function seedSuppliers(prisma: PrismaService) {
  const entries = [
    { name: 'Desert Compass Transport', type: 'transport', email: 'ops.transport@desertcompass.jo', phone: '+96265501001', notes: 'Jordan-wide private transfers and touring vehicles.' },
    { name: 'Desert Compass Guides', type: 'guide', email: 'guides@desertcompass.jo', phone: '+96265501002', notes: 'Licensed Jordan guides for FIT and small groups.' },
    { name: 'Desert Compass Experiences', type: 'activity', email: 'experiences@desertcompass.jo', phone: '+96265501003', notes: 'Sightseeing, desert activities, and site arrangements.' },
    { name: 'The House Boutique Suites Amman', type: 'hotel', email: 'contracts@houseamman.jo', phone: '+96265502001', notes: 'Amman contracted hotel placeholder.' },
    { name: 'Dead Sea Spa Hotel', type: 'hotel', email: 'contracts@deadseaspa.jo', phone: '+96265502002', notes: 'Dead Sea contracted hotel placeholder.' },
    { name: 'Petra Moon Hotel', type: 'hotel', email: 'contracts@petramoon.jo', phone: '+96265502003', notes: 'Petra contracted hotel placeholder.' },
    { name: 'Sun City Camp Wadi Rum', type: 'hotel', email: 'contracts@suncitywadi.jo', phone: '+96265502004', notes: 'Wadi Rum camp contracted hotel placeholder.' },
    { name: 'DoubleTree by Hilton Aqaba', type: 'hotel', email: 'contracts@doubletreeaqaba.jo', phone: '+96265502005', notes: 'Aqaba contracted hotel placeholder.' },
    { name: 'Olive Branch Hotel Jerash', type: 'hotel', email: 'contracts@olivebranchjerash.jo', phone: '+96265502006', notes: 'Jerash contracted hotel placeholder.' },
    { name: 'Jordanian Table Catering', type: 'other', email: 'sales@jordaniantable.jo', phone: '+96265501004', notes: 'Dining and special meal arrangements.' },
  ] as const;

  const records = await Promise.all(
    entries.map(async (entry) => {
      const existing = await prisma.supplier.findFirst({
        where: {
          name: { equals: entry.name, mode: 'insensitive' },
        },
      });

      if (existing) {
        return prisma.supplier.update({
          where: { id: existing.id },
          data: entry,
        });
      }

      return prisma.supplier.create({
        data: entry,
      });
    }),
  );

  return toRecordMap(records);
}

async function seedSupplierServices(
  prisma: PrismaService,
  suppliers: Record<string, NamedRecord>,
  serviceTypes: Record<string, NamedRecord>,
) {
  const entries = [
    {
      supplier: 'The House Boutique Suites Amman',
      name: 'Jordan Contracted Hotel Night',
      serviceType: 'Accommodation',
      unitType: ServiceUnitType.per_room,
      baseCost: 0,
      currency: 'USD',
    },
    {
      supplier: 'Desert Compass Transport',
      name: 'Jordan Private Transfer Service',
      serviceType: 'Transport',
      unitType: ServiceUnitType.per_vehicle,
      baseCost: 0,
      currency: 'USD',
    },
    {
      supplier: 'Desert Compass Guides',
      name: 'Licensed Jordan Guide Service',
      serviceType: 'Guiding',
      unitType: ServiceUnitType.per_day,
      baseCost: 120,
      currency: 'USD',
    },
    {
      supplier: 'Desert Compass Experiences',
      name: 'Petra Entrance And Guided Visit',
      serviceType: 'Sightseeing',
      unitType: ServiceUnitType.per_person,
      baseCost: 65,
      currency: 'USD',
    },
    {
      supplier: 'Desert Compass Experiences',
      name: 'Wadi Rum 2-Hour Jeep Safari',
      serviceType: 'Sightseeing',
      unitType: ServiceUnitType.per_person,
      baseCost: 45,
      currency: 'USD',
    },
    {
      supplier: 'Desert Compass Experiences',
      name: 'Jerash And Amman Touring',
      serviceType: 'Sightseeing',
      unitType: ServiceUnitType.per_person,
      baseCost: 38,
      currency: 'USD',
    },
    {
      supplier: 'Jordanian Table Catering',
      name: 'Traditional Jordanian Dinner',
      serviceType: 'Dining',
      unitType: ServiceUnitType.per_person,
      baseCost: 24,
      currency: 'USD',
    },
    {
      supplier: 'Desert Compass Transport',
      name: 'Airport Meet And Assist',
      serviceType: 'Meet And Assist',
      unitType: ServiceUnitType.per_group,
      baseCost: 35,
      currency: 'USD',
    },
  ] as const;

  const records = await Promise.all(
    entries.map(async (entry) => {
      const supplier = suppliers[normalizeKey(entry.supplier)];
      const serviceType = serviceTypes[normalizeKey(entry.serviceType)];
      const existing = await prisma.supplierService.findFirst({
        where: {
          supplierId: supplier.id,
          name: { equals: entry.name, mode: 'insensitive' },
        },
      });

      const data = {
        supplierId: supplier.id,
        name: entry.name,
        category: entry.serviceType,
        serviceTypeId: serviceType.id,
        unitType: entry.unitType,
        baseCost: entry.baseCost,
        currency: entry.currency,
      };

      if (existing) {
        return prisma.supplierService.update({
          where: { id: existing.id },
          data,
        });
      }

      return prisma.supplierService.create({ data });
    }),
  );

  return toRecordMap(records);
}

async function seedTransportServiceTypes(prisma: PrismaService) {
  const entries = [
    { name: 'Arrival Transfer', code: 'ARR' },
    { name: 'Departure Transfer', code: 'DEP' },
    { name: 'Intercity Transfer', code: 'INT' },
    { name: 'Excursion Transfer', code: 'EXC' },
  ];

  const records = await Promise.all(
    entries.map(async (entry) => {
      const existing = await prisma.transportServiceType.findFirst({
        where: {
          OR: [
            { name: { equals: entry.name, mode: 'insensitive' } },
            { code: { equals: entry.code, mode: 'insensitive' } },
          ],
        },
      });

      if (existing) {
        return prisma.transportServiceType.update({
          where: { id: existing.id },
          data: entry,
        });
      }

      return prisma.transportServiceType.create({ data: entry });
    }),
  );

  return toRecordMap(records);
}

async function seedVehicles(prisma: PrismaService, suppliers: Record<string, NamedRecord>) {
  const transportSupplier = suppliers[normalizeKey('Desert Compass Transport')];
  const entries = [
    { name: 'Toyota Camry Sedan', maxPax: 2, luggageCapacity: 3 },
    { name: 'Hyundai H1 Minivan', maxPax: 5, luggageCapacity: 7 },
    { name: 'Toyota Coaster Mini Coach', maxPax: 14, luggageCapacity: 16 },
  ];

  const records = await Promise.all(
    entries.map(async (entry) => {
      const existing = await prisma.vehicle.findFirst({
        where: {
          supplierId: transportSupplier.id,
          name: { equals: entry.name, mode: 'insensitive' },
        },
      });

      if (existing) {
        return prisma.vehicle.update({
          where: { id: existing.id },
          data: {
            supplierId: transportSupplier.id,
            ...entry,
          },
        });
      }

      return prisma.vehicle.create({
        data: {
          supplierId: transportSupplier.id,
          ...entry,
        },
      });
    }),
  );

  return toRecordMap(records);
}

async function seedRoutes(prisma: PrismaService, places: Record<string, NamedRecord>) {
  const entries = [
    ['Queen Alia International Airport', 'Amman City Center', 45, 35],
    ['Amman City Center', 'Jerash Archaeological Site', 60, 50],
    ['Jerash Archaeological Site', 'Amman City Center', 60, 50],
    ['Amman City Center', 'Petra Visitor Center', 210, 235],
    ['Petra Visitor Center', 'Wadi Rum Camp Area', 120, 110],
    ['Wadi Rum Camp Area', 'Aqaba City Center', 75, 70],
    ['Aqaba City Center', 'Dead Sea Resort Area', 210, 275],
    ['Dead Sea Resort Area', 'Queen Alia International Airport', 55, 50],
    ['King Hussein International Airport', 'Aqaba City Center', 20, 12],
  ] as const;

  const records = await Promise.all(
    entries.map(async ([fromName, toName, durationMinutes, distanceKm]) => {
      const fromPlace = places[normalizeKey(fromName)];
      const toPlace = places[normalizeKey(toName)];
      const routeName = `${fromName} - ${toName}`;
      const existing = await prisma.route.findFirst({
        where: {
          fromPlaceId: fromPlace.id,
          toPlaceId: toPlace.id,
        },
      });

      const data = {
        fromPlaceId: fromPlace.id,
        toPlaceId: toPlace.id,
        name: routeName,
        routeType: 'private-transfer',
        durationMinutes,
        distanceKm,
        notes: 'Starter Jordan routing for quotations and operations.',
        isActive: true,
      };

      if (existing) {
        return prisma.route.update({
          where: { id: existing.id },
          data,
        });
      }

      return prisma.route.create({ data });
    }),
  );

  return toRecordMap(records) as Record<string, RouteRecord>;
}

async function seedTransportPricingRules(
  prisma: PrismaService,
  routes: Record<string, RouteRecord>,
  transportServiceTypes: Record<string, NamedRecord>,
  vehicles: Record<string, NamedRecord>,
) {
  const routePrices: Array<{
    route: string;
    serviceType: string;
    bands: Array<{ vehicle: string; minPax: number; maxPax: number; baseCost: number }>;
  }> = [
    {
      route: 'Queen Alia International Airport - Amman City Center',
      serviceType: 'Arrival Transfer',
      bands: [
        { vehicle: 'Toyota Camry Sedan', minPax: 1, maxPax: 2, baseCost: 55 },
        { vehicle: 'Hyundai H1 Minivan', minPax: 3, maxPax: 5, baseCost: 75 },
        { vehicle: 'Toyota Coaster Mini Coach', minPax: 6, maxPax: 14, baseCost: 130 },
      ],
    },
    {
      route: 'Dead Sea Resort Area - Queen Alia International Airport',
      serviceType: 'Departure Transfer',
      bands: [
        { vehicle: 'Toyota Camry Sedan', minPax: 1, maxPax: 2, baseCost: 70 },
        { vehicle: 'Hyundai H1 Minivan', minPax: 3, maxPax: 5, baseCost: 95 },
        { vehicle: 'Toyota Coaster Mini Coach', minPax: 6, maxPax: 14, baseCost: 155 },
      ],
    },
    {
      route: 'Amman City Center - Jerash Archaeological Site',
      serviceType: 'Excursion Transfer',
      bands: [
        { vehicle: 'Toyota Camry Sedan', minPax: 1, maxPax: 2, baseCost: 95 },
        { vehicle: 'Hyundai H1 Minivan', minPax: 3, maxPax: 5, baseCost: 120 },
        { vehicle: 'Toyota Coaster Mini Coach', minPax: 6, maxPax: 14, baseCost: 185 },
      ],
    },
    {
      route: 'Amman City Center - Petra Visitor Center',
      serviceType: 'Intercity Transfer',
      bands: [
        { vehicle: 'Toyota Camry Sedan', minPax: 1, maxPax: 2, baseCost: 180 },
        { vehicle: 'Hyundai H1 Minivan', minPax: 3, maxPax: 5, baseCost: 230 },
        { vehicle: 'Toyota Coaster Mini Coach', minPax: 6, maxPax: 14, baseCost: 340 },
      ],
    },
    {
      route: 'Petra Visitor Center - Wadi Rum Camp Area',
      serviceType: 'Intercity Transfer',
      bands: [
        { vehicle: 'Toyota Camry Sedan', minPax: 1, maxPax: 2, baseCost: 135 },
        { vehicle: 'Hyundai H1 Minivan', minPax: 3, maxPax: 5, baseCost: 170 },
        { vehicle: 'Toyota Coaster Mini Coach', minPax: 6, maxPax: 14, baseCost: 245 },
      ],
    },
    {
      route: 'Wadi Rum Camp Area - Aqaba City Center',
      serviceType: 'Intercity Transfer',
      bands: [
        { vehicle: 'Toyota Camry Sedan', minPax: 1, maxPax: 2, baseCost: 95 },
        { vehicle: 'Hyundai H1 Minivan', minPax: 3, maxPax: 5, baseCost: 125 },
        { vehicle: 'Toyota Coaster Mini Coach', minPax: 6, maxPax: 14, baseCost: 180 },
      ],
    },
    {
      route: 'Aqaba City Center - Dead Sea Resort Area',
      serviceType: 'Intercity Transfer',
      bands: [
        { vehicle: 'Toyota Camry Sedan', minPax: 1, maxPax: 2, baseCost: 225 },
        { vehicle: 'Hyundai H1 Minivan', minPax: 3, maxPax: 5, baseCost: 285 },
        { vehicle: 'Toyota Coaster Mini Coach', minPax: 6, maxPax: 14, baseCost: 395 },
      ],
    },
  ];

  for (const entry of routePrices) {
    const route = routes[normalizeKey(entry.route)];
    const serviceType = transportServiceTypes[normalizeKey(entry.serviceType)];

    for (const band of entry.bands) {
      const vehicle = vehicles[normalizeKey(band.vehicle)];
      const existing = await prisma.transportPricingRule.findFirst({
        where: {
          routeId: route.id,
          transportServiceTypeId: serviceType.id,
          vehicleId: vehicle.id,
          minPax: band.minPax,
          maxPax: band.maxPax,
        },
      });

      const data = {
        routeId: route.id,
        transportServiceTypeId: serviceType.id,
        vehicleId: vehicle.id,
        pricingMode: TransportPricingMode.per_vehicle,
        minPax: band.minPax,
        maxPax: band.maxPax,
        unitCapacity: null,
        baseCost: band.baseCost,
        discountPercent: 0,
        currency: 'USD',
        isActive: true,
      };

      if (existing) {
        await prisma.transportPricingRule.update({
          where: { id: existing.id },
          data,
        });
      } else {
        await prisma.transportPricingRule.create({ data });
      }
    }
  }
}

async function seedVehicleRates(
  prisma: PrismaService,
  routes: Record<string, RouteRecord>,
  transportServiceTypes: Record<string, NamedRecord>,
  vehicles: Record<string, NamedRecord>,
) {
  const validity = {
    validFrom: new Date('2026-01-01T00:00:00.000Z'),
    validTo: new Date('2026-12-31T23:59:59.999Z'),
  };

  const entries: Array<{
    route: string;
    serviceType: string;
    vehicle: string;
    minPax: number;
    maxPax: number;
    price: number;
  }> = [
    { route: 'Queen Alia International Airport - Amman City Center', serviceType: 'Arrival Transfer', vehicle: 'Toyota Camry Sedan', minPax: 1, maxPax: 2, price: 55 },
    { route: 'Queen Alia International Airport - Amman City Center', serviceType: 'Arrival Transfer', vehicle: 'Hyundai H1 Minivan', minPax: 3, maxPax: 5, price: 75 },
    { route: 'Queen Alia International Airport - Amman City Center', serviceType: 'Arrival Transfer', vehicle: 'Toyota Coaster Mini Coach', minPax: 6, maxPax: 14, price: 130 },
    { route: 'Dead Sea Resort Area - Queen Alia International Airport', serviceType: 'Departure Transfer', vehicle: 'Toyota Camry Sedan', minPax: 1, maxPax: 2, price: 70 },
    { route: 'Dead Sea Resort Area - Queen Alia International Airport', serviceType: 'Departure Transfer', vehicle: 'Hyundai H1 Minivan', minPax: 3, maxPax: 5, price: 95 },
    { route: 'Dead Sea Resort Area - Queen Alia International Airport', serviceType: 'Departure Transfer', vehicle: 'Toyota Coaster Mini Coach', minPax: 6, maxPax: 14, price: 155 },
    { route: 'Amman City Center - Jerash Archaeological Site', serviceType: 'Excursion Transfer', vehicle: 'Hyundai H1 Minivan', minPax: 3, maxPax: 5, price: 120 },
    { route: 'Amman City Center - Jerash Archaeological Site', serviceType: 'Excursion Transfer', vehicle: 'Toyota Coaster Mini Coach', minPax: 6, maxPax: 14, price: 185 },
    { route: 'Amman City Center - Petra Visitor Center', serviceType: 'Intercity Transfer', vehicle: 'Toyota Camry Sedan', minPax: 1, maxPax: 2, price: 180 },
    { route: 'Amman City Center - Petra Visitor Center', serviceType: 'Intercity Transfer', vehicle: 'Hyundai H1 Minivan', minPax: 3, maxPax: 5, price: 230 },
    { route: 'Amman City Center - Petra Visitor Center', serviceType: 'Intercity Transfer', vehicle: 'Toyota Coaster Mini Coach', minPax: 6, maxPax: 14, price: 340 },
    { route: 'Petra Visitor Center - Wadi Rum Camp Area', serviceType: 'Intercity Transfer', vehicle: 'Hyundai H1 Minivan', minPax: 3, maxPax: 5, price: 170 },
    { route: 'Petra Visitor Center - Wadi Rum Camp Area', serviceType: 'Intercity Transfer', vehicle: 'Toyota Coaster Mini Coach', minPax: 6, maxPax: 14, price: 245 },
    { route: 'Wadi Rum Camp Area - Aqaba City Center', serviceType: 'Intercity Transfer', vehicle: 'Hyundai H1 Minivan', minPax: 3, maxPax: 5, price: 125 },
    { route: 'Aqaba City Center - Dead Sea Resort Area', serviceType: 'Intercity Transfer', vehicle: 'Hyundai H1 Minivan', minPax: 3, maxPax: 5, price: 285 },
    { route: 'King Hussein International Airport - Aqaba City Center', serviceType: 'Arrival Transfer', vehicle: 'Toyota Camry Sedan', minPax: 1, maxPax: 2, price: 35 },
  ];

  for (const entry of entries) {
    const route = routes[normalizeKey(entry.route)];
    const serviceType = transportServiceTypes[normalizeKey(entry.serviceType)];
    const vehicle = vehicles[normalizeKey(entry.vehicle)];
    const existing = await prisma.vehicleRate.findFirst({
      where: {
        routeId: route.id,
        serviceTypeId: serviceType.id,
        vehicleId: vehicle.id,
        minPax: entry.minPax,
        maxPax: entry.maxPax,
      },
    });

    const data = {
      vehicleId: vehicle.id,
      serviceTypeId: serviceType.id,
      routeId: route.id,
      fromPlaceId: route.fromPlaceId,
      toPlaceId: route.toPlaceId,
      routeName: entry.route,
      minPax: entry.minPax,
      maxPax: entry.maxPax,
      price: entry.price,
      currency: 'USD',
      ...validity,
    };

    if (existing) {
      await prisma.vehicleRate.update({
        where: { id: existing.id },
        data,
      });
    } else {
      await prisma.vehicleRate.create({ data });
    }
  }
}

async function seedSeasons(prisma: PrismaService) {
  const entries = ['Spring 2026', 'Summer 2026', 'Autumn 2026', 'Winter 2026'];

  const records = await Promise.all(
    entries.map((name) =>
      prisma.season.upsert({
        where: { name },
        update: { name },
        create: { name },
      }),
    ),
  );

  return toRecordMap(records);
}

async function seedHotels(
  prisma: PrismaService,
  suppliers: Record<string, NamedRecord>,
  cities: Record<string, NamedRecord>,
  hotelCategories: Record<string, NamedRecord>,
) {
  const entries = [
    { name: 'The House Boutique Suites Amman', city: 'Amman', category: '4 Star', supplier: 'The House Boutique Suites Amman' },
    { name: 'Dead Sea Spa Hotel', city: 'Dead Sea', category: '4 Star', supplier: 'Dead Sea Spa Hotel' },
    { name: 'Petra Moon Hotel', city: 'Petra', category: '4 Star', supplier: 'Petra Moon Hotel' },
    { name: 'Sun City Camp Wadi Rum', city: 'Wadi Rum', category: 'Desert Camp', supplier: 'Sun City Camp Wadi Rum' },
    { name: 'DoubleTree by Hilton Aqaba', city: 'Aqaba', category: '5 Star', supplier: 'DoubleTree by Hilton Aqaba' },
    { name: 'Olive Branch Hotel Jerash', city: 'Jerash', category: '4 Star', supplier: 'Olive Branch Hotel Jerash' },
  ] as const;

  const records = await Promise.all(
    entries.map(async (entry) => {
      const existing = await prisma.hotel.findFirst({
        where: {
          name: { equals: entry.name, mode: 'insensitive' },
        },
      });
      const city = cities[normalizeKey(entry.city)];
      const category = hotelCategories[normalizeKey(entry.category)];
      const supplier = suppliers[normalizeKey(entry.supplier)];
      const data = {
        name: entry.name,
        city: entry.city,
        cityId: city.id,
        category: entry.category,
        hotelCategoryId: category.id,
        supplierId: supplier.id,
      };

      if (existing) {
        return prisma.hotel.update({
          where: { id: existing.id },
          data,
        });
      }

      return prisma.hotel.create({ data });
    }),
  );

  return toRecordMap(records);
}

async function seedHotelRoomCategories(prisma: PrismaService, hotels: Record<string, NamedRecord>) {
  const entries = [
    { hotel: 'The House Boutique Suites Amman', name: 'Standard Room', code: 'STD', description: 'Business-friendly standard room.' },
    { hotel: 'The House Boutique Suites Amman', name: 'Deluxe Room', code: 'DLX', description: 'Spacious room for FIT and premium proposals.' },
    { hotel: 'Dead Sea Spa Hotel', name: 'Standard Room', code: 'STD', description: 'Standard resort room.' },
    { hotel: 'Dead Sea Spa Hotel', name: 'Sea View Room', code: 'SEA', description: 'Room with resort sea-view positioning.' },
    { hotel: 'Petra Moon Hotel', name: 'Standard Room', code: 'STD', description: 'Comfortable room close to Petra gate.' },
    { hotel: 'Petra Moon Hotel', name: 'Deluxe Room', code: 'DLX', description: 'Enhanced room for Petra FIT programs.' },
    { hotel: 'Sun City Camp Wadi Rum', name: 'Standard Tent', code: 'STD', description: 'Standard desert camp accommodation.' },
    { hotel: 'Sun City Camp Wadi Rum', name: 'Panoramic Dome', code: 'PAN', description: 'Premium dome accommodation.' },
    { hotel: 'DoubleTree by Hilton Aqaba', name: 'City View Room', code: 'CVR', description: 'Standard Aqaba city-view room.' },
    { hotel: 'DoubleTree by Hilton Aqaba', name: 'Sea View Room', code: 'SVR', description: 'Premium Aqaba sea-view room.' },
    { hotel: 'Olive Branch Hotel Jerash', name: 'Standard Room', code: 'STD', description: 'Comfortable overnight room for Jerash extensions.' },
    { hotel: 'Olive Branch Hotel Jerash', name: 'Superior Room', code: 'SUP', description: 'Upgraded room for touring series.' },
  ] as const;

  const records = await Promise.all(
    entries.map(async (entry) => {
      const hotel = hotels[normalizeKey(entry.hotel)];
      const existing = await prisma.hotelRoomCategory.findFirst({
        where: {
          hotelId: hotel.id,
          name: { equals: entry.name, mode: 'insensitive' },
        },
      });

      const data = {
        hotelId: hotel.id,
        name: entry.name,
        code: entry.code,
        description: entry.description,
        isActive: true,
      };

      if (existing) {
        return prisma.hotelRoomCategory.update({
          where: { id: existing.id },
          data,
        });
      }

      return prisma.hotelRoomCategory.create({ data });
    }),
  );

  return toRecordMap(records.map((record) => ({ id: record.id, name: `${record.hotelId}:${record.name}` })));
}

async function seedHotelContracts(prisma: PrismaService, hotels: Record<string, NamedRecord>) {
  const entries = Object.values(hotels).map((hotel) => ({
    hotelId: hotel.id,
    name: 'Jordan FIT 2026',
    validFrom: new Date('2026-01-01T00:00:00.000Z'),
    validTo: new Date('2026-12-31T23:59:59.999Z'),
    currency: 'USD',
  }));

  const records = await Promise.all(
    entries.map(async (entry) => {
      const existing = await prisma.hotelContract.findFirst({
        where: {
          hotelId: entry.hotelId,
          name: { equals: entry.name, mode: 'insensitive' },
        },
      });

      if (existing) {
        return prisma.hotelContract.update({
          where: { id: existing.id },
          data: entry,
        });
      }

      return prisma.hotelContract.create({ data: entry });
    }),
  );

  return toRecordMap(records.map((record) => ({ id: record.id, name: `${record.hotelId}:${record.name}` })));
}

async function seedHotelRates(
  prisma: PrismaService,
  hotels: Record<string, NamedRecord>,
  contracts: Record<string, NamedRecord>,
  roomCategories: Record<string, NamedRecord>,
  seasons: Record<string, NamedRecord>,
) {
  const seasonMultipliers: Record<string, number> = {
    'Spring 2026': 1,
    'Summer 2026': 1.08,
    'Autumn 2026': 1.04,
    'Winter 2026': 0.92,
  };
  const hotelBaseRates: Record<string, { standardDouble: number; standardSingle: number; deluxeDouble: number; deluxeSingle: number }> = {
    'The House Boutique Suites Amman': { standardDouble: 120, standardSingle: 96, deluxeDouble: 155, deluxeSingle: 125 },
    'Dead Sea Spa Hotel': { standardDouble: 145, standardSingle: 118, deluxeDouble: 182, deluxeSingle: 148 },
    'Petra Moon Hotel': { standardDouble: 132, standardSingle: 108, deluxeDouble: 168, deluxeSingle: 138 },
    'Sun City Camp Wadi Rum': { standardDouble: 128, standardSingle: 105, deluxeDouble: 164, deluxeSingle: 135 },
    'DoubleTree by Hilton Aqaba': { standardDouble: 150, standardSingle: 122, deluxeDouble: 192, deluxeSingle: 158 },
    'Olive Branch Hotel Jerash': { standardDouble: 98, standardSingle: 82, deluxeDouble: 124, deluxeSingle: 103 },
  };
  const mealPlanForCategory: Record<string, HotelMealPlan> = {
    standard: HotelMealPlan.BB,
    deluxe: HotelMealPlan.HB,
  };
  const roomCategoryLookup: Record<string, { standard: string; deluxe: string }> = {
    'The House Boutique Suites Amman': { standard: 'Standard Room', deluxe: 'Deluxe Room' },
    'Dead Sea Spa Hotel': { standard: 'Standard Room', deluxe: 'Sea View Room' },
    'Petra Moon Hotel': { standard: 'Standard Room', deluxe: 'Deluxe Room' },
    'Sun City Camp Wadi Rum': { standard: 'Standard Tent', deluxe: 'Panoramic Dome' },
    'DoubleTree by Hilton Aqaba': { standard: 'City View Room', deluxe: 'Sea View Room' },
    'Olive Branch Hotel Jerash': { standard: 'Standard Room', deluxe: 'Superior Room' },
  };

  for (const [seasonName, multiplier] of Object.entries(seasonMultipliers)) {
    const season = seasons[normalizeKey(seasonName)];

    for (const [hotelName, baseRate] of Object.entries(hotelBaseRates)) {
      const hotel = hotels[normalizeKey(hotelName)];
      const contract = contracts[normalizeKey(`${hotel.id}:Jordan FIT 2026`)];
      const roomNames = roomCategoryLookup[hotelName];
      const standardRoom = roomCategories[normalizeKey(`${hotel.id}:${roomNames.standard}`)];
      const deluxeRoom = roomCategories[normalizeKey(`${hotel.id}:${roomNames.deluxe}`)];

      if (!contract || !standardRoom || !deluxeRoom) {
        throw new Error(`Missing hotel contract or room categories for ${hotelName}`);
      }

      const rateMatrix = [
        { roomCategoryId: standardRoom.id, occupancyType: HotelOccupancyType.DBL, mealPlan: mealPlanForCategory.standard, cost: baseRate.standardDouble },
        { roomCategoryId: standardRoom.id, occupancyType: HotelOccupancyType.SGL, mealPlan: mealPlanForCategory.standard, cost: baseRate.standardSingle },
        { roomCategoryId: deluxeRoom.id, occupancyType: HotelOccupancyType.DBL, mealPlan: mealPlanForCategory.deluxe, cost: baseRate.deluxeDouble },
        { roomCategoryId: deluxeRoom.id, occupancyType: HotelOccupancyType.SGL, mealPlan: mealPlanForCategory.deluxe, cost: baseRate.deluxeSingle },
      ];

      for (const rate of rateMatrix) {
        const cost = Number((rate.cost * multiplier).toFixed(2));
        const existing = await prisma.hotelRate.findFirst({
          where: {
            contractId: contract.id,
            seasonName,
            roomCategoryId: rate.roomCategoryId,
            occupancyType: rate.occupancyType,
            mealPlan: rate.mealPlan,
          },
        });

        const data = {
          contractId: contract.id,
          seasonId: season.id,
          seasonName,
          roomCategoryId: rate.roomCategoryId,
          occupancyType: rate.occupancyType,
          mealPlan: rate.mealPlan,
          currency: 'USD',
          cost,
        };

        if (existing) {
          await prisma.hotelRate.update({
            where: { id: existing.id },
            data,
          });
        } else {
          await prisma.hotelRate.create({ data });
        }
      }
    }
  }
}

async function seedSupportTextTemplates(prisma: PrismaService) {
  const entries = [
    {
      title: 'Jordan FIT Inclusions',
      templateType: 'inclusions',
      content:
        'Accommodation as specified, private transportation with English-speaking driver, sightseeing and services listed in the itinerary, breakfast where indicated, applicable taxes, and standard on-ground coordination.',
    },
    {
      title: 'Jordan FIT Exclusions',
      templateType: 'exclusions',
      content:
        'International airfare, travel insurance, visa fees, personal expenses, beverages unless specified, optional activities, tips, and any services not explicitly mentioned as included.',
    },
    {
      title: 'Jordan FIT Terms',
      templateType: 'terms_notes',
      content:
        'Rates are starter contract placeholders for testing. All services remain subject to final availability at time of confirmation. Supplements may apply during public holidays, congress periods, or mandatory gala events.',
    },
  ] as const;

  for (const entry of entries) {
    const existing = await prisma.supportTextTemplate.findFirst({
      where: {
        title: { equals: entry.title, mode: 'insensitive' },
        templateType: entry.templateType,
      },
    });

    if (existing) {
      await prisma.supportTextTemplate.update({
        where: { id: existing.id },
        data: entry,
      });
    } else {
      await prisma.supportTextTemplate.create({ data: entry });
    }
  }
}

async function seedQuoteBlocks(
  prisma: PrismaService,
  services: Record<string, NamedRecord>,
  serviceTypes: Record<string, NamedRecord>,
) {
  const blocks = [
    {
      name: 'Jordan Arrival Day',
      type: 'ITINERARY_DAY',
      title: 'Arrival in Amman',
      description: 'Meet on arrival, private transfer to Amman, and overnight at a city hotel.',
      defaultServiceId: services[normalizeKey('Airport Meet And Assist')].id,
      defaultServiceTypeId: serviceTypes[normalizeKey('Meet And Assist')].id,
      defaultCategory: 'Arrival',
      defaultCost: 35,
      defaultSell: 45,
    },
    {
      name: 'Petra Discovery Day',
      type: 'ITINERARY_DAY',
      title: 'Petra Discovery',
      description: 'Visit Petra with guiding and private logistics.',
      defaultServiceId: services[normalizeKey('Petra Entrance And Guided Visit')].id,
      defaultServiceTypeId: serviceTypes[normalizeKey('Sightseeing')].id,
      defaultCategory: 'Sightseeing',
      defaultCost: 65,
      defaultSell: 85,
    },
    {
      name: 'Private Transfer',
      type: 'SERVICE_BLOCK',
      title: 'Private Transfer',
      description: 'Private transfer using the contracted Jordan transport setup.',
      defaultServiceId: services[normalizeKey('Jordan Private Transfer Service')].id,
      defaultServiceTypeId: serviceTypes[normalizeKey('Transport')].id,
      defaultCategory: 'Transport',
      defaultCost: 95,
      defaultSell: 120,
    },
    {
      name: 'Wadi Rum Jeep Safari',
      type: 'SERVICE_BLOCK',
      title: 'Wadi Rum Jeep Safari',
      description: 'Desert exploration experience suitable for FIT and small groups.',
      defaultServiceId: services[normalizeKey('Wadi Rum 2-Hour Jeep Safari')].id,
      defaultServiceTypeId: serviceTypes[normalizeKey('Sightseeing')].id,
      defaultCategory: 'Activity',
      defaultCost: 45,
      defaultSell: 58,
    },
  ] as const;

  for (const block of blocks) {
    const existing = await prisma.quoteBlock.findFirst({
      where: {
        name: { equals: block.name, mode: 'insensitive' },
        type: block.type,
      },
    });

    if (existing) {
      await prisma.quoteBlock.update({
        where: { id: existing.id },
        data: block,
      });
    } else {
      await prisma.quoteBlock.create({ data: block });
    }
  }
}

async function findVehicleRateId(
  prisma: PrismaService,
  routeId: string,
  serviceTypeId: string,
  paxCount: number,
) {
  const vehicleRate = await prisma.vehicleRate.findFirst({
    where: {
      routeId,
      serviceTypeId,
      minPax: {
        lte: paxCount,
      },
      maxPax: {
        gte: paxCount,
      },
    },
    orderBy: [{ maxPax: 'asc' }, { price: 'asc' }],
  });

  if (!vehicleRate) {
    throw new Error(`Missing vehicle rate for route ${routeId} and service type ${serviceTypeId}`);
  }

  return vehicleRate.id;
}

async function createSeedQuoteItem(
  prisma: PrismaService,
  input: {
    quoteId: string;
    optionId?: string | null;
    serviceId: string;
    itineraryId?: string;
    vehicleRateId?: string;
    hotelId?: string;
    contractId?: string;
    seasonId?: string;
    seasonName?: string;
    roomCategoryId?: string;
    occupancyType?: HotelOccupancyType;
    mealPlan?: HotelMealPlan;
    quantity: number;
    paxCount: number;
    roomCount?: number;
    nightCount?: number;
    dayCount?: number;
    guideType?: 'local' | 'escort';
    guideDuration?: 'half_day' | 'full_day';
    overnight?: boolean;
    markupPercent: number;
    // --- Activity operational fields
serviceDate?: Date;
startTime?: string;
pickupTime?: string | null;
pickupLocation?: string | null;
meetingPoint?: string | null;
participantCount?: number;
adultCount?: number;
childCount?: number;
reconfirmationRequired?: boolean;
reconfirmationDueAt?: Date | null;
  },
) {
  const service = await prisma.supplierService.findUniqueOrThrow({
    where: { id: input.serviceId },
    include: {
      serviceType: true,
    },
  });

  let baseCost = service.baseCost;
  let currency = service.currency;
  let pricingDescription: string | null = null;
  let appliedVehicleRateId: string | null = null;
  let hotelId: string | null = null;
  let contractId: string | null = null;
  let seasonId: string | null = null;
  let seasonName: string | null = null;
  let roomCategoryId: string | null = null;
  let occupancyType: HotelOccupancyType | null = null;
  let mealPlan: HotelMealPlan | null = null;

  if (input.vehicleRateId) {
    const vehicleRate = await prisma.vehicleRate.findUniqueOrThrow({
      where: { id: input.vehicleRateId },
      include: {
        vehicle: true,
        serviceType: true,
      },
    });

    baseCost = vehicleRate.price;
    currency = vehicleRate.currency;
    appliedVehicleRateId = vehicleRate.id;
    pricingDescription = `${vehicleRate.serviceType.name} | ${vehicleRate.routeName} | ${vehicleRate.vehicle.name}`;
  }

  if (input.hotelId && input.contractId && input.roomCategoryId && input.occupancyType && input.mealPlan && input.seasonName) {
    const hotelRate = await prisma.hotelRate.findFirstOrThrow({
      where: {
        contractId: input.contractId,
        seasonName: input.seasonName,
        roomCategoryId: input.roomCategoryId,
        occupancyType: input.occupancyType,
        mealPlan: input.mealPlan,
      },
      include: {
        contract: true,
        roomCategory: true,
      },
    });

    baseCost = hotelRate.cost;
    currency = hotelRate.currency;
    pricingDescription = `${hotelRate.contract.name} | ${hotelRate.seasonName} | ${hotelRate.roomCategory.name} | ${hotelRate.occupancyType} | ${hotelRate.mealPlan}`;
    hotelId = input.hotelId;
    contractId = input.contractId;
    seasonId = input.seasonId || null;
    seasonName = input.seasonName;
    roomCategoryId = input.roomCategoryId;
    occupancyType = input.occupancyType;
    mealPlan = input.mealPlan;
  }

  if (service.serviceType?.code === 'GUIDE' && input.guideType && input.guideDuration) {
    const guideRates = {
      local: {
        half_day: 80,
        full_day: 120,
      },
      escort: {
        half_day: 140,
        full_day: 200,
      },
    } as const;
    baseCost = guideRates[input.guideType][input.guideDuration] + (input.overnight ? 50 : 0);
    pricingDescription = `Guide | ${input.guideType} | ${input.guideDuration} | Overnight: ${input.overnight ? 'Yes' : 'No'}`;
  }

  const quantity = Math.max(1, input.quantity);
  const paxCount = Math.max(1, input.paxCount);
  const roomCount = input.roomCount ? Math.max(1, input.roomCount) : null;
  const nightCount = input.nightCount ? Math.max(1, input.nightCount) : null;
  const dayCount = input.dayCount ? Math.max(1, input.dayCount) : null;
  const totalCost = hotelId
    ? Number((baseCost * Math.max(1, roomCount || 1) * Math.max(1, nightCount || 1) * quantity).toFixed(2))
    : Number((baseCost * getPricingUnits(service.unitType, quantity, paxCount, roomCount || 1, nightCount || 1, dayCount || 1)).toFixed(2));
  const totalSell = Number((totalCost * (1 + input.markupPercent / 100)).toFixed(2));

  return prisma.quoteItem.create({
    data: {
      quoteId: input.quoteId,
      optionId: input.optionId ?? null,
      serviceId: input.serviceId,
      itineraryId: input.itineraryId || null,
      quantity,
      paxCount,
      roomCount,
      nightCount,
      dayCount,
      markupPercent: input.markupPercent,
      totalCost,
      totalSell,
      appliedVehicleRateId,
      currency,
      pricingDescription,
      hotelId,
      contractId,
      seasonName,
      mealPlan,
      roomCategoryId,
      occupancyType,
      baseCost,
      overrideCost: null,
      useOverride: false,
      // --- Activity operational fields
serviceDate: input.serviceDate ?? null,
startTime: input.startTime ?? null,
pickupTime: input.pickupTime ?? null,
pickupLocation: input.pickupLocation ?? null,
meetingPoint: input.meetingPoint ?? null,
participantCount: input.participantCount ?? null,
adultCount: input.adultCount ?? null,
childCount: input.childCount ?? null,
reconfirmationRequired: input.reconfirmationRequired ?? false,
reconfirmationDueAt: input.reconfirmationDueAt ?? null,
    },
  });
}

function getPricingUnits(
  unitType: ServiceUnitType,
  quantity: number,
  paxCount: number,
  roomCount: number,
  nightCount: number,
  dayCount: number,
) {
  switch (unitType) {
    case ServiceUnitType.per_person:
      return quantity * paxCount;
    case ServiceUnitType.per_room:
      return quantity * roomCount;
    case ServiceUnitType.per_night:
      return quantity * nightCount;
    case ServiceUnitType.per_day:
      return quantity * dayCount;
    case ServiceUnitType.per_group:
    case ServiceUnitType.per_vehicle:
    default:
      return quantity;
  }
}

async function refreshQuoteTotals(prisma: PrismaService, quoteId: string, totalPax: number) {
  const items = await prisma.quoteItem.findMany({
    where: {
      quoteId,
      optionId: null,
    },
    select: {
      totalCost: true,
      totalSell: true,
    },
  });

  const totalCost = Number(items.reduce((sum, item) => sum + item.totalCost, 0).toFixed(2));
  const totalSell = Number(items.reduce((sum, item) => sum + item.totalSell, 0).toFixed(2));
  const pricePerPax = totalPax > 0 ? Number((totalSell / totalPax).toFixed(2)) : 0;

  await prisma.quote.update({
    where: { id: quoteId },
    data: {
      totalCost,
      totalSell,
      totalPrice: totalSell,
      pricePerPax,
    },
  });
}

async function seedDemoScenarios(
  prisma: PrismaService,
  quotesService: QuotesService,
  itinerariesService: ItinerariesService,
  invoicesService: InvoicesService,
  hotels: Record<string, NamedRecord>,
  roomCategories: Record<string, NamedRecord>,
  contracts: Record<string, NamedRecord>,
  services: Record<string, NamedRecord>,
  routes: Record<string, RouteRecord>,
  transportServiceTypes: Record<string, NamedRecord>,
  seasons: Record<string, NamedRecord>,
  suppliers: Record<string, NamedRecord>,
) {
  const fitAccepted = await seedSampleQuoteScenario(
    prisma,
    quotesService,
    itinerariesService,
    invoicesService,
    hotels,
    roomCategories,
    contracts,
    services,
    routes,
    transportServiceTypes,
    seasons,
    suppliers,
  );

  const fitSent = await seedFitSentScenario(
    prisma,
    quotesService,
    itinerariesService,
    hotels,
    roomCategories,
    contracts,
    services,
    routes,
    transportServiceTypes,
    seasons,
  );

  const groupScenario = await seedGroupQuoteScenario(
    prisma,
    quotesService,
    itinerariesService,
    hotels,
    roomCategories,
    contracts,
    services,
    routes,
    transportServiceTypes,
    seasons,
  );

  const revisionScenario = await seedRevisionRequestedScenario(
    prisma,
    quotesService,
    itinerariesService,
    hotels,
    roomCategories,
    contracts,
    services,
    routes,
    transportServiceTypes,
    seasons,
  );

  return [fitSent, fitAccepted, groupScenario, revisionScenario];
}

async function seedHotelContractConfigurations(
  prisma: PrismaService,
  hotels: Record<string, NamedRecord>,
  contracts: Record<string, NamedRecord>,
  roomCategories: Record<string, NamedRecord>,
) {
  const configEntries = [
    {
      hotelName: 'The House Boutique Suites Amman',
      contractName: 'Jordan FIT 2026',
      defaultMealPlans: ['BB', 'HB'],
      occupancyRules: [
        { roomName: 'Standard Room', occupancyType: HotelOccupancyType.SGL, minAdults: 1, maxAdults: 1, maxChildren: 0, maxOccupants: 1, notes: 'Standard single occupancy.' },
        { roomName: 'Standard Room', occupancyType: HotelOccupancyType.DBL, minAdults: 2, maxAdults: 2, maxChildren: 1, maxOccupants: 3, notes: 'Double or twin setup with one child sharing.' },
        { roomName: 'Deluxe Room', occupancyType: HotelOccupancyType.TPL, minAdults: 3, maxAdults: 3, maxChildren: 0, maxOccupants: 3, notes: 'Triple adult use for FIT family demos.' },
      ],
      supplements: [
        { roomName: 'Standard Room', type: 'EXTRA_BED', chargeBasis: 'PER_NIGHT', amount: 45, currency: 'USD', isMandatory: false, notes: 'Foldaway extra bed for child or third adult.' },
        { roomName: null, type: 'GALA_DINNER', chargeBasis: 'PER_PERSON', amount: 60, currency: 'USD', isMandatory: true, notes: 'Mandatory gala dinner during festive periods.' },
      ],
      cancellation: {
        summary: 'Free cancellation until 14 days prior, then stepped penalties apply.',
        noShowPenaltyType: 'FULL_STAY',
        noShowPenaltyValue: null,
        rules: [
          { windowFromValue: 14, windowToValue: 8, deadlineUnit: 'DAYS', penaltyType: 'PERCENT', penaltyValue: 50, notes: 'Late cancellation fee.' },
          { windowFromValue: 7, windowToValue: 0, deadlineUnit: 'DAYS', penaltyType: 'FULL_STAY', penaltyValue: null, notes: 'Final week is fully charged.' },
        ],
      },
      childPolicy: {
        infantMaxAge: 1,
        childMaxAge: 11,
        notes: 'Children sharing existing bedding are allowed based on room occupancy.',
        bands: [
          { label: 'Infant', minAge: 0, maxAge: 1, chargeBasis: 'FREE', chargeValue: null, notes: 'Infants stay free.' },
          { label: 'Child Sharing', minAge: 2, maxAge: 11, chargeBasis: 'PERCENT_OF_ADULT', chargeValue: 50, notes: 'One child sharing with parents at 50% of adult rate.' },
        ],
      },
    },
    {
      hotelName: 'Petra Moon Hotel',
      contractName: 'Jordan FIT 2026',
      defaultMealPlans: ['BB', 'HB'],
      occupancyRules: [
        { roomName: 'Standard Room', occupancyType: HotelOccupancyType.SGL, minAdults: 1, maxAdults: 1, maxChildren: 0, maxOccupants: 1, notes: 'Single room use.' },
        { roomName: 'Standard Room', occupancyType: HotelOccupancyType.DBL, minAdults: 2, maxAdults: 2, maxChildren: 1, maxOccupants: 3, notes: 'Double occupancy with optional child.' },
        { roomName: 'Deluxe Room', occupancyType: HotelOccupancyType.DBL, minAdults: 2, maxAdults: 2, maxChildren: 1, maxOccupants: 3, notes: 'Premium double room option.' },
      ],
      supplements: [
        { roomName: 'Deluxe Room', type: 'EXTRA_DINNER', chargeBasis: 'PER_PERSON', amount: 28, currency: 'USD', isMandatory: false, notes: 'Optional dinner supplement.' },
      ],
      cancellation: {
        summary: 'Cancellation charges apply inside 10 days prior to arrival.',
        noShowPenaltyType: 'FULL_STAY',
        noShowPenaltyValue: null,
        rules: [
          { windowFromValue: 10, windowToValue: 4, deadlineUnit: 'DAYS', penaltyType: 'NIGHTS', penaltyValue: 1, notes: 'One-night retention.' },
          { windowFromValue: 3, windowToValue: 0, deadlineUnit: 'DAYS', penaltyType: 'FULL_STAY', penaltyValue: null, notes: 'Last-minute cancellation.' },
        ],
      },
      childPolicy: {
        infantMaxAge: 1,
        childMaxAge: 10,
        notes: 'Petra child policy for FIT demo contracts.',
        bands: [
          { label: 'Child Sharing', minAge: 2, maxAge: 10, chargeBasis: 'PERCENT_OF_ADULT', chargeValue: 60, notes: 'Reduced sharing rate.' },
        ],
      },
    },
    {
      hotelName: 'Dead Sea Spa Hotel',
      contractName: 'Jordan FIT 2026',
      defaultMealPlans: ['BB', 'HB'],
      occupancyRules: [
        { roomName: 'Standard Room', occupancyType: HotelOccupancyType.SGL, minAdults: 1, maxAdults: 1, maxChildren: 0, maxOccupants: 1, notes: 'Single resort occupancy.' },
        { roomName: 'Standard Room', occupancyType: HotelOccupancyType.DBL, minAdults: 2, maxAdults: 2, maxChildren: 2, maxOccupants: 4, notes: 'Family sharing setup.' },
        { roomName: 'Sea View Room', occupancyType: HotelOccupancyType.TPL, minAdults: 3, maxAdults: 3, maxChildren: 1, maxOccupants: 4, notes: 'Triple premium room with optional child.' },
      ],
      supplements: [
        { roomName: 'Sea View Room', type: 'EXTRA_BREAKFAST', chargeBasis: 'PER_PERSON', amount: 18, currency: 'USD', isMandatory: false, notes: 'Sea-view room breakfast supplement for added guest.' },
        { roomName: null, type: 'GALA_DINNER', chargeBasis: 'PER_PERSON', amount: 75, currency: 'USD', isMandatory: true, notes: 'Peak date festive supplement.' },
      ],
      cancellation: {
        summary: 'Resort cancellation policy with stepped penalties.',
        noShowPenaltyType: 'FULL_STAY',
        noShowPenaltyValue: null,
        rules: [
          { windowFromValue: 21, windowToValue: 15, deadlineUnit: 'DAYS', penaltyType: 'PERCENT', penaltyValue: 30, notes: 'Resort penalty begins three weeks out.' },
          { windowFromValue: 14, windowToValue: 7, deadlineUnit: 'DAYS', penaltyType: 'PERCENT', penaltyValue: 50, notes: 'Mid-window penalty.' },
          { windowFromValue: 6, windowToValue: 0, deadlineUnit: 'DAYS', penaltyType: 'FULL_STAY', penaltyValue: null, notes: 'Final week full charge.' },
        ],
      },
      childPolicy: {
        infantMaxAge: 1,
        childMaxAge: 11,
        notes: 'Resort-style family child policy.',
        bands: [
          { label: 'First Child Sharing', minAge: 2, maxAge: 5, chargeBasis: 'FREE', chargeValue: null, notes: 'One young child free when sharing existing bedding.' },
          { label: 'Older Child Sharing', minAge: 6, maxAge: 11, chargeBasis: 'PERCENT_OF_ADULT', chargeValue: 50, notes: 'Older child sharing rate.' },
        ],
      },
    },
  ] as const;

  for (const config of configEntries) {
    const hotel = hotels[normalizeKey(config.hotelName)];
    const contract = contracts[normalizeKey(`${hotel.id}:${config.contractName}`)];
    const supplementalRoomNames = config.supplements
      .map((entry) => entry.roomName)
      .filter((roomName) => roomName !== null) as string[];
    const roomNames = [
      ...config.occupancyRules.map((entry) => entry.roomName),
      ...supplementalRoomNames,
    ];
    const roomCategoryByName = new Map(
      roomNames.map((roomName) => {
          const room = roomCategories[normalizeKey(`${hotel.id}:${roomName}`)];
          return [roomName, room];
        }),
    );

    await prisma.hotelContractMealPlan.deleteMany({
      where: { hotelContractId: contract.id },
    });
    await prisma.hotelContractMealPlan.createMany({
      data: config.defaultMealPlans.map((code, index) => ({
        hotelContractId: contract.id,
        code: code as HotelMealPlan,
        isDefault: index === 0,
        isActive: true,
        notes: `Demo meal plan ${code} for ${config.hotelName}.`,
      })),
    });

    await prisma.hotelContractOccupancyRule.deleteMany({
      where: { hotelContractId: contract.id },
    });
    await prisma.hotelContractOccupancyRule.createMany({
      data: config.occupancyRules.map((rule) => ({
        hotelContractId: contract.id,
        roomCategoryId: roomCategoryByName.get(rule.roomName)?.id || null,
        occupancyType: rule.occupancyType,
        minAdults: rule.minAdults,
        maxAdults: rule.maxAdults,
        maxChildren: rule.maxChildren,
        maxOccupants: rule.maxOccupants,
        isActive: true,
        notes: rule.notes,
      })),
    });

    await prisma.hotelContractSupplement.deleteMany({
      where: { hotelContractId: contract.id },
    });
    await prisma.hotelContractSupplement.createMany({
      data: config.supplements.map((supplement) => ({
        hotelContractId: contract.id,
        roomCategoryId: supplement.roomName ? roomCategoryByName.get(supplement.roomName)?.id || null : null,
        type: supplement.type as any,
        chargeBasis: supplement.chargeBasis as any,
        amount: supplement.amount,
        currency: supplement.currency,
        isMandatory: supplement.isMandatory,
        isActive: true,
        notes: supplement.notes,
      })),
    });

    await prisma.hotelContractCancellationRule.deleteMany({
      where: {
        cancellationPolicy: {
          hotelContractId: contract.id,
        },
      },
    });
    await prisma.hotelContractCancellationPolicy.upsert({
      where: { hotelContractId: contract.id },
      update: {
        summary: config.cancellation.summary,
        notes: `Demo cancellation policy for ${config.hotelName}.`,
        noShowPenaltyType: config.cancellation.noShowPenaltyType as any,
        noShowPenaltyValue: config.cancellation.noShowPenaltyValue,
        rules: {
          create: config.cancellation.rules.map((rule) => ({
            windowFromValue: rule.windowFromValue,
            windowToValue: rule.windowToValue,
            deadlineUnit: rule.deadlineUnit as any,
            penaltyType: rule.penaltyType as any,
            penaltyValue: rule.penaltyValue,
            isActive: true,
            notes: rule.notes,
          })),
        },
      },
      create: {
        hotelContractId: contract.id,
        summary: config.cancellation.summary,
        notes: `Demo cancellation policy for ${config.hotelName}.`,
        noShowPenaltyType: config.cancellation.noShowPenaltyType as any,
        noShowPenaltyValue: config.cancellation.noShowPenaltyValue,
        rules: {
          create: config.cancellation.rules.map((rule) => ({
            windowFromValue: rule.windowFromValue,
            windowToValue: rule.windowToValue,
            deadlineUnit: rule.deadlineUnit as any,
            penaltyType: rule.penaltyType as any,
            penaltyValue: rule.penaltyValue,
            isActive: true,
            notes: rule.notes,
          })),
        },
      },
    });

    await prisma.hotelContractChildPolicyBand.deleteMany({
      where: {
        childPolicy: {
          hotelContractId: contract.id,
        },
      },
    });
    await prisma.hotelContractChildPolicy.upsert({
      where: { hotelContractId: contract.id },
      update: {
        infantMaxAge: config.childPolicy.infantMaxAge,
        childMaxAge: config.childPolicy.childMaxAge,
        notes: config.childPolicy.notes,
        bands: {
          create: config.childPolicy.bands.map((band) => ({
            label: band.label,
            minAge: band.minAge,
            maxAge: band.maxAge,
            chargeBasis: band.chargeBasis as any,
            chargeValue: band.chargeValue,
            isActive: true,
            notes: band.notes,
          })),
        },
      },
      create: {
        hotelContractId: contract.id,
        infantMaxAge: config.childPolicy.infantMaxAge,
        childMaxAge: config.childPolicy.childMaxAge,
        notes: config.childPolicy.notes,
        bands: {
          create: config.childPolicy.bands.map((band) => ({
            label: band.label,
            minAge: band.minAge,
            maxAge: band.maxAge,
            chargeBasis: band.chargeBasis as any,
            chargeValue: band.chargeValue,
            isActive: true,
            notes: band.notes,
          })),
        },
      },
    });

    const standardRoomName = config.occupancyRules[0]?.roomName;
    const standardRoom = standardRoomName ? roomCategoryByName.get(standardRoomName) : null;
    if (standardRoom) {
      await prisma.hotelAllotment.deleteMany({
        where: {
          hotelContractId: contract.id,
          roomCategoryId: standardRoom.id,
        },
      });
      await prisma.hotelAllotment.create({
        data: {
          hotelContractId: contract.id,
          roomCategoryId: standardRoom.id,
          dateFrom: new Date('2026-05-01T00:00:00.000Z'),
          dateTo: new Date('2026-05-31T23:59:59.999Z'),
          allotment: 8,
          releaseDays: 7,
          stopSale: false,
          notes: `Demo May allotment for ${config.hotelName}.`,
          isActive: true,
        },
      });
    }
  }
}

async function createItineraryDays(
  itinerariesService: ItinerariesService,
  quoteId: string,
  days: Array<{ dayNumber: number; title: string; description: string }>,
) {
  return Promise.all(
    days.map((day) =>
      itinerariesService.create({
        quoteId,
        dayNumber: day.dayNumber,
        title: day.title,
        description: day.description,
      }),
    ),
  );
}

async function syncQuoteItineraryFromQuoteItems(prisma: PrismaService, quoteId: string) {
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

async function seedSampleQuoteScenario(
  prisma: PrismaService,
  quotesService: QuotesService,
  itinerariesService: ItinerariesService,
  invoicesService: InvoicesService,
  hotels: Record<string, NamedRecord>,
  roomCategories: Record<string, NamedRecord>,
  contracts: Record<string, NamedRecord>,
  services: Record<string, NamedRecord>,
  routes: Record<string, RouteRecord>,
  transportServiceTypes: Record<string, NamedRecord>,
  seasons: Record<string, NamedRecord>,
  suppliers: Record<string, NamedRecord>,
) {
  const brandCompany = await upsertCompany(prisma, {
    name: DEMO_BRAND_COMPANY,
    type: 'dmc',
    website: 'https://desertcompass.example',
    country: 'Jordan',
    city: 'Amman',
    primaryColor: '#0F766E',
  });
  await prisma.companyBranding.upsert({
    where: { companyId: brandCompany.id },
    update: {
      displayName: DEMO_BRAND_COMPANY,
      headerTitle: 'Jordan Travel Proposal',
      headerSubtitle: 'Tailor-made Jordan programs for FIT and small groups',
      footerText: 'Operational placeholder data for end-to-end workflow testing.',
      website: 'https://desertcompass.example',
      email: 'sales@desertcompass.example',
      phone: '+96265500000',
      primaryColor: '#0F766E',
      secondaryColor: '#155E75',
    },
    create: {
      companyId: brandCompany.id,
      displayName: DEMO_BRAND_COMPANY,
      headerTitle: 'Jordan Travel Proposal',
      headerSubtitle: 'Tailor-made Jordan programs for FIT and small groups',
      footerText: 'Operational placeholder data for end-to-end workflow testing.',
      website: 'https://desertcompass.example',
      email: 'sales@desertcompass.example',
      phone: '+96265500000',
      primaryColor: '#0F766E',
      secondaryColor: '#155E75',
    },
  });

  const clientCompany = await upsertCompany(prisma, {
    name: 'Demo Company - FIT Accepted',
    type: 'travel-agency',
    website: 'https://demo-fit-accepted.example',
    country: 'United Kingdom',
    city: 'London',
    primaryColor: '#1D4ED8',
  });
  const contact = await upsertContact(prisma, clientCompany.id, {
    firstName: 'Nadia',
    lastName: 'Bennett',
    email: 'demo.fit.accepted@demo.local',
    phone: '+447700900100',
    title: 'Senior Product Manager',
  });

  const quote = await quotesService.create({
    clientCompanyId: clientCompany.id,
    brandCompanyId: brandCompany.id,
    contactId: contact.id,
    title: DEMO_ACCEPTED_QUOTE_TITLE,
    description:
      'Accepted FIT demo quote for a 7-day Jordan circuit covering Amman, Jerash, Petra, Wadi Rum, Aqaba, and the Dead Sea.',
    inclusionsText:
      'Accommodation, private transfers, listed sightseeing, guiding where mentioned, breakfast, desert dinner, and operational coordination.',
    exclusionsText:
      'International flights, visa fees, insurance, lunches unless stated, beverages, tips, and personal expenses.',
    termsNotesText:
      'Seed sample for end-to-end testing only. Rates are realistic placeholders and should not be treated as contracted live rates.',
    pricingMode: 'FIXED',
    fixedPricePerPerson: 825,
    adults: 4,
    children: 0,
    roomCount: 2,
    nightCount: 6,
    validUntil: new Date('2026-05-31T23:59:59.999Z'),
  });

  const quoteId = quote.id;
  const springSeason = seasons[normalizeKey('Spring 2026')];
  const itineraryDays = await Promise.all([
    itinerariesService.create({
      quoteId,
      dayNumber: 1,
      title: 'Arrival in Amman',
      description: 'Meet at Queen Alia International Airport and transfer to Amman for overnight.',
    }),
    itinerariesService.create({
      quoteId,
      dayNumber: 2,
      title: 'Amman and Jerash',
      description: 'Morning orientation in Amman followed by a visit to Jerash and return to Amman.',
    }),
    itinerariesService.create({
      quoteId,
      dayNumber: 3,
      title: 'Amman to Petra',
      description: 'Travel south to Petra and explore the Nabataean city with guiding.',
    }),
    itinerariesService.create({
      quoteId,
      dayNumber: 4,
      title: 'Petra to Wadi Rum',
      description: 'Morning at leisure in Petra, then onward to Wadi Rum for a jeep safari and camp stay.',
    }),
    itinerariesService.create({
      quoteId,
      dayNumber: 5,
      title: 'Wadi Rum to Aqaba',
      description: 'Transfer to Aqaba and enjoy free time by the Red Sea.',
    }),
    itinerariesService.create({
      quoteId,
      dayNumber: 6,
      title: 'Aqaba to Dead Sea',
      description: 'Transfer north to the Dead Sea for relaxation and overnight.',
    }),
    itinerariesService.create({
      quoteId,
      dayNumber: 7,
      title: 'Departure from Jordan',
      description: 'Transfer to Queen Alia International Airport for final departure.',
    }),
  ]);

  const itineraryByDay = new Map(itineraryDays.map((day) => [day.dayNumber, day]));
  const ammanHotelId = hotels[normalizeKey('The House Boutique Suites Amman')].id;
  const petraHotelId = hotels[normalizeKey('Petra Moon Hotel')].id;
  const wadiRumHotelId = hotels[normalizeKey('Sun City Camp Wadi Rum')].id;
  const aqabaHotelId = hotels[normalizeKey('DoubleTree by Hilton Aqaba')].id;
  const deadSeaHotelId = hotels[normalizeKey('Dead Sea Spa Hotel')].id;

  await createSeedQuoteItem(prisma, {
    quoteId,
    itineraryId: itineraryByDay.get(1)?.id,
    serviceId: services[normalizeKey('Airport Meet And Assist')].id,
    quantity: 1,
    paxCount: 4,
    dayCount: 1,
    markupPercent: 25,
  });

  await createSeedQuoteItem(prisma, {
    quoteId,
    itineraryId: itineraryByDay.get(1)?.id,
    serviceId: services[normalizeKey('Jordan Private Transfer Service')].id,
    vehicleRateId: await findVehicleRateId(prisma, routes[normalizeKey('Queen Alia International Airport - Amman City Center')].id, transportServiceTypes[normalizeKey('Arrival Transfer')].id, 4),
    quantity: 1,
    paxCount: 4,
    markupPercent: 20,
  });

  await createSeedQuoteItem(prisma, {
    quoteId,
    itineraryId: itineraryByDay.get(1)?.id,
    serviceId: services[normalizeKey('Jordan Contracted Hotel Night')].id,
    hotelId: ammanHotelId,
    contractId: contracts[normalizeKey(`${ammanHotelId}:Jordan FIT 2026`)].id,
    seasonId: springSeason.id,
    seasonName: springSeason.name,
    roomCategoryId: roomCategories[normalizeKey(`${ammanHotelId}:Standard Room`)].id,
    occupancyType: HotelOccupancyType.DBL,
    mealPlan: HotelMealPlan.BB,
    quantity: 1,
    paxCount: 4,
    roomCount: 2,
    nightCount: 2,
    markupPercent: 18,
  });

  await createSeedQuoteItem(prisma, {
    quoteId,
    itineraryId: itineraryByDay.get(2)?.id,
    serviceId: services[normalizeKey('Jerash And Amman Touring')].id,
    quantity: 4,
    paxCount: 4,
    dayCount: 1,
    markupPercent: 20,
    serviceDate: new Date('2026-05-11'),
startTime: '09:00',
pickupTime: '08:30',
pickupLocation: 'The House Boutique Suites Amman',
meetingPoint: null,
participantCount: 4,
adultCount: 4,
childCount: 0,
reconfirmationRequired: false,
reconfirmationDueAt: null,
  });

  await createSeedQuoteItem(prisma, {
    quoteId,
    itineraryId: itineraryByDay.get(2)?.id,
    serviceId: services[normalizeKey('Licensed Jordan Guide Service')].id,
    quantity: 1,
    paxCount: 4,
    dayCount: 1,
    guideType: 'local',
    guideDuration: 'full_day',
    overnight: false,
    markupPercent: 25,
  });

  await createSeedQuoteItem(prisma, {
    quoteId,
    itineraryId: itineraryByDay.get(2)?.id,
    serviceId: services[normalizeKey('Jordan Private Transfer Service')].id,
    vehicleRateId: await findVehicleRateId(prisma, routes[normalizeKey('Amman City Center - Jerash Archaeological Site')].id, transportServiceTypes[normalizeKey('Excursion Transfer')].id, 4),
    quantity: 1,
    paxCount: 4,
    markupPercent: 20,
  });

  await createSeedQuoteItem(prisma, {
    quoteId,
    itineraryId: itineraryByDay.get(3)?.id,
    serviceId: services[normalizeKey('Jordan Private Transfer Service')].id,
    vehicleRateId: await findVehicleRateId(prisma, routes[normalizeKey('Amman City Center - Petra Visitor Center')].id, transportServiceTypes[normalizeKey('Intercity Transfer')].id, 4),
    quantity: 1,
    paxCount: 4,
    markupPercent: 20,
  });

  await createSeedQuoteItem(prisma, {
    quoteId,
    itineraryId: itineraryByDay.get(3)?.id,
    serviceId: services[normalizeKey('Petra Entrance And Guided Visit')].id,
    quantity: 4,
    paxCount: 4,
    dayCount: 1,
    markupPercent: 22,
    serviceDate: new Date('2026-05-12'),
startTime: '08:30',
pickupTime: null,
pickupLocation: null,
meetingPoint: 'Petra Visitor Center',
participantCount: 4,
adultCount: 4,
childCount: 0,
reconfirmationRequired: false,
reconfirmationDueAt: null,
  });

  await createSeedQuoteItem(prisma, {
    quoteId,
    itineraryId: itineraryByDay.get(3)?.id,
    serviceId: services[normalizeKey('Jordan Contracted Hotel Night')].id,
    hotelId: petraHotelId,
    contractId: contracts[normalizeKey(`${petraHotelId}:Jordan FIT 2026`)].id,
    seasonId: springSeason.id,
    seasonName: springSeason.name,
    roomCategoryId: roomCategories[normalizeKey(`${petraHotelId}:Standard Room`)].id,
    occupancyType: HotelOccupancyType.DBL,
    mealPlan: HotelMealPlan.BB,
    quantity: 1,
    paxCount: 4,
    roomCount: 2,
    nightCount: 1,
    markupPercent: 18,
  });

  await createSeedQuoteItem(prisma, {
    quoteId,
    itineraryId: itineraryByDay.get(4)?.id,
    serviceId: services[normalizeKey('Jordan Private Transfer Service')].id,
    vehicleRateId: await findVehicleRateId(prisma, routes[normalizeKey('Petra Visitor Center - Wadi Rum Camp Area')].id, transportServiceTypes[normalizeKey('Intercity Transfer')].id, 4),
    quantity: 1,
    paxCount: 4,
    markupPercent: 20,
  });

  await createSeedQuoteItem(prisma, {
    quoteId,
    itineraryId: itineraryByDay.get(4)?.id,
    serviceId: services[normalizeKey('Wadi Rum 2-Hour Jeep Safari')].id,
    quantity: 4,
    paxCount: 4,
    dayCount: 1,
    markupPercent: 20,
    serviceDate: new Date('2026-05-13'),
startTime: '16:00',
pickupTime: null,
pickupLocation: null,
meetingPoint: 'Wadi Rum Camp Area',
participantCount: 4,
adultCount: 4,
childCount: 0,
reconfirmationRequired: true,
reconfirmationDueAt: new Date('2026-05-12T16:00:00.000Z'),
  });

  await createSeedQuoteItem(prisma, {
    quoteId,
    itineraryId: itineraryByDay.get(4)?.id,
    serviceId: services[normalizeKey('Traditional Jordanian Dinner')].id,
    quantity: 4,
    paxCount: 4,
    dayCount: 1,
    markupPercent: 18,
  });

  await createSeedQuoteItem(prisma, {
    quoteId,
    itineraryId: itineraryByDay.get(4)?.id,
    serviceId: services[normalizeKey('Jordan Contracted Hotel Night')].id,
    hotelId: wadiRumHotelId,
    contractId: contracts[normalizeKey(`${wadiRumHotelId}:Jordan FIT 2026`)].id,
    seasonId: springSeason.id,
    seasonName: springSeason.name,
    roomCategoryId: roomCategories[normalizeKey(`${wadiRumHotelId}:Standard Tent`)].id,
    occupancyType: HotelOccupancyType.DBL,
    mealPlan: HotelMealPlan.BB,
    quantity: 1,
    paxCount: 4,
    roomCount: 2,
    nightCount: 1,
    markupPercent: 18,
  });

  await createSeedQuoteItem(prisma, {
    quoteId,
    itineraryId: itineraryByDay.get(5)?.id,
    serviceId: services[normalizeKey('Jordan Private Transfer Service')].id,
    vehicleRateId: await findVehicleRateId(prisma, routes[normalizeKey('Wadi Rum Camp Area - Aqaba City Center')].id, transportServiceTypes[normalizeKey('Intercity Transfer')].id, 4),
    quantity: 1,
    paxCount: 4,
    markupPercent: 20,
  });

  await createSeedQuoteItem(prisma, {
    quoteId,
    itineraryId: itineraryByDay.get(5)?.id,
    serviceId: services[normalizeKey('Jordan Contracted Hotel Night')].id,
    hotelId: aqabaHotelId,
    contractId: contracts[normalizeKey(`${aqabaHotelId}:Jordan FIT 2026`)].id,
    seasonId: springSeason.id,
    seasonName: springSeason.name,
    roomCategoryId: roomCategories[normalizeKey(`${aqabaHotelId}:City View Room`)].id,
    occupancyType: HotelOccupancyType.DBL,
    mealPlan: HotelMealPlan.BB,
    quantity: 1,
    paxCount: 4,
    roomCount: 2,
    nightCount: 1,
    markupPercent: 18,
  });

  await createSeedQuoteItem(prisma, {
    quoteId,
    itineraryId: itineraryByDay.get(6)?.id,
    serviceId: services[normalizeKey('Jordan Private Transfer Service')].id,
    vehicleRateId: await findVehicleRateId(prisma, routes[normalizeKey('Aqaba City Center - Dead Sea Resort Area')].id, transportServiceTypes[normalizeKey('Intercity Transfer')].id, 4),
    quantity: 1,
    paxCount: 4,
    markupPercent: 20,
  });

  await createSeedQuoteItem(prisma, {
    quoteId,
    itineraryId: itineraryByDay.get(6)?.id,
    serviceId: services[normalizeKey('Jordan Contracted Hotel Night')].id,
    hotelId: deadSeaHotelId,
    contractId: contracts[normalizeKey(`${deadSeaHotelId}:Jordan FIT 2026`)].id,
    seasonId: springSeason.id,
    seasonName: springSeason.name,
    roomCategoryId: roomCategories[normalizeKey(`${deadSeaHotelId}:Standard Room`)].id,
    occupancyType: HotelOccupancyType.DBL,
    mealPlan: HotelMealPlan.BB,
    quantity: 1,
    paxCount: 4,
    roomCount: 2,
    nightCount: 1,
    markupPercent: 18,
  });

  await createSeedQuoteItem(prisma, {
    quoteId,
    itineraryId: itineraryByDay.get(7)?.id,
    serviceId: services[normalizeKey('Jordan Private Transfer Service')].id,
    vehicleRateId: await findVehicleRateId(prisma, routes[normalizeKey('Dead Sea Resort Area - Queen Alia International Airport')].id, transportServiceTypes[normalizeKey('Departure Transfer')].id, 4),
    quantity: 1,
    paxCount: 4,
    markupPercent: 20,
  });

  await refreshQuoteTotals(prisma, quoteId, 4);
  await syncQuoteItineraryFromQuoteItems(prisma, quoteId);

  const premiumOption = await prisma.quoteOption.create({
    data: {
      quoteId,
      name: 'Dead Sea Premium Upgrade',
      notes: 'Upgrade the Dead Sea night to the premium room category.',
      pricingMode: QuoteOptionPricingMode.itemized,
    },
  });

  await createSeedQuoteItem(prisma, {
    quoteId,
    optionId: premiumOption.id,
    serviceId: services[normalizeKey('Jordan Contracted Hotel Night')].id,
    itineraryId: itineraryByDay.get(6)?.id,
    hotelId: deadSeaHotelId,
    contractId: contracts[normalizeKey(`${deadSeaHotelId}:Jordan FIT 2026`)].id,
    seasonId: springSeason.id,
    seasonName: springSeason.name,
    roomCategoryId: roomCategories[normalizeKey(`${deadSeaHotelId}:Sea View Room`)].id,
    occupancyType: HotelOccupancyType.DBL,
    mealPlan: HotelMealPlan.HB,
    quantity: 1,
    paxCount: 4,
    roomCount: 2,
    nightCount: 1,
    markupPercent: 18,
  });

  const version = await quotesService.createVersion({
    quoteId,
    label: 'Accepted FIT demo snapshot',
  });

  await quotesService.updateStatus(quoteId, {
    status: QuoteStatus.ACCEPTED,
    acceptedVersionId: version.id,
  });
  const publicLink = await quotesService.enablePublicLink(quoteId);
  const invoice = await quotesService.createInvoice(quoteId);

  const booking = await quotesService.convertToBooking(quoteId);
  await seedBookingAssignments(prisma, booking.id, suppliers);
  await seedBookingOperationsScenario(prisma, booking.id);

  const finalQuote = await prisma.quote.findUniqueOrThrow({
    where: { id: quoteId },
    select: {
      id: true,
      quoteNumber: true,
      status: true,
    },
  });
  const finalBooking = await prisma.booking.findUniqueOrThrow({
    where: { id: booking.id },
    select: {
      id: true,
      bookingRef: true,
      accessToken: true,
    },
  });

  return {
    label: 'FIT accepted scenario',
    summary: `${finalQuote.quoteNumber || finalQuote.id} | status ${finalQuote.status} | invoice ${invoice?.status || 'n/a'} | booking ${finalBooking.bookingRef} | public ${publicLink?.publicToken || 'n/a'}`,
  };
}

async function seedFitSentScenario(
  prisma: PrismaService,
  quotesService: QuotesService,
  itinerariesService: ItinerariesService,
  hotels: Record<string, NamedRecord>,
  roomCategories: Record<string, NamedRecord>,
  contracts: Record<string, NamedRecord>,
  services: Record<string, NamedRecord>,
  routes: Record<string, RouteRecord>,
  transportServiceTypes: Record<string, NamedRecord>,
  seasons: Record<string, NamedRecord>,
) {
  const brandCompany = await upsertCompany(prisma, {
    name: DEMO_BRAND_COMPANY,
    type: 'dmc',
    website: 'https://desertcompass.example',
    country: 'Jordan',
    city: 'Amman',
    primaryColor: '#0F766E',
  });
  const clientCompany = await upsertCompany(prisma, {
    name: 'Demo Company - FIT Sent',
    type: 'travel-agency',
    website: 'https://demo-fit-sent.example',
    country: 'Germany',
    city: 'Munich',
    primaryColor: '#1E40AF',
  });
  const contact = await upsertContact(prisma, clientCompany.id, {
    firstName: 'Elena',
    lastName: 'Fischer',
    email: 'demo.fit.sent@demo.local',
    phone: '+49891234567',
    title: 'Product Executive',
  });

  const quote = await quotesService.create({
    clientCompanyId: clientCompany.id,
    brandCompanyId: brandCompany.id,
    contactId: contact.id,
    title: DEMO_SENT_QUOTE_TITLE,
    description: 'Sent FIT proposal with public sharing enabled for quote-detail and public portal testing.',
    inclusionsText: 'Accommodation, airport transfers, private Petra transfer, touring, and breakfast.',
    exclusionsText: 'Flights, insurance, lunches, gratuities, and optional upgrades.',
    termsNotesText: 'Demo quote for local workflow testing only.',
    pricingMode: 'FIXED',
    fixedPricePerPerson: 760,
    adults: 2,
    children: 0,
    roomCount: 1,
    nightCount: 3,
    travelStartDate: new Date('2026-04-12T00:00:00.000Z'),
    validUntil: new Date('2026-04-30T23:59:59.999Z'),
  });

  const quoteId = quote.id;
  const springSeason = seasons[normalizeKey('Spring 2026')];
  const itineraryDays = await createItineraryDays(itinerariesService, quoteId, [
    { dayNumber: 1, title: 'Arrival in Amman', description: 'Meet on arrival and transfer to Amman hotel.' },
    { dayNumber: 2, title: 'Amman and Jerash', description: 'Private touring day in Amman and Jerash.' },
    { dayNumber: 3, title: 'Petra Excursion', description: 'Private transfer south and Petra guided visit.' },
    { dayNumber: 4, title: 'Departure', description: 'Transfer to the airport for departure.' },
  ]);
  const itineraryByDay = new Map(itineraryDays.map((day) => [day.dayNumber, day]));

  const ammanHotelId = hotels[normalizeKey('The House Boutique Suites Amman')].id;
  const petraHotelId = hotels[normalizeKey('Petra Moon Hotel')].id;

  await createSeedQuoteItem(prisma, {
    quoteId,
    itineraryId: itineraryByDay.get(1)?.id,
    serviceId: services[normalizeKey('Airport Meet And Assist')].id,
    quantity: 1,
    paxCount: 2,
    dayCount: 1,
    markupPercent: 20,
  });
  await createSeedQuoteItem(prisma, {
    quoteId,
    itineraryId: itineraryByDay.get(1)?.id,
    serviceId: services[normalizeKey('Jordan Private Transfer Service')].id,
    vehicleRateId: await findVehicleRateId(
      prisma,
      routes[normalizeKey('Queen Alia International Airport - Amman City Center')].id,
      transportServiceTypes[normalizeKey('Arrival Transfer')].id,
      2,
    ),
    quantity: 1,
    paxCount: 2,
    markupPercent: 18,
  });
  await createSeedQuoteItem(prisma, {
    quoteId,
    itineraryId: itineraryByDay.get(1)?.id,
    serviceId: services[normalizeKey('Jordan Contracted Hotel Night')].id,
    hotelId: ammanHotelId,
    contractId: contracts[normalizeKey(`${ammanHotelId}:Jordan FIT 2026`)].id,
    seasonId: springSeason.id,
    seasonName: springSeason.name,
    roomCategoryId: roomCategories[normalizeKey(`${ammanHotelId}:Standard Room`)].id,
    occupancyType: HotelOccupancyType.DBL,
    mealPlan: HotelMealPlan.BB,
    quantity: 1,
    paxCount: 2,
    roomCount: 1,
    nightCount: 2,
    markupPercent: 18,
  });
  await createSeedQuoteItem(prisma, {
    quoteId,
    itineraryId: itineraryByDay.get(2)?.id,
    serviceId: services[normalizeKey('Jerash And Amman Touring')].id,
    quantity: 2,
    paxCount: 2,
    dayCount: 1,
    markupPercent: 20,
    serviceDate: new Date('2026-04-13T00:00:00.000Z'),
    startTime: '09:00',
    pickupTime: '08:30',
    pickupLocation: 'The House Boutique Suites Amman',
    participantCount: 2,
    adultCount: 2,
  });
  await createSeedQuoteItem(prisma, {
    quoteId,
    itineraryId: itineraryByDay.get(3)?.id,
    serviceId: services[normalizeKey('Jordan Private Transfer Service')].id,
    vehicleRateId: await findVehicleRateId(
      prisma,
      routes[normalizeKey('Amman City Center - Petra Visitor Center')].id,
      transportServiceTypes[normalizeKey('Intercity Transfer')].id,
      2,
    ),
    quantity: 1,
    paxCount: 2,
    markupPercent: 18,
  });
  await createSeedQuoteItem(prisma, {
    quoteId,
    itineraryId: itineraryByDay.get(3)?.id,
    serviceId: services[normalizeKey('Petra Entrance And Guided Visit')].id,
    quantity: 2,
    paxCount: 2,
    dayCount: 1,
    markupPercent: 20,
    serviceDate: new Date('2026-04-14T00:00:00.000Z'),
    startTime: '09:30',
    meetingPoint: 'Petra Visitor Center',
    participantCount: 2,
    adultCount: 2,
  });
  await createSeedQuoteItem(prisma, {
    quoteId,
    itineraryId: itineraryByDay.get(3)?.id,
    serviceId: services[normalizeKey('Jordan Contracted Hotel Night')].id,
    hotelId: petraHotelId,
    contractId: contracts[normalizeKey(`${petraHotelId}:Jordan FIT 2026`)].id,
    seasonId: springSeason.id,
    seasonName: springSeason.name,
    roomCategoryId: roomCategories[normalizeKey(`${petraHotelId}:Standard Room`)].id,
    occupancyType: HotelOccupancyType.DBL,
    mealPlan: HotelMealPlan.BB,
    quantity: 1,
    paxCount: 2,
    roomCount: 1,
    nightCount: 1,
    markupPercent: 18,
  });
  await createSeedQuoteItem(prisma, {
    quoteId,
    itineraryId: itineraryByDay.get(4)?.id,
    serviceId: services[normalizeKey('Jordan Private Transfer Service')].id,
    vehicleRateId: await findVehicleRateId(
      prisma,
      routes[normalizeKey('Dead Sea Resort Area - Queen Alia International Airport')].id,
      transportServiceTypes[normalizeKey('Departure Transfer')].id,
      2,
    ),
    quantity: 1,
    paxCount: 2,
    markupPercent: 18,
  });

  await refreshQuoteTotals(prisma, quoteId, 2);
  await syncQuoteItineraryFromQuoteItems(prisma, quoteId);
  await quotesService.updateStatus(quoteId, {
    status: QuoteStatus.SENT,
  });
  const publicLink = await quotesService.enablePublicLink(quoteId);

  const finalQuote = await prisma.quote.findUniqueOrThrow({
    where: { id: quoteId },
    select: {
      id: true,
      quoteNumber: true,
      status: true,
    },
  });

  return {
    label: 'FIT sent scenario',
    summary: `${finalQuote.quoteNumber || finalQuote.id} | status ${finalQuote.status} | public ${publicLink?.publicToken || 'n/a'}`,
  };
}

async function seedGroupQuoteScenario(
  prisma: PrismaService,
  quotesService: QuotesService,
  itinerariesService: ItinerariesService,
  hotels: Record<string, NamedRecord>,
  roomCategories: Record<string, NamedRecord>,
  contracts: Record<string, NamedRecord>,
  services: Record<string, NamedRecord>,
  routes: Record<string, RouteRecord>,
  transportServiceTypes: Record<string, NamedRecord>,
  seasons: Record<string, NamedRecord>,
) {
  const brandCompany = await upsertCompany(prisma, {
    name: DEMO_BRAND_COMPANY,
    type: 'dmc',
    website: 'https://desertcompass.example',
    country: 'Jordan',
    city: 'Amman',
    primaryColor: '#0F766E',
  });
  const clientCompany = await upsertCompany(prisma, {
    name: 'Demo Company - Group',
    type: 'tour-operator',
    website: 'https://demo-group.example',
    country: 'Spain',
    city: 'Madrid',
    primaryColor: '#B45309',
  });
  const contact = await upsertContact(prisma, clientCompany.id, {
    firstName: 'Carlos',
    lastName: 'Mendez',
    email: 'demo.group@demo.local',
    phone: '+34911222333',
    title: 'Groups Contracting Manager',
  });

  const quote = await quotesService.create({
    clientCompanyId: clientCompany.id,
    brandCompanyId: brandCompany.id,
    contactId: contact.id,
    bookingType: 'GROUP',
    title: DEMO_GROUP_QUOTE_TITLE,
    description: 'Group quote with slab pricing, itinerary-linked services, and a saved version for commercial review.',
    inclusionsText: 'Accommodation, touring coach, selected sightseeing, one dinner, and local coordination.',
    exclusionsText: 'Flights, tips, porterage, and optional side programs.',
    termsNotesText: 'Demo group quote for UI and workflow testing.',
    pricingMode: 'SLAB',
    pricingType: 'group',
    adults: 14,
    children: 0,
    roomCount: 7,
    nightCount: 4,
    fixedPricePerPerson: 0,
    travelStartDate: new Date('2026-09-15T00:00:00.000Z'),
    validUntil: new Date('2026-08-31T23:59:59.999Z'),
  });

  const quoteId = quote.id;
  const autumnSeason = seasons[normalizeKey('Autumn 2026')];
  const itineraryDays = await createItineraryDays(itinerariesService, quoteId, [
    { dayNumber: 1, title: 'Arrival and check-in in Amman', description: 'Arrive in Amman and settle into the city hotel.' },
    { dayNumber: 2, title: 'Jerash excursion', description: 'Full-day touring with group transfer and guide.' },
    { dayNumber: 3, title: 'Petra transfer and visit', description: 'Drive south and enter Petra with local support.' },
    { dayNumber: 4, title: 'Petra to Wadi Rum', description: 'Continue to Wadi Rum for jeep safari and overnight camp.' },
    { dayNumber: 5, title: 'Departure transfer', description: 'Return for departure transfer.' },
  ]);
  const itineraryByDay = new Map(itineraryDays.map((day) => [day.dayNumber, day]));

  const ammanHotelId = hotels[normalizeKey('The House Boutique Suites Amman')].id;
  const petraHotelId = hotels[normalizeKey('Petra Moon Hotel')].id;
  const wadiRumHotelId = hotels[normalizeKey('Sun City Camp Wadi Rum')].id;

  await createSeedQuoteItem(prisma, {
    quoteId,
    itineraryId: itineraryByDay.get(1)?.id,
    serviceId: services[normalizeKey('Jordan Private Transfer Service')].id,
    vehicleRateId: await findVehicleRateId(
      prisma,
      routes[normalizeKey('Queen Alia International Airport - Amman City Center')].id,
      transportServiceTypes[normalizeKey('Arrival Transfer')].id,
      14,
    ),
    quantity: 1,
    paxCount: 14,
    markupPercent: 15,
  });
  await createSeedQuoteItem(prisma, {
    quoteId,
    itineraryId: itineraryByDay.get(1)?.id,
    serviceId: services[normalizeKey('Jordan Contracted Hotel Night')].id,
    hotelId: ammanHotelId,
    contractId: contracts[normalizeKey(`${ammanHotelId}:Jordan FIT 2026`)].id,
    seasonId: autumnSeason.id,
    seasonName: autumnSeason.name,
    roomCategoryId: roomCategories[normalizeKey(`${ammanHotelId}:Standard Room`)].id,
    occupancyType: HotelOccupancyType.DBL,
    mealPlan: HotelMealPlan.BB,
    quantity: 1,
    paxCount: 14,
    roomCount: 7,
    nightCount: 2,
    markupPercent: 16,
  });
  await createSeedQuoteItem(prisma, {
    quoteId,
    itineraryId: itineraryByDay.get(2)?.id,
    serviceId: services[normalizeKey('Jerash And Amman Touring')].id,
    quantity: 14,
    paxCount: 14,
    dayCount: 1,
    markupPercent: 18,
    serviceDate: new Date('2026-09-16T00:00:00.000Z'),
    startTime: '09:00',
    pickupTime: '08:15',
    pickupLocation: 'The House Boutique Suites Amman',
    participantCount: 14,
    adultCount: 14,
  });
  await createSeedQuoteItem(prisma, {
    quoteId,
    itineraryId: itineraryByDay.get(2)?.id,
    serviceId: services[normalizeKey('Licensed Jordan Guide Service')].id,
    quantity: 1,
    paxCount: 14,
    dayCount: 1,
    guideType: 'escort',
    guideDuration: 'full_day',
    overnight: false,
    markupPercent: 20,
  });
  await createSeedQuoteItem(prisma, {
    quoteId,
    itineraryId: itineraryByDay.get(3)?.id,
    serviceId: services[normalizeKey('Jordan Private Transfer Service')].id,
    vehicleRateId: await findVehicleRateId(
      prisma,
      routes[normalizeKey('Amman City Center - Petra Visitor Center')].id,
      transportServiceTypes[normalizeKey('Intercity Transfer')].id,
      14,
    ),
    quantity: 1,
    paxCount: 14,
    markupPercent: 15,
  });
  await createSeedQuoteItem(prisma, {
    quoteId,
    itineraryId: itineraryByDay.get(3)?.id,
    serviceId: services[normalizeKey('Petra Entrance And Guided Visit')].id,
    quantity: 14,
    paxCount: 14,
    dayCount: 1,
    markupPercent: 20,
    serviceDate: new Date('2026-09-17T00:00:00.000Z'),
    startTime: '10:00',
    meetingPoint: 'Petra Visitor Center',
    participantCount: 14,
    adultCount: 14,
  });
  await createSeedQuoteItem(prisma, {
    quoteId,
    itineraryId: itineraryByDay.get(3)?.id,
    serviceId: services[normalizeKey('Jordan Contracted Hotel Night')].id,
    hotelId: petraHotelId,
    contractId: contracts[normalizeKey(`${petraHotelId}:Jordan FIT 2026`)].id,
    seasonId: autumnSeason.id,
    seasonName: autumnSeason.name,
    roomCategoryId: roomCategories[normalizeKey(`${petraHotelId}:Standard Room`)].id,
    occupancyType: HotelOccupancyType.DBL,
    mealPlan: HotelMealPlan.BB,
    quantity: 1,
    paxCount: 14,
    roomCount: 7,
    nightCount: 1,
    markupPercent: 16,
  });
  await createSeedQuoteItem(prisma, {
    quoteId,
    itineraryId: itineraryByDay.get(4)?.id,
    serviceId: services[normalizeKey('Jordan Private Transfer Service')].id,
    vehicleRateId: await findVehicleRateId(
      prisma,
      routes[normalizeKey('Petra Visitor Center - Wadi Rum Camp Area')].id,
      transportServiceTypes[normalizeKey('Intercity Transfer')].id,
      14,
    ),
    quantity: 1,
    paxCount: 14,
    markupPercent: 15,
  });
  await createSeedQuoteItem(prisma, {
    quoteId,
    itineraryId: itineraryByDay.get(4)?.id,
    serviceId: services[normalizeKey('Wadi Rum 2-Hour Jeep Safari')].id,
    quantity: 14,
    paxCount: 14,
    dayCount: 1,
    markupPercent: 18,
    serviceDate: new Date('2026-09-18T00:00:00.000Z'),
    startTime: '16:30',
    meetingPoint: 'Wadi Rum Camp Area',
    participantCount: 14,
    adultCount: 14,
    reconfirmationRequired: false,
    reconfirmationDueAt: null,
  });
  await createSeedQuoteItem(prisma, {
    quoteId,
    itineraryId: itineraryByDay.get(4)?.id,
    serviceId: services[normalizeKey('Jordan Contracted Hotel Night')].id,
    hotelId: wadiRumHotelId,
    contractId: contracts[normalizeKey(`${wadiRumHotelId}:Jordan FIT 2026`)].id,
    seasonId: autumnSeason.id,
    seasonName: autumnSeason.name,
    roomCategoryId: roomCategories[normalizeKey(`${wadiRumHotelId}:Standard Tent`)].id,
    occupancyType: HotelOccupancyType.DBL,
    mealPlan: HotelMealPlan.BB,
    quantity: 1,
    paxCount: 14,
    roomCount: 7,
    nightCount: 1,
    markupPercent: 16,
  });
  await createSeedQuoteItem(prisma, {
    quoteId,
    itineraryId: itineraryByDay.get(5)?.id,
    serviceId: services[normalizeKey('Traditional Jordanian Dinner')].id,
    quantity: 14,
    paxCount: 14,
    dayCount: 1,
    markupPercent: 18,
  });

  await quotesService.createPricingSlab(quoteId, { minPax: 8, maxPax: 10, price: 990 });
  await quotesService.createPricingSlab(quoteId, { minPax: 11, maxPax: 12, price: 955 });
  await quotesService.createPricingSlab(quoteId, { minPax: 13, maxPax: 14, price: 925 });
  await quotesService.generateScenarios({
    quoteId,
    paxCounts: [8, 10, 12, 14],
  });
  await syncQuoteItineraryFromQuoteItems(prisma, quoteId);
  await quotesService.createVersion({
    quoteId,
    label: 'Group commercial review v1',
  });
  await quotesService.updateStatus(quoteId, {
    status: QuoteStatus.READY,
  });

  const finalQuote = await prisma.quote.findUniqueOrThrow({
    where: { id: quoteId },
    select: {
      id: true,
      quoteNumber: true,
      status: true,
      pricingSlabs: {
        select: { id: true },
      },
      scenarios: {
        select: { id: true },
      },
      versions: {
        select: { id: true },
      },
    },
  });

  return {
    label: 'GROUP slab scenario',
    summary: `${finalQuote.quoteNumber || finalQuote.id} | status ${finalQuote.status} | slabs ${finalQuote.pricingSlabs.length} | scenarios ${finalQuote.scenarios.length} | versions ${finalQuote.versions.length}`,
  };
}

async function seedRevisionRequestedScenario(
  prisma: PrismaService,
  quotesService: QuotesService,
  itinerariesService: ItinerariesService,
  hotels: Record<string, NamedRecord>,
  roomCategories: Record<string, NamedRecord>,
  contracts: Record<string, NamedRecord>,
  services: Record<string, NamedRecord>,
  routes: Record<string, RouteRecord>,
  transportServiceTypes: Record<string, NamedRecord>,
  seasons: Record<string, NamedRecord>,
) {
  const brandCompany = await upsertCompany(prisma, {
    name: DEMO_BRAND_COMPANY,
    type: 'dmc',
    website: 'https://desertcompass.example',
    country: 'Jordan',
    city: 'Amman',
    primaryColor: '#0F766E',
  });
  const clientCompany = await upsertCompany(prisma, {
    name: 'Demo Company - Revision Requested',
    type: 'travel-agency',
    website: 'https://demo-revision.example',
    country: 'France',
    city: 'Paris',
    primaryColor: '#7C3AED',
  });
  const contact = await upsertContact(prisma, clientCompany.id, {
    firstName: 'Claire',
    lastName: 'Dubois',
    email: 'demo.revision@demo.local',
    phone: '+33155667788',
    title: 'Leisure Contracting Manager',
  });

  const quote = await quotesService.create({
    clientCompanyId: clientCompany.id,
    brandCompanyId: brandCompany.id,
    contactId: contact.id,
    title: DEMO_REVISION_QUOTE_TITLE,
    description: 'Publicly shared FIT quote with a client change request captured in the current workflow.',
    inclusionsText: 'Accommodation, transfers, Petra excursion, and breakfast.',
    exclusionsText: 'Flights, insurance, lunch, dinners unless specified, and personal expenses.',
    termsNotesText: 'Demo revision-request scenario.',
    pricingMode: 'FIXED',
    fixedPricePerPerson: 845,
    adults: 2,
    children: 1,
    roomCount: 2,
    nightCount: 4,
    travelStartDate: new Date('2026-06-10T00:00:00.000Z'),
    validUntil: new Date('2026-05-25T23:59:59.999Z'),
  });

  const quoteId = quote.id;
  const summerSeason = seasons[normalizeKey('Summer 2026')];
  const itineraryDays = await createItineraryDays(itinerariesService, quoteId, [
    { dayNumber: 1, title: 'Arrival and Amman overnight', description: 'Airport arrival and hotel check-in in Amman.' },
    { dayNumber: 2, title: 'Jerash touring', description: 'Private touring day with guide support.' },
    { dayNumber: 3, title: 'Petra day trip', description: 'Drive south and visit Petra.' },
    { dayNumber: 4, title: 'Dead Sea relaxation', description: 'Transfer to Dead Sea for final night.' },
    { dayNumber: 5, title: 'Departure', description: 'Airport transfer for outbound flight.' },
  ]);
  const itineraryByDay = new Map(itineraryDays.map((day) => [day.dayNumber, day]));
  const ammanHotelId = hotels[normalizeKey('The House Boutique Suites Amman')].id;
  const deadSeaHotelId = hotels[normalizeKey('Dead Sea Spa Hotel')].id;

  await createSeedQuoteItem(prisma, {
    quoteId,
    itineraryId: itineraryByDay.get(1)?.id,
    serviceId: services[normalizeKey('Jordan Private Transfer Service')].id,
    vehicleRateId: await findVehicleRateId(
      prisma,
      routes[normalizeKey('Queen Alia International Airport - Amman City Center')].id,
      transportServiceTypes[normalizeKey('Arrival Transfer')].id,
      3,
    ),
    quantity: 1,
    paxCount: 3,
    markupPercent: 18,
  });
  await createSeedQuoteItem(prisma, {
    quoteId,
    itineraryId: itineraryByDay.get(1)?.id,
    serviceId: services[normalizeKey('Jordan Contracted Hotel Night')].id,
    hotelId: ammanHotelId,
    contractId: contracts[normalizeKey(`${ammanHotelId}:Jordan FIT 2026`)].id,
    seasonId: summerSeason.id,
    seasonName: summerSeason.name,
    roomCategoryId: roomCategories[normalizeKey(`${ammanHotelId}:Deluxe Room`)].id,
    occupancyType: HotelOccupancyType.DBL,
    mealPlan: HotelMealPlan.HB,
    quantity: 1,
    paxCount: 3,
    roomCount: 2,
    nightCount: 3,
    markupPercent: 18,
  });
  await createSeedQuoteItem(prisma, {
    quoteId,
    itineraryId: itineraryByDay.get(2)?.id,
    serviceId: services[normalizeKey('Jerash And Amman Touring')].id,
    quantity: 3,
    paxCount: 3,
    dayCount: 1,
    markupPercent: 20,
    serviceDate: new Date('2026-06-11T00:00:00.000Z'),
    startTime: '09:00',
    pickupTime: '08:30',
    pickupLocation: 'The House Boutique Suites Amman',
    participantCount: 3,
    adultCount: 2,
    childCount: 1,
  });
  await createSeedQuoteItem(prisma, {
    quoteId,
    itineraryId: itineraryByDay.get(3)?.id,
    serviceId: services[normalizeKey('Petra Entrance And Guided Visit')].id,
    quantity: 3,
    paxCount: 3,
    dayCount: 1,
    markupPercent: 22,
    serviceDate: new Date('2026-06-12T00:00:00.000Z'),
    startTime: '09:45',
    meetingPoint: 'Petra Visitor Center',
    participantCount: 3,
    adultCount: 2,
    childCount: 1,
  });
  await createSeedQuoteItem(prisma, {
    quoteId,
    itineraryId: itineraryByDay.get(4)?.id,
    serviceId: services[normalizeKey('Jordan Contracted Hotel Night')].id,
    hotelId: deadSeaHotelId,
    contractId: contracts[normalizeKey(`${deadSeaHotelId}:Jordan FIT 2026`)].id,
    seasonId: summerSeason.id,
    seasonName: summerSeason.name,
    roomCategoryId: roomCategories[normalizeKey(`${deadSeaHotelId}:Sea View Room`)].id,
    occupancyType: HotelOccupancyType.DBL,
    mealPlan: HotelMealPlan.HB,
    quantity: 1,
    paxCount: 3,
    roomCount: 2,
    nightCount: 1,
    markupPercent: 18,
  });
  await createSeedQuoteItem(prisma, {
    quoteId,
    itineraryId: itineraryByDay.get(5)?.id,
    serviceId: services[normalizeKey('Jordan Private Transfer Service')].id,
    vehicleRateId: await findVehicleRateId(
      prisma,
      routes[normalizeKey('Dead Sea Resort Area - Queen Alia International Airport')].id,
      transportServiceTypes[normalizeKey('Departure Transfer')].id,
      3,
    ),
    quantity: 1,
    paxCount: 3,
    markupPercent: 18,
  });

  await refreshQuoteTotals(prisma, quoteId, 3);
  await syncQuoteItineraryFromQuoteItems(prisma, quoteId);
  await quotesService.updateStatus(quoteId, {
    status: QuoteStatus.SENT,
  });
  const publicLink = await quotesService.enablePublicLink(quoteId);
  await quotesService.requestPublicQuoteChanges(
    publicLink?.publicToken || '',
    'Please revise the Dead Sea night to HB and add one family-friendly dinner option on day 2.',
  );

  const finalQuote = await prisma.quote.findUniqueOrThrow({
    where: { id: quoteId },
    select: {
      id: true,
      quoteNumber: true,
      status: true,
      clientChangeRequestMessage: true,
    },
  });

  return {
    label: 'Revision-requested scenario',
    summary: `${finalQuote.quoteNumber || finalQuote.id} | status ${finalQuote.status} | public ${publicLink?.publicToken || 'n/a'} | message "${finalQuote.clientChangeRequestMessage || ''}"`,
  };
}

async function seedBookingOperationsScenario(prisma: PrismaService, bookingId: string) {
  const adminUser = await prisma.user.findFirst({
    where: {
      email: 'operations@dmc.local',
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
    },
  });
  const actorLabel = adminUser
    ? `${adminUser.firstName} ${adminUser.lastName} <${adminUser.email}> [operations]`
    : 'Demo Operations User';

  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      status: 'in_progress',
      statusNote: 'Demo booking moved into operations execution.',
      clientInvoiceStatus: 'invoiced',
      supplierPaymentStatus: 'scheduled',
    },
  });

  const services = await prisma.bookingService.findMany({
    where: { bookingId },
    orderBy: [{ serviceOrder: 'asc' }, { id: 'asc' }],
  });

  const statusMatrix = [
    {
      lifecycleStatus: 'confirmed',
      confirmationStatus: 'confirmed',
      supplierReference: 'OPS-ARR-001',
      confirmationNumber: 'SUP-ARR-001',
      confirmationNotes: 'Arrival transfer confirmed with driver assigned.',
      confirmationRequestedAt: new Date('2026-05-08T10:00:00.000Z'),
      confirmationConfirmedAt: new Date('2026-05-08T12:00:00.000Z'),
      statusNote: 'Ready for arrival handling.',
    },
    {
      lifecycleStatus: 'ready',
      confirmationStatus: 'requested',
      supplierReference: 'OPS-HOTEL-001',
      confirmationNumber: null,
      confirmationNotes: 'Waiting for final rooming confirmation.',
      confirmationRequestedAt: new Date('2026-05-09T09:00:00.000Z'),
      confirmationConfirmedAt: null,
      statusNote: 'Hoteling details prepared, awaiting reconfirmation.',
    },
    {
      lifecycleStatus: 'in_progress',
      confirmationStatus: 'requested',
      supplierReference: 'OPS-ACT-001',
      confirmationNumber: null,
      confirmationNotes: 'Guide requested to reconfirm timing.',
      confirmationRequestedAt: new Date('2026-05-10T11:30:00.000Z'),
      confirmationConfirmedAt: null,
      statusNote: 'Activity team following up on reconfirmation.',
    },
    {
      lifecycleStatus: 'pending',
      confirmationStatus: 'pending',
      supplierReference: null,
      confirmationNumber: null,
      confirmationNotes: null,
      confirmationRequestedAt: null,
      confirmationConfirmedAt: null,
      statusNote: 'Pending manual follow-up.',
    },
    {
      lifecycleStatus: 'cancelled',
      confirmationStatus: 'pending',
      supplierReference: null,
      confirmationNumber: null,
      confirmationNotes: 'Cancelled from demo operations workflow.',
      confirmationRequestedAt: null,
      confirmationConfirmedAt: null,
      statusNote: 'Cancelled by operations for edge-case UI coverage.',
    },
  ] as const;

  for (const [index, service] of services.entries()) {
    const status = statusMatrix[index] || statusMatrix[statusMatrix.length - 1];
    await prisma.bookingService.update({
      where: { id: service.id },
      data: {
        status: status.lifecycleStatus as any,
        confirmationStatus: status.confirmationStatus as any,
        supplierReference: status.supplierReference,
        confirmationNumber: status.confirmationNumber,
        confirmationNotes: status.confirmationNotes,
        confirmationRequestedAt: status.confirmationRequestedAt,
        confirmationConfirmedAt: status.confirmationConfirmedAt,
        statusNote: status.statusNote,
      },
    });

    await prisma.bookingAuditLog.create({
      data: {
        bookingId,
        bookingServiceId: service.id,
        entityType: 'booking_service',
        entityId: service.id,
        action: 'demo_seed_service_status',
        oldValue: null,
        newValue: `${status.lifecycleStatus}/${status.confirmationStatus}`,
        note: status.statusNote,
        actorUserId: adminUser?.id || null,
        actor: actorLabel,
      },
    });
  }

  const passengers = await Promise.all(
    [
      { firstName: 'Omar', lastName: 'Haddad', title: 'Mr', isLead: true, notes: 'Lead passenger' },
      { firstName: 'Layla', lastName: 'Haddad', title: 'Mrs', isLead: false, notes: 'Rooming with lead passenger' },
      { firstName: 'Rana', lastName: 'Haddad', title: 'Ms', isLead: false, notes: 'Second room assignment' },
      { firstName: 'Sami', lastName: 'Haddad', title: 'Mr', isLead: false, notes: 'Intentionally left unassigned for rooming UI coverage' },
    ].map((passenger) =>
      prisma.bookingPassenger.create({
        data: {
          bookingId,
          ...passenger,
        },
      }),
    ),
  );

  const roomEntries = await Promise.all(
    [
      { roomType: 'Double/Twin', occupancy: 'double', notes: 'Lead room', sortOrder: 1 },
      { roomType: 'Double/Twin', occupancy: 'double', notes: 'Second room pending final assignment', sortOrder: 2 },
    ].map((entry) =>
      prisma.bookingRoomingEntry.create({
        data: {
          bookingId,
          roomType: entry.roomType,
          occupancy: entry.occupancy as any,
          notes: entry.notes,
          sortOrder: entry.sortOrder,
        },
      }),
    ),
  );

  await prisma.bookingRoomingAssignment.create({
    data: {
      bookingRoomingEntryId: roomEntries[0].id,
      bookingPassengerId: passengers[0].id,
    },
  });
  await prisma.bookingRoomingAssignment.create({
    data: {
      bookingRoomingEntryId: roomEntries[0].id,
      bookingPassengerId: passengers[1].id,
    },
  });
  await prisma.bookingRoomingAssignment.create({
    data: {
      bookingRoomingEntryId: roomEntries[1].id,
      bookingPassengerId: passengers[2].id,
    },
  });

  await prisma.bookingAuditLog.create({
    data: {
      bookingId,
      entityType: 'booking',
      entityId: bookingId,
      action: 'demo_seed_booking_status',
      oldValue: null,
      newValue: 'in_progress',
      note: 'Demo booking prepared with passengers, rooming, and mixed service lifecycle states.',
      actorUserId: adminUser?.id || null,
      actor: actorLabel,
    },
  });
}

async function seedBookingAssignments(
  prisma: PrismaService,
  bookingId: string,
  suppliers: Record<string, NamedRecord>,
) {
  const services = await prisma.bookingService.findMany({
    where: { bookingId },
    orderBy: [{ serviceOrder: 'asc' }, { id: 'asc' }],
  });

  for (const service of services) {
    let supplierId: string | null = null;

    if (service.serviceType.toLowerCase().includes('accommodation')) {
      supplierId = suppliers[normalizeKey('The House Boutique Suites Amman')].id;
    } else if (service.serviceType.toLowerCase().includes('transport')) {
      supplierId = suppliers[normalizeKey('Desert Compass Transport')].id;
    } else if (service.serviceType.toLowerCase().includes('guid')) {
      supplierId = suppliers[normalizeKey('Desert Compass Guides')].id;
    } else if (service.serviceType.toLowerCase().includes('dining')) {
      supplierId = suppliers[normalizeKey('Jordanian Table Catering')].id;
    } else if (service.serviceType.toLowerCase().includes('sightseeing')) {
      supplierId = suppliers[normalizeKey('Desert Compass Experiences')].id;
    }

    if (!supplierId) {
      continue;
    }

    const supplier = await prisma.supplier.findUniqueOrThrow({
      where: { id: supplierId },
    });

    await prisma.bookingService.update({
      where: { id: service.id },
      data: {
        supplierId: supplier.id,
        supplierName: supplier.name,
      },
    });
  }
}

async function resetDemoScenarioData(prisma: PrismaService) {
  const demoQuotes = await prisma.quote.findMany({
    where: {
      title: {
        startsWith: DEMO_PREFIX,
        mode: 'insensitive',
      },
    },
    select: {
      id: true,
    },
  });

  for (const quote of demoQuotes) {
    await deleteQuoteScenario(prisma, quote.id);
  }

  const demoCompanies = await prisma.company.findMany({
    where: {
      name: {
        startsWith: DEMO_PREFIX,
        mode: 'insensitive',
      },
    },
    select: {
      id: true,
    },
  });

  if (demoCompanies.length > 0) {
    await prisma.contact.deleteMany({
      where: {
        companyId: {
          in: demoCompanies.map((company) => company.id),
        },
      },
    });
    await prisma.company.deleteMany({
      where: {
        id: {
          in: demoCompanies.map((company) => company.id),
        },
      },
    });
  }
}

async function deleteQuoteScenario(prisma: PrismaService, quoteId: string) {
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

async function upsertCompany(
  prisma: PrismaService,
  data: {
    name: string;
    type: string;
    website: string;
    country: string;
    city: string;
    primaryColor: string;
  },
) {
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
  prisma: PrismaService,
  companyId: string,
  data: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    title: string;
  },
) {
  const existing = await prisma.contact.findFirst({
    where: {
      companyId,
      email: {
        equals: data.email,
        mode: 'insensitive',
      },
    },
  });

  if (existing) {
    return prisma.contact.update({
      where: { id: existing.id },
      data: {
        companyId,
        ...data,
      },
    });
  }

  return prisma.contact.create({
    data: {
      companyId,
      ...data,
    },
  });
}

function toRecordMap<T extends NamedRecord>(records: T[]) {
  return records.reduce<Record<string, T>>((accumulator, record) => {
    accumulator[normalizeKey(record.name)] = record;
    return accumulator;
  }, {});
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

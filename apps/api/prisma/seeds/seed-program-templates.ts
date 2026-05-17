import { PackageTemplateComponentType, PrismaClient } from '@prisma/client';

type ProgramComponentSeed = {
  componentType: PackageTemplateComponentType;
  label: string;
  sortOrder: number;
  isOptional?: boolean;
  excursionTemplateCode?: string;
  activityCode?: string;
  touringRouteCode?: string;
  transferRouteTerms?: string[];
  supplierServiceTerms?: string[];
  hotelContractTerms?: string[];
  pricingMode?: string;
  operationalNotes: string;
};

type ProgramDaySeed = {
  dayNumber: number;
  title: string;
  description: string;
  components: ProgramComponentSeed[];
};

type ProgramTemplateSeed = {
  code: string;
  name: string;
  durationDays: number;
  targetMarket: string;
  season: string;
  destination: string;
  summary: string;
  inclusions: string;
  exclusions: string;
  hotelCategoryNotes: string;
  guideRules: string;
  categoryTags: string[];
  operationalNotes: string;
  days: ProgramDaySeed[];
};

const CLASSIC_JORDAN_8D7N: ProgramTemplateSeed = {
  code: 'PROGRAM-CLASSIC-JORDAN-8D7N',
  name: 'Classic Jordan 8D7N Program Template',
  durationDays: 8,
  targetMarket: 'Inbound leisure groups and FIT',
  season: 'Year-round, with heat review from May to September',
  destination: 'Jordan',
  summary:
    'Reusable multi-day Classic Jordan program using existing transfers, touring routes, excursion templates, activities, hotels, dining service placeholders, and guide rules.',
  inclusions:
    'Reusable day structure, linked excursion templates where available, operational transfer/touring route references, hotel category notes, dining placeholders, and guide rules.',
  exclusions:
    'Live pricing, confirmed hotel allotments, supplier confirmations, flight tickets, visas, tips, personal expenses, and finance/invoice records.',
  hotelCategoryNotes:
    'Use selectable hotel category variants: 3 star, 4 star, 5 star, and 5 star luxury. Overnight pattern: Amman 3N, Petra 1N, Wadi Rum 1N, Aqaba 1N, Dead Sea 1N. Hotel contracts are linked only if existing records match; this seed does not create hotels or contracts.',
  guideRules:
    'Licensed English-speaking guide recommended throughout touring days. Local/specialist guides remain separate operational resources. Petra local guide rules and religious/cultural specialist guide requirements follow linked Activity/Excursion metadata.',
  categoryTags: ['Classic Jordan', 'Multi-day', 'Cultural', 'Historical', 'Wellness'],
  operationalNotes:
    'Program Template Phase 1 foundation. PackageTemplate is used as the Program Template model. This seed composes existing ERP building blocks and does not alter pricing, finance, invoices, quotes, hotels, routes, activities, or excursion masters.',
  days: [
    {
      dayNumber: 1,
      title: 'Arrival Amman',
      description: 'Arrival at QAIA, meet and assist, transfer to Amman, overnight in Amman.',
      components: [
        {
          componentType: 'TRANSPORT',
          label: 'QAIA to Amman arrival transfer',
          sortOrder: 0,
          transferRouteTerms: ['QAIA', 'Amman'],
          pricingMode: 'Airport Transfer',
          operationalNotes: 'Use existing Transfer Route if available. Do not create transfer route from this seed.',
        },
        {
          componentType: 'HOTEL',
          label: 'Amman hotel overnight',
          sortOrder: 1,
          hotelContractTerms: ['Amman'],
          operationalNotes: 'Hotel category selected later by operator. Overnight 1 of 3 in Amman.',
        },
        {
          componentType: 'SERVICE',
          label: 'Arrival meet and assist / guide rule',
          sortOrder: 2,
          isOptional: true,
          operationalNotes: 'Meet and assist or guide arrival support depends on booking profile. Guide resource remains separate.',
        },
      ],
    },
    {
      dayNumber: 2,
      title: 'Jerash and Ajloun',
      description: 'Full-day north Jordan touring from Amman to Jerash and Ajloun, return to Amman.',
      components: [
        {
          componentType: 'EXCURSION_TEMPLATE',
          label: 'Jerash & Ajloun Full Day',
          sortOrder: 0,
          excursionTemplateCode: 'JERASH_AJLOUN_FULL_DAY',
          operationalNotes: 'Sellable day excursion template composed from existing north Jordan route and activity records.',
        },
        {
          componentType: 'HOTEL',
          label: 'Amman hotel overnight',
          sortOrder: 1,
          hotelContractTerms: ['Amman'],
          operationalNotes: 'Overnight 2 of 3 in Amman.',
        },
      ],
    },
    {
      dayNumber: 3,
      title: 'Madaba, Nebo, Dead Sea and Amman',
      description: 'Central Jordan touring with Madaba, Mount Nebo and Dead Sea relaxation, overnight Amman.',
      components: [
        {
          componentType: 'EXCURSION_TEMPLATE',
          label: 'Madaba, Nebo & Dead Sea',
          sortOrder: 0,
          excursionTemplateCode: 'MADABA_NEBO_DEAD_SEA',
          operationalNotes: 'Sellable central Jordan excursion template. Tickets/day-use remain separate components inside the excursion template.',
        },
        {
          componentType: 'HOTEL',
          label: 'Amman hotel overnight',
          sortOrder: 1,
          hotelContractTerms: ['Amman'],
          operationalNotes: 'Overnight 3 of 3 in Amman.',
        },
      ],
    },
    {
      dayNumber: 4,
      title: 'Amman to Petra via Kerak',
      description: 'Depart Amman toward Petra via Kerak touring route. Overnight in Petra.',
      components: [
        {
          componentType: 'TRANSPORT',
          label: 'Amman – Kerak – Petra touring route',
          sortOrder: 0,
          touringRouteCode: 'JOR-TR-SOUTH-KERAK-PETRA-ON',
          operationalNotes: 'Uses existing canonical Touring Route. Touring route remains operational infrastructure.',
        },
        {
          componentType: 'TICKET',
          label: 'Kerak Castle ticket/access',
          sortOrder: 1,
          supplierServiceTerms: ['Kerak', 'Castle'],
          isOptional: true,
          operationalNotes: 'Link existing ticketing service if present. Ticketing remains separate.',
        },
        {
          componentType: 'HOTEL',
          label: 'Petra hotel overnight',
          sortOrder: 2,
          hotelContractTerms: ['Petra'],
          operationalNotes: 'Petra overnight. Hotel category selected later by operator.',
        },
      ],
    },
    {
      dayNumber: 5,
      title: 'Petra Full Day and Wadi Rum',
      description: 'Full-day Petra visit, then continue to Wadi Rum for overnight camp experience.',
      components: [
        {
          componentType: 'EXCURSION_TEMPLATE',
          label: 'Petra Full Day',
          sortOrder: 0,
          excursionTemplateCode: 'PETRA_FULL_DAY',
          operationalNotes: 'Sellable Petra excursion template links Petra Activity Master, ticketing where present, and guide rules.',
        },
        {
          componentType: 'TRANSPORT',
          label: 'Petra – Wadi Rum touring route',
          sortOrder: 1,
          touringRouteCode: 'JOR-TR-SOUTH-PETRA-WADI-RUM-ON',
          operationalNotes: 'Uses existing canonical Touring Route from Petra to Wadi Rum.',
        },
        {
          componentType: 'HOTEL',
          label: 'Wadi Rum camp overnight',
          sortOrder: 2,
          hotelContractTerms: ['Wadi Rum', 'Camp'],
          operationalNotes: 'Camp/hotel category selected later. Confirm camp access and dinner inclusions separately.',
        },
      ],
    },
    {
      dayNumber: 6,
      title: 'Wadi Rum Jeep Experience and Aqaba',
      description: 'Wadi Rum jeep experience, then continue to Aqaba for overnight.',
      components: [
        {
          componentType: 'EXCURSION_TEMPLATE',
          label: 'Wadi Rum Jeep Experience',
          sortOrder: 0,
          excursionTemplateCode: 'WADI_RUM_JEEP_EXPERIENCE',
          operationalNotes: 'Sellable Wadi Rum jeep excursion template composed from existing Activity Master and route records.',
        },
        {
          componentType: 'TRANSPORT',
          label: 'Wadi Rum to Aqaba transfer',
          sortOrder: 1,
          transferRouteTerms: ['Wadi Rum', 'Aqaba'],
          pricingMode: 'Point-to-Point',
          operationalNotes: 'Use existing Transfer Route if available. Do not create route from this seed.',
        },
        {
          componentType: 'HOTEL',
          label: 'Aqaba hotel overnight',
          sortOrder: 2,
          hotelContractTerms: ['Aqaba'],
          operationalNotes: 'Aqaba overnight. Hotel category selected later by operator.',
        },
      ],
    },
    {
      dayNumber: 7,
      title: 'Aqaba to Dead Sea',
      description: 'Transfer north to the Dead Sea with relaxation time and overnight at Dead Sea.',
      components: [
        {
          componentType: 'TRANSPORT',
          label: 'Aqaba to Dead Sea transfer',
          sortOrder: 0,
          transferRouteTerms: ['Aqaba', 'Dead Sea'],
          pricingMode: 'Point-to-Point',
          operationalNotes: 'Use existing Transfer Route if available. Do not create route from this seed.',
        },
        {
          componentType: 'EXCURSION_TEMPLATE',
          label: 'Dead Sea Relaxation Day',
          sortOrder: 1,
          excursionTemplateCode: 'DEAD_SEA_RELAXATION_DAY',
          isOptional: true,
          operationalNotes: 'Optional sellable Dead Sea relaxation day component depending on arrival time and day-use/hotel inclusion.',
        },
        {
          componentType: 'HOTEL',
          label: 'Dead Sea hotel overnight',
          sortOrder: 2,
          hotelContractTerms: ['Dead Sea'],
          operationalNotes: 'Dead Sea overnight. Hotel category selected later by operator.',
        },
      ],
    },
    {
      dayNumber: 8,
      title: 'Departure',
      description: 'Transfer from Dead Sea or Amman area to QAIA for departure.',
      components: [
        {
          componentType: 'TRANSPORT',
          label: 'Dead Sea to QAIA departure transfer',
          sortOrder: 0,
          transferRouteTerms: ['Dead Sea', 'QAIA'],
          pricingMode: 'Airport Transfer',
          operationalNotes: 'Use existing Transfer Route if available. Flight time drives pickup time.',
        },
        {
          componentType: 'SERVICE',
          label: 'Departure assistance / guide rule',
          sortOrder: 1,
          isOptional: true,
          operationalNotes: 'Departure assistance optional. No guide resource is created by this seed.',
        },
      ],
    },
  ],
};

function norm(value: string) {
  return value.trim().toLowerCase();
}

function includesAll(value: string, terms: string[]) {
  const haystack = norm(value);
  return terms.every((term) => haystack.includes(norm(term)));
}

async function findTransferRoute(prisma: PrismaClient, terms?: string[]) {
  if (!terms?.length) return null;
  const routes = await prisma.route.findMany({
    where: { isActive: true, routeType: { equals: 'TRANSFER_ROUTE', mode: 'insensitive' } },
    take: 500,
  } as any);
  return routes.find((route) => includesAll(`${route.name} ${route.notes || ''}`, terms)) || null;
}

async function findSupplierService(prisma: PrismaClient, terms?: string[]) {
  if (!terms?.length) return null;
  const services = await prisma.supplierService.findMany({ take: 500 });
  return services.find((service) => includesAll(`${service.name} ${service.category}`, terms)) || null;
}

async function findHotelContract(prisma: PrismaClient, terms?: string[]) {
  if (!terms?.length) return null;
  const contracts = await prisma.hotelContract.findMany({
    include: { hotel: true },
    take: 500,
  });
  return contracts.find((contract) => includesAll(`${contract.name} ${contract.hotel?.name || ''} ${contract.hotel?.city || ''}`, terms)) || null;
}

async function buildComponentData(prisma: PrismaClient, packageTemplateId: string, dayIdByNumber: Map<number, string>, component: ProgramComponentSeed, dayNumber: number) {
  const excursionTemplate = component.excursionTemplateCode
    ? await prisma.excursionTemplate.findUnique({ where: { code: component.excursionTemplateCode }, select: { id: true } })
    : null;
  const activity = component.activityCode
    ? await prisma.activity.findUnique({ where: { code: component.activityCode }, select: { id: true } })
    : null;
  const touringRoute = component.touringRouteCode
    ? await prisma.touringRoute.findUnique({ where: { code: component.touringRouteCode }, select: { id: true } })
    : null;
  const route = await findTransferRoute(prisma, component.transferRouteTerms);
  const supplierService = await findSupplierService(prisma, component.supplierServiceTerms);
  const hotelContract = await findHotelContract(prisma, component.hotelContractTerms);

  const unresolved = [
    component.excursionTemplateCode && !excursionTemplate ? `Missing excursion template ${component.excursionTemplateCode}` : '',
    component.activityCode && !activity ? `Missing activity ${component.activityCode}` : '',
    component.touringRouteCode && !touringRoute ? `Missing touring route ${component.touringRouteCode}` : '',
    component.transferRouteTerms?.length && !route ? `Transfer route not linked: ${component.transferRouteTerms.join(' + ')}` : '',
    component.supplierServiceTerms?.length && !supplierService ? `Supplier service not linked: ${component.supplierServiceTerms.join(' + ')}` : '',
    component.hotelContractTerms?.length && !hotelContract ? `Hotel contract not linked: ${component.hotelContractTerms.join(' + ')}` : '',
  ].filter(Boolean);

  return {
    data: {
      packageTemplateId,
      packageTemplateDayId: dayIdByNumber.get(dayNumber) || null,
      componentType: component.componentType,
      dayNumber,
      label: component.label,
      sortOrder: component.sortOrder,
      isOptional: component.isOptional ?? false,
      active: true,
      operationalNotes: [component.operationalNotes, unresolved.length ? `Review: ${unresolved.join('; ')}` : ''].filter(Boolean).join(' | '),
      excursionTemplateId: excursionTemplate?.id ?? null,
      activityId: activity?.id ?? null,
      hotelContractId: hotelContract?.id ?? null,
      routeId: route?.id ?? null,
      touringRouteId: touringRoute?.id ?? null,
      transportServiceTypeId: null,
      pricingMode: component.pricingMode ?? null,
      supplierServiceId: supplierService?.id ?? null,
    },
    unresolvedCount: unresolved.length,
  };
}

async function seedClassicJordanProgramTemplate(prisma: PrismaClient) {
  const existing = await prisma.packageTemplate.findUnique({ where: { code: CLASSIC_JORDAN_8D7N.code }, select: { id: true } });
  const template = await prisma.packageTemplate.upsert({
    where: { code: CLASSIC_JORDAN_8D7N.code },
    update: {
      name: CLASSIC_JORDAN_8D7N.name,
      durationDays: CLASSIC_JORDAN_8D7N.durationDays,
      targetMarket: CLASSIC_JORDAN_8D7N.targetMarket,
      season: CLASSIC_JORDAN_8D7N.season,
      destination: CLASSIC_JORDAN_8D7N.destination,
      summary: CLASSIC_JORDAN_8D7N.summary,
      inclusions: CLASSIC_JORDAN_8D7N.inclusions,
      exclusions: CLASSIC_JORDAN_8D7N.exclusions,
      hotelCategoryNotes: CLASSIC_JORDAN_8D7N.hotelCategoryNotes,
      guideRules: CLASSIC_JORDAN_8D7N.guideRules,
      categoryTags: CLASSIC_JORDAN_8D7N.categoryTags,
      operationalNotes: CLASSIC_JORDAN_8D7N.operationalNotes,
      active: true,
    },
    create: {
      code: CLASSIC_JORDAN_8D7N.code,
      name: CLASSIC_JORDAN_8D7N.name,
      durationDays: CLASSIC_JORDAN_8D7N.durationDays,
      targetMarket: CLASSIC_JORDAN_8D7N.targetMarket,
      season: CLASSIC_JORDAN_8D7N.season,
      destination: CLASSIC_JORDAN_8D7N.destination,
      summary: CLASSIC_JORDAN_8D7N.summary,
      inclusions: CLASSIC_JORDAN_8D7N.inclusions,
      exclusions: CLASSIC_JORDAN_8D7N.exclusions,
      hotelCategoryNotes: CLASSIC_JORDAN_8D7N.hotelCategoryNotes,
      guideRules: CLASSIC_JORDAN_8D7N.guideRules,
      categoryTags: CLASSIC_JORDAN_8D7N.categoryTags,
      operationalNotes: CLASSIC_JORDAN_8D7N.operationalNotes,
      active: true,
    },
  });

  await prisma.packageTemplateComponent.deleteMany({ where: { packageTemplateId: template.id } });
  await prisma.packageTemplateDay.deleteMany({ where: { packageTemplateId: template.id } });

  const dayIdByNumber = new Map<number, string>();
  for (const day of CLASSIC_JORDAN_8D7N.days) {
    const createdDay = await prisma.packageTemplateDay.create({
      data: {
        packageTemplateId: template.id,
        dayNumber: day.dayNumber,
        title: day.title,
        description: day.description,
        active: true,
      },
    });
    dayIdByNumber.set(day.dayNumber, createdDay.id);
  }

  let componentsSynced = 0;
  let unresolvedLinks = 0;
  for (const day of CLASSIC_JORDAN_8D7N.days) {
    for (const component of day.components) {
      const result = await buildComponentData(prisma, template.id, dayIdByNumber, component, day.dayNumber);
      await prisma.packageTemplateComponent.create({ data: result.data });
      componentsSynced += 1;
      unresolvedLinks += result.unresolvedCount;
    }
  }

  const validatedDays = await prisma.packageTemplateDay.count({ where: { packageTemplateId: template.id } });
  const validatedComponents = await prisma.packageTemplateComponent.count({ where: { packageTemplateId: template.id } });
  const expectedComponents = CLASSIC_JORDAN_8D7N.days.reduce((sum, day) => sum + day.components.length, 0);
  if (validatedDays !== CLASSIC_JORDAN_8D7N.durationDays) {
    throw new Error(`Classic Jordan program validation failed: expected ${CLASSIC_JORDAN_8D7N.durationDays} days, found ${validatedDays}.`);
  }
  if (validatedComponents !== expectedComponents) {
    throw new Error(`Classic Jordan program validation failed: expected ${expectedComponents} components, found ${validatedComponents}.`);
  }

  return {
    created: existing ? 0 : 1,
    updated: existing ? 1 : 0,
    daysSynced: validatedDays,
    componentsSynced,
    unresolvedLinks,
    validatedComponents,
  };
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const summary = await seedClassicJordanProgramTemplate(prisma);
    console.log('Golden Jordan program template seed complete');
    console.log(`created: ${summary.created}`);
    console.log(`updated: ${summary.updated}`);
    console.log(`days synced: ${summary.daysSynced}`);
    console.log(`components synced: ${summary.componentsSynced}`);
    console.log(`unresolved optional links: ${summary.unresolvedLinks}`);
    console.log(`validated components: ${summary.validatedComponents}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Golden Jordan program template seed failed');
  console.error(error);
  process.exit(1);
});

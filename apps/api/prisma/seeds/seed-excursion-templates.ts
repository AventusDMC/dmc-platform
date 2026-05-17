import { PrismaClient, ExcursionComponentType } from '@prisma/client';

type CategoryTag = 'Adventure' | 'Historical' | 'Religious' | 'Islamic' | 'Christian' | 'Cultural' | 'Wellness';

type ComponentSeed = {
  componentType: ExcursionComponentType;
  label: string;
  isOptional?: boolean;
  touringRouteCode?: string;
  activityCode?: string;
  ticketSearch?: string[];
  diningSearch?: string[];
  suggestedDepartureCity?: string;
  suggestedArrivalCity?: string;
  durationMinutes?: number;
  supplierConfirmationRequired?: boolean;
  voucherRequired?: boolean;
  pickupNotes?: string;
  operationalDependency?: string;
  operationalNotes: string;
};

type ExcursionTemplateSeed = {
  code: string;
  name: string;
  description: string;
  defaultDepartureCity: string;
  region: string;
  durationMinutes: number;
  operatingDays: string;
  recommendedDepartureTime: string;
  estimatedReturnTime: string;
  minimumPax: number;
  maximumPax: number;
  sicPossible: boolean;
  familyFriendly: boolean;
  fitnessLevel: string;
  recommendedPaxRange: string;
  categoryTags: CategoryTag[];
  inclusions: string;
  exclusions: string;
  seasonalRestrictions: string;
  operationalWarnings: string;
  components: ComponentSeed[];
};

const GOLDEN_JORDAN_EXCURSION_TEMPLATES: ExcursionTemplateSeed[] = [
  {
    code: 'PETRA_FULL_DAY',
    name: 'Petra Full Day',
    description: 'Sellable full-day Petra excursion built from the canonical Petra operational route and Activity Master.',
    defaultDepartureCity: 'Amman',
    region: 'South Jordan',
    durationMinutes: 720,
    operatingDays: 'Daily subject to Petra site operation and weather',
    recommendedDepartureTime: '07:00',
    estimatedReturnTime: '19:00',
    minimumPax: 1,
    maximumPax: 35,
    sicPossible: true,
    familyFriendly: true,
    fitnessLevel: 'Basic walking fitness',
    recommendedPaxRange: '1-35',
    categoryTags: ['Historical', 'Cultural'],
    inclusions: 'Private/SIC-capable excursion template, guided Petra experience component, and operational route structure.',
    exclusions: 'Petra entrance ticket, meals, drinks, gratuities, and services not explicitly linked as components.',
    seasonalRestrictions: 'Summer heat and daylight must be reviewed before operation.',
    operationalWarnings: 'Petra tickets remain separate. Guide assignment remains an operational resource.',
    components: [
      {
        componentType: 'TRANSPORT',
        label: 'Amman – Petra operational touring route',
        touringRouteCode: 'JOR-TR-SOUTH-AMMAN-PETRA-ON',
        suggestedDepartureCity: 'Amman',
        suggestedArrivalCity: 'Petra',
        durationMinutes: 420,
        supplierConfirmationRequired: true,
        voucherRequired: true,
        pickupNotes: 'Early Amman pickup recommended.',
        operationalDependency: 'Requires confirmed touring vehicle and route timing.',
        operationalNotes: 'Uses existing Touring Route infrastructure; route remains non-sellable operational data.',
      },
      {
        componentType: 'TICKET',
        label: 'Petra entrance ticket',
        ticketSearch: ['Petra Entrance', 'Petra Ticket', 'Petra'],
        supplierConfirmationRequired: false,
        voucherRequired: true,
        operationalNotes: 'Link existing Petra ticketing service where available. Jordan Pass handling remains ticketing logic.',
      },
      {
        componentType: 'ACTIVITY',
        label: 'Petra guided experience',
        activityCode: 'ACT-PETRA-GUIDED-EXPERIENCES',
        durationMinutes: 180,
        supplierConfirmationRequired: true,
        voucherRequired: true,
        operationalDependency: 'Guide resource assignment remains separate.',
        operationalNotes: 'Activity Master represents the customer experience; local guide remains a separate operational resource.',
      },
      {
        componentType: 'GUIDE',
        label: 'Petra guide requirement',
        activityCode: 'ACT-PETRA-GUIDED-EXPERIENCES',
        durationMinutes: 180,
        supplierConfirmationRequired: true,
        voucherRequired: true,
        operationalNotes: 'Guide required. Link to Activity Master for guide requirement metadata; actual guide assignment remains separate.',
      },
    ],
  },
  {
    code: 'JERASH_AJLOUN_FULL_DAY',
    name: 'Jerash & Ajloun Full Day',
    description: 'Sellable north Jordan full-day excursion using Jerash, Ajloun and the canonical northern touring route.',
    defaultDepartureCity: 'Amman',
    region: 'North Jordan',
    durationMinutes: 480,
    operatingDays: 'Daily subject to site operation',
    recommendedDepartureTime: '08:30',
    estimatedReturnTime: '16:30',
    minimumPax: 1,
    maximumPax: 35,
    sicPossible: true,
    familyFriendly: true,
    fitnessLevel: 'Basic walking fitness with stairs at Ajloun',
    recommendedPaxRange: '1-35',
    categoryTags: ['Historical', 'Cultural'],
    inclusions: 'Operational route, Jerash guided experience, Ajloun Castle experience, and guide requirement metadata.',
    exclusions: 'Entrance tickets, meals, drinks, gratuities, and services not linked as components.',
    seasonalRestrictions: 'Summer heat and wet-weather stair safety must be reviewed.',
    operationalWarnings: 'Tickets remain separate entrance/access components.',
    components: [
      {
        componentType: 'TRANSPORT',
        label: 'Amman – Jerash – Ajloun – Amman route',
        touringRouteCode: 'JOR-TR-NORTH-JERASH-AJLOUN-RT',
        suggestedDepartureCity: 'Amman',
        suggestedArrivalCity: 'Amman',
        durationMinutes: 220,
        supplierConfirmationRequired: true,
        voucherRequired: true,
        operationalNotes: 'Uses canonical northern Touring Route.',
      },
      {
        componentType: 'TICKET',
        label: 'Jerash entrance ticket',
        ticketSearch: ['Jerash Entrance', 'Jerash Ticket', 'Jerash'],
        voucherRequired: true,
        operationalNotes: 'Link existing Jerash ticketing service where available.',
      },
      {
        componentType: 'ACTIVITY',
        label: 'Jerash guided experience',
        activityCode: 'ACT-JERASH-GUIDED-EXPERIENCES',
        durationMinutes: 120,
        supplierConfirmationRequired: true,
        voucherRequired: true,
        operationalNotes: 'Jerash Activity Master component.',
      },
      {
        componentType: 'TICKET',
        label: 'Ajloun Castle entrance ticket',
        ticketSearch: ['Ajloun Castle', 'Ajloun Ticket', 'Ajloun'],
        voucherRequired: true,
        operationalNotes: 'Link existing Ajloun ticketing service where available.',
      },
      {
        componentType: 'ACTIVITY',
        label: 'Ajloun Castle experience',
        activityCode: 'ACT-AJLOUN-CASTLE-EXPERIENCES',
        durationMinutes: 90,
        voucherRequired: true,
        operationalNotes: 'Ajloun Castle Activity Master component.',
      },
      {
        componentType: 'GUIDE',
        label: 'Northern sites guide requirement',
        activityCode: 'ACT-JERASH-GUIDED-EXPERIENCES',
        isOptional: true,
        supplierConfirmationRequired: true,
        operationalNotes: 'Guide recommended/required according to booking language and group profile.',
      },
    ],
  },
  {
    code: 'MADABA_NEBO_DEAD_SEA',
    name: 'Madaba, Nebo & Dead Sea',
    description: 'Sellable central Jordan excursion combining cultural sites with Dead Sea relaxation.',
    defaultDepartureCity: 'Amman',
    region: 'Central Jordan / Dead Sea',
    durationMinutes: 540,
    operatingDays: 'Daily subject to site and Dead Sea access operation',
    recommendedDepartureTime: '08:30',
    estimatedReturnTime: '17:30',
    minimumPax: 1,
    maximumPax: 40,
    sicPossible: true,
    familyFriendly: true,
    fitnessLevel: 'Low walking fitness',
    recommendedPaxRange: '1-40',
    categoryTags: ['Historical', 'Christian', 'Cultural', 'Wellness'],
    inclusions: 'Operational route structure and Dead Sea Activity Master component.',
    exclusions: 'Madaba/Nebo/Dead Sea tickets, meals, spa treatments, drinks, and gratuities unless linked separately.',
    seasonalRestrictions: 'Dead Sea heat and sun exposure must be reviewed.',
    operationalWarnings: 'Ticketing and Dead Sea day-use access remain separate components.',
    components: [
      {
        componentType: 'TRANSPORT',
        label: 'Amman – Madaba – Nebo – Dead Sea – Amman route',
        touringRouteCode: 'JOR-TR-CENTRAL-MADABA-NEBO-DEAD-SEA-RT',
        suggestedDepartureCity: 'Amman',
        suggestedArrivalCity: 'Amman',
        durationMinutes: 200,
        supplierConfirmationRequired: true,
        voucherRequired: true,
        operationalNotes: 'Uses canonical central Touring Route.',
      },
      {
        componentType: 'TICKET',
        label: 'Madaba site access',
        ticketSearch: ['Madaba', 'St George', 'Mosaic'],
        isOptional: true,
        voucherRequired: true,
        operationalNotes: 'Link existing Madaba ticketing service where available.',
      },
      {
        componentType: 'TICKET',
        label: 'Mount Nebo entrance ticket',
        ticketSearch: ['Nebo', 'Mount Nebo'],
        isOptional: true,
        voucherRequired: true,
        operationalNotes: 'Link existing Mount Nebo ticketing service where available.',
      },
      {
        componentType: 'ACTIVITY',
        label: 'Dead Sea relaxation experience',
        activityCode: 'ACT-DEAD-SEA-RELAXATION-EXPERIENCES',
        durationMinutes: 180,
        voucherRequired: true,
        operationalNotes: 'Dead Sea Activity Master component. Day-use ticket/access remains separate where applicable.',
      },
    ],
  },
  {
    code: 'WADI_RUM_JEEP_EXPERIENCE',
    name: 'Wadi Rum Jeep Experience',
    description: 'Sellable Wadi Rum jeep excursion using canonical Wadi Rum Activity Master and existing Aqaba/Wadi Rum route.',
    defaultDepartureCity: 'Aqaba',
    region: 'South Jordan',
    durationMinutes: 360,
    operatingDays: 'Daily subject to desert weather and supplier operation',
    recommendedDepartureTime: '09:00',
    estimatedReturnTime: '15:00',
    minimumPax: 1,
    maximumPax: 48,
    sicPossible: true,
    familyFriendly: true,
    fitnessLevel: 'Low fitness requirement',
    recommendedPaxRange: '1-48',
    categoryTags: ['Adventure', 'Cultural'],
    inclusions: 'Operational route and Wadi Rum jeep Activity Master component.',
    exclusions: 'Wadi Rum entrance ticket, meals, camp stays, gratuities, and services not linked as components.',
    seasonalRestrictions: 'Desert heat, dust, wind, and low visibility must be checked.',
    operationalWarnings: 'Jeep supplier confirmation remains separate.',
    components: [
      {
        componentType: 'TRANSPORT',
        label: 'Aqaba – Wadi Rum – Aqaba route',
        touringRouteCode: 'JOR-TR-SOUTH-AQABA-WADI-RUM-RT',
        suggestedDepartureCity: 'Aqaba',
        suggestedArrivalCity: 'Aqaba',
        durationMinutes: 150,
        supplierConfirmationRequired: true,
        voucherRequired: true,
        operationalNotes: 'Uses canonical Aqaba/Wadi Rum Touring Route.',
      },
      {
        componentType: 'TICKET',
        label: 'Wadi Rum protected area ticket',
        ticketSearch: ['Wadi Rum Entrance', 'Wadi Rum Ticket', 'Wadi Rum'],
        voucherRequired: true,
        operationalNotes: 'Link existing Wadi Rum ticketing service where available.',
      },
      {
        componentType: 'ACTIVITY',
        label: 'Wadi Rum jeep experience',
        activityCode: 'ACT-WADI-RUM-JEEP-EXPERIENCES',
        durationMinutes: 240,
        supplierConfirmationRequired: true,
        voucherRequired: true,
        operationalNotes: 'Activity variants include 2h, 4h, sunset and stargazing options.',
      },
    ],
  },
  {
    code: 'BLESSED_TREE_ISLAMIC_HERITAGE_TOUR',
    name: 'Blessed Tree Islamic Heritage Tour',
    description: 'Sellable Islamic heritage excursion to the Blessed Tree site.',
    defaultDepartureCity: 'Amman',
    region: 'East Jordan',
    durationMinutes: 540,
    operatingDays: 'Daily subject to access and road conditions',
    recommendedDepartureTime: '08:00',
    estimatedReturnTime: '17:00',
    minimumPax: 1,
    maximumPax: 25,
    sicPossible: false,
    familyFriendly: true,
    fitnessLevel: 'Low fitness requirement',
    recommendedPaxRange: '1-25',
    categoryTags: ['Religious', 'Islamic', 'Cultural'],
    inclusions: 'Operational route and Blessed Tree heritage Activity Master component.',
    exclusions: 'Meals, specialist religious guide, permissions, gratuities, and services not linked as components.',
    seasonalRestrictions: 'Remote desert heat and wind must be reviewed.',
    operationalWarnings: 'Long-distance desert operation; confirm road/access conditions.',
    components: [
      {
        componentType: 'TRANSPORT',
        label: 'Amman – Blessed Tree – Amman route',
        touringRouteCode: 'JOR-TR-ISLAMIC-BLESSED-TREE-RT',
        suggestedDepartureCity: 'Amman',
        suggestedArrivalCity: 'Amman',
        durationMinutes: 280,
        supplierConfirmationRequired: true,
        voucherRequired: true,
        operationalNotes: 'Uses canonical Islamic Touring Route.',
      },
      {
        componentType: 'ACTIVITY',
        label: 'Blessed Tree heritage experience',
        activityCode: 'ACT-BLESSED-TREE-HERITAGE-EXPERIENCES',
        durationMinutes: 60,
        voucherRequired: true,
        operationalNotes: 'Activity Master component. Specialist religious guide remains separate if required.',
      },
      {
        componentType: 'GUIDE',
        label: 'Islamic heritage guide requirement',
        activityCode: 'ACT-BLESSED-TREE-HERITAGE-EXPERIENCES',
        isOptional: true,
        supplierConfirmationRequired: true,
        operationalNotes: 'Specialist religious/cultural guide optional according to booking profile.',
      },
    ],
  },
  {
    code: 'JORDAN_VALLEY_ISLAMIC_HERITAGE_TOUR',
    name: 'Jordan Valley Islamic Heritage Tour',
    description: 'Sellable Jordan Valley Islamic heritage excursion.',
    defaultDepartureCity: 'Amman',
    region: 'Jordan Valley',
    durationMinutes: 480,
    operatingDays: 'Daily subject to site access',
    recommendedDepartureTime: '08:30',
    estimatedReturnTime: '16:30',
    minimumPax: 1,
    maximumPax: 30,
    sicPossible: false,
    familyFriendly: true,
    fitnessLevel: 'Low walking fitness',
    recommendedPaxRange: '1-30',
    categoryTags: ['Religious', 'Islamic', 'Cultural'],
    inclusions: 'Operational route and Jordan Valley Islamic heritage Activity Master component.',
    exclusions: 'Meals, specialist religious guide, permissions/tickets, gratuities, and services not linked as components.',
    seasonalRestrictions: 'Jordan Valley heat must be reviewed.',
    operationalWarnings: 'Confirm active sites and access before operation.',
    components: [
      {
        componentType: 'TRANSPORT',
        label: 'Amman – Jordan Valley Islamic Sites – Amman route',
        touringRouteCode: 'JOR-TR-ISLAMIC-JORDAN-VALLEY-RT',
        suggestedDepartureCity: 'Amman',
        suggestedArrivalCity: 'Amman',
        durationMinutes: 250,
        supplierConfirmationRequired: true,
        voucherRequired: true,
        operationalNotes: 'Uses canonical Islamic Touring Route.',
      },
      {
        componentType: 'ACTIVITY',
        label: 'Jordan Valley Islamic heritage experience',
        activityCode: 'ACT-JORDAN-VALLEY-ISLAMIC-HERITAGE-EXPERIENCES',
        durationMinutes: 180,
        voucherRequired: true,
        operationalNotes: 'Activity Master component.',
      },
      {
        componentType: 'GUIDE',
        label: 'Islamic heritage guide requirement',
        activityCode: 'ACT-JORDAN-VALLEY-ISLAMIC-HERITAGE-EXPERIENCES',
        isOptional: true,
        supplierConfirmationRequired: true,
        operationalNotes: 'Specialist religious/cultural guide optional according to booking profile.',
      },
    ],
  },
  {
    code: 'AMMAN_CITY_DESERT_CASTLES',
    name: 'Amman City & Desert Castles',
    description: 'Sellable Amman city and Desert Castles excursion. Touring route is pending canonical route review.',
    defaultDepartureCity: 'Amman',
    region: 'Central / East Jordan',
    durationMinutes: 480,
    operatingDays: 'Daily subject to site access',
    recommendedDepartureTime: '08:30',
    estimatedReturnTime: '16:30',
    minimumPax: 1,
    maximumPax: 35,
    sicPossible: true,
    familyFriendly: true,
    fitnessLevel: 'Low walking fitness',
    recommendedPaxRange: '1-35',
    categoryTags: ['Historical', 'Cultural'],
    inclusions: 'Sellable excursion shell with ticket/guide placeholders where catalog records exist.',
    exclusions: 'Entrance tickets, meals, gratuities, and services not linked as components.',
    seasonalRestrictions: 'Desert heat and site opening times must be checked.',
    operationalWarnings: 'Canonical Touring Route not created in this task; transport component is flagged for route review.',
    components: [
      {
        componentType: 'TRANSPORT',
        label: 'Amman City & Desert Castles routing',
        suggestedDepartureCity: 'Amman',
        suggestedArrivalCity: 'Amman',
        durationMinutes: 240,
        supplierConfirmationRequired: true,
        voucherRequired: true,
        operationalNotes: 'No duplicate Touring Route is created here. Link to canonical route after route library review.',
      },
      {
        componentType: 'TICKET',
        label: 'Amman Citadel ticket',
        ticketSearch: ['Citadel', 'Amman Citadel'],
        isOptional: true,
        voucherRequired: true,
        operationalNotes: 'Link existing Amman Citadel ticketing service where available.',
      },
      {
        componentType: 'TICKET',
        label: 'Desert Castles ticket/access',
        ticketSearch: ['Desert Castles', 'Qasr', 'Azraq', 'Amra'],
        isOptional: true,
        voucherRequired: true,
        operationalNotes: 'Link existing Desert Castles ticketing service where available.',
      },
      {
        componentType: 'GUIDE',
        label: 'Cultural guide requirement',
        isOptional: true,
        supplierConfirmationRequired: true,
        operationalNotes: 'Guide recommended. No guide resource is created by this seed.',
      },
    ],
  },
  {
    code: 'DEAD_SEA_RELAXATION_DAY',
    name: 'Dead Sea Relaxation Day',
    description: 'Sellable Dead Sea wellness and relaxation day excursion.',
    defaultDepartureCity: 'Amman',
    region: 'Dead Sea',
    durationMinutes: 360,
    operatingDays: 'Daily subject to day-use availability',
    recommendedDepartureTime: '10:00',
    estimatedReturnTime: '16:00',
    minimumPax: 1,
    maximumPax: 80,
    sicPossible: true,
    familyFriendly: true,
    fitnessLevel: 'Low fitness requirement',
    recommendedPaxRange: '1-80',
    categoryTags: ['Wellness', 'Cultural'],
    inclusions: 'Dead Sea relaxation Activity Master component and optional day-use ticket/service linkage where available.',
    exclusions: 'Day-use ticket/access, meals, spa treatments, drinks, transport, and gratuities unless linked as components.',
    seasonalRestrictions: 'Extreme heat and sun exposure must be reviewed.',
    operationalWarnings: 'Confirm day-use access, inclusions, and hotel rules before operation.',
    components: [
      {
        componentType: 'TRANSPORT',
        label: 'Amman – Dead Sea relaxation routing',
        touringRouteCode: 'JOR-TR-CENTRAL-BETHANY-DEAD-SEA-RT',
        suggestedDepartureCity: 'Amman',
        suggestedArrivalCity: 'Amman',
        durationMinutes: 160,
        supplierConfirmationRequired: true,
        voucherRequired: true,
        operationalNotes: 'Uses closest existing central Dead Sea canonical Touring Route; review if a pure Dead Sea route is later added.',
      },
      {
        componentType: 'ACTIVITY',
        label: 'Dead Sea relaxation experience',
        activityCode: 'ACT-DEAD-SEA-RELAXATION-EXPERIENCES',
        durationMinutes: 240,
        voucherRequired: true,
        operationalNotes: 'Dead Sea Activity Master component.',
      },
      {
        componentType: 'TICKET',
        label: 'Dead Sea day-use access',
        ticketSearch: ['Dead Sea Day Use', 'Dead Sea Beach', 'Dead Sea'],
        isOptional: true,
        voucherRequired: true,
        operationalNotes: 'Link existing Dead Sea day-use/ticketing service where available.',
      },
      {
        componentType: 'DINING',
        label: 'Dead Sea lunch',
        diningSearch: ['Dead Sea Lunch', 'Lunch Dead Sea', 'Buffet Lunch'],
        isOptional: true,
        supplierConfirmationRequired: true,
        voucherRequired: true,
        operationalNotes: 'Optional dining component where a supplier service exists.',
      },
    ],
  },
];

function normalized(value: string) {
  return value.trim().toLowerCase();
}

function includesAny(value: string, terms: string[]) {
  const haystack = normalized(value);
  return terms.some((term) => haystack.includes(normalized(term)));
}

async function findTicketService(prisma: PrismaClient, terms: string[] | undefined) {
  if (!terms?.length) return null;
  const services = await prisma.supplierService.findMany({
    where: { category: { contains: 'ticket', mode: 'insensitive' } },
    take: 300,
  });
  return services.find((service) => includesAny(`${service.name} ${service.category}`, terms)) || null;
}

async function findDiningService(prisma: PrismaClient, terms: string[] | undefined) {
  if (!terms?.length) return null;
  const services = await prisma.supplierService.findMany({
    where: { category: { contains: 'dining', mode: 'insensitive' } },
    take: 300,
  });
  return services.find((service) => includesAny(`${service.name} ${service.category}`, terms)) || null;
}

async function buildComponents(prisma: PrismaClient, template: ExcursionTemplateSeed) {
  const components = [];
  const unresolved: string[] = [];

  for (const [index, component] of template.components.entries()) {
    const touringRoute = component.touringRouteCode
      ? await prisma.touringRoute.findUnique({ where: { code: component.touringRouteCode }, select: { id: true } })
      : null;
    const activity = component.activityCode
      ? await prisma.activity.findUnique({ where: { code: component.activityCode }, select: { id: true } })
      : null;
    const ticketService = await findTicketService(prisma, component.ticketSearch);
    const diningService = await findDiningService(prisma, component.diningSearch);

    if (component.touringRouteCode && !touringRoute) {
      unresolved.push(`${component.label}: missing touring route ${component.touringRouteCode}`);
    }
    if (component.activityCode && !activity) {
      unresolved.push(`${component.label}: missing Activity Master ${component.activityCode}`);
    }
    if (component.componentType === 'TICKET' && component.ticketSearch?.length && !ticketService) {
      unresolved.push(`${component.label}: no existing ticketing service matched ${component.ticketSearch.join(', ')}`);
    }
    if (component.componentType === 'DINING' && component.diningSearch?.length && !diningService) {
      unresolved.push(`${component.label}: no existing dining service matched ${component.diningSearch.join(', ')}`);
    }

    const supplierServiceId = component.componentType === 'TICKET' ? ticketService?.id : component.componentType === 'DINING' ? diningService?.id : null;
    const notes = [
      component.operationalNotes,
      component.touringRouteCode ? `Touring route code: ${component.touringRouteCode}` : '',
      component.activityCode ? `Activity Master code: ${component.activityCode}` : '',
      supplierServiceId ? '' : component.componentType === 'TICKET' ? 'Ticket component intentionally left unlinked when no existing ticketing record is available.' : '',
      supplierServiceId ? '' : component.componentType === 'DINING' ? 'Dining component intentionally left unlinked when no existing dining service is available.' : '',
    ]
      .filter(Boolean)
      .join(' | ');

    components.push({
      componentType: component.componentType,
      label: component.label,
      sortOrder: index,
      isOptional: component.isOptional ?? false,
      active: true,
      operationalNotes: notes,
      supplierServiceId,
      activityId: activity?.id ?? null,
      routeId: null,
      touringRouteId: touringRoute?.id ?? null,
      transportServiceTypeId: null,
      suggestedDepartureCity: component.suggestedDepartureCity ?? template.defaultDepartureCity,
      suggestedArrivalCity: component.suggestedArrivalCity ?? null,
      durationMinutes: component.durationMinutes ?? null,
      requiredArrivalTime: null,
      supplierConfirmationRequired: component.supplierConfirmationRequired ?? null,
      voucherRequired: component.voucherRequired ?? null,
      pickupNotes: component.pickupNotes ?? null,
      operationalDependency: component.operationalDependency ?? null,
      estimatedDurationMinutes: component.durationMinutes ?? null,
    });
  }

  return { components, unresolved };
}

function buildTemplateData(template: ExcursionTemplateSeed, unresolved: string[]) {
  return {
    name: template.name,
    description: template.description,
    defaultDepartureCity: template.defaultDepartureCity,
    region: template.region,
    categoryTags: template.categoryTags,
    sicPossible: template.sicPossible,
    familyFriendly: template.familyFriendly,
    fitnessLevel: template.fitnessLevel,
    recommendedPaxRange: template.recommendedPaxRange,
    inclusions: template.inclusions,
    exclusions: template.exclusions,
    durationMinutes: template.durationMinutes,
    operationalNotes: [
      'Golden Jordan canonical sellable excursion template. Uses existing Touring Routes and Activity Masters.',
      unresolved.length ? `Review unresolved optional links: ${unresolved.join('; ')}` : '',
    ]
      .filter(Boolean)
      .join(' '),
    operatingDays: template.operatingDays,
    recommendedDepartureTime: template.recommendedDepartureTime,
    estimatedReturnTime: template.estimatedReturnTime,
    minimumPax: template.minimumPax,
    maximumPax: template.maximumPax,
    weatherSensitive: true,
    childFriendly: template.familyFriendly,
    wheelchairAccessible: false,
    seasonalRestrictions: template.seasonalRestrictions,
    operationalWarnings: template.operationalWarnings,
    active: true,
  };
}

async function seedGoldenJordanExcursionTemplates(prisma: PrismaClient) {
  const canonicalCodes = GOLDEN_JORDAN_EXCURSION_TEMPLATES.map((template) => template.code);
  const existingTemplates = await prisma.excursionTemplate.findMany({
    where: { code: { in: canonicalCodes } },
    select: { code: true },
  });
  const existingCodes = new Set(existingTemplates.map((template) => template.code));

  let created = 0;
  let updated = 0;
  let componentsCreated = 0;
  let unresolvedLinks = 0;

  for (const template of GOLDEN_JORDAN_EXCURSION_TEMPLATES) {
    const shell = await prisma.excursionTemplate.upsert({
      where: { code: template.code },
      update: {
        name: template.name,
        description: template.description,
        active: true,
      },
      create: {
        code: template.code,
        name: template.name,
        description: template.description,
        active: true,
      },
    });

    const { components, unresolved } = await buildComponents(prisma, template);
    unresolvedLinks += unresolved.length;

    await prisma.excursionTemplate.update({
      where: { id: shell.id },
      data: {
        ...buildTemplateData(template, unresolved),
        components: {
          deleteMany: {},
          create: components,
        },
      },
    });

    if (existingCodes.has(template.code)) {
      updated += 1;
    } else {
      created += 1;
    }
    componentsCreated += components.length;
  }

  const validatedTemplates = await prisma.excursionTemplate.count({ where: { code: { in: canonicalCodes } } });
  const validatedComponents = await prisma.excursionTemplateComponent.count({
    where: { template: { code: { in: canonicalCodes } }, active: true },
  });
  const expectedComponents = GOLDEN_JORDAN_EXCURSION_TEMPLATES.reduce((sum, template) => sum + template.components.length, 0);

  if (validatedTemplates !== GOLDEN_JORDAN_EXCURSION_TEMPLATES.length) {
    throw new Error(`Golden Jordan excursion validation failed: expected ${GOLDEN_JORDAN_EXCURSION_TEMPLATES.length}, found ${validatedTemplates}.`);
  }
  if (validatedComponents !== expectedComponents) {
    throw new Error(`Golden Jordan excursion component validation failed: expected ${expectedComponents}, found ${validatedComponents}.`);
  }

  return { created, updated, componentsCreated, unresolvedLinks, validatedTemplates, validatedComponents };
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const summary = await seedGoldenJordanExcursionTemplates(prisma);
    console.log('Golden Jordan excursion template seed complete');
    console.log(`created: ${summary.created}`);
    console.log(`updated: ${summary.updated}`);
    console.log(`components created: ${summary.componentsCreated}`);
    console.log(`unresolved optional links: ${summary.unresolvedLinks}`);
    console.log(`validated templates: ${summary.validatedTemplates}`);
    console.log(`validated components: ${summary.validatedComponents}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Golden Jordan excursion template seed failed');
  console.error(error);
  process.exit(1);
});

import { PrismaClient } from '@prisma/client';

type PrismaLike = Record<string, any>;
type Logger = Pick<Console, 'log' | 'warn'>;

type GoldenJordanTouringRouteSeed = {
  code: string;
  name: string;
  startCity: string;
  durationDays: number;
  mainDestinations: string[];
  estimatedDistanceKm: number;
  estimatedDriveHours: number;
  pickupRecommendation: string;
  operationalNotes: string;
  stationaryGuidance: string;
  region: 'North' | 'Central' | 'South' | 'Islamic' | 'Airport Layover' | 'Aqaba';
  longDistance: boolean;
  desertRoad: boolean;
  mountainRoad: boolean;
  seasonalHeatRisk: boolean;
  sicPossible: boolean;
  overnightRisk: boolean;
  stops: Array<{ city: string; location?: string; overnight?: boolean; notes?: string }>;
};

type SeedOptions = {
  dryRun?: boolean;
  logger?: Logger;
};

type SeedSummary = {
  dryRun: boolean;
  totalCanonicalRoutes: number;
  created: number;
  updated: number;
  skippedExisting: number;
  duplicatesFlagged: number;
  validatedRoutes: number;
};

const GOLDEN_JORDAN_TOURING_ROUTES: GoldenJordanTouringRouteSeed[] = [
  route('JOR-TR-NORTH-JERASH-RT', 'Amman -> Jerash -> Amman RT', 'Amman', ['Jerash'], 105, 2.1, 'North', ['Amman', 'Jerash', 'Amman'], {
    pickup: '08:30 from Amman hotels',
    notes: 'Classic north half/full-day Roman city circuit. Suitable for same-day Amman return.',
    stationary: 'No stationary charge normally required unless vehicle is held for extended lunch or evening program.',
    sic: true,
  }),
  route('JOR-TR-NORTH-JERASH-AJLOUN-RT', 'Amman -> Jerash -> Ajloun -> Amman RT', 'Amman', ['Jerash', 'Ajloun'], 170, 3.6, 'North', ['Amman', 'Jerash', 'Ajloun', 'Amman'], {
    pickup: '08:00 from Amman hotels',
    notes: 'Mountain-road touring circuit combining Jerash with Ajloun Castle or forest area.',
    stationary: 'Waiting may apply for long lunch stops or extended castle/forest program.',
    mountain: true,
    sic: true,
  }),
  route('JOR-TR-NORTH-UMM-QAIS-PELLA-RT', 'Amman -> Umm Qais -> Pella -> Amman RT', 'Amman', ['Umm Qais', 'Pella'], 245, 5.1, 'North', ['Amman', 'Umm Qais', 'Pella', 'Amman'], {
    pickup: '07:30 from Amman hotels',
    notes: 'Long north Jordan Valley day. Conservative early pickup due distance and site spread.',
    stationary: 'Waiting may apply when combining archaeological site visits with hosted meal stops.',
    long: true,
    mountain: true,
    heat: true,
    sic: true,
  }),
  route('JOR-TR-NORTH-SALT-IRAQ-AL-AMIR-RT', 'Amman -> Salt -> Iraq Al Amir -> Amman RT', 'Amman', ['Salt', 'Iraq Al Amir'], 95, 2.6, 'North', ['Amman', 'Salt', 'Iraq Al Amir', 'Amman'], {
    pickup: '09:00 from Amman hotels',
    notes: 'Short heritage circuit west of Amman. Narrow roads may affect coach access.',
    stationary: 'No stationary charge normally required for standard half/full-day routing.',
    mountain: true,
    sic: true,
  }),

  route('JOR-TR-CENTRAL-AMMAN-CITY-RT', 'Amman -> Amman City Sites -> Amman RT', 'Amman', ['Amman Citadel', 'Roman Theater', 'Downtown Amman'], 35, 1.4, 'Central', ['Amman', 'Amman Citadel', 'Roman Theater', 'Downtown Amman', 'Amman'], {
    pickup: '09:00 from Amman hotels',
    notes: 'Urban sightseeing route. Traffic and parking constraints are the key operational risks.',
    stationary: 'Stationary/waiting may apply if vehicle is held through meals or shopping time.',
    sic: true,
  }),
  route('JOR-TR-CENTRAL-MADABA-NEBO-RT', 'Amman -> Madaba -> Mount Nebo -> Amman RT', 'Amman', ['Madaba', 'Mount Nebo'], 95, 2.2, 'Central', ['Amman', 'Madaba', 'Mount Nebo', 'Amman'], {
    pickup: '08:30 from Amman hotels',
    notes: 'Core mosaic and biblical-site circuit. Can operate as half-day or combined with Dead Sea.',
    stationary: 'No stationary charge normally required for direct routing.',
    sic: true,
  }),
  route('JOR-TR-CENTRAL-MADABA-NEBO-DEAD-SEA-RT', 'Amman -> Madaba -> Nebo -> Dead Sea -> Amman RT', 'Amman', ['Madaba', 'Mount Nebo', 'Dead Sea'], 150, 3.2, 'Central', ['Amman', 'Madaba', 'Mount Nebo', 'Dead Sea', 'Amman'], {
    pickup: '08:30 from Amman hotels',
    notes: 'Full-day central Jordan and Dead Sea circuit. Dead Sea resort access timing should be confirmed.',
    stationary: 'Dead Sea day touring from Amman normally should not require Stationary / Waiting unless vehicle is held beyond included hours.',
    mountain: true,
    heat: true,
    sic: true,
  }),
  route('JOR-TR-CENTRAL-BETHANY-DEAD-SEA-RT', 'Amman -> Bethany -> Dead Sea -> Amman RT', 'Amman', ['Bethany Beyond the Jordan', 'Dead Sea'], 130, 2.8, 'Central', ['Amman', 'Bethany Beyond the Jordan', 'Dead Sea', 'Amman'], {
    pickup: '08:30 from Amman hotels',
    notes: 'Jordan Valley religious and leisure circuit. Bethany shuttle timing must be considered.',
    stationary: 'Dead Sea waiting may apply for extended swim/resort access beyond included hours.',
    heat: true,
    sic: true,
  }),
  route('JOR-TR-CENTRAL-DEAD-SEA-BETHANY-RT', 'Dead Sea -> Bethany -> Dead Sea RT', 'Dead Sea', ['Bethany Beyond the Jordan'], 55, 1.2, 'Central', ['Dead Sea', 'Bethany Beyond the Jordan', 'Dead Sea'], {
    pickup: '09:00 from Dead Sea hotels',
    notes: 'Dead Sea origin religious site circuit. Short distance but shuttle/site timing controls duration.',
    stationary: 'No separate stationary charge normally required for direct Bethany visit.',
    heat: true,
  }),
  route('JOR-TR-CENTRAL-DESERT-CASTLES-RT', 'Amman -> Desert Castles -> Amman RT', 'Amman', ['Qasr Amra', 'Qasr Kharana', 'Qasr Azraq'], 230, 4.0, 'Central', ['Amman', 'Qasr Kharana', 'Qasr Amra', 'Qasr Azraq', 'Amman'], {
    pickup: '08:00 from Amman hotels',
    notes: 'Eastern desert circuit. Fuel, heat, and guide timing should be checked in summer.',
    stationary: 'Waiting may apply for extended Azraq or lunch stop.',
    long: true,
    desert: true,
    heat: true,
    sic: true,
  }),
  route('JOR-TR-CENTRAL-MUKAWIR-RT', 'Amman -> Mukawir -> Amman RT', 'Amman', ['Mukawir'], 170, 3.4, 'Central', ['Amman', 'Mukawir', 'Amman'], {
    pickup: '08:00 from Amman hotels',
    notes: 'Remote biblical hilltop site. Road and walking conditions should be reviewed.',
    stationary: 'Waiting may apply when combined with Madaba, Nebo, or Dead Sea meal stops.',
    mountain: true,
    heat: true,
  }),
  route('JOR-TR-CENTRAL-DEAD-SEA-MADABA-NEBO-AMMAN-OW', 'Dead Sea -> Madaba -> Mount Nebo -> Amman OW', 'Dead Sea', ['Madaba', 'Mount Nebo', 'Amman'], 80, 2.0, 'Central', ['Dead Sea', 'Mount Nebo', 'Madaba', 'Amman'], {
    pickup: '09:00 from Dead Sea hotels',
    notes: 'One-way continuation from Dead Sea to Amman with sightseeing en route.',
    stationary: 'No stationary charge normally required unless adding lunch or shopping hold.',
    mountain: true,
    heat: true,
  }),

  route('JOR-TR-SOUTH-AMMAN-PETRA-ON', 'Amman -> Petra ON', 'Amman', ['Petra'], 240, 3.4, 'South', ['Amman', 'Petra'], {
    pickup: '07:00 from Amman hotels',
    notes: 'Southbound overnight continuation to Petra. Desert Highway or Kings Highway variant must be specified operationally.',
    stationary: 'Stationary / Waiting may apply for Petra overnight or free-day operations.',
    long: true,
    desert: true,
    mountain: true,
    heat: true,
    sic: true,
    overnightAt: 'Petra',
  }),
  route('JOR-TR-SOUTH-MADABA-NEBO-PETRA-ON', 'Amman -> Madaba -> Nebo -> Petra ON', 'Amman', ['Madaba', 'Mount Nebo', 'Petra'], 270, 4.5, 'South', ['Amman', 'Madaba', 'Mount Nebo', 'Petra'], {
    pickup: '07:30 from Amman hotels',
    notes: 'Sightseeing continuation to Petra via central Jordan. Suitable for first southbound program day.',
    stationary: 'Stationary / Waiting may apply at Petra overnight endpoint.',
    long: true,
    desert: true,
    mountain: true,
    heat: true,
    sic: true,
    overnightAt: 'Petra',
  }),
  route('JOR-TR-SOUTH-KERAK-PETRA-ON', 'Amman -> Kerak -> Petra ON', 'Amman', ['Kerak', 'Petra'], 285, 4.8, 'South', ['Amman', 'Kerak', 'Petra'], {
    pickup: '08:00 from Amman hotels',
    notes: 'Kings Highway continuation to Petra through Kerak. Slower mountain-road routing than Desert Highway.',
    stationary: 'Stationary / Waiting may apply at Petra overnight endpoint.',
    long: true,
    desert: true,
    mountain: true,
    heat: true,
    sic: true,
    overnightAt: 'Petra',
  }),
  route('JOR-TR-SOUTH-DEAD-SEA-KERAK-PETRA-ON', 'Dead Sea -> Kerak -> Petra ON', 'Dead Sea', ['Kerak', 'Petra'], 245, 4.2, 'South', ['Dead Sea', 'Kerak', 'Petra'], {
    pickup: '08:30 from Dead Sea hotels',
    notes: 'Dead Sea origin continuation to Petra via Kerak. Useful for southbound overnight programs.',
    stationary: 'Stationary / Waiting may apply at Petra overnight endpoint.',
    long: true,
    desert: true,
    mountain: true,
    heat: true,
    overnightAt: 'Petra',
  }),
  route('JOR-TR-SOUTH-PETRA-WADI-RUM-ON', 'Petra -> Wadi Rum ON', 'Petra', ['Wadi Rum'], 115, 2.0, 'South', ['Petra', 'Wadi Rum'], {
    pickup: '09:00 from Petra hotels',
    notes: 'Continuation from Petra to Wadi Rum camp area. Camp transfer handoff should be confirmed.',
    stationary: 'Stationary / Waiting may apply for Wadi Rum overnight or free-day operations.',
    desert: true,
    heat: true,
    sic: true,
    overnightAt: 'Wadi Rum',
  }),
  route('JOR-TR-SOUTH-WADI-RUM-AQABA-OW', 'Wadi Rum -> Aqaba OW', 'Wadi Rum', ['Aqaba'], 70, 1.2, 'South', ['Wadi Rum', 'Aqaba'], {
    pickup: '09:00 from Wadi Rum camp exit or visitor center',
    notes: 'One-way continuation from Wadi Rum to Aqaba hotels, port, or airport area.',
    stationary: 'No stationary charge normally required for direct continuation.',
    desert: true,
    heat: true,
  }),
  route('JOR-TR-SOUTH-AQABA-WADI-RUM-RT', 'Aqaba -> Wadi Rum -> Aqaba RT', 'Aqaba', ['Wadi Rum'], 145, 2.5, 'South', ['Aqaba', 'Wadi Rum', 'Aqaba'], {
    pickup: '08:30 from Aqaba hotels',
    notes: 'Aqaba origin Wadi Rum day excursion route. Jeep provider timing is separate from vehicle routing.',
    stationary: 'Stationary / Waiting may apply if vehicle waits through desert activity.',
    desert: true,
    heat: true,
    sic: true,
  }),
  route('JOR-TR-SOUTH-PETRA-AQABA-OW', 'Petra -> Aqaba OW', 'Petra', ['Aqaba'], 125, 2.1, 'South', ['Petra', 'Aqaba'], {
    pickup: '09:00 from Petra hotels',
    notes: 'One-way continuation to Aqaba after Petra overnight. Can connect to beach or port operations.',
    stationary: 'No stationary charge normally required for direct continuation.',
    desert: true,
    heat: true,
  }),
  route('JOR-TR-SOUTH-PETRA-AQABA-RT', 'Petra -> Aqaba -> Petra RT', 'Petra', ['Aqaba'], 250, 4.2, 'South', ['Petra', 'Aqaba', 'Petra'], {
    pickup: '08:00 from Petra hotels',
    notes: 'Petra origin Aqaba same-day return. Use only when itinerary requires Petra base.',
    stationary: 'Waiting applies if vehicle is held during Aqaba beach, yacht, or diving activity.',
    long: true,
    desert: true,
    heat: true,
  }),
  route('JOR-TR-SOUTH-LITTLE-PETRA-RT', 'Petra -> Little Petra -> Petra RT', 'Petra', ['Little Petra'], 28, 0.9, 'South', ['Petra', 'Little Petra', 'Petra'], {
    pickup: '09:00 from Petra hotels',
    notes: 'Short Petra area local circuit. Often combined with free-day or evening camp activity.',
    stationary: 'Stationary / Waiting may apply when vehicle is held locally for Petra free-day operations.',
    mountain: true,
    heat: true,
  }),
  route('JOR-TR-SOUTH-DANA-RT', 'Petra -> Dana -> Petra RT', 'Petra', ['Dana'], 150, 3.2, 'South', ['Petra', 'Dana', 'Petra'], {
    pickup: '08:00 from Petra hotels',
    notes: 'Petra origin Dana nature reserve circuit. Road conditions and walking program must be confirmed.',
    stationary: 'Waiting may apply for hiking or extended reserve visit.',
    mountain: true,
    heat: true,
  }),
  route('JOR-TR-SOUTH-AMMAN-DANA-PETRA-ON', 'Amman -> Dana -> Petra ON', 'Amman', ['Dana', 'Petra'], 310, 5.0, 'South', ['Amman', 'Dana', 'Petra'], {
    pickup: '07:00 from Amman hotels',
    notes: 'Southbound continuation through Dana before Petra overnight.',
    stationary: 'Stationary / Waiting may apply at Dana visit and Petra overnight endpoint.',
    long: true,
    desert: true,
    mountain: true,
    heat: true,
    overnightAt: 'Petra',
  }),

  route('JOR-TR-ISLAMIC-BLESSED-TREE-RT', 'Amman -> Blessed Tree -> Amman RT', 'Amman', ['Blessed Tree'], 270, 4.7, 'Islamic', ['Amman', 'Blessed Tree', 'Amman'], {
    pickup: '07:30 from Amman hotels',
    notes: 'Long eastern desert religious route. Confirm site access and prayer/lunch timing.',
    stationary: 'Waiting may apply for hosted religious program or extended stop.',
    long: true,
    desert: true,
    heat: true,
  }),
  route('JOR-TR-ISLAMIC-JORDAN-VALLEY-RT', 'Amman -> Jordan Valley Islamic Sites -> Amman RT', 'Amman', ['Jordan Valley Islamic Sites'], 210, 4.2, 'Islamic', ['Amman', 'Jordan Valley Islamic Sites', 'Amman'], {
    pickup: '08:00 from Amman hotels',
    notes: 'Islamic sites circuit in Jordan Valley. Heat and access timing are operational constraints.',
    stationary: 'Waiting may apply for religious program extensions.',
    long: true,
    heat: true,
  }),
  route('JOR-TR-ISLAMIC-MUTA-PETRA-ON', 'Amman -> Muta -> Petra ON', 'Amman', ['Muta', 'Petra'], 300, 5.0, 'Islamic', ['Amman', 'Muta', 'Petra'], {
    pickup: '07:30 from Amman hotels',
    notes: 'Religious southbound continuation ending overnight in Petra.',
    stationary: 'Stationary / Waiting may apply for Petra overnight operations.',
    long: true,
    desert: true,
    mountain: true,
    heat: true,
    overnightAt: 'Petra',
  }),

  route('JOR-TR-LAYOVER-QAIA-AMMAN-RT', 'QAIA -> Amman -> QAIA RT', 'QAIA', ['Amman City Sites'], 80, 1.8, 'Airport Layover', ['QAIA', 'Amman Citadel', 'Roman Theater', 'QAIA'], {
    pickup: 'Coordinate to flight arrival; allow immigration and baggage buffer',
    notes: 'Airport layover route. Must preserve airport return buffer and flight reconfirmation.',
    stationary: 'Waiting is inherent in layover operation; price as layover/stationary if vehicle remains on standby.',
  }),
  route('JOR-TR-LAYOVER-QAIA-DEAD-SEA-RT', 'QAIA -> Dead Sea -> QAIA RT', 'QAIA', ['Dead Sea'], 110, 2.0, 'Airport Layover', ['QAIA', 'Dead Sea', 'QAIA'], {
    pickup: 'Coordinate to flight arrival; recommend 5+ hour layover minimum',
    notes: 'Airport-to-Dead Sea layover. Resort access timing and luggage handling must be confirmed.',
    stationary: 'Waiting/standby normally applies for layover operation.',
    heat: true,
  }),
  route('JOR-TR-LAYOVER-QAIA-JERASH-RT', 'QAIA -> Jerash -> QAIA RT', 'QAIA', ['Jerash'], 145, 2.7, 'Airport Layover', ['QAIA', 'Jerash', 'QAIA'], {
    pickup: 'Coordinate to flight arrival; recommend 6+ hour layover minimum',
    notes: 'Airport layover to Jerash. Traffic risk around Amman corridor must be considered.',
    stationary: 'Waiting/standby normally applies for layover operation.',
  }),

  route('JOR-TR-AQABA-SOUTH-BEACH-RT', 'Aqaba -> South Beach -> Aqaba RT', 'Aqaba', ['South Beach'], 35, 0.8, 'Aqaba', ['Aqaba', 'South Beach', 'Aqaba'], {
    pickup: '09:30 from Aqaba hotels',
    notes: 'Aqaba local beach route. Beach club access and towel/lunch arrangements are outside route record.',
    stationary: 'Waiting applies when vehicle is held during beach time.',
    heat: true,
  }),
  route('JOR-TR-AQABA-BERENICE-RT', 'Aqaba -> Berenice Beach Club -> Aqaba RT', 'Aqaba', ['Berenice Beach Club'], 30, 0.7, 'Aqaba', ['Aqaba', 'Berenice Beach Club', 'Aqaba'], {
    pickup: '09:30 from Aqaba hotels',
    notes: 'Aqaba local beach club route. Confirm day-use booking separately.',
    stationary: 'Waiting applies when vehicle is held during beach club time.',
    heat: true,
  }),
  route('JOR-TR-AQABA-YACHT-RT', 'Aqaba -> Marina Yacht Pier -> Aqaba RT', 'Aqaba', ['Aqaba Marina'], 20, 0.5, 'Aqaba', ['Aqaba', 'Aqaba Marina', 'Aqaba'], {
    pickup: 'Align with yacht boarding time',
    notes: 'Transfer backbone for yacht experience. Yacht product is layered as excursion/service, not an activity route.',
    stationary: 'Waiting applies if vehicle is held through sailing duration.',
    heat: true,
  }),
  route('JOR-TR-AQABA-GLASS-BOAT-RT', 'Aqaba -> Glass Boat Pier -> Aqaba RT', 'Aqaba', ['Glass Boat Pier'], 20, 0.5, 'Aqaba', ['Aqaba', 'Glass Boat Pier', 'Aqaba'], {
    pickup: 'Align with glass boat boarding time',
    notes: 'Transfer backbone for glass boat experience. Boat supplier service is separate from route.',
    stationary: 'Waiting applies if vehicle is held through boat duration.',
    heat: true,
  }),
  route('JOR-TR-AQABA-SNORKELING-RT', 'Aqaba -> Snorkeling Site -> Aqaba RT', 'Aqaba', ['Snorkeling Site'], 35, 0.8, 'Aqaba', ['Aqaba', 'South Beach Snorkeling Site', 'Aqaba'], {
    pickup: '09:00 from Aqaba hotels',
    notes: 'Transfer backbone for snorkeling experience. Equipment/guide supplier is separate.',
    stationary: 'Waiting applies if vehicle is held through snorkeling duration.',
    heat: true,
  }),
  route('JOR-TR-AQABA-DIVING-RT', 'Aqaba -> Diving Center -> Aqaba RT', 'Aqaba', ['Diving Center'], 35, 0.8, 'Aqaba', ['Aqaba', 'Diving Center', 'Aqaba'], {
    pickup: 'Align with dive center check-in time',
    notes: 'Transfer backbone for diving experience. Dive product and certification checks are separate.',
    stationary: 'Waiting applies if vehicle is held through diving duration.',
    heat: true,
  }),
];

const CANONICAL_REVIEW_NOTE =
  'Golden Jordan canonical touring route. Operational infrastructure only; not a sellable excursion template.';

const LEGACY_SOURCE_TEST_NAME_MARKERS = [
  { name: 'Amman – Jerash – Amman RT' },
  { name: 'Amman – Madaba – Nebo – Dead Sea – Amman RT' },
  { name: 'Petra – Wadi Rum ON' },
  { name: 'Amman – Blessed Tree – Amman RT' },
  { name: 'Amman – Jerash – Ajloun – Amman RT' },
  { name: 'Amman – Umm Qais – Pella – Amman RT' },
  { name: 'Amman – Salt – Iraq Al Amir – Amman RT' },
  { name: 'Amman – Amman City Sites – Amman RT' },
  { name: 'Amman – Madaba – Mount Nebo – Amman RT' },
  { name: 'Amman – Bethany – Dead Sea – Amman RT' },
  { name: 'Amman – Desert Castles – Amman RT' },
  { name: 'Amman – Mukawir – Amman RT' },
  { name: 'Amman – Kerak – Petra ON' },
  { name: 'Aqaba – Wadi Rum – Aqaba RT' },
  { name: 'Amman â€“ Jerash â€“ Amman RT' },
  { name: 'Amman â€“ Madaba â€“ Nebo â€“ Dead Sea â€“ Amman RT' },
  { name: 'Petra â€“ Wadi Rum ON' },
  { name: 'Amman â€“ Blessed Tree â€“ Amman RT' },
  { name: 'Amman â€“ Jerash â€“ Ajloun â€“ Amman RT' },
  { name: 'Amman â€“ Umm Qais â€“ Pella â€“ Amman RT' },
  { name: 'Amman â€“ Salt â€“ Iraq Al Amir â€“ Amman RT' },
  { name: 'Amman â€“ Amman City Sites â€“ Amman RT' },
  { name: 'Amman â€“ Madaba â€“ Mount Nebo â€“ Amman RT' },
  { name: 'Amman â€“ Bethany â€“ Dead Sea â€“ Amman RT' },
  { name: 'Amman â€“ Desert Castles â€“ Amman RT' },
  { name: 'Amman â€“ Mukawir â€“ Amman RT' },
  { name: 'Amman â€“ Kerak â€“ Petra ON' },
  { name: 'Aqaba â€“ Wadi Rum â€“ Aqaba RT' },
];

const LEGACY_SOURCE_TEST_REGION_MARKERS = [
  { region: 'North' },
  { region: 'Central' },
  { region: 'South' },
  { region: 'Islamic' },
];

function route(
  code: string,
  name: string,
  startCity: string,
  mainDestinations: string[],
  estimatedDistanceKm: number,
  estimatedDriveHours: number,
  region: GoldenJordanTouringRouteSeed['region'],
  stopNames: string[],
  options: {
    pickup: string;
    notes: string;
    stationary: string;
    long?: boolean;
    desert?: boolean;
    mountain?: boolean;
    heat?: boolean;
    sic?: boolean;
    overnightAt?: string;
  },
): GoldenJordanTouringRouteSeed {
  return {
    code,
    name,
    startCity,
    durationDays: options.overnightAt ? 2 : 1,
    mainDestinations,
    estimatedDistanceKm,
    estimatedDriveHours,
    pickupRecommendation: options.pickup,
    operationalNotes: options.notes,
    stationaryGuidance: options.stationary,
    region,
    longDistance: options.long || estimatedDistanceKm >= 180 || estimatedDriveHours >= 3.5,
    desertRoad: Boolean(options.desert),
    mountainRoad: Boolean(options.mountain),
    seasonalHeatRisk: Boolean(options.heat),
    sicPossible: Boolean(options.sic),
    overnightRisk: Boolean(options.overnightAt),
    stops: stopNames.map((stopName) => ({
      city: stopName,
      location: stopName,
      overnight: stopName === options.overnightAt,
      notes: stopName === options.overnightAt ? 'Overnight stop' : undefined,
    })),
  };
}

function normalizeTouringRouteReviewKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\b(round\s*trip|return|rt)\b/g, 'rt')
    .replace(/\b(overnight|on)\b/g, 'on')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function buildReviewNotes(route: GoldenJordanTouringRouteSeed) {
  return [
    CANONICAL_REVIEW_NOTE,
    `Pickup recommendation: ${route.pickupRecommendation}.`,
    `Operational notes: ${route.operationalNotes}`,
    `Stationary / Waiting guidance: ${route.stationaryGuidance}`,
    route.overnightRisk ? 'Overnight marker: route contains an ON overnight routing endpoint.' : 'Overnight marker: none; round-trip or same-day operation.',
  ].join('\n');
}

function buildRouteData(route: GoldenJordanTouringRouteSeed) {
  return {
    name: route.name,
    startCity: route.startCity,
    durationDays: route.durationDays,
    routeDescription: route.stops.map((stop) => stop.location || stop.city).join(' -> '),
    mainDestinations: route.mainDestinations,
    includedKm: route.estimatedDistanceKm,
    includedHours: route.estimatedDriveHours,
    estimatedDistanceKm: route.estimatedDistanceKm,
    estimatedDriveHours: route.estimatedDriveHours,
    region: route.region,
    longDistance: route.longDistance,
    desertRoad: route.desertRoad,
    mountainRoad: route.mountainRoad,
    seasonalHeatRisk: route.seasonalHeatRisk,
    sicPossible: route.sicPossible,
    overnightRisk: route.overnightRisk,
    reviewNotes: buildReviewNotes(route),
    active: true,
  };
}

function buildStopCreates(route: GoldenJordanTouringRouteSeed) {
  return route.stops.map((stop, index) => ({
    order: index + 1,
    city: stop.city,
    location: stop.location || stop.city,
    notes: stop.overnight ? [stop.notes || 'Overnight stop', route.stationaryGuidance].filter(Boolean).join(' | ') : stop.notes || null,
  }));
}

function printPlan(logger: Logger, rows: Array<{ code: string; name: string; action: string; route: GoldenJordanTouringRouteSeed }>) {
  logger.log('Code | Name | Action | DistanceKm | DurationHours | Pickup Recommendation | Stops');
  for (const row of rows) {
    logger.log(
      `${row.code} | ${row.name} | ${row.action} | ${row.route.estimatedDistanceKm} | ${row.route.estimatedDriveHours} | ${row.route.pickupRecommendation} | ${row.route.stops
        .map((stop) => `${stop.location || stop.city}${stop.overnight ? ' (ON)' : ''}`)
        .join(' > ')}`,
    );
  }
}

export async function seedGoldenJordanTouringRoutes(prisma: PrismaLike, options: SeedOptions = {}) {
  const dryRun = options.dryRun ?? true;
  const logger = options.logger || console;
  const canonicalCodes = GOLDEN_JORDAN_TOURING_ROUTES.map((routeSeed) => routeSeed.code);
  const existingCanonicalRoutes = await prisma.touringRoute.findMany({
    where: { code: { in: canonicalCodes } },
    select: { id: true, code: true, name: true, routeDescription: true, reviewNotes: true },
  });
  const existingCanonicalCodes = new Set(existingCanonicalRoutes.map((routeRow: any) => routeRow.code));
  const canonicalByReviewKey = new Map(
    GOLDEN_JORDAN_TOURING_ROUTES.map((routeSeed) => [normalizeTouringRouteReviewKey(routeSeed.name), routeSeed]),
  );

  const summary: SeedSummary = {
    dryRun,
    totalCanonicalRoutes: GOLDEN_JORDAN_TOURING_ROUTES.length,
    created: 0,
    updated: 0,
    skippedExisting: 0,
    duplicatesFlagged: 0,
    validatedRoutes: dryRun ? existingCanonicalRoutes.length : 0,
  };
  const planRows: Array<{ code: string; name: string; action: string; route: GoldenJordanTouringRouteSeed }> = [];

  logger.log(`Jordan Touring Route Expansion Seeder Phase 1 ${dryRun ? 'dry-run' : 'apply'} mode.`);
  logger.log('No quotes, bookings, activities, or pricing logic will be touched.');

  for (const routeSeed of GOLDEN_JORDAN_TOURING_ROUTES) {
    const exists = existingCanonicalCodes.has(routeSeed.code);
    const action = exists ? (dryRun ? 'Would update existing canonical route' : 'Updated existing canonical route') : dryRun ? 'Would create canonical route' : 'Created canonical route';
    planRows.push({ code: routeSeed.code, name: routeSeed.name, action, route: routeSeed });

    if (dryRun) {
      if (exists) summary.skippedExisting += 1;
      else summary.created += 1;
      continue;
    }

    await prisma.touringRoute.upsert({
      where: { code: routeSeed.code },
      update: {
        ...buildRouteData(routeSeed),
        stops: {
          deleteMany: {},
          create: buildStopCreates(routeSeed),
        },
      },
      create: {
        code: routeSeed.code,
        ...buildRouteData(routeSeed),
        stops: {
          create: buildStopCreates(routeSeed),
        },
      },
    });

    if (exists) summary.updated += 1;
    else summary.created += 1;
  }

  const legacyRoutes = await prisma.touringRoute.findMany({
    where: { code: { notIn: canonicalCodes } },
    select: { id: true, code: true, name: true, routeDescription: true, reviewNotes: true },
  });

  for (const legacyRoute of legacyRoutes) {
    const matched = canonicalByReviewKey.get(
      normalizeTouringRouteReviewKey(legacyRoute.name || legacyRoute.routeDescription || ''),
    );
    if (!matched) continue;

    const reviewNotes = `Review duplicate/similar legacy touring route against canonical ${matched.code}. Do not delete automatically.`;
    if (legacyRoute.reviewNotes === reviewNotes) continue;

    if (!dryRun) {
      await prisma.touringRoute.update({
        where: { id: legacyRoute.id },
        data: { reviewNotes },
      });
    }
    summary.duplicatesFlagged += 1;
  }

  if (!dryRun) {
    const canonicalRouteCount = await prisma.touringRoute.count({
      where: { code: { in: canonicalCodes } },
    });
    if (canonicalRouteCount !== GOLDEN_JORDAN_TOURING_ROUTES.length) {
      throw new Error(
        `Golden Jordan touring route validation failed: expected ${GOLDEN_JORDAN_TOURING_ROUTES.length}, found ${canonicalRouteCount}.`,
      );
    }
    summary.validatedRoutes = canonicalRouteCount;
  }

  printPlan(logger, planRows);
  logger.log(`Jordan Touring Route Expansion summary: ${JSON.stringify(summary, null, 2)}`);
  return summary;
}

async function main() {
  const prisma = new PrismaClient();
  const dryRun = !process.argv.includes('--apply');
  try {
    await seedGoldenJordanTouringRoutes(prisma, { dryRun });
    if (dryRun) {
      console.log('Dry-run only. Re-run with --apply to create or update canonical touring routes.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Golden Jordan touring route seed failed');
    console.error(error);
    process.exit(1);
  });
}

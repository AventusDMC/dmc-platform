import { PrismaClient } from '@prisma/client';

type PrismaLike = Record<string, any>;
type Logger = Pick<Console, 'log' | 'warn'>;

// First Jordan Points-of-Interest seed (Phase 2.5). Content objects (sightseeing
// places), NOT generic cities — base cities / transfer points stay as plain
// route stops (poiId = null). English content first; the translation table is
// ready for pt/es/ar and they can be added progressively.
type PoiSeed = {
  code: string;
  name: string;
  region: 'North' | 'Central' | 'South' | 'Islamic' | 'Eastern Desert';
  stopType: string;
  visitDurationMinutes?: number;
  viewpoint?: boolean;
  religiousSite?: boolean;
  photoStop?: boolean;
  guideRecommended?: boolean;
  lunchOpportunity?: boolean;
  en: { title: string; shortDescription: string; longDescription: string };
  // Route-stop city strings that should resolve to this POI when linking sample
  // routes. Empty = created but not auto-linked to the sample routes.
  linkCities?: string[];
};

const POI_SEED: PoiSeed[] = [
  // ---- North ----
  { code: 'JERASH_ARCHAEOLOGICAL_SITE', name: 'Jerash Archaeological Site', region: 'North', stopType: 'Archaeological site', visitDurationMinutes: 150, photoStop: true, guideRecommended: true, linkCities: ['Jerash'],
    en: { title: 'Jerash Archaeological Site', shortDescription: 'One of the best-preserved Greco-Roman cities in the world.', longDescription: "Explore Hadrian's Arch, the Oval Plaza, the colonnaded Cardo Maximus, the Temple of Artemis and the ancient theatres of this remarkably intact Roman provincial city." } },
  { code: 'AJLOUN_CASTLE', name: 'Ajloun Castle', region: 'North', stopType: 'Castle', visitDurationMinutes: 60, photoStop: true, viewpoint: true, linkCities: ['Ajloun'],
    en: { title: 'Ajloun Castle', shortDescription: '12th-century Ayyubid hilltop fortress.', longDescription: 'Qal’at Ar-Rabad was built by a general of Saladin to control the region and command sweeping views over the northern Jordan Valley.' } },
  { code: 'UMM_QAIS', name: 'Umm Qais', region: 'North', stopType: 'Archaeological site', visitDurationMinutes: 90, viewpoint: true, photoStop: true, linkCities: ['Umm Qais'],
    en: { title: 'Umm Qais', shortDescription: 'Ruins of Gadara overlooking the Sea of Galilee and Golan Heights.', longDescription: 'The Greco-Roman city of Gadara, with its basalt streets, theatre and terraces offering panoramic views across three countries.' } },
  { code: 'PELLA', name: 'Pella', region: 'North', stopType: 'Archaeological site', visitDurationMinutes: 75, linkCities: ['Pella'],
    en: { title: 'Pella', shortDescription: 'One of the Decapolis cities, continuously occupied for millennia.', longDescription: 'An archaeological site in the Jordan Valley revealing layers from the Neolithic through the Roman, Byzantine and Islamic periods.' } },
  { code: 'AJLOUN_FOREST_RESERVE', name: 'Ajloun Forest Reserve', region: 'North', stopType: 'Nature reserve', visitDurationMinutes: 120, photoStop: true, lunchOpportunity: true, linkCities: ['Ajloun Forest'],
    en: { title: 'Ajloun Forest Reserve', shortDescription: 'Oak and pistachio woodland in the northern highlands.', longDescription: 'A protected Mediterranean-type forest with marked walking trails, local enterprises and rich birdlife, managed by the RSCN.' } },

  // ---- Central / Biblical ----
  { code: 'MADABA', name: 'Madaba', region: 'Central', stopType: 'Heritage town', visitDurationMinutes: 60, religiousSite: true, guideRecommended: true, linkCities: ['Madaba'],
    en: { title: 'Madaba', shortDescription: 'The "City of Mosaics" and the 6th-century Madaba Map.', longDescription: 'Home to the famous Byzantine mosaic map of the Holy Land in St George’s Church, plus numerous other mosaics across the town.' } },
  { code: 'MOUNT_NEBO', name: 'Mount Nebo', region: 'Central', stopType: 'Religious viewpoint', visitDurationMinutes: 45, religiousSite: true, viewpoint: true, photoStop: true, linkCities: ['Mount Nebo'],
    en: { title: 'Mount Nebo', shortDescription: 'Where Moses viewed the Promised Land.', longDescription: 'A revered pilgrimage site with the Memorial Church of Moses and panoramic views over the Jordan Valley, Dead Sea and, on clear days, Jerusalem.' } },
  { code: 'BETHANY_BEYOND_THE_JORDAN', name: 'Bethany Beyond the Jordan', region: 'Central', stopType: 'Religious site', visitDurationMinutes: 90, religiousSite: true, guideRecommended: true, linkCities: ['Bethany'],
    en: { title: 'Bethany Beyond the Jordan', shortDescription: 'The baptism site of Jesus Christ (UNESCO).', longDescription: 'Al-Maghtas, on the east bank of the Jordan River, is the widely recognised location of the baptism of Jesus and an important pilgrimage destination.' } },
  { code: 'DEAD_SEA', name: 'Dead Sea', region: 'Central', stopType: 'Natural wonder', visitDurationMinutes: 120, photoStop: true, lunchOpportunity: true, linkCities: ['Dead Sea'],
    en: { title: 'Dead Sea', shortDescription: 'The lowest point on Earth — float in mineral-rich waters.', longDescription: 'At over 400m below sea level, its hypersaline water lets visitors float effortlessly; the mineral mud is prized for its therapeutic properties.' } },
  { code: 'MUKAWIR', name: 'Mukawir', region: 'Central', stopType: 'Archaeological site', visitDurationMinutes: 75, viewpoint: true, religiousSite: true, linkCities: ['Mukawir'],
    en: { title: 'Mukawir', shortDescription: 'Hilltop fortress of Herod — where John the Baptist was beheaded.', longDescription: 'Machaerus, a fortified palace overlooking the Dead Sea, traditionally held as the place of John the Baptist’s imprisonment and death.' } },

  // ---- South ----
  { code: 'KARAK_CASTLE', name: 'Karak Castle', region: 'South', stopType: 'Castle', visitDurationMinutes: 75, photoStop: true, guideRecommended: true, linkCities: ['Karak', 'Kerak'],
    en: { title: 'Karak Castle', shortDescription: 'A great Crusader castle on the King’s Highway.', longDescription: 'A vast 12th-century Crusader fortress with vaulted halls and tunnels, later expanded under Ayyubid and Mamluk rule.' } },
  { code: 'DANA_BIOSPHERE_RESERVE', name: 'Dana Biosphere Reserve', region: 'South', stopType: 'Nature reserve', visitDurationMinutes: 120, viewpoint: true, photoStop: true, lunchOpportunity: true, linkCities: ['Dana'],
    en: { title: 'Dana Biosphere Reserve', shortDescription: 'Jordan’s largest nature reserve, spanning four bio-geographic zones.', longDescription: 'Dramatic escarpments and wadis descending from the highlands to the desert, with the historic Dana village, hiking trails and abundant wildlife.' } },
  { code: 'SHOBAK_CASTLE', name: 'Shobak Castle', region: 'South', stopType: 'Castle', visitDurationMinutes: 60, photoStop: true, linkCities: ['Shobak', 'Shoubak'],
    en: { title: 'Shobak Castle', shortDescription: 'Crusader fortress "Montreal" on a lone hill.', longDescription: 'Built in 1115 by Baldwin I, this remote Crusader castle preserves towers, a church and carved inscriptions from successive eras.' } },
  { code: 'PETRA_ARCHAEOLOGICAL_CITY', name: 'Petra Archaeological City', region: 'South', stopType: 'Archaeological city', visitDurationMinutes: 300, photoStop: true, guideRecommended: true, lunchOpportunity: true, linkCities: ['Petra'],
    en: { title: 'Petra Archaeological City', shortDescription: 'The rose-red Nabataean capital and a New Wonder of the World.', longDescription: 'Enter through the Siq to the Treasury (Al-Khazneh), then explore the Street of Facades, the Royal Tombs, the Monastery (Ad-Deir) and a vast carved city — a UNESCO World Heritage Site.' } },
  { code: 'LITTLE_PETRA', name: 'Little Petra', region: 'South', stopType: 'Archaeological site', visitDurationMinutes: 60, photoStop: true, linkCities: ['Little Petra', 'Siq al-Barid'],
    en: { title: 'Little Petra', shortDescription: 'Siq al-Barid — a smaller Nabataean caravan suburb.', longDescription: 'A compact carved canyon north of Petra that served as a trading suburb, with painted Hellenistic frescoes in the Painted House.' } },
  { code: 'WADI_RUM_PROTECTED_AREA', name: 'Wadi Rum Protected Area', region: 'South', stopType: 'Desert / nature reserve', visitDurationMinutes: 180, viewpoint: true, photoStop: true, lunchOpportunity: true, linkCities: ['Wadi Rum'],
    en: { title: 'Wadi Rum Protected Area', shortDescription: 'The "Valley of the Moon" — dramatic desert of sandstone and granite.', longDescription: 'A UNESCO desert wilderness of towering rock formations, narrow canyons and Nabataean inscriptions, best explored by 4x4 and experienced overnight in a desert camp.' } },
  { code: 'AQABA_CITY', name: 'Aqaba City', region: 'South', stopType: 'Coastal city', visitDurationMinutes: 90, lunchOpportunity: true, linkCities: ['Aqaba'],
    en: { title: 'Aqaba City', shortDescription: 'Jordan’s Red Sea resort and dive gateway.', longDescription: 'A relaxed coastal city with coral reefs, beaches, a historic fort and a duty-free zone, serving as the southern gateway to Wadi Rum and Petra.' } },

  // ---- Islamic / Religious ----
  { code: 'ABU_UBAIDAH_SHRINE', name: 'Abu Ubaidah Shrine', region: 'Islamic', stopType: 'Islamic shrine', visitDurationMinutes: 30, religiousSite: true, linkCities: ['Abu Ubaidah'],
    en: { title: 'Abu Ubaidah Shrine', shortDescription: 'Tomb of the companion Abu Ubaidah ibn al-Jarrah.', longDescription: 'A mosque and shrine in the Jordan Valley honouring one of the most revered companions of the Prophet Muhammad.' } },
  { code: 'SHURAHBEEL_SHRINE', name: 'Shurahbeel Bin Hasana Shrine', region: 'Islamic', stopType: 'Islamic shrine', visitDurationMinutes: 30, religiousSite: true, linkCities: ['Shurahbeel'],
    en: { title: 'Shurahbeel Bin Hasana Shrine', shortDescription: 'Shrine of an early Muslim commander.', longDescription: 'A pilgrimage site commemorating Shurahbeel ibn Hasana, a companion and commander of the early Islamic conquests.' } },
  { code: 'DIRAR_SHRINE', name: 'Dirar Bin Al Azwar Shrine', region: 'Islamic', stopType: 'Islamic shrine', visitDurationMinutes: 30, religiousSite: true, linkCities: ['Dirar'],
    en: { title: 'Dirar Bin Al Azwar Shrine', shortDescription: 'Shrine of the companion and poet Dirar ibn al-Azwar.', longDescription: 'A site honouring the famed early Muslim warrior and poet, located in the Jordan Valley.' } },
  { code: 'MUTAH', name: "Mu'tah", region: 'Islamic', stopType: 'Historic battlefield', visitDurationMinutes: 45, religiousSite: true, linkCities: ["Mu'tah", 'Mutah'],
    en: { title: "Mu'tah", shortDescription: 'Site of the 629 CE Battle of Mu’tah and companions’ shrines.', longDescription: 'Near Karak, the area commemorates the Battle of Mu’tah with the shrines of Ja’far ibn Abi Talib, Zaid ibn Harithah and Abdullah ibn Rawahah.' } },
  { code: 'BLESSED_TREE', name: 'Blessed Tree', region: 'Islamic', stopType: 'Religious landmark', visitDurationMinutes: 20, religiousSite: true, photoStop: true, linkCities: ['Blessed Tree'],
    en: { title: 'Blessed Tree', shortDescription: 'The lone desert tree associated with the Prophet Muhammad.', longDescription: 'A solitary, centuries-old tree in the eastern desert traditionally linked to the journey of the young Prophet Muhammad with the monk Bahira.' } },

  // ---- Eastern Desert ----
  { code: 'QASR_KHARANA', name: 'Qasr Kharana', region: 'Eastern Desert', stopType: 'Desert castle', visitDurationMinutes: 40, photoStop: true, linkCities: ['Qasr Kharana', 'Kharana', 'Kharanah'],
    en: { title: 'Qasr Kharana', shortDescription: 'A well-preserved early Umayyad desert structure.', longDescription: 'A square, fortress-like building from the early 8th century, notable for its intact interior rooms and decorative plasterwork.' } },
  { code: 'QASR_AMRA', name: 'Qasr Amra', region: 'Eastern Desert', stopType: 'Desert castle (UNESCO)', visitDurationMinutes: 40, photoStop: true, guideRecommended: true, linkCities: ['Qasr Amra', 'Amra', 'Qusayr Amra'],
    en: { title: 'Qasr Amra', shortDescription: 'Umayyad bath-house famed for its frescoes (UNESCO).', longDescription: 'An early 8th-century desert retreat whose walls and domes are covered in rare secular frescoes, including hunting scenes and a zodiac dome.' } },
  { code: 'AZRAQ_WETLAND_RESERVE', name: 'Azraq Wetland Reserve', region: 'Eastern Desert', stopType: 'Nature reserve', visitDurationMinutes: 75, photoStop: true, linkCities: ['Azraq'],
    en: { title: 'Azraq Wetland Reserve', shortDescription: 'A desert oasis and vital bird migration stopover.', longDescription: 'Spring-fed pools and marshes in the eastern desert, an important refuge for migratory birds, managed by the RSCN.' } },
  { code: 'SHAUMARI_WILDLIFE_RESERVE', name: 'Shaumari Wildlife Reserve', region: 'Eastern Desert', stopType: 'Wildlife reserve', visitDurationMinutes: 90, photoStop: true, lunchOpportunity: true, linkCities: ['Shaumari', 'Shawmari'],
    en: { title: 'Shaumari Wildlife Reserve', shortDescription: 'Jordan’s first reserve — home to the reintroduced Arabian oryx.', longDescription: 'A breeding reserve credited with restoring the Arabian oryx and other desert species, with safari-style game drives.' } },
];

// Phase 2.5 links only a small, controlled SAMPLE of existing routes (matched
// by specific name fragments) — not every route — so the foundation can be
// reviewed before broader rollout. Fragments chosen to hit ~5 routes that
// cover North / Biblical / South / Eastern-Desert content stops.
const SAMPLE_ROUTE_NAME_HINTS = [
  'Ajloun & Jerash',
  'Madaba -> Mount Nebo -> Amman RT',
  'Amman -> Dana -> Petra',
  'Petra -> Wadi Rum',
  'Desert Castles',
];

// Bare POIs created during Phase 2 verification that are superseded by the
// properly-named seed entries — deactivate so the catalog stays clean.
const SUPERSEDED_POI_CODES = ['JERASH'];

type SeedOptions = { dryRun?: boolean; logger?: Logger };

function normalizeCity(value?: string | null) {
  return (value || '').trim().toLowerCase();
}

export async function seedJordanPointsOfInterest(prisma: PrismaLike, options: SeedOptions = {}) {
  const dryRun = options.dryRun ?? true;
  const logger = options.logger ?? console;
  const summary = {
    dryRun,
    created: 0,
    updated: 0,
    translationsWritten: 0,
    superseded: 0,
    routesScanned: 0,
    stopsLinked: 0,
    stopsLeftNull: 0,
  };

  // Build a city -> POI code lookup for linking.
  const cityToCode = new Map<string, string>();
  for (const poi of POI_SEED) {
    for (const city of poi.linkCities || []) {
      cityToCode.set(normalizeCity(city), poi.code);
    }
  }

  // 1) Upsert POIs + English translation.
  const codeToId = new Map<string, string>();
  for (const poi of POI_SEED) {
    const baseData = {
      name: poi.name,
      isActive: true,
      stopType: poi.stopType,
      visitDurationMinutes: poi.visitDurationMinutes ?? null,
      viewpoint: Boolean(poi.viewpoint),
      religiousSite: Boolean(poi.religiousSite),
      photoStop: Boolean(poi.photoStop),
      guideRecommended: Boolean(poi.guideRecommended),
      lunchOpportunity: Boolean(poi.lunchOpportunity),
    };
    if (dryRun) {
      logger.log(`[dry-run] upsert POI ${poi.code} (${poi.name}) [${poi.region}]`);
      continue;
    }
    const existing = await prisma.pointOfInterest.findUnique({ where: { code: poi.code }, select: { id: true } });
    const saved = await prisma.pointOfInterest.upsert({
      where: { code: poi.code },
      create: { code: poi.code, ...baseData },
      update: baseData,
    });
    codeToId.set(poi.code, saved.id);
    if (existing) summary.updated += 1;
    else summary.created += 1;
    await prisma.pointOfInterestTranslation.upsert({
      where: { poiId_locale: { poiId: saved.id, locale: 'en' } },
      create: { poiId: saved.id, locale: 'en', title: poi.en.title, shortDescription: poi.en.shortDescription, longDescription: poi.en.longDescription },
      update: { title: poi.en.title, shortDescription: poi.en.shortDescription, longDescription: poi.en.longDescription },
    });
    summary.translationsWritten += 1;
  }

  // 2) Deactivate superseded bare POIs.
  if (!dryRun) {
    for (const code of SUPERSEDED_POI_CODES) {
      const poi = await prisma.pointOfInterest.findUnique({ where: { code }, select: { id: true, isActive: true } });
      if (poi && poi.isActive) {
        await prisma.pointOfInterest.update({ where: { id: poi.id }, data: { isActive: false } });
        summary.superseded += 1;
      }
    }
  }

  // 3) Link content stops on the sample routes (surgical: only stop.poiId).
  const routes = await prisma.touringRoute.findMany({
    where: { active: true },
    select: { id: true, name: true, stops: { select: { id: true, city: true, poiId: true } } },
  });
  for (const route of routes) {
    const isSample = SAMPLE_ROUTE_NAME_HINTS.some((hint) => (route.name || '').toLowerCase().includes(hint.toLowerCase()));
    if (!isSample) continue;
    summary.routesScanned += 1;
    for (const stop of route.stops || []) {
      const code = cityToCode.get(normalizeCity(stop.city));
      if (!code) {
        summary.stopsLeftNull += 1; // base city / transfer / operational-only stop
        continue;
      }
      const poiId = codeToId.get(code);
      if (dryRun) {
        logger.log(`[dry-run] link route "${route.name}" stop "${stop.city}" -> POI ${code}`);
        summary.stopsLinked += 1;
        continue;
      }
      if (!poiId) continue;
      if (stop.poiId === poiId) {
        summary.stopsLinked += 1;
        continue;
      }
      await prisma.touringRouteStop.update({ where: { id: stop.id }, data: { poiId } });
      summary.stopsLinked += 1;
    }
  }

  logger.log(`Jordan POI seed summary: ${JSON.stringify(summary, null, 2)}`);
  return summary;
}

async function main() {
  const prisma = new PrismaClient();
  const dryRun = !process.argv.includes('--apply');
  try {
    await seedJordanPointsOfInterest(prisma as unknown as PrismaLike, { dryRun });
    if (dryRun) {
      console.log('Dry-run only. Re-run with --apply to create POIs and link sample route stops.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Jordan POI seed failed');
    console.error(error);
    process.exit(1);
  });
}

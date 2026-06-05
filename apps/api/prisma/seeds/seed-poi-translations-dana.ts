import { PrismaClient } from '@prisma/client';

// Phase 4B.1 — apply the APPROVED PT/ES/AR translations for the Dana Biosphere
// Reserve POI (content approved 2026-06-06, see
// docs/poi-translation-pack-4b0-dana-2026-06-06.md / .xlsx).
//
// Closes the content gap found during the PT proposal review: Dana stored only
// an English (en) translation, so the day narrative rendered in English while
// other POIs rendered in the selected language.
//
// Idempotent: upserts one PointOfInterestTranslation per [poiId, locale]; the
// English (en) row is NEVER touched. The PT/ES/AR LONG descriptions are
// translations of the CANONICAL English long currently stored on the POI
// ("Dramatic escarpments and wadis descending from the highlands to the desert,
// with the historic Dana village, hiking trails and abundant wildlife.") — not
// the richer "proposed" long from the review pack — so the locales stay
// consistent with the untouched English row. No routing / pricing /
// proposal-logic / schema changes. Dry-run by default; pass --apply to write.

type PrismaLike = Record<string, any>;
type Logger = Pick<Console, 'log' | 'warn'>;
type Tri = { title: string; short: string; long: string };

const POI_CODE = 'DANA_BIOSPHERE_RESERVE';
const POI_NAME = 'Dana Biosphere Reserve';

const TRANSLATIONS: Record<'pt' | 'es' | 'ar', Tri> = {
  pt: {
    title: 'Reserva da Biosfera de Dana',
    short: 'A maior reserva natural da Jordânia, abrangendo quatro zonas biogeográficas.',
    long: 'Escarpas e wadis dramáticos que descem das terras altas até ao deserto, com a histórica aldeia de Dana, trilhos de caminhada e vida selvagem abundante.',
  },
  es: {
    title: 'Reserva de la Biosfera de Dana',
    short: 'La mayor reserva natural de Jordania, que abarca cuatro zonas biogeográficas.',
    long: 'Espectaculares escarpas y uadis que descienden desde las tierras altas hasta el desierto, con el histórico pueblo de Dana, senderos de senderismo y abundante fauna.',
  },
  ar: {
    title: 'محمية ضانا للمحيط الحيوي',
    short: 'أكبر محمية طبيعية في الأردن، تمتد عبر أربع مناطق جغرافية حيوية.',
    long: 'منحدرات وأودية مهيبة تنحدر من المرتفعات نحو الصحراء، مع قرية ضانا التاريخية ومسارات المشي والحياة البرية الوفيرة.',
  },
};

const LOCALES: Array<'pt' | 'es' | 'ar'> = ['pt', 'es', 'ar'];

export async function seedPoiTranslationsDana(prisma: PrismaLike, options: { dryRun?: boolean; logger?: Logger } = {}) {
  const dryRun = options.dryRun ?? true;
  const logger = options.logger ?? console;
  const summary = { dryRun, poiFound: false, written: { pt: 0, es: 0, ar: 0 } };

  const found = await prisma.pointOfInterest.findUnique({ where: { code: POI_CODE }, select: { id: true } });
  if (!found) {
    logger.warn(`POI not found by code: ${POI_CODE} (${POI_NAME}) — nothing written`);
    logger.log(`Dana translation seed summary: ${JSON.stringify(summary, null, 2)}`);
    return summary;
  }
  summary.poiFound = true;

  for (const locale of LOCALES) {
    const tri = TRANSLATIONS[locale];
    if (dryRun) {
      logger.log(`[dry-run] upsert ${POI_CODE} [${locale}] title="${tri.title}"`);
      summary.written[locale] += 1;
      continue;
    }
    await prisma.pointOfInterestTranslation.upsert({
      where: { poiId_locale: { poiId: found.id, locale } },
      create: { poiId: found.id, locale, title: tri.title, shortDescription: tri.short, longDescription: tri.long },
      update: { title: tri.title, shortDescription: tri.short, longDescription: tri.long },
    });
    summary.written[locale] += 1;
  }

  logger.log(`Dana translation seed summary: ${JSON.stringify(summary, null, 2)}`);
  return summary;
}

async function main() {
  const prisma = new PrismaClient();
  const dryRun = !process.argv.includes('--apply');
  try {
    await seedPoiTranslationsDana(prisma as unknown as PrismaLike, { dryRun });
    if (dryRun) {
      console.log('Dry-run only. Re-run with --apply to write the PT/ES/AR Dana translations (English untouched).');
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Dana translation seed failed');
    console.error(error);
    process.exit(1);
  });
}

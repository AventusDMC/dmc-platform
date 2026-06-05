import { PrismaClient } from '@prisma/client';

// Phase 4B.1 — apply the APPROVED PT/ES/AR translations for the Dana Biosphere
// Reserve POI, and align the English LONG description to the approved richer
// text (content approved 2026-06-06, see
// docs/poi-translation-pack-4b0-dana-2026-06-06.md / .xlsx).
//
// Closes the content gap found during the PT proposal review: Dana stored only
// an English translation, so the day narrative rendered in English while other
// POIs rendered in the selected language.
//
// Idempotent: upserts one PointOfInterestTranslation per [poiId, locale].
//   - en : ONLY the longDescription is updated to the approved richer text;
//          the English title + short description are left untouched.
//   - pt/es/ar : full title + short + long upserted.
// All four locales therefore share the same (richer) long narrative. No
// routing / pricing / proposal-logic / schema changes. Dry-run by default;
// pass --apply to write.

type PrismaLike = Record<string, any>;
type Logger = Pick<Console, 'log' | 'warn'>;
type Tri = { title: string; short: string; long: string };

const POI_CODE = 'DANA_BIOSPHERE_RESERVE';
const POI_NAME = 'Dana Biosphere Reserve';

// Approved richer English long description (replaces the shorter canonical long
// on the en row). English title + short are NOT changed by this seed.
const EN_LONG =
  "Dana Biosphere Reserve is Jordan's largest nature reserve — a dramatic landscape of sandstone cliffs, deep wadis, and ancient villages that descends from the highlands near Tafileh toward the Rift Valley. Spanning four bio-geographic zones, it shelters a remarkable diversity of plants, birds, and wildlife, and offers some of the country's finest scenic walking and eco-tourism experiences.";

const TRANSLATIONS: Record<'pt' | 'es' | 'ar', Tri> = {
  pt: {
    title: 'Reserva da Biosfera de Dana',
    short: 'A maior reserva natural da Jordânia, abrangendo quatro zonas biogeográficas.',
    long: 'A Reserva da Biosfera de Dana é a maior reserva natural da Jordânia — uma paisagem deslumbrante de falésias de arenito, wadis profundos e aldeias antigas que desce das terras altas próximas de Tafileh em direção ao Vale do Rift. Abrangendo quatro zonas biogeográficas, abriga uma notável diversidade de plantas, aves e vida selvagem, e oferece algumas das melhores caminhadas paisagísticas e experiências de ecoturismo do país.',
  },
  es: {
    title: 'Reserva de la Biosfera de Dana',
    short: 'La mayor reserva natural de Jordania, que abarca cuatro zonas biogeográficas.',
    long: 'La Reserva de la Biosfera de Dana es la mayor reserva natural de Jordania — un paisaje impresionante de acantilados de arenisca, profundos uadis y antiguas aldeas que desciende desde las tierras altas cercanas a Tafileh hacia el valle del Rift. Abarca cuatro zonas biogeográficas y alberga una notable diversidad de plantas, aves y fauna, además de ofrecer algunas de las mejores caminatas paisajísticas y experiencias de ecoturismo del país.',
  },
  ar: {
    title: 'محمية ضانا للمحيط الحيوي',
    short: 'أكبر محمية طبيعية في الأردن، تمتد عبر أربع مناطق جغرافية حيوية.',
    long: 'محمية ضانا للمحيط الحيوي هي أكبر محمية طبيعية في الأردن — منطقة آسرة من المنحدرات الرملية والأودية العميقة والقرى القديمة، تنحدر من المرتفعات قرب الطفيلة نحو وادي الأردن المتصدّع. تمتد المحمية عبر أربع مناطق جغرافية حيوية، وتضمّ تنوّعاً لافتاً من النباتات والطيور والحياة البرية، وتوفّر بعضاً من أجمل مسارات المشي الطبيعية وتجارب السياحة البيئية في البلاد.',
  },
};

const LOCALES: Array<'pt' | 'es' | 'ar'> = ['pt', 'es', 'ar'];

export async function seedPoiTranslationsDana(prisma: PrismaLike, options: { dryRun?: boolean; logger?: Logger } = {}) {
  const dryRun = options.dryRun ?? true;
  const logger = options.logger ?? console;
  const summary = { dryRun, poiFound: false, written: { en: 0, pt: 0, es: 0, ar: 0 } };

  const found = await prisma.pointOfInterest.findUnique({ where: { code: POI_CODE }, select: { id: true } });
  if (!found) {
    logger.warn(`POI not found by code: ${POI_CODE} (${POI_NAME}) — nothing written`);
    logger.log(`Dana translation seed summary: ${JSON.stringify(summary, null, 2)}`);
    return summary;
  }
  summary.poiFound = true;

  // en — update ONLY the long description (title + short left untouched).
  if (dryRun) {
    logger.log(`[dry-run] update ${POI_CODE} [en] longDescription (title/short untouched)`);
  } else {
    await prisma.pointOfInterestTranslation.update({
      where: { poiId_locale: { poiId: found.id, locale: 'en' } },
      data: { longDescription: EN_LONG },
    });
  }
  summary.written.en += 1;

  // pt/es/ar — full upsert.
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
      console.log('Dry-run only. Re-run with --apply to write the EN long + PT/ES/AR Dana translations.');
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

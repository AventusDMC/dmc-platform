import { PrismaService } from '../prisma/prisma.service';
import { TouringRoutesService } from './touring-routes.service';

async function main() {
  const prisma = new PrismaService();

  try {
    await prisma.$connect();
    const service = new TouringRoutesService(prisma);
    const audit = await service.previewOperationalAudit();

    console.log(
      JSON.stringify(
        {
          success: audit.success,
          mode: audit.mode,
          mutatesData: audit.mutatesData,
          canonicalCodeFormat: audit.canonicalCodeFormat,
          totalRoutesAudited: audit.counts.total,
          countsByClassification: Object.fromEntries(
            Object.entries(audit.counts).filter(([key]) => key !== 'total' && key !== 'selectorEligible'),
          ),
          selectorEligibleCount: audit.counts.selectorEligible,
          rows: audit.rows.slice(0, 20),
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

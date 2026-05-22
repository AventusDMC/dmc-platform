import 'reflect-metadata';
import { PrismaService } from '../prisma/prisma.service';
import { TouringRoutesService } from './touring-routes.service';

function printJson(payload: unknown) {
  console.log(JSON.stringify(payload, null, 2));
}

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  const service = new TouringRoutesService(prisma);

  try {
    printJson(await service.dryRunAqabaExcursionPricingReadiness());
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  printJson({
    success: false,
    mode: 'AQABA_EXCURSION_PRICING_READINESS_DRY_RUN',
    mutatesData: false,
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});

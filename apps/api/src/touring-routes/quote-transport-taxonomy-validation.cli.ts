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
    printJson(await service.validateQuoteTransportTaxonomy());
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  printJson({
    passed: false,
    failedChecks: [error instanceof Error ? error.message : String(error)],
    archivedRouteLeaks: [],
    templatesVerified: [],
    componentIssues: [],
    activityIssues: [],
    transferIssues: [],
  });
  process.exitCode = 1;
});

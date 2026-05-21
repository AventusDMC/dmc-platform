import 'reflect-metadata';
import { PrismaService } from '../prisma/prisma.service';
import { TouringRoutesService } from './touring-routes.service';

function parseArgs(argv: string[]) {
  const [mode, ...rest] = argv;
  const args = new Map<string, string>();

  for (const entry of rest) {
    if (!entry.startsWith('--')) continue;
    const [key, ...valueParts] = entry.slice(2).split('=');
    args.set(key, valueParts.join('='));
  }

  return { mode, args };
}

function printJson(payload: unknown) {
  console.log(JSON.stringify(payload, null, 2));
}

async function main() {
  const { mode, args } = parseArgs(process.argv.slice(2));
  const prisma = new PrismaService();
  await prisma.$connect();
  const service = new TouringRoutesService(prisma);

  try {
    if (mode === 'dry-run') {
      printJson(await service.dryRunAqabaActivityCleanup());
      return;
    }

    if (mode === 'batch-dry-run') {
      printJson(await service.dryRunAqabaActivityCleanupBatch());
      return;
    }

    if (mode === 'aqaba-rt-dry-run') {
      printJson(await service.dryRunAqabaRoundTripCleanup());
      return;
    }

    if (mode === 'aqaba-rt-dependencies-dry-run') {
      printJson(await service.dryRunAqabaRoundTripDependencies());
      return;
    }

    if (mode === 'aqaba-rt-convert-dry-run') {
      printJson(await service.dryRunAqabaRoundTripExcursionConversion());
      return;
    }

    if (mode === 'apply') {
      const id = args.get('id') || '';
      const companyId = process.env.DMC_CLEANUP_COMPANY_ID || process.env.DMC_ACTIVITY_MASTER_COMPANY_ID || '';
      const userId = process.env.DMC_CLEANUP_USER_ID || null;
      printJson(await service.applyAqabaActivityCleanup(id, { companyId, userId }));
      return;
    }

    if (mode === 'batch-apply') {
      const companyId = process.env.DMC_CLEANUP_COMPANY_ID || process.env.DMC_ACTIVITY_MASTER_COMPANY_ID || '';
      const userId = process.env.DMC_CLEANUP_USER_ID || null;
      const confirm = args.get('confirm') || '';
      printJson(await service.applyAqabaActivityCleanupBatch({ companyId, userId, confirm }));
      return;
    }

    if (mode === 'aqaba-rt-dependencies-apply') {
      const confirm = args.get('confirm') || '';
      printJson(await service.applyAqabaRoundTripDependencies({ confirm }));
      return;
    }

    if (mode === 'aqaba-rt-convert-apply') {
      const companyId = process.env.DMC_CLEANUP_COMPANY_ID || process.env.DMC_ACTIVITY_MASTER_COMPANY_ID || '';
      const userId = process.env.DMC_CLEANUP_USER_ID || null;
      const confirm = args.get('confirm') || '';
      printJson(await service.applyAqabaRoundTripExcursionConversion({ companyId, userId, confirm }));
      return;
    }

    throw new Error('Usage: ts-node src/touring-routes/touring-routes-aqaba-activities-cleanup.cli.ts <dry-run|apply|batch-dry-run|batch-apply|aqaba-rt-dry-run|aqaba-rt-dependencies-dry-run|aqaba-rt-dependencies-apply|aqaba-rt-convert-dry-run|aqaba-rt-convert-apply> [--id=<touringRouteId>] [--confirm=AQABA_ACTIVITY_BATCH_CLEANUP|AQABA_RT_DEPENDENCIES|AQABA_RT_EXCURSION_CONVERSION]');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  printJson({
    success: false,
    error: message,
  });
  process.exitCode = 1;
});

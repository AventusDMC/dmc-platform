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

    throw new Error('Usage: ts-node src/touring-routes/touring-routes-aqaba-activities-cleanup.cli.ts <dry-run|apply|batch-dry-run|batch-apply> [--id=<touringRouteId>] [--confirm=AQABA_ACTIVITY_BATCH_CLEANUP]');
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

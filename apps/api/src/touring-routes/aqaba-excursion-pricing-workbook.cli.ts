import 'reflect-metadata';
import { resolve } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { TouringRoutesService } from './touring-routes.service';

function printJson(payload: unknown) {
  console.log(JSON.stringify(payload, null, 2));
}

function argValue(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) || null;
}

async function main() {
  const mode = process.argv[2];
  const prisma = new PrismaService();
  await prisma.$connect();
  const service = new TouringRoutesService(prisma);

  try {
    if (mode === 'export') {
      const outputPath = resolve(process.argv[3] || 'aqaba-excursion-pricing.xlsx');
      printJson(await service.exportAqabaExcursionPricingWorkbook(outputPath));
      return;
    }

    if (mode === 'import-preview') {
      const workbookPath = process.argv[3];
      printJson(await service.previewAqabaExcursionPricingWorkbookImport(resolve(workbookPath || '')));
      return;
    }

    if (mode === 'import') {
      const workbookPath = process.argv[3];
      printJson(
        await service.importAqabaExcursionPricingWorkbook(resolve(workbookPath || ''), {
          confirm: argValue('confirm'),
        }),
      );
      return;
    }

    if (mode === 'repair-duplicate-vehicle-rates-dry-run') {
      printJson(await service.dryRunAqabaExcursionDuplicateVehicleRateRepair());
      return;
    }

    if (mode === 'repair-duplicate-vehicle-rates-apply') {
      printJson(
        await service.applyAqabaExcursionDuplicateVehicleRateRepair({
          confirm: argValue('confirm'),
        }),
      );
      return;
    }

    throw new Error(
      'Usage: aqaba-excursion-pricing-workbook.cli.ts export [output.xlsx] | import-preview <workbook.xlsx> | import <workbook.xlsx> --confirm=AQABA_EXCURSION_PRICING_IMPORT | repair-duplicate-vehicle-rates-dry-run | repair-duplicate-vehicle-rates-apply --confirm=AQABA_EXCURSION_DUPLICATE_RATE_REPAIR',
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  printJson({
    success: false,
    mode: 'AQABA_EXCURSION_PRICING_WORKBOOK',
    mutatesData: false,
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});

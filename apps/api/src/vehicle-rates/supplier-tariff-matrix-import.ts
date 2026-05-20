import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { VehicleRatesService } from './vehicle-rates.service';

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const workbookPath = args.find((arg) => !arg.startsWith('--'));

  if (!workbookPath) {
    throw new Error('Usage: npm run import:supplier-tariff-matrix -- <workbook.xlsx> [--apply]');
  }

  const prisma = new PrismaService();
  try {
    await prisma.$connect();
    const service = new VehicleRatesService(prisma);
    const result = await service.importTransferRouteTariffMatrixWorkbook(readFileSync(resolve(workbookPath)), { apply });
    console.log(JSON.stringify(result, null, 2));

    if (!apply) {
      console.log('Dry-run only. Re-run with --apply to update existing canonical VehicleRate rows.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

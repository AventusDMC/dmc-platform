import { PrismaClient } from '@prisma/client';
import { seedJordanTransferRouteLibrary } from '../../src/routes/jordan-transfer-route-library';

const prisma = new PrismaClient();

async function main() {
  const apply = process.argv.includes('--apply');
  const dryRun = !apply;

  console.log(dryRun ? 'Dry run: no transfer routes will be written. Pass --apply to persist.' : 'Applying Jordan transfer route library seed.');
  await seedJordanTransferRouteLibrary(prisma, { dryRun });
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}


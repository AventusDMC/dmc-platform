import { PrismaClient } from '@prisma/client';
import { seedJordanCanonicalTransferPlaces } from '../../src/places/jordan-canonical-places';

const prisma = new PrismaClient();

async function main() {
  const apply = process.argv.includes('--apply');
  const dryRun = !apply;

  console.log(dryRun ? 'Dry run: no canonical places will be written. Pass --apply to persist.' : 'Applying Jordan canonical transfer places seed.');
  await seedJordanCanonicalTransferPlaces(prisma, { dryRun });
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


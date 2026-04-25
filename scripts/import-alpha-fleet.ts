import { PrismaClient } from '@prisma/client';
import { ensureFleet } from './alpha-transport-import-utils';

const prisma = new PrismaClient();

async function main() {
  await prisma.$connect();

  try {
    const summary = await prisma.$transaction(
      async (tx) => {
        const vehicles = await ensureFleet(tx);

        return {
          supplier: 'Alpha Transport',
          vehicles: vehicles.size,
        };
      },
      { timeout: 120000, maxWait: 10000 },
    );

    console.log('Alpha fleet import complete.');
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(message);
  process.exit(1);
});

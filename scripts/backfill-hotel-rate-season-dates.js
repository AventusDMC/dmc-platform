const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const ranges = {
  'Winter 2026': ['2026-01-01 00:00:00', '2026-02-28 00:00:00'],
  'Spring 2026': ['2026-03-01 00:00:00', '2026-05-31 00:00:00'],
  'Summer 2026': ['2026-06-01 00:00:00', '2026-08-31 00:00:00'],
  'Autumn 2026': ['2026-09-01 00:00:00', '2026-11-30 00:00:00'],
};

async function main() {
  let updated = 0;

  for (const [seasonName, [seasonFrom, seasonTo]] of Object.entries(ranges)) {
    updated += await prisma.$executeRawUnsafe(
      `
        UPDATE "hotel_rates"
        SET "seasonFrom" = $1::timestamp, "seasonTo" = $2::timestamp
        WHERE ("seasonFrom" IS NULL OR "seasonTo" IS NULL)
          AND "seasonName" = $3
      `,
      seasonFrom,
      seasonTo,
      seasonName,
    );
  }

  const remainingNullBySeason = await prisma.$queryRawUnsafe(`
    SELECT "seasonName", COUNT(*)::int AS count
    FROM "hotel_rates"
    WHERE "seasonFrom" IS NULL OR "seasonTo" IS NULL
    GROUP BY "seasonName"
    ORDER BY "seasonName"
  `);

  console.log(JSON.stringify({ updated, remainingNullBySeason }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

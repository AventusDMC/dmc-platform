import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const operationalServiceTypes = [
  { name: 'Meet And Assist', code: 'MEET_ASSIST' },
  { name: 'Border Assistance', code: 'BORDER_ASSISTANCE' },
  { name: 'Fast Track', code: 'FAST_TRACK' },
  { name: 'Porterage', code: 'PORTERAGE' },
  { name: 'Visa Assistance', code: 'VISA_ASSISTANCE' },
  { name: 'Airport Assistance', code: 'AIRPORT_ASSISTANCE' },
  { name: 'Escort Services', code: 'ESCORT' },
] as const;

async function main() {
  const results = [];

  for (const entry of operationalServiceTypes) {
    const existing = await prisma.serviceType.findFirst({
      where: {
        OR: [
          { code: { equals: entry.code, mode: 'insensitive' } },
          { name: { equals: entry.name, mode: 'insensitive' } },
        ],
      },
    });

    const record = existing
      ? await prisma.serviceType.update({
          where: { id: existing.id },
          data: {
            name: entry.name,
            code: entry.code,
            isActive: true,
          },
        })
      : await prisma.serviceType.create({
          data: {
            name: entry.name,
            code: entry.code,
            isActive: true,
          },
        });

    results.push({
      code: record.code,
      name: record.name,
      action: existing ? 'updated' : 'created',
    });
  }

  console.log(JSON.stringify({ serviceTypes: results }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

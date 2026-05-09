import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const operationalServiceTypes = [
  { name: 'Entrance Ticket', code: 'ENTRANCE_TICKET' },
  { name: 'Museum Ticket', code: 'MUSEUM_TICKET' },
  { name: 'Park Entry', code: 'PARK_ENTRY' },
  { name: 'Religious Site Entry', code: 'RELIGIOUS_SITE_ENTRY' },
  { name: 'Jeep Tour', code: 'JEEP_TOUR' },
  { name: 'Boat Ride', code: 'BOAT_RIDE' },
  { name: 'Petra by Night', code: 'PETRA_BY_NIGHT' },
  { name: 'Optional Excursion', code: 'OPTIONAL_EXCURSION' },
  { name: 'Sound & Light Show', code: 'SOUND_LIGHT_SHOW' },
  { name: 'Safari', code: 'SAFARI' },
  { name: 'Cruise', code: 'CRUISE' },
  { name: 'Excursion', code: 'EXCURSION' },
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

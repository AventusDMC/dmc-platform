import { PrismaClient, TransportPricingMode } from '@prisma/client';

const prisma = new PrismaClient();
const WORKBOOK_PATH = process.argv[2] || 'transport_contract_template final.xlsx';
const GENERAL_SUPPLIER_NAME = 'General Transport';
const ENTRANCE_SUPPLIER_NAME = 'Jordan Entrance Fees';
const JOD = 'JOD';

type Row = Record<string, unknown>;
type Workbook = {
  SheetNames: string[];
  Sheets: Record<string, unknown>;
};

const JORDAN_CITY_COORDINATES: Record<string, { latitude: number; longitude: number }> = {
  amman: { latitude: 31.9539, longitude: 35.9106 },
  petra: { latitude: 30.3285, longitude: 35.4444 },
  'wadi-rum': { latitude: 29.5321, longitude: 35.421 },
  'dead-sea': { latitude: 31.559, longitude: 35.4732 },
  aqaba: { latitude: 29.5321, longitude: 35.0063 },
  jerash: { latitude: 32.2808, longitude: 35.8997 },
  madaba: { latitude: 31.7167, longitude: 35.7939 },
  'jordan-borders': { latitude: 31.9539, longitude: 35.9106 },
};

const CITY_ALIASES: Record<string, string> = {
  'qaia airport': 'Amman',
  qaia: 'Amman',
  'queen alia airport': 'Amman',
  'queen alia international airport': 'Amman',
  'marka airport': 'Amman',
  'king hussein bridge': 'Jordan Borders',
  'sheikh hussein border': 'Jordan Borders',
  'allenby bridge': 'Jordan Borders',
  'south border': 'Aqaba',
  'aqaba port': 'Aqaba',
  'aqj airport': 'Aqaba',
  'tala bay': 'Aqaba',
  'wadi rum': 'Wadi Rum',
  rum: 'Wadi Rum',
};

const PLACE_ALIASES: Record<string, string> = {
  qaia: 'QAIA Airport',
  'amman qaia': 'QAIA Airport',
  'qaia airport': 'QAIA Airport',
  'queen alia airport': 'QAIA Airport',
  'queen alia international airport': 'QAIA Airport',
  'aqj airport': 'AQJ Airport',
  'aqaba airport': 'AQJ Airport',
  'south border': 'South Border',
  'king hussein bridge': 'King Hussein Bridge',
  'sheikh hussein border': 'Sheikh Hussein Border',
  'allenby bridge': 'Allenby Bridge',
  rum: 'Wadi Rum',
  'wadi rum': 'Wadi Rum',
  'dead sea': 'Dead Sea',
  main: '',
};

const ROUTE_STOP_WORDS = new Set([
  'dinner',
  'lunch',
  'panoramic amman tour',
  'amman city tour',
  'city tour',
  'tour',
  'drop off',
  'pick up',
  'visit',
]);

function loadWorkbook(path: string): Workbook {
  try {
    // Optional dependency: install xlsx when running this importer against the uploaded workbook.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const xlsx = require('xlsx');
    return xlsx.readFile(path) as Workbook;
  } catch (error) {
    throw new Error(
      `Could not read ${path}. Ensure the workbook exists and the "xlsx" package is installed before running this importer.`,
    );
  }
}

function normalizeHeader(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isMeaningfulHeader(value: unknown) {
  return ['site', 'route', 'pass type', 'car jod', 'van jod', 'foreigner fee jod', 'price jod', 'petra days'].includes(
    normalizeHeader(value),
  );
}

function detectHeaderRow(matrix: unknown[][]) {
  let bestIndex = -1;
  let bestScore = 0;

  matrix.forEach((row, index) => {
    const score = row.filter(isMeaningfulHeader).length;
    if (score > bestScore) {
      bestIndex = index;
      bestScore = score;
    }
  });

  return bestIndex;
}

function printWorkbookDiagnostics(workbook: Workbook) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const xlsx = require('xlsx');
  console.log(`Workbook sheets: ${workbook.SheetNames.join(', ')}`);

  for (const sheetName of workbook.SheetNames) {
    const matrix = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      defval: null,
      blankrows: false,
    }) as unknown[][];
    const headerIndex = detectHeaderRow(matrix);
    const headers =
      headerIndex >= 0
        ? matrix[headerIndex].map((header) => String(header ?? '').trim()).filter(Boolean)
        : (matrix.find((row) => row.some((cell) => cell !== null && String(cell).trim())) ?? [])
            .map((header) => String(header ?? '').trim())
            .filter(Boolean);

    console.log(`[${sheetName}] header row ${headerIndex >= 0 ? headerIndex + 1 : 'not detected'}: ${headers.join(' | ')}`);
  }
}

function sheetRows(workbook: Workbook, sheetNamePattern: RegExp): Row[] {
  const sheetName = workbook.SheetNames.find((name: string) => sheetNamePattern.test(name));
  if (!sheetName) {
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const xlsx = require('xlsx');
  const matrix = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    defval: null,
    blankrows: false,
  }) as unknown[][];
  const headerIndex = detectHeaderRow(matrix);

  if (headerIndex < 0) {
    console.log(`[${sheetName}] no usable header row detected.`);
    return [];
  }

  const headers = matrix[headerIndex].map((header) => String(header ?? '').trim());
  console.log(`[${sheetName}] using columns: ${headers.filter(Boolean).join(' | ')}`);

  return matrix
    .slice(headerIndex + 1)
    .map((row) =>
      headers.reduce<Row>((record, header, index) => {
        if (header) {
          record[header] = row[index] ?? null;
        }
        return record;
      }, {}),
    )
    .filter((row) => Object.values(row).some((value) => value !== null && String(value).trim()));
}

function text(row: Row, names: string[]) {
  const wanted = new Set(names.map(normalizeHeader));
  for (const name of names) {
    const key = Object.keys(row).find((candidate) => normalizeHeader(candidate) === normalizeHeader(name) || wanted.has(normalizeHeader(candidate)));
    const value = key ? row[key] : undefined;
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }

  return '';
}

function numberValue(row: Row, names: string[]) {
  const raw = text(row, names);
  const parsed = Number(String(raw).replace(/[^0-9.-]+/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function booleanValue(row: Row, names: string[]) {
  const raw = text(row, names).toLowerCase();
  return ['yes', 'true', '1', 'included', 'y'].includes(raw);
}

function normalizeRouteName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\s*(?:↔|<->|-->|->|=>|→)\s*/g, '_')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

function routeKey(fromName: string, toName: string) {
  return [normalizeRouteName(fromName), normalizeRouteName(toName)].filter(Boolean).join('_');
}

function titleCase(value: string) {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizePlaceName(value: string) {
  const cleaned = value
    .replace(/\([^)]*\)/g, '')
    .replace(/\b(one way|drop off|pick up|main site)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  const key = normalizeHeader(cleaned);

  if (ROUTE_STOP_WORDS.has(key)) {
    return '';
  }

  return PLACE_ALIASES[key] ?? titleCase(cleaned);
}

function routeSegments(routeText: string) {
  return routeText
    .replace(/[–—]/g, '-')
    .replace(/\s*(?:↔|→|<->|->|=>)\s*/g, '-')
    .split(/\s+-\s+/)
    .map(normalizePlaceName)
    .filter(Boolean);
}

function routeEndpoints(routeText: string) {
  const normalizedRoute = normalizeHeader(routeText);
  if (normalizedRoute === 'amman qaia') {
    return { from: 'Amman', to: 'QAIA Airport' };
  }
  if (normalizedRoute === 'qaia amman') {
    return { from: 'QAIA Airport', to: 'Amman' };
  }

  const segments = routeSegments(routeText);
  if (segments.length < 2) {
    return null;
  }

  return { from: segments[0], to: segments[segments.length - 1] };
}

function cityNameForPlace(placeName: string) {
  return CITY_ALIASES[normalizeHeader(placeName)] ?? placeName;
}

function cityCoordinates(name: string) {
  return JORDAN_CITY_COORDINATES[normalizeRouteName(name).replace(/_/g, '-')] ?? { latitude: 0, longitude: 0 };
}

function placeTypeForPlace(name: string) {
  const key = normalizeHeader(name);
  if (key.includes('airport')) {
    return 'Airport';
  }
  if (key.includes('border') || key.includes('bridge')) {
    return 'Border';
  }
  return 'Destination';
}

async function ensureSupplier(name: string, type: string) {
  const existing = await prisma.supplier.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } },
  });
  const data = { name, type, notes: 'Imported from transport_contract_template final.xlsx.' };
  return existing ? prisma.supplier.update({ where: { id: existing.id }, data }) : prisma.supplier.create({ data });
}

async function ensureVehicle(supplierId: string, name: string, maxPax: number) {
  const existing = await prisma.vehicle.findFirst({
    where: { supplierId, name: { equals: name, mode: 'insensitive' } },
  });
  const data = { supplierId, name, maxPax, luggageCapacity: maxPax };
  return existing ? prisma.vehicle.update({ where: { id: existing.id }, data }) : prisma.vehicle.create({ data });
}

async function ensureTransferServiceType() {
  const existing = await prisma.transportServiceType.findFirst({
    where: { code: { equals: 'TRANSFER', mode: 'insensitive' } },
  });
  const data = { code: 'TRANSFER', name: 'Transfer' };
  return existing ? prisma.transportServiceType.update({ where: { id: existing.id }, data }) : prisma.transportServiceType.create({ data });
}

async function ensureCity(name: string) {
  const existing = await prisma.city.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } },
  });
  const data = { name, country: 'Jordan', ...cityCoordinates(name), isActive: true };
  return existing ? prisma.city.update({ where: { id: existing.id }, data }) : prisma.city.create({ data });
}

async function ensurePlaceType(name: string) {
  const existing = await prisma.placeType.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } },
  });
  const data = { name, isActive: true };
  return existing ? prisma.placeType.update({ where: { id: existing.id }, data }) : prisma.placeType.create({ data });
}

async function ensurePlace(name: string) {
  const city = await ensureCity(cityNameForPlace(name));
  const placeType = await ensurePlaceType(placeTypeForPlace(name));
  const existing = await prisma.place.findFirst({
    where: {
      name: { equals: name, mode: 'insensitive' },
      cityId: city.id,
    },
  });
  const data = {
    name,
    type: placeType.name,
    city: city.name,
    country: 'Jordan',
    isActive: true,
    cityId: city.id,
    placeTypeId: placeType.id,
  };
  return existing ? prisma.place.update({ where: { id: existing.id }, data }) : prisma.place.create({ data });
}

async function ensureRouteFromText(routeText: string) {
  const endpoints = routeEndpoints(routeText);
  if (!endpoints) {
    return null;
  }

  const normalizedKey = routeKey(endpoints.from, endpoints.to);
  const existing = await prisma.route.findUnique({ where: { normalizedKey } });
  if (existing) {
    return existing;
  }

  const fromPlace = await ensurePlace(endpoints.from);
  const toPlace = await ensurePlace(endpoints.to);
  return prisma.route.create({
    data: {
      fromPlaceId: fromPlace.id,
      toPlaceId: toPlace.id,
      name: `${endpoints.from} → ${endpoints.to}`,
      normalizedKey,
      routeType: 'transfer',
      notes: `Imported from transport_contract_template final.xlsx. Source route: ${routeText}`,
      isActive: true,
    },
  });
}

async function importRoutesAndPrices(rows: Row[]) {
  const supplier = await ensureSupplier(GENERAL_SUPPLIER_NAME, 'transport');
  const serviceType = await ensureTransferServiceType();
  const car = await ensureVehicle(supplier.id, 'General Transport Car', 3);
  const van = await ensureVehicle(supplier.id, 'General Transport Van', 7);
  let imported = 0;

  for (const row of rows) {
    const routeText = text(row, ['route', 'route name']);
    const from = text(row, ['from', 'origin', 'from city']);
    const to = text(row, ['to', 'destination', 'to city']);
    const key = text(row, ['normalizedKey', 'normalized key']) || (from && to ? routeKey(from, to) : '');
    const route = key
      ? await prisma.route.findUnique({ where: { normalizedKey: key } })
      : routeText
        ? await ensureRouteFromText(routeText)
        : null;

    if (!route) {
      continue;
    }

    for (const [vehicle, price] of [
      [car, numberValue(row, ['car', 'car jod', 'car price', 'car price jod'])],
      [van, numberValue(row, ['van', 'van jod', 'van price', 'van price jod'])],
    ] as const) {
      if (price <= 0) {
        continue;
      }

      const existing = await prisma.transportPricingRule.findFirst({
        where: {
          routeId: route.id,
          transportServiceTypeId: serviceType.id,
          vehicleId: vehicle.id,
          minPax: 1,
          maxPax: vehicle.maxPax,
        },
      });
      const data = {
        routeId: route.id,
        transportServiceTypeId: serviceType.id,
        vehicleId: vehicle.id,
        pricingMode: TransportPricingMode.per_vehicle,
        minPax: 1,
        maxPax: vehicle.maxPax,
        unitCapacity: null,
        baseCost: price,
        discountPercent: 0,
        currency: JOD,
        isActive: true,
      };

      if (existing) {
        await prisma.transportPricingRule.update({ where: { id: existing.id }, data });
      } else {
        await prisma.transportPricingRule.create({ data });
      }
      imported += 1;
    }
  }

  return imported;
}

async function ensureActivityServiceType() {
  const existing = await prisma.serviceType.findFirst({
    where: { OR: [{ code: { equals: 'ACTIVITY', mode: 'insensitive' } }, { name: { equals: 'Activity', mode: 'insensitive' } }] },
  });
  const data = { name: 'Activity', code: 'ACTIVITY', isActive: true };
  return existing ? prisma.serviceType.update({ where: { id: existing.id }, data }) : prisma.serviceType.create({ data });
}

async function importEntranceFees(rows: Row[]) {
  const supplier = await ensureSupplier(ENTRANCE_SUPPLIER_NAME, 'activity');
  const serviceType = await ensureActivityServiceType();
  let imported = 0;

  for (const row of rows) {
    const siteName = text(row, ['site name', 'site', 'name']);
    const fee = numberValue(row, ['foreigner fee jod', 'foreigner fee', 'fee jod', 'price', 'price jod']);
    if (!siteName || fee < 0) {
      continue;
    }

    const category = text(row, ['category', 'type']) || 'Admission';
    const serviceName = `${siteName} Entrance Fee`;
    const existingService = await prisma.supplierService.findFirst({
      where: { supplierId: supplier.id, name: { equals: serviceName, mode: 'insensitive' } },
    });
    const serviceData = {
      supplierId: supplier.id,
      name: serviceName,
      category: 'Activity',
      serviceTypeId: serviceType.id,
      unitType: 'per_person' as const,
      baseCost: fee,
      currency: JOD,
      costBaseAmount: fee,
      costCurrency: JOD,
    };
    const service = existingService
      ? await prisma.supplierService.update({ where: { id: existingService.id }, data: serviceData })
      : await prisma.supplierService.create({ data: serviceData });
    const existingFee = await prisma.entranceFee.findUnique({ where: { serviceId: service.id } });
    const feeData = {
      siteName,
      category,
      foreignerFeeJod: fee,
      includedInJordanPass: booleanValue(row, ['includedInJordanPass', 'included in jordan pass', 'jordan pass']),
      notes: text(row, ['notes', 'note']) || null,
      source: text(row, ['source', 'source url']) || 'transport_contract_template final.xlsx',
      serviceId: service.id,
    };

    if (existingFee) {
      await prisma.entranceFee.update({ where: { id: existingFee.id }, data: feeData });
    } else {
      await prisma.entranceFee.create({ data: feeData });
    }
    imported += 1;
  }

  return imported;
}

async function importJordanPass(rows: Row[]) {
  const fallback = [
    { code: 'WANDERER', name: 'Jordan Pass Wanderer', priceJod: 70, petraDayCount: 1 },
    { code: 'EXPLORER', name: 'Jordan Pass Explorer', priceJod: 75, petraDayCount: 2 },
    { code: 'EXPERT', name: 'Jordan Pass Expert', priceJod: 80, petraDayCount: 3 },
  ];
  const normalizePassCode = (value: string) => {
    const upper = value.toUpperCase();
    if (upper.includes('WANDERER')) {
      return 'WANDERER';
    }
    if (upper.includes('EXPLORER')) {
      return 'EXPLORER';
    }
    if (upper.includes('EXPERT')) {
      return 'EXPERT';
    }
    return upper.replace(/^JORDAN\s+PASS\s+/i, '').replace(/^JORDAN\s+/i, '');
  };

  const records = rows.length
    ? rows.map((row) => ({
        code: normalizePassCode(text(row, ['code', 'pass', 'pass type', 'name'])),
        name: text(row, ['name', 'pass type', 'pass']) || `Jordan Pass ${text(row, ['code', 'pass', 'pass type'])}`,
        priceJod: numberValue(row, ['price jod', 'price', 'jod']),
        petraDayCount: numberValue(row, ['petra day count', 'petra days', 'petra coverage']),
        visaWaiverNote: text(row, ['visa waiver note', 'notes']) || 'Includes visa waiver when eligibility conditions are met.',
      }))
    : fallback;

  for (const record of records) {
    if (!['WANDERER', 'EXPLORER', 'EXPERT'].includes(record.code) || record.priceJod <= 0) {
      continue;
    }

    await prisma.jordanPassProduct.upsert({
      where: { code: record.code as any },
      update: {
        name: record.name,
        priceJod: record.priceJod,
        petraDayCount: record.petraDayCount,
        visaWaiverNote: 'Includes visa waiver when eligibility conditions are met.',
        optionalUpgrade: true,
        isActive: true,
      },
      create: {
        code: record.code as any,
        name: record.name,
        priceJod: record.priceJod,
        petraDayCount: record.petraDayCount,
        visaWaiverNote: 'Includes visa waiver when eligibility conditions are met.',
        optionalUpgrade: true,
        isActive: true,
      },
    });
  }
}

async function main() {
  const workbook = loadWorkbook(WORKBOOK_PATH);
  printWorkbookDiagnostics(workbook);
  const transportRules = await importRoutesAndPrices(sheetRows(workbook, /routes?\s*&?\s*prices?|prices?/i));
  const entranceFees = await importEntranceFees(sheetRows(workbook, /entrance\s*fees?/i));
  await importJordanPass(sheetRows(workbook, /jordan\s*pass/i));
  const jordanPassProducts = await prisma.jordanPassProduct.count();
  console.log(JSON.stringify({ transportRules, entranceFees, jordanPassProducts }, null, 2));
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

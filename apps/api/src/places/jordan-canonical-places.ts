export type Logger = Pick<Console, 'log' | 'warn' | 'error'>;

export type SeedOptions = {
  dryRun?: boolean;
  logger?: Logger;
};

type CityRow = {
  id: string;
  name: string;
  country?: string | null;
  latitude: number;
  longitude: number;
  isActive?: boolean | null;
};

type PlaceTypeRow = {
  id: string;
  name: string;
  isActive?: boolean | null;
};

export type PlaceRow = {
  id: string;
  name: string;
  type: string;
  city?: string | null;
  country?: string | null;
  isActive?: boolean | null;
  cityId?: string | null;
  placeTypeId?: string | null;
};

type CityWriteData = {
  name: string;
  country: string;
  latitude: number;
  longitude: number;
  isActive: boolean;
};

type PlaceTypeWriteData = {
  name: string;
  isActive: boolean;
};

type PlaceWriteData = {
  name: string;
  type: string;
  city: string;
  country: string;
  isActive: boolean;
  cityId: string;
  placeTypeId: string;
};

export type PrismaLike = {
  city: {
    findMany(args?: unknown): Promise<CityRow[]>;
    create(args: { data: CityWriteData }): Promise<CityRow>;
    update(args: { where: { id: string }; data: CityWriteData }): Promise<CityRow>;
  };
  placeType: {
    findMany(args?: unknown): Promise<PlaceTypeRow[]>;
    create(args: { data: PlaceTypeWriteData }): Promise<PlaceTypeRow>;
    update(args: { where: { id: string }; data: PlaceTypeWriteData }): Promise<PlaceTypeRow>;
  };
  place: {
    findMany(args?: unknown): Promise<PlaceRow[]>;
    create(args: { data: PlaceWriteData }): Promise<PlaceRow>;
    update(args: { where: { id: string }; data: PlaceWriteData }): Promise<PlaceRow>;
  };
};

type CanonicalPlaceDefinition = {
  name: string;
  aliases: string[];
  type: string;
  city: string;
  latitude: number;
  longitude: number;
};

type PlannedRow = {
  name: string;
  type: string;
  city: string;
  aliases: string;
  action: 'CREATE' | 'UPDATE' | 'UNCHANGED';
};

export type SeedResult = {
  dryRun: boolean;
  planned: PlannedRow[];
  created: number;
  updated: number;
  unchanged: number;
};

export const JORDAN_CANONICAL_TRANSFER_PLACES: CanonicalPlaceDefinition[] = [
  place('Ajloun', [], 'Archaeological Site', 'Ajloun', 32.3326, 35.7517),
  place('Bethany', ['Bethany Beyond the Jordan', 'Al-Maghtas'], 'Religious Site', 'Bethany', 31.8362, 35.5501),
  place('Dana', ['Dana Biosphere Reserve', 'Dana Village'], 'Nature Reserve', 'Dana', 30.6746, 35.6095),
  place('Kerak', ['Karak', 'Kerak Castle'], 'Archaeological Site', 'Kerak', 31.1809, 35.7047),
  place('Mukawir', ['Machaerus'], 'Archaeological Site', 'Mukawir', 31.5676, 35.6243),
  place('Pella', [], 'Archaeological Site', 'Pella', 32.4508, 35.6144),
  place('Shobak', ['Shoubak', 'Shobak Castle', 'Shawbak'], 'Archaeological Site', 'Shobak', 30.5217, 35.5601),
  place('Umm Qais', ['Umm Qays', 'Gadara'], 'Archaeological Site', 'Umm Qais', 32.6547, 35.6842),
];

function place(name: string, aliases: string[], type: string, city: string, latitude: number, longitude: number): CanonicalPlaceDefinition {
  return { name, aliases, type, city, latitude, longitude };
}

function normalize(value: string | null | undefined) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function byNormalizedName<T extends { name: string }>(rows: T[]) {
  return new Map(rows.map((row) => [normalize(row.name), row]));
}

function isSameCity(existing: CityRow, data: CityWriteData) {
  return (
    existing.name === data.name &&
    normalize(existing.country) === normalize(data.country) &&
    Number(existing.latitude) === data.latitude &&
    Number(existing.longitude) === data.longitude &&
    existing.isActive === data.isActive
  );
}

function isSamePlaceType(existing: PlaceTypeRow, data: PlaceTypeWriteData) {
  return existing.name === data.name && existing.isActive === data.isActive;
}

function isSamePlace(existing: PlaceRow, data: PlaceWriteData) {
  return (
    existing.name === data.name &&
    existing.type === data.type &&
    existing.city === data.city &&
    normalize(existing.country) === normalize(data.country) &&
    existing.isActive === data.isActive &&
    existing.cityId === data.cityId &&
    existing.placeTypeId === data.placeTypeId
  );
}

function printPlan(logger: Logger, rows: PlannedRow[]) {
  logger.log('Place | Type | City | Aliases | Action');
  for (const row of rows) {
    logger.log(`${row.name} | ${row.type} | ${row.city} | ${row.aliases || '-'} | ${row.action}`);
  }
}

async function ensureCity(prisma: PrismaLike, dryRun: boolean, cityRows: Map<string, CityRow>, definition: CanonicalPlaceDefinition) {
  const existing = cityRows.get(normalize(definition.city));
  const data: CityWriteData = {
    name: definition.city,
    country: 'Jordan',
    latitude: definition.latitude,
    longitude: definition.longitude,
    isActive: true,
  };

  if (existing) {
    if (!dryRun && !isSameCity(existing, data)) {
      const updated = await prisma.city.update({ where: { id: existing.id }, data });
      cityRows.set(normalize(updated.name), updated);
      return updated;
    }
    return existing;
  }

  if (dryRun) {
    const dryRunCity = { id: `dry-run-city-${normalize(definition.city).replace(/\s+/g, '-')}`, ...data };
    cityRows.set(normalize(dryRunCity.name), dryRunCity);
    return dryRunCity;
  }

  const created = await prisma.city.create({ data });
  cityRows.set(normalize(created.name), created);
  return created;
}

async function ensurePlaceType(prisma: PrismaLike, dryRun: boolean, typeRows: Map<string, PlaceTypeRow>, typeName: string) {
  const existing = typeRows.get(normalize(typeName));
  const data: PlaceTypeWriteData = { name: typeName, isActive: true };

  if (existing) {
    if (!dryRun && !isSamePlaceType(existing, data)) {
      const updated = await prisma.placeType.update({ where: { id: existing.id }, data });
      typeRows.set(normalize(updated.name), updated);
      return updated;
    }
    return existing;
  }

  if (dryRun) {
    const dryRunType = { id: `dry-run-place-type-${normalize(typeName).replace(/\s+/g, '-')}`, ...data };
    typeRows.set(normalize(dryRunType.name), dryRunType);
    return dryRunType;
  }

  const created = await prisma.placeType.create({ data });
  typeRows.set(normalize(created.name), created);
  return created;
}

function findExistingPlace(places: PlaceRow[], definition: CanonicalPlaceDefinition) {
  const names = [definition.name, ...definition.aliases].map(normalize);
  return places.find((candidate) => candidate.isActive !== false && normalize(candidate.country || 'Jordan') === 'jordan' && names.includes(normalize(candidate.name))) || null;
}

export async function seedJordanCanonicalTransferPlaces(prisma: PrismaLike, options: SeedOptions = {}): Promise<SeedResult> {
  const dryRun = options.dryRun ?? true;
  const logger = options.logger || console;
  const cities = byNormalizedName(await prisma.city.findMany({ where: { country: { equals: 'Jordan', mode: 'insensitive' } } }));
  const placeTypes = byNormalizedName(await prisma.placeType.findMany());
  const places = await prisma.place.findMany({ where: { country: { equals: 'Jordan', mode: 'insensitive' } } });
  const planned: PlannedRow[] = [];
  const result: SeedResult = {
    dryRun,
    planned,
    created: 0,
    updated: 0,
    unchanged: 0,
  };

  for (const definition of JORDAN_CANONICAL_TRANSFER_PLACES) {
    const city = await ensureCity(prisma, dryRun, cities, definition);
    const placeType = await ensurePlaceType(prisma, dryRun, placeTypes, definition.type);
    const existing = findExistingPlace(places, definition);
    const data: PlaceWriteData = {
      name: definition.name,
      type: definition.type,
      city: definition.city,
      country: 'Jordan',
      isActive: true,
      cityId: city.id,
      placeTypeId: placeType.id,
    };
    const action = existing ? (isSamePlace(existing, data) ? 'UNCHANGED' : 'UPDATE') : 'CREATE';

    planned.push({
      name: definition.name,
      type: definition.type,
      city: definition.city,
      aliases: definition.aliases.join(', '),
      action,
    });

    if (action === 'UNCHANGED') {
      result.unchanged += 1;
      continue;
    }

    if (dryRun) {
      if (action === 'CREATE') result.created += 1;
      else result.updated += 1;
      continue;
    }

    if (existing) {
      const updated = await prisma.place.update({ where: { id: existing.id }, data });
      Object.assign(existing, updated);
      result.updated += 1;
    } else {
      const created = await prisma.place.create({ data });
      places.push(created);
      result.created += 1;
    }
  }

  printPlan(logger, planned);
  return result;
}

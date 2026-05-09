export type ServiceTaxonomyInput = {
  category?: string | null;
  serviceType?: {
    name?: string | null;
    code?: string | null;
  } | null;
};

export type ServiceTaxonomyGroup =
  | 'hotel'
  | 'transport'
  | 'guide'
  | 'activity'
  | 'meal'
  | 'externalPackage'
  | 'operationalAssistance'
  | 'other';

export const OPERATIONAL_SERVICE_TYPE_CODES = [
  'MEET_ASSIST',
  'BORDER_ASSISTANCE',
  'FAST_TRACK',
  'PORTERAGE',
  'VISA_ASSISTANCE',
  'AIRPORT_ASSISTANCE',
  'ESCORT',
] as const;

const OPERATIONAL_SERVICE_TYPE_CODE_SET = new Set<string>(OPERATIONAL_SERVICE_TYPE_CODES);

export function normalizeServiceTaxonomyText(value: string | null | undefined) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

export function getServiceTaxonomySource(service: ServiceTaxonomyInput) {
  return service.serviceType?.code || service.serviceType?.name || service.category || '';
}

export function isOperationalAssistanceService(service: ServiceTaxonomyInput) {
  const normalizedCode = String(service.serviceType?.code || '').trim().toUpperCase();

  if (OPERATIONAL_SERVICE_TYPE_CODE_SET.has(normalizedCode)) {
    return true;
  }

  const normalized = normalizeServiceTaxonomyText(getServiceTaxonomySource(service));

  return (
    normalized.includes('meet_assist') ||
    normalized.includes('meet_and_assist') ||
    normalized.includes('border_assistance') ||
    normalized.includes('fast_track') ||
    normalized.includes('porterage') ||
    normalized.includes('visa_assistance') ||
    normalized.includes('airport_assistance') ||
    normalized === 'escort' ||
    normalized.includes('escort_service')
  );
}

export function resolveServiceTaxonomyGroup(service: ServiceTaxonomyInput): ServiceTaxonomyGroup {
  const normalized = normalizeServiceTaxonomyText(getServiceTaxonomySource(service));

  if (isOperationalAssistanceService(service)) {
    return 'operationalAssistance';
  }

  if (normalized.includes('external_package') || normalized.includes('partner_package')) {
    return 'externalPackage';
  }

  if (normalized.includes('hotel') || normalized.includes('accommodation')) {
    return 'hotel';
  }

  if (normalized.includes('transport') || normalized.includes('transfer') || normalized.includes('vehicle')) {
    return 'transport';
  }

  if (normalized.includes('guide')) {
    return 'guide';
  }

  if (
    normalized.includes('activity') ||
    normalized.includes('tour') ||
    normalized.includes('excursion') ||
    normalized.includes('experience') ||
    normalized.includes('sightseeing') ||
    normalized.includes('entrance') ||
    normalized.includes('ticket')
  ) {
    return 'activity';
  }

  if (
    normalized.includes('meal') ||
    normalized.includes('dining') ||
    normalized.includes('breakfast') ||
    normalized.includes('lunch') ||
    normalized.includes('dinner') ||
    normalized.includes('restaurant') ||
    normalized.includes('food')
  ) {
    return 'meal';
  }

  return 'other';
}

export function isActivityTaxonomyGroup(service: ServiceTaxonomyInput) {
  return resolveServiceTaxonomyGroup(service) === 'activity';
}

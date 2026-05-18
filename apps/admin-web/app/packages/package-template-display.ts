import type { PackageTemplateComponent, PackageTemplateComponentType, PackageTemplateDay, PackageTemplateSupplierServiceOption } from './types';

export const PACKAGE_CATALOG_MODULES = [
  { id: 'packages', label: 'Packages', href: '/packages', helper: 'Commercial templates' },
  { id: 'hotels', label: 'Hotels', href: '/hotels', helper: 'Contracts and rates' },
  { id: 'excursion-templates', label: 'Excursion Templates', href: '/excursion-templates', helper: 'Composite operations' },
  { id: 'activities', label: 'Activities', href: '/activities', helper: 'Activity Master' },
  { id: 'transport', label: 'Transport', href: '/transport', helper: 'Routes and pricing modes' },
  { id: 'services', label: 'Services', href: '/catalog?tab=services', helper: 'Ticketing and services' },
];

export function packageComponentTypeLabel(type: PackageTemplateComponentType) {
  if (type === 'EXCURSION_TEMPLATE') return 'Excursion template';
  if (type === 'ACTIVITY') return 'Activity Master';
  if (type === 'HOTEL') return 'Hotel contract';
  if (type === 'TRANSPORT') return 'Transport structure';
  if (type === 'DINING') return 'Dining';
  if (type === 'MEAL') return 'Meal';
  if (type === 'ENTRANCE') return 'Entrance';
  if (type === 'GUIDE') return 'Guide';
  if (type === 'SERVICE') return 'Operational service';
  if (type === 'OTHER') return 'Other service';
  if (type === 'EXTERNAL_PACKAGE') return 'External country package';
  return 'Ticketing';
}

export function packageComponentReferenceLabel(component: PackageTemplateComponent) {
  if (component.componentType === 'EXCURSION_TEMPLATE') {
    return component.excursionTemplate?.name || 'Excursion template link';
  }

  if (component.componentType === 'ACTIVITY') {
    return component.activity?.name || 'Activity Master link';
  }

  if (component.componentType === 'HOTEL') {
    const hotelName = component.hotelContract?.hotel?.name;
    const contractName = component.hotelContract?.name;
    return [hotelName, contractName].filter(Boolean).join(' - ') || 'Hotel contract link';
  }

  if (component.componentType === 'TRANSPORT') {
    return [component.route?.name, component.pricingMode || component.transportServiceType?.name, component.supplierService?.name].filter(Boolean).join(' - ') || 'Transport link';
  }

  if (component.componentType === 'SERVICE') {
    return component.supplierService?.name || 'Operational service link';
  }

  return component.supplierService?.entranceFee?.siteName || component.supplierService?.entranceFee?.name || component.supplierService?.name || 'Ticketing link';
}

const OPERATIONAL_SERVICE_CODE_TOKENS = [
  'MEET_ASSIST',
  'MEET_AND_ASSIST',
  'VIP_FAST_TRACK',
  'FAST_TRACK',
  'PORTER',
  'PORTERAGE',
  'SIM_CARD',
  'WHEELCHAIR_ASSISTANCE',
  'AIRPORT_ASSISTANCE',
  'BORDER_ASSISTANCE',
  'ESCORT',
  'ESCORT_SERVICE',
  'ESCORT_SERVICES',
];

const OPERATIONAL_SERVICE_TEXT_PATTERNS = [
  /\bmeet\s*(and|&)?\s*assist(ance)?\b/i,
  /\bvip\s*fast\s*track\b/i,
  /\bfast\s*track\b/i,
  /\bporter(age)?\b/i,
  /\bsim\s*card\b/i,
  /\bwheelchair\s*assist(ance)?\b/i,
  /\bairport\s*assist(ance)?\b/i,
  /\bborder\s*assist(ance)?\b/i,
  /\bescort\s*service(s)?\b/i,
];

const EXCLUDED_SERVICE_TYPE_PATTERNS = [
  /\b(ticket|entrance|entry|museum|park|religious site)\b/i,
  /\b(transport|transfer|vehicle|coach|driver)\b/i,
  /\b(activity|excursion|sightseeing|tour|safari|guided visit)\b/i,
  /\b(hotel|accommodation|room|night)\b/i,
  /\b(guide|guiding|dining|meal|lunch|dinner)\b/i,
];

function normalizeToken(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

export function isOperationalPackageService(service: PackageTemplateSupplierServiceOption) {
  if (service.entranceFee) {
    return false;
  }

  const serviceTypeCode = normalizeToken(service.serviceType?.code || '');
  const text = [service.name, service.category, service.serviceType?.name, service.serviceType?.code].filter(Boolean).join(' ');
  const typeText = [service.category, service.serviceType?.name, service.serviceType?.code].filter(Boolean).join(' ');
  const hasOperationalCode = OPERATIONAL_SERVICE_CODE_TOKENS.includes(serviceTypeCode);
  const hasOperationalText = OPERATIONAL_SERVICE_TEXT_PATTERNS.some((pattern) => pattern.test(text));
  const hasExcludedType = EXCLUDED_SERVICE_TYPE_PATTERNS.some((pattern) => pattern.test(typeText));

  return (hasOperationalCode || hasOperationalText) && !hasExcludedType;
}

export function groupPackageComponentsByDay(components: PackageTemplateComponent[], durationDays: number) {
  const sorted = [...components].sort((first, second) => first.dayNumber - second.dayNumber || first.sortOrder - second.sortOrder);
  const days = Array.from({ length: Math.max(durationDays, 1) }, (_, index) => ({
    dayNumber: index + 1,
    components: [] as PackageTemplateComponent[],
  }));

  for (const component of sorted) {
    const existingDay = days.find((day) => day.dayNumber === component.dayNumber);
    if (existingDay) {
      existingDay.components.push(component);
    }
  }

  return days;
}

export function resolvePackageTemplateDays(days: PackageTemplateDay[] | undefined, components: PackageTemplateComponent[], durationDays: number) {
  if (days?.length) {
    return [...days]
      .sort((first, second) => first.dayNumber - second.dayNumber)
      .map((day) => ({
        ...day,
        components: (day.components?.length ? day.components : components.filter((component) => component.dayNumber === day.dayNumber)).sort(
          (first, second) => first.sortOrder - second.sortOrder || first.label.localeCompare(second.label),
        ),
      }));
  }

  return groupPackageComponentsByDay(components, durationDays).map((day) => ({
    id: `day-${day.dayNumber}`,
    packageTemplateId: '',
    dayNumber: day.dayNumber,
    title: `Day ${day.dayNumber}`,
    description: null,
    active: true,
    components: day.components,
  }));
}

export function collectPackageTemplateComponents(days: PackageTemplateDay[], fallbackComponents: PackageTemplateComponent[] = []) {
  const componentById = new Map<string, PackageTemplateComponent>();

  for (const day of days) {
    for (const component of day.components || []) {
      componentById.set(component.id, component);
    }
  }

  for (const component of fallbackComponents) {
    if (!componentById.has(component.id)) {
      componentById.set(component.id, component);
    }
  }

  return [...componentById.values()].sort((first, second) => first.dayNumber - second.dayNumber || first.sortOrder - second.sortOrder);
}

function collectMealLabels(components: PackageTemplateComponent[]) {
  const mealPattern = /\b(breakfast|lunch|dinner|meal|bb|hb|fb)\b/i;
  const labels = components
    .map((component) => packageComponentReferenceLabel(component) || component.label)
    .filter((label) => mealPattern.test(label));

  return [...new Set(labels)];
}

export function buildPackagePlannerSummary(days: PackageTemplateDay[], components: PackageTemplateComponent[], durationDays: number) {
  const currentComponents = collectPackageTemplateComponents(days, components);
  const currentDuration = Math.max(durationDays, days.length, ...days.map((day) => day.dayNumber));
  const cities = [
    ...new Set(
      currentComponents
        .map((component) => component.hotelContract?.hotel?.city)
        .filter((city): city is string => Boolean(city)),
    ),
  ];
  const excursions = currentComponents.filter((component) => component.componentType === 'EXCURSION_TEMPLATE').length;
  const hotelNights = currentComponents.filter((component) => component.componentType === 'HOTEL').length;
  const mealLabels = collectMealLabels(currentComponents);

  return {
    duration: `${currentDuration} days`,
    cities: cities.length ? cities.join(', ') : 'Not set',
    excursions: String(excursions),
    hotelNights: String(hotelNights),
    includedMeals: mealLabels.length ? mealLabels.join(', ') : 'Not set',
    activeDays: String(days.filter((day) => day.active).length),
  };
}

import type { PackageTemplateComponent, PackageTemplateComponentType, PackageTemplateDay } from './types';

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
  if (type === 'SERVICE') return 'Operational service';
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
    return [component.route?.name, component.pricingMode || component.transportServiceType?.name].filter(Boolean).join(' - ') || 'Transport link';
  }

  if (component.componentType === 'SERVICE') {
    return component.supplierService?.name || 'Operational service link';
  }

  return component.supplierService?.entranceFee?.siteName || component.supplierService?.entranceFee?.name || component.supplierService?.name || 'Ticketing link';
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

function collectMealLabels(components: PackageTemplateComponent[]) {
  const mealPattern = /\b(breakfast|lunch|dinner|meal|bb|hb|fb)\b/i;
  const labels = components
    .map((component) => packageComponentReferenceLabel(component) || component.label)
    .filter((label) => mealPattern.test(label));

  return [...new Set(labels)];
}

export function buildPackagePlannerSummary(days: PackageTemplateDay[], components: PackageTemplateComponent[], durationDays: number) {
  const cities = [
    ...new Set(
      components
        .map((component) => component.hotelContract?.hotel?.city)
        .filter((city): city is string => Boolean(city)),
    ),
  ];
  const excursions = components.filter((component) => component.componentType === 'EXCURSION_TEMPLATE').length;
  const hotelNights = components.filter((component) => component.componentType === 'HOTEL').length;
  const mealLabels = collectMealLabels(components);

  return {
    duration: `${durationDays} days`,
    cities: cities.length ? cities.join(', ') : 'Not set',
    excursions: String(excursions),
    hotelNights: String(hotelNights),
    includedMeals: mealLabels.length ? mealLabels.join(', ') : 'Not set',
    activeDays: String(days.filter((day) => day.active).length),
  };
}

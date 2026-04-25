export type ReferenceOption = {
  value: string;
  label: string;
};

export const OTHER_REFERENCE_VALUE = 'Other';

export const companyTypes: ReferenceOption[] = [
  { value: 'Client', label: 'Client' },
  { value: 'Agent', label: 'Agent' },
  { value: 'Supplier', label: 'Supplier' },
  { value: 'Internal', label: 'Internal' },
  { value: 'Partner', label: 'Partner' },
  { value: OTHER_REFERENCE_VALUE, label: 'Other' },
];

export const supplierTypes: ReferenceOption[] = [
  { value: 'hotel', label: 'Hotel' },
  { value: 'transport', label: 'Transport' },
  { value: 'activity', label: 'Activity' },
  { value: 'guide', label: 'Guide' },
  { value: 'other', label: 'Other' },
];

export const contactTypes: ReferenceOption[] = [
  { value: 'Primary', label: 'Primary' },
  { value: 'Sales', label: 'Sales' },
  { value: 'Operations', label: 'Operations' },
  { value: 'Finance', label: 'Finance' },
  { value: OTHER_REFERENCE_VALUE, label: 'Other' },
];

export const routeTypes: ReferenceOption[] = [
  { value: 'Airport Transfer', label: 'Airport Transfer' },
  { value: 'City Transfer', label: 'City Transfer' },
  { value: 'Intercity Transfer', label: 'Intercity Transfer' },
  { value: 'Sightseeing Route', label: 'Sightseeing Route' },
  { value: OTHER_REFERENCE_VALUE, label: 'Other' },
];

export const countries = [
  'Jordan',
  'Saudi Arabia',
  'UAE',
  'Qatar',
  'Kuwait',
  'Bahrain',
  'Oman',
  'Egypt',
  'Lebanon',
  OTHER_REFERENCE_VALUE,
];

export const citiesByCountry: Record<string, string[]> = {
  Jordan: ['Amman', 'Aqaba', 'Petra', 'Wadi Rum', 'Dead Sea', 'Jerash', 'Madaba', 'Irbid', OTHER_REFERENCE_VALUE],
  'Saudi Arabia': ['Riyadh', 'Jeddah', 'AlUla', 'Mecca', 'Medina', 'Dammam', OTHER_REFERENCE_VALUE],
  UAE: ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ras Al Khaimah', 'Fujairah', OTHER_REFERENCE_VALUE],
  Qatar: ['Doha', 'Al Wakrah', 'Lusail', OTHER_REFERENCE_VALUE],
  Kuwait: ['Kuwait City', 'Salmiya', 'Hawally', OTHER_REFERENCE_VALUE],
  Bahrain: ['Manama', 'Muharraq', 'Riffa', OTHER_REFERENCE_VALUE],
  Oman: ['Muscat', 'Salalah', 'Nizwa', 'Sur', OTHER_REFERENCE_VALUE],
  Egypt: ['Cairo', 'Alexandria', 'Luxor', 'Aswan', 'Sharm El Sheikh', 'Hurghada', OTHER_REFERENCE_VALUE],
  Lebanon: ['Beirut', 'Byblos', 'Baalbek', 'Tripoli', OTHER_REFERENCE_VALUE],
};

export function isKnownCountry(value: string) {
  return countries.some((country) => country !== OTHER_REFERENCE_VALUE && country === value);
}

export function getCitiesForCountry(country: string) {
  return citiesByCountry[country] || [OTHER_REFERENCE_VALUE];
}

export function isKnownCity(country: string, city: string) {
  return getCitiesForCountry(country).some((cityOption) => cityOption !== OTHER_REFERENCE_VALUE && cityOption === city);
}

export function getCountryForCity(city: string) {
  return Object.entries(citiesByCountry).find(([, cities]) => cities.some((cityOption) => cityOption !== OTHER_REFERENCE_VALUE && cityOption === city))?.[0] || '';
}

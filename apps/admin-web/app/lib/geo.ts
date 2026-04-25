export type GeoPoint = {
  latitude: number;
  longitude: number;
};

export type DistanceEstimate = {
  distanceKm: number;
  travelTimeHours: number;
};

const EARTH_RADIUS_KM = 6371;
const JORDAN_AVG_SPEED_KMH = 75;

export const JORDAN_CITY_COORDINATES: Record<string, GeoPoint> = {
  amman: { latitude: 31.9539, longitude: 35.9106 },
  petra: { latitude: 30.3285, longitude: 35.4444 },
  'wadi rum': { latitude: 29.5321, longitude: 35.421 },
  'dead sea': { latitude: 31.559, longitude: 35.4732 },
  aqaba: { latitude: 29.5321, longitude: 35.0063 },
  jerash: { latitude: 32.2808, longitude: 35.8997 },
  madaba: { latitude: 31.7167, longitude: 35.7939 },
};

function normalizeCityName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function calculateDistance(cityA: GeoPoint, cityB: GeoPoint, avgSpeedKmh = JORDAN_AVG_SPEED_KMH): DistanceEstimate {
  const latDelta = toRadians(cityB.latitude - cityA.latitude);
  const lonDelta = toRadians(cityB.longitude - cityA.longitude);
  const latA = toRadians(cityA.latitude);
  const latB = toRadians(cityB.latitude);
  const haversine =
    Math.sin(latDelta / 2) ** 2 + Math.cos(latA) * Math.cos(latB) * Math.sin(lonDelta / 2) ** 2;
  const distanceKm = EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));

  return {
    distanceKm: Number(distanceKm.toFixed(1)),
    travelTimeHours: Number((distanceKm / avgSpeedKmh).toFixed(1)),
  };
}

export function calculateCityDistance(cityA: string, cityB: string) {
  const pointA = JORDAN_CITY_COORDINATES[normalizeCityName(cityA)];
  const pointB = JORDAN_CITY_COORDINATES[normalizeCityName(cityB)];

  return pointA && pointB ? calculateDistance(pointA, pointB) : null;
}

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

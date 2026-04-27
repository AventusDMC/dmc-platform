export function buildPassengerManifestExportApiUrl(apiBaseUrl: string, id: string) {
  return `${apiBaseUrl}/bookings/${id}/passengers/export`;
}

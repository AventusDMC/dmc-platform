import ExcelJS = require('exceljs');
import { join } from 'path';

const outputPath = join(process.cwd(), 'Tiny_Touring_Route_Import_Test_EXCELJS.xlsx');

async function main() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'DMC Platform';
  workbook.created = new Date();
  workbook.modified = new Date();

  const touringRoutes = workbook.addWorksheet('TOURING_ROUTES');
  touringRoutes.addRow([
    'TourCode',
    'TourName',
    'StartCity',
    'DurationDays',
    'RouteDescription',
    'MainDestinations',
    'IncludedKM',
    'IncludedHours',
    'TransportType',
    'Notes',
  ]);
  touringRoutes.addRow([
    'PETRA_FD_TEST',
    'Petra Full Day Test',
    'Amman',
    1,
    'Amman → Petra → Amman',
    'Petra',
    600,
    12,
    'TOURING_ROUTE',
    'Tiny ExcelJS test',
  ]);

  const touringRouteStops = workbook.addWorksheet('TOURING_ROUTE_STOPS');
  touringRouteStops.addRow(['TourCode', 'StopOrder', 'StopName', 'Region', 'Overnight', 'Notes']);
  touringRouteStops.addRow(['PETRA_FD_TEST', 1, 'Amman', 'Amman', false, 'Departure']);
  touringRouteStops.addRow(['PETRA_FD_TEST', 2, 'Petra', 'South Jordan', false, 'Visit']);
  touringRouteStops.addRow(['PETRA_FD_TEST', 3, 'Amman', 'Amman', false, 'Return']);

  const touringRouteRates = workbook.addWorksheet('TOURING_ROUTE_RATES');
  touringRouteRates.addRow([
    'SupplierName',
    'TourCode',
    'VehicleCode',
    'VehicleName',
    'PricingBasis',
    'Currency',
    'Cost',
    'ValidFrom',
    'ValidTo',
    'IncludedKM',
    'IncludedHours',
    'ExtraKMRate',
    'ExtraHourRate',
    'DriverAccommodationIncluded',
    'Notes',
  ]);
  touringRouteRates.addRow([
    'REVIEW_SUPPLIER',
    'PETRA_FD_TEST',
    'VAN9',
    'Van 9',
    'PER_VEHICLE',
    'JOD',
    140,
    '2026-01-01',
    '2026-12-31',
    600,
    12,
    0.5,
    10,
    false,
    'ExcelJS tiny test',
  ]);

  const vehicleTypes = workbook.addWorksheet('VEHICLE_TYPES');
  vehicleTypes.addRow(['VehicleCode', 'VehicleName', 'VehicleCategory', 'MinPax', 'MaxPax', 'LuggageCapacity', 'Notes']);
  vehicleTypes.addRow(['VAN9', 'Van 9', 'Van', 1, 9, 9, 'Touring van']);

  for (const worksheet of workbook.worksheets) {
    worksheet.getRow(1).font = { bold: true };
    worksheet.columns.forEach((column) => {
      column.width = 24;
    });
  }

  await workbook.xlsx.writeFile(outputPath);
  console.log(`Created ${outputPath}`);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});

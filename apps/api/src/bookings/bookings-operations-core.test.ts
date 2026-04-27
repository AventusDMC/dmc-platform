import test = require('node:test');
import assert = require('node:assert/strict');
import * as XLSX from 'xlsx';
import { PATH_METADATA } from '@nestjs/common/constants';
import { mapQuoteToProposalV3 } from '../quotes/proposal-v3.mapper';
const { BookingsService } = require('./bookings.service');
const { BookingsController } = require('./bookings.controller');

function createService(prisma: any) {
  return new BookingsService(prisma, { log: async () => null });
}

function capturePdfText(service: any) {
  const lines: string[] = [];
  const doc: any = {
    y: 50,
    page: {
      width: 595,
      height: 842,
      margins: { left: 50, right: 50, top: 50, bottom: 50 },
    },
    font: () => doc,
    fontSize: () => doc,
    fillColor: () => doc,
    strokeColor: () => doc,
    lineWidth: () => doc,
    image: () => doc,
    moveTo: () => doc,
    lineTo: () => doc,
    stroke: () => doc,
    addPage: () => {
      doc.y = 50;
      return doc;
    },
    moveDown: (amount = 1) => {
      doc.y += 12 * amount;
      return doc;
    },
    text: (value: string) => {
      lines.push(String(value));
      doc.y += 12;
      return doc;
    },
  };

  service.createPdf = (write: (doc: any) => void) => {
    write(doc);
    return Promise.resolve(Buffer.from(lines.join('\n')));
  };

  return lines;
}

test('passenger manifest export route uses extensionless URL and Excel response headers', async () => {
  const routePath = (Reflect as any).getMetadata(PATH_METADATA, BookingsController.prototype.downloadPassengerManifestExcel);
  assert.equal(routePath, ':id/passengers/export');

  const controller = new BookingsController(
    {
      exportPassengerManifestExcel: async () => ({
        fileName: 'BK-1-passenger-manifest.xlsx',
        buffer: Buffer.from('excel'),
      }),
    },
    {},
  );
  const headers: Record<string, string> = {};
  const response = {
    setHeader: (name: string, value: string) => {
      headers[name] = value;
    },
  };

  await controller.downloadPassengerManifestExcel('booking-1', { companyId: 'company-1' }, response);

  assert.equal(headers['Content-Type'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.equal(headers['Content-Disposition'], 'attachment; filename="BK-1-passenger-manifest.xlsx"');
});

test('passenger manifest validates required fields and dates', async () => {
  const service = createService({
    $transaction: async (callback: any) =>
      callback({
        booking: {
          findFirst: async () => ({ id: 'booking-1' }),
        },
        bookingPassenger: {
          create: async ({ data }: any) => ({ id: 'passenger-1', ...data }),
          updateMany: async () => ({ count: 0 }),
        },
        bookingAuditLog: {
          create: async () => ({}),
        },
      }),
  });

  await assert.rejects(
    () =>
      service.createPassenger('booking-1', {
        fullName: 'Lina Haddad',
        nationality: '',
        passportNumber: 'P1234567',
        passportExpiryDate: '2030-01-01',
        companyActor: { companyId: 'company-1' },
      }),
    /nationality is required/i,
  );
  await assert.rejects(
    () =>
      service.createPassenger('booking-1', {
        fullName: 'Lina Haddad',
        nationality: 'Jordanian',
        passportNumber: 'P1234567',
        passportIssueDate: '2030-01-01',
        passportExpiryDate: '2029-01-01',
        companyActor: { companyId: 'company-1' },
      }),
    /expiry date cannot be before issue date/i,
  );
});

test('booking detail masks passport number in list response', async () => {
  const service = createService({
    booking: {
      findFirst: async () => ({
        id: 'booking-1',
        quoteId: 'quote-1',
        adults: 1,
        children: 0,
        roomCount: 1,
        services: [],
        auditLogs: [],
        payments: [],
        roomingEntries: [],
        passengers: [
          {
            id: 'passenger-1',
            fullName: 'Lina Haddad',
            firstName: 'Lina',
            lastName: 'Haddad',
            title: null,
            passportNumber: 'P1234567',
            isLead: true,
            roomingAssignments: [],
          },
        ],
        quote: {
          clientCompany: { id: 'company-1', name: 'Client Co' },
          brandCompany: null,
          contact: {},
        },
      }),
    },
  });

  const booking = await service.findOne('booking-1', { companyId: 'company-1' });

  assert.equal(booking.passengers[0].passportNumber, undefined);
  assert.equal(booking.passengers[0].passportNumberMasked, '****4567');
});

test('passenger manifest Excel export contains government-ready columns and values', async () => {
  const service = createService({
    booking: {
      findFirst: async () => ({
        id: 'booking-1',
        bookingRef: 'BK-2026-0001',
        startDate: new Date('2026-10-01T00:00:00.000Z'),
        snapshotJson: { title: 'Jordan Operations Booking' },
        quote: { title: 'Quote title', clientCompany: { id: 'company-1' } },
        passengers: [
          {
            fullName: 'Lina Haddad',
            firstName: 'Lina',
            lastName: 'Haddad',
            gender: 'F',
            dateOfBirth: new Date('1990-02-03T00:00:00.000Z'),
            nationality: 'Jordanian',
            passportNumber: 'P1234567',
            passportIssueDate: new Date('2024-01-01T00:00:00.000Z'),
            passportExpiryDate: new Date('2030-01-01T00:00:00.000Z'),
            arrivalFlight: 'RJ101',
            departureFlight: 'RJ102',
            entryPoint: 'QAIA',
            visaStatus: 'Approved',
          },
        ],
      }),
    },
  });

  const exported = await service.exportPassengerManifestExcel('booking-1', { companyId: 'company-1' });
  const workbook = XLSX.read(exported.buffer);
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets['Passenger Manifest']) as any[];

  assert.deepEqual(Object.keys(rows[0]), [
    'Booking Name',
    'Arrival Date',
    'Entry Point',
    'Full Name',
    'Gender',
    'DOB',
    'Nationality',
    'Passport Number',
    'Issue Date',
    'Expiry Date',
    'Flight',
    'Visa Status',
  ]);
  assert.equal(rows[0]['Booking Name'], 'Jordan Operations Booking');
  assert.equal(rows[0]['Arrival Date'], '2026-10-01');
  assert.equal(rows[0]['Entry Point'], 'QAIA');
  assert.equal(rows[0]['Full Name'], 'Lina Haddad');
  assert.equal(rows[0]['Passport Number'], 'P1234567');
});

test('cross-company booking access is scoped through clientCompanyId', async () => {
  let whereClause: any;
  const service = createService({
    booking: {
      findFirst: async ({ where }: any) => {
        whereClause = where;
        return null;
      },
    },
  });

  await service.findOne('booking-1', { companyId: 'company-a' });

  assert.equal(whereClause.quote.clientCompanyId, 'company-a');
});

test('operations dashboard returns scoped counts and missing passenger alerts', async () => {
  const bookingBase = {
    id: 'booking-1',
    bookingRef: 'BK-1',
    status: 'draft',
    startDate: new Date('2026-04-27T08:00:00.000Z'),
    endDate: new Date('2026-04-28T08:00:00.000Z'),
    pax: 2,
    adults: 2,
    children: 0,
    snapshotJson: { title: 'Jordan group' },
    passengers: [
      {
        id: 'passenger-1',
        fullName: 'Lina Haddad',
        firstName: 'Lina',
        lastName: 'Haddad',
        nationality: 'Jordanian',
        passportNumber: '',
        passportExpiryDate: null,
        entryPoint: 'QAIA',
      },
    ],
  };
  const transportService = {
    id: 'service-1',
    bookingId: 'booking-1',
    description: 'Airport transfer',
    serviceType: 'TRANSPORT',
    operationType: 'TRANSPORT',
    operationStatus: 'PENDING',
    serviceDate: new Date('2026-04-27T10:00:00.000Z'),
    pickupTime: null,
    assignedTo: null,
    supplierId: null,
    supplierName: null,
    vehicleId: null,
    booking: bookingBase,
  };
  const findManyCalls: any[] = [];
  const service = createService({
    booking: {
      findMany: async (args: any) => {
        findManyCalls.push({ model: 'booking', where: args.where });
        if (args.where?.startDate?.gte && args.where?.startDate?.lt) return [bookingBase];
        if (args.where?.endDate?.gte && args.where?.endDate?.lt) return [bookingBase];
        if (args.where?.status?.in) return [bookingBase];
        if (args.where?.OR) return [bookingBase];
        return [bookingBase];
      },
    },
    bookingService: {
      findMany: async (args: any) => {
        findManyCalls.push({ model: 'bookingService', where: args.where });
        return [transportService];
      },
    },
  });

  const dashboard = await service.getOperationsDashboard({
    actor: { companyId: 'company-1' },
    date: '2026-04-27',
  });

  assert.equal(dashboard.todayArrivals.count, 1);
  assert.equal(dashboard.todayDepartures.count, 1);
  assert.equal(dashboard.activeBookings.count, 1);
  assert.equal(dashboard.pendingServices.count, 1);
  assert.equal(dashboard.unconfirmedServices.count, 1);
  assert.equal(dashboard.missingPassengers.count, 1);
  assert.match(dashboard.missingPassengers.items[0].reasons.join(' '), /incomplete/i);
  assert.match(dashboard.missingPassengers.items[0].reasons.join(' '), /passport/i);
  assert.equal(dashboard.alerts.servicesWithoutSupplierOrAssignment.count, 1);
  assert.equal(dashboard.alerts.missingTransportAssignmentForToday.count, 1);
  assert.ok(findManyCalls.every((call) => call.where.booking?.quote?.clientCompanyId === 'company-1' || call.where.quote?.clientCompanyId === 'company-1'));
});

test('operations dashboard filters booking and service statuses', async () => {
  const bookingWheres: any[] = [];
  const serviceWheres: any[] = [];
  const service = createService({
    booking: {
      findMany: async (args: any) => {
        bookingWheres.push(args.where);
        return [];
      },
    },
    bookingService: {
      findMany: async (args: any) => {
        serviceWheres.push(args.where);
        return [];
      },
    },
  });

  const dashboard = await service.getOperationsDashboard({
    actor: { companyId: 'company-1' },
    date: '2026-04-27',
    bookingStatus: 'IN_PROGRESS',
    serviceStatus: 'REQUESTED',
  });

  assert.equal(dashboard.filters.bookingStatus, 'in_progress');
  assert.equal(dashboard.filters.serviceStatus, 'REQUESTED');
  assert.ok(bookingWheres.some((where) => where.status === 'in_progress' || where.status?.in?.includes('in_progress')));
  assert.ok(serviceWheres.every((where) => where.booking.quote.clientCompanyId === 'company-1'));
  assert.ok(serviceWheres.some((where) => where.operationStatus === 'REQUESTED' || JSON.stringify(where).includes('REQUESTED')));
});

test('operations dashboard requires company scope', async () => {
  const service = createService({});

  await assert.rejects(
    () =>
      service.getOperationsDashboard({
        actor: null,
        date: '2026-04-27',
      }),
    /company context is required/i,
  );
});

test('operations mobile data returns days services masked passports and no pricing', async () => {
  let whereClause: any;
  const service = createService({
    booking: {
      findMany: async ({ where }: any) => {
        whereClause = where;
        return [
          {
            id: 'booking-1',
            bookingRef: 'BK-1',
            status: 'in_progress',
            startDate: new Date('2026-04-27T00:00:00.000Z'),
            endDate: new Date('2026-04-28T00:00:00.000Z'),
            pax: 2,
            adults: 2,
            children: 0,
            roomCount: 1,
            snapshotJson: { title: 'Jordan group' },
            passengers: [
              {
                id: 'passenger-1',
                fullName: 'Lina Haddad',
                firstName: 'Lina',
                lastName: 'Haddad',
                nationality: 'Jordanian',
                passportNumber: 'P1234567',
                passportExpiryDate: new Date('2030-01-01T00:00:00.000Z'),
              },
            ],
            days: [
              {
                id: 'day-1',
                dayNumber: 1,
                date: new Date('2026-04-27T00:00:00.000Z'),
                title: 'Arrival',
                notes: 'Meet and assist',
                status: 'PENDING',
                services: [
                  {
                    id: 'service-1',
                    bookingDayId: 'day-1',
                    serviceType: 'TRANSPORT',
                    operationType: 'TRANSPORT',
                    operationStatus: 'CONFIRMED',
                    supplierId: 'supplier-1',
                    referenceId: 'route-1',
                    vehicleId: 'vehicle-1',
                    description: 'Airport transfer',
                    serviceDate: new Date('2026-04-27T10:00:00.000Z'),
                    startTime: null,
                    pickupTime: '09:00',
                    pickupLocation: 'QAIA',
                    meetingPoint: null,
                    assignedTo: 'Omar Driver',
                    guidePhone: '+962700000000',
                    supplierName: 'Transport Co',
                    confirmationNumber: null,
                    notes: 'Call on arrival',
                    status: 'confirmed',
                    totalCost: 100,
                    totalSell: 150,
                    vouchers: [{ id: 'voucher-1', status: 'DRAFT', type: 'TRANSPORT' }],
                  },
                ],
              },
            ],
          },
        ];
      },
    },
  });

  const mobile = await service.getOperationsMobileData({
    actor: { companyId: 'company-1' },
    date: '2026-04-27',
  });
  const rendered = JSON.stringify(mobile);

  assert.equal(whereClause.quote.clientCompanyId, 'company-1');
  assert.equal(mobile.bookings[0].days[0].services[0].operationStatus, 'CONFIRMED');
  assert.equal(mobile.bookings[0].days[0].services[0].vouchers[0].id, 'voucher-1');
  assert.equal(mobile.bookings[0].passengerSummary.maskedPassportSamples[0].passportNumberMasked, '****4567');
  assert.doesNotMatch(rendered, /P1234567/);
  assert.doesNotMatch(rendered, /totalCost|totalSell|margin/i);
});

test('end-to-end operations workflow keeps field data scoped and client-safe', async () => {
  const booking: any = {
    id: 'booking-1',
    bookingRef: 'BK-E2E-1',
    status: 'in_progress',
    startDate: new Date('2026-04-27T00:00:00.000Z'),
    endDate: new Date('2026-04-29T00:00:00.000Z'),
    pax: 2,
    adults: 2,
    children: 0,
    roomCount: 1,
    nightCount: 2,
    snapshotJson: {
      title: 'Jordan Field Operations',
      travelStartDate: '2026-04-27T00:00:00.000Z',
      itineraries: [
        { id: 'day-1', dayNumber: 1, title: 'Arrival', description: 'Arrival and transfer' },
        { id: 'day-2', dayNumber: 2, title: 'Petra', description: 'Petra touring' },
      ],
    },
    clientSnapshotJson: { name: 'Client Co' },
    contactSnapshotJson: { firstName: 'Lina', lastName: 'Haddad', email: 'lina@example.test' },
    brandSnapshotJson: { name: 'DMC Ops' },
    quote: {
      title: 'Jordan Quote',
      clientCompany: { id: 'company-1', name: 'Client Co' },
      brandCompany: { name: 'DMC Ops', branding: null },
      contact: { firstName: 'Lina', lastName: 'Haddad', email: 'lina@example.test' },
    },
    passengers: [],
    days: [
      { id: 'day-1', bookingId: 'booking-1', dayNumber: 1, date: new Date('2026-04-27T00:00:00.000Z'), title: 'Arrival', notes: 'Meet and assist', status: 'PENDING', services: [] },
      { id: 'day-2', bookingId: 'booking-1', dayNumber: 2, date: new Date('2026-04-28T00:00:00.000Z'), title: 'Petra', notes: 'Full-day touring', status: 'PENDING', services: [] },
    ],
    services: [],
  };
  const suppliers: Record<string, any> = {
    'supplier-transport': { id: 'supplier-transport', name: 'Amman Transport', type: 'transport' },
    'supplier-guide': { id: 'supplier-guide', name: 'Jordan Guides', type: 'guide' },
    'supplier-hotel': { id: 'supplier-hotel', name: 'Petra Hotel', type: 'hotel' },
  };
  const vehicles: Record<string, any> = {
    'vehicle-1': { id: 'vehicle-1', name: 'Mercedes Vito', supplierId: 'supplier-transport' },
  };
  const routes: Record<string, any> = {
    'route-1': { id: 'route-1', name: 'QAIA to Petra' },
  };
  const vouchers: any[] = [];
  let serviceSequence = 0;

  const prisma: any = {
    $transaction: async (callback: any) => callback(prisma),
    booking: {
      findFirst: async ({ where }: any) => {
        const scopedCompanyId = where?.quote?.clientCompanyId;
        return !scopedCompanyId || scopedCompanyId === 'company-1' ? booking : null;
      },
      findMany: async ({ where }: any) => {
        const scopedCompanyId = where?.quote?.clientCompanyId;
        return !scopedCompanyId || scopedCompanyId === 'company-1' ? [booking] : [];
      },
    },
    bookingDay: {
      findFirst: async ({ where }: any) => {
        const day = booking.days.find((entry: any) => entry.id === where.id && entry.bookingId === where.bookingId);
        return day ? { ...day, booking: { id: booking.id, adults: booking.adults, children: booking.children } } : null;
      },
    },
    bookingPassenger: {
      updateMany: async () => ({ count: 0 }),
      create: async ({ data }: any) => {
        const passenger = { id: `passenger-${booking.passengers.length + 1}`, createdAt: new Date(), ...data };
        booking.passengers.push(passenger);
        return passenger;
      },
    },
    bookingService: {
      count: async () => booking.services.length,
      create: async ({ data }: any) => {
        const service = {
          id: `service-${++serviceSequence}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          vouchers: [],
          ...data,
        };
        booking.services.push(service);
        booking.days.find((day: any) => day.id === service.bookingDayId)?.services.push(service);
        return { ...service, supplier: suppliers[service.supplierId] || null, vehicle: vehicles[service.vehicleId] || null, bookingDay: booking.days.find((day: any) => day.id === service.bookingDayId) };
      },
      findFirst: async ({ where }: any) => {
        const service = booking.services.find((entry: any) => entry.id === where.id && (!where.bookingId || entry.bookingId === where.bookingId));
        if (!service) return null;
        return { ...service, supplier: suppliers[service.supplierId] || null, vehicle: vehicles[service.vehicleId] || null, bookingDay: booking.days.find((day: any) => day.id === service.bookingDayId), booking };
      },
      findMany: async ({ where }: any = {}) => {
        let rows = booking.services;
        const serializedWhere = JSON.stringify(where || {});
        if (serializedWhere.includes('PENDING')) {
          rows = rows.filter((service: any) => service.operationStatus === 'PENDING');
        } else if (serializedWhere.includes('"not":"CONFIRMED"')) {
          rows = rows.filter((service: any) => service.operationStatus !== 'CONFIRMED');
        } else if (serializedWhere.includes('"operationType":"TRANSPORT"')) {
          rows = rows.filter((service: any) => service.operationType === 'TRANSPORT');
        }
        return rows.map((service: any) => ({ ...service, booking }));
      },
      update: async ({ where, data }: any) => {
        const index = booking.services.findIndex((entry: any) => entry.id === where.id);
        booking.services[index] = { ...booking.services[index], ...data };
        const day = booking.days.find((entry: any) => entry.id === booking.services[index].bookingDayId);
        const dayIndex = day.services.findIndex((entry: any) => entry.id === where.id);
        day.services[dayIndex] = booking.services[index];
        return { ...booking.services[index], supplier: suppliers[booking.services[index].supplierId] || null, vehicle: vehicles[booking.services[index].vehicleId] || null, bookingDay: day };
      },
    },
    bookingAuditLog: {
      create: async () => ({}),
    },
    route: {
      findUnique: async ({ where }: any) => routes[where.id] || null,
    },
    vehicle: {
      findUnique: async ({ where }: any) => vehicles[where.id] || null,
    },
    supplier: {
      findUnique: async ({ where }: any) => suppliers[where.id] || null,
    },
    voucher: {
      create: async ({ data }: any) => {
        const voucher = {
          id: `voucher-${vouchers.length + 1}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          issuedAt: null,
          ...data,
          supplier: suppliers[data.supplierId],
          bookingService: booking.services.find((service: any) => service.id === data.bookingServiceId),
        };
        vouchers.push(voucher);
        voucher.bookingService.vouchers.push({ id: voucher.id, status: voucher.status, type: voucher.type });
        return voucher;
      },
      findFirst: async ({ where }: any) => {
        const voucher = vouchers.find((entry) => entry.id === where.id);
        if (!voucher) return null;
        return {
          ...voucher,
          booking,
          supplier: suppliers[voucher.supplierId],
          bookingService: {
            ...booking.services.find((service: any) => service.id === voucher.bookingServiceId),
            bookingDay: booking.days.find((day: any) => day.id === voucher.bookingService.bookingDayId),
            vehicle: vehicles[voucher.bookingService.vehicleId] || null,
          },
        };
      },
    },
  };
  const service = createService(prisma);
  const pdfLines = capturePdfText(service);

  await service.createPassenger('booking-1', {
    fullName: 'Lina Haddad',
    firstName: 'Lina',
    lastName: 'Haddad',
    nationality: 'Jordanian',
    passportNumber: 'P1234567',
    passportExpiryDate: '2030-01-01',
    arrivalFlight: 'RJ101',
    entryPoint: 'QAIA',
    companyActor: { companyId: 'company-1' },
  });
  await service.createPassenger('booking-1', {
    fullName: 'Omar Haddad',
    firstName: 'Omar',
    lastName: 'Haddad',
    nationality: 'Jordanian',
    passportNumber: 'P7654321',
    passportExpiryDate: '2030-01-01',
    companyActor: { companyId: 'company-1' },
  });

  const manifest = await service.exportPassengerManifestExcel('booking-1', { companyId: 'company-1' });
  const manifestRows = XLSX.utils.sheet_to_json(XLSX.read(manifest.buffer).Sheets['Passenger Manifest']) as any[];
  assert.equal(manifestRows.length, 2);
  assert.equal(manifestRows[0]['Passport Number'], 'P1234567');

  const transport = await service.createBookingService('booking-1', 'day-1', {
    type: 'TRANSPORT',
    referenceId: 'route-1',
    vehicleId: 'vehicle-1',
    pickupTime: '09:00',
    assignedTo: 'Omar Driver',
    guidePhone: '+962700000000',
    status: 'REQUESTED',
    notes: 'Airport pickup',
    companyActor: { companyId: 'company-1' },
  });
  const guide = await service.createBookingService('booking-1', 'day-2', {
    type: 'GUIDE',
    supplierId: 'supplier-guide',
    assignedTo: 'Nadia Guide',
    guidePhone: '+962711111111',
    status: 'REQUESTED',
    notes: 'English guide',
    companyActor: { companyId: 'company-1' },
  });
  const hotel = await service.createBookingService('booking-1', 'day-1', {
    type: 'HOTEL',
    supplierId: 'supplier-hotel',
    confirmationNumber: 'PETRA-123',
    status: 'CONFIRMED',
    notes: 'One double room',
    companyActor: { companyId: 'company-1' },
  });

  await service.createServiceVoucher('booking-1', transport.id, { companyActor: { companyId: 'company-1' } });
  await service.createServiceVoucher('booking-1', guide.id, { companyActor: { companyId: 'company-1' } });
  await service.createServiceVoucher('booking-1', hotel.id, { companyActor: { companyId: 'company-1' } });
  assert.equal(vouchers.length, 3);

  const guarantee = await service.generateGuaranteeLetterPdf('booking-1', { companyId: 'company-1' });
  assert.match(guarantee.toString(), /Lina Haddad/);
  assert.match(guarantee.toString(), /Omar Driver/);
  assert.doesNotMatch(guarantee.toString(), /margin|totalSell|totalCost/i);

  const dashboard = await service.getOperationsDashboard({ actor: { companyId: 'company-1' }, date: '2026-04-27' });
  assert.equal(dashboard.todayArrivals.count, 1);
  assert.equal(dashboard.pendingServices.count, 0);
  assert.equal(dashboard.missingPassengers.count, 0);
  assert.equal(dashboard.upcomingBorderCrossings.count, 1);

  const mobile = await service.getOperationsMobileData({ actor: { companyId: 'company-1' }, date: '2026-04-27' });
  assert.equal(mobile.bookings[0].days[0].services.length, 2);
  assert.equal(mobile.bookings[0].passengerSummary.manifestStatus, 'complete');
  assert.equal(mobile.bookings[0].passengerSummary.maskedPassportSamples[0].passportNumberMasked, '****4567');
  assert.doesNotMatch(JSON.stringify(mobile), /P1234567|P7654321|totalCost|totalSell|margin/i);
  assert.equal(mobile.bookings[0].days[0].services[0].vouchers[0].id, 'voucher-1');

  const updatedTransport = await service.updateBookingService('booking-1', 'day-1', transport.id, {
    type: 'TRANSPORT',
    referenceId: 'route-1',
    vehicleId: 'vehicle-1',
    pickupTime: '09:15',
    assignedTo: 'Omar Driver',
    guidePhone: '+962700000000',
    status: 'DONE',
    notes: 'Guest boarded vehicle',
    companyActor: { companyId: 'company-1' },
  });
  assert.equal(updatedTransport.operationStatus, 'DONE');
  assert.equal(updatedTransport.notes, 'Guest boarded vehicle');

  const proposal = mapQuoteToProposalV3({
    id: 'quote-1',
    quoteNumber: 'Q-1',
    quoteCurrency: 'USD',
    title: 'Client Proposal',
    description: 'Client-safe proposal',
    createdAt: new Date('2026-04-27T00:00:00.000Z'),
    travelStartDate: new Date('2026-04-27T00:00:00.000Z'),
    nightCount: 2,
    adults: 2,
    children: 0,
    totalCost: 900,
    totalSell: 1200,
    pricePerPax: 600,
    quoteOptions: [],
    itineraries: [{ dayNumber: 1, title: 'Arrival', description: 'Welcome to Jordan' }],
    quoteItems: [],
    passengers: booking.passengers,
  } as any);
  const proposalText = JSON.stringify(proposal);
  assert.doesNotMatch(proposalText, /P1234567|P7654321|passport|supplier|internal/i);
  assert.ok(pdfLines.length > 0);
});

test('proposal export view model does not leak booking passenger passport data', () => {
  const proposal = mapQuoteToProposalV3({
    id: 'quote-1',
    quoteNumber: 'Q-2026-0001',
    quoteCurrency: 'USD',
    title: 'Client Proposal',
    description: 'Public proposal',
    createdAt: new Date('2026-04-27T00:00:00.000Z'),
    travelStartDate: new Date('2026-10-01T00:00:00.000Z'),
    nightCount: 1,
    adults: 1,
    children: 0,
    totalCost: 100,
    totalSell: 120,
    pricePerPax: 120,
    quoteOptions: [],
    itineraries: [],
    quoteItems: [],
    passengers: [{ fullName: 'Lina Haddad', passportNumber: 'P1234567' }],
  } as any);
  const renderedText = JSON.stringify(proposal);

  assert.doesNotMatch(renderedText, /P1234567/);
  assert.doesNotMatch(renderedText, /passport/i);
});

test('create update and delete booking service assignment rows', async () => {
  const createdRows: any[] = [];
  const updatedRows: any[] = [];
  const deletedIds: string[] = [];
  const service = createService({
    bookingDay: {
      findFirst: async ({ where }: any) => {
        assert.equal(where.booking.quote.clientCompanyId, 'company-1');
        return {
          id: 'day-1',
          bookingId: 'booking-1',
          date: new Date('2026-10-01T00:00:00.000Z'),
          booking: { id: 'booking-1', adults: 2, children: 1 },
        };
      },
    },
    bookingService: {
      count: async () => 0,
      findFirst: async () => ({
        id: 'service-1',
        bookingId: 'booking-1',
        bookingDayId: 'day-1',
        operationType: 'GUIDE',
        operationStatus: 'PENDING',
        serviceType: 'GUIDE',
        description: 'Guide: Samir',
        notes: null,
        supplierId: null,
        supplierName: null,
        vehicleId: null,
        vehicle: null,
        referenceId: null,
        assignedTo: 'Samir',
        guidePhone: null,
        pickupTime: null,
        confirmationNumber: null,
      }),
    },
    supplier: {
      findUnique: async () => null,
    },
    $transaction: async (callback: any) =>
      callback({
        bookingService: {
          create: async ({ data }: any) => {
            createdRows.push(data);
            return { id: 'service-1', ...data };
          },
          update: async ({ data }: any) => {
            updatedRows.push(data);
            return { id: 'service-1', ...data };
          },
          delete: async ({ where }: any) => {
            deletedIds.push(where.id);
            return { id: where.id };
          },
        },
        bookingAuditLog: {
          create: async () => ({}),
        },
      }),
  });

  const created = await service.createBookingService('booking-1', 'day-1', {
    type: 'GUIDE',
    assignedTo: 'Samir',
    guidePhone: '+962700000000',
    status: 'REQUESTED',
    notes: 'Arabic speaking guide',
    companyActor: { companyId: 'company-1' },
  });

  assert.equal(created.operationType, 'GUIDE');
  assert.equal(created.operationStatus, 'REQUESTED');
  assert.equal(created.assignedTo, 'Samir');
  assert.equal(created.guidePhone, '+962700000000');
  assert.equal(created.status, 'in_progress');
  assert.equal(created.confirmationStatus, 'requested');
  assert.equal(createdRows[0].participantCount, 3);

  const updated = await service.updateBookingService('booking-1', 'day-1', 'service-1', {
    type: 'GUIDE',
    assignedTo: 'Nadia',
    status: 'CONFIRMED',
    notes: 'Met group in lobby',
    companyActor: { companyId: 'company-1' },
  });

  assert.equal(updated.assignedTo, 'Nadia');
  assert.equal(updated.operationStatus, 'CONFIRMED');
  assert.equal(updated.notes, 'Met group in lobby');
  assert.equal(updated.status, 'confirmed');
  assert.equal(updatedRows[0].confirmationStatus, 'confirmed');

  const deleted = await service.deleteBookingService('booking-1', 'day-1', 'service-1', undefined, { companyId: 'company-1' });

  assert.deepEqual(deleted, { id: 'service-1', deleted: true });
  assert.deepEqual(deletedIds, ['service-1']);
});

test('transport booking service uses route and vehicle catalog and saves vehicle supplier', async () => {
  const service = createService({
    bookingDay: {
      findFirst: async () => ({
        id: 'day-1',
        bookingId: 'booking-1',
        date: new Date('2026-10-01T00:00:00.000Z'),
        booking: { id: 'booking-1', adults: 2, children: 0 },
      }),
    },
    bookingService: {
      count: async () => 0,
    },
    route: {
      findUnique: async ({ where }: any) => {
        assert.equal(where.id, 'route-1');
        return { id: 'route-1', name: 'QAIA to Amman' };
      },
    },
    vehicle: {
      findUnique: async ({ where }: any) => {
        assert.equal(where.id, 'vehicle-1');
        return { id: 'vehicle-1', name: 'Mercedes Vito', supplierId: 'supplier-transport' };
      },
    },
    supplier: {
      findUnique: async ({ where }: any) => {
        assert.equal(where.id, 'supplier-transport');
        return { id: 'supplier-transport', name: 'Desert Transport' };
      },
    },
    $transaction: async (callback: any) =>
      callback({
        bookingService: {
          create: async ({ data }: any) => ({ id: 'service-transport', ...data }),
        },
        bookingAuditLog: {
          create: async () => ({}),
        },
      }),
  });

  const created = await service.createBookingService('booking-1', 'day-1', {
    type: 'TRANSPORT',
    referenceId: 'route-1',
    vehicleId: 'vehicle-1',
    assignedTo: 'Driver Ali',
    pickupTime: '09:30',
    companyActor: { companyId: 'company-1' },
  });

  assert.equal(created.referenceId, 'route-1');
  assert.equal(created.vehicleId, 'vehicle-1');
  assert.equal(created.supplierId, 'supplier-transport');
  assert.equal(created.supplierName, 'Desert Transport');
  assert.equal(created.pickupTime, '09:30');
  assert.match(created.description, /QAIA to Amman/);
});

test('hotel confirmation and external package operations services persist constrained fields', async () => {
  const createdRows: any[] = [];
  const service = createService({
    bookingDay: {
      findFirst: async () => ({
        id: 'day-1',
        bookingId: 'booking-1',
        date: new Date('2026-10-01T00:00:00.000Z'),
        booking: { id: 'booking-1', adults: 2, children: 0 },
      }),
    },
    bookingService: {
      count: async () => 0,
      findFirst: async () => ({
        id: 'service-external',
        bookingId: 'booking-1',
        bookingDayId: 'day-1',
        operationType: 'EXTERNAL_PACKAGE',
        operationStatus: 'PENDING',
        serviceType: 'EXTERNAL_PACKAGE',
        description: 'External package operations',
        notes: null,
      }),
    },
    supplier: {
      findUnique: async ({ where }: any) => ({ id: where.id, name: 'Hotel Supplier' }),
    },
    $transaction: async (callback: any) =>
      callback({
        bookingService: {
          create: async ({ data }: any) => {
            createdRows.push(data);
            return { id: `service-${createdRows.length}`, ...data };
          },
          update: async ({ data }: any) => ({ id: 'service-external', ...data }),
        },
        bookingAuditLog: {
          create: async () => ({}),
        },
      }),
  });

  const hotel = await service.createBookingService('booking-1', 'day-1', {
    type: 'HOTEL',
    supplierId: 'supplier-hotel',
    confirmationNumber: 'CN-7788',
    notes: 'Twin rooms confirmed',
    companyActor: { companyId: 'company-1' },
  });

  assert.equal(hotel.operationType, 'HOTEL');
  assert.equal(hotel.supplierId, 'supplier-hotel');
  assert.equal(hotel.confirmationNumber, 'CN-7788');

  const external = await service.createBookingService('booking-1', 'day-1', {
    type: 'EXTERNAL_PACKAGE',
    supplierId: 'should-be-ignored',
    assignedTo: 'should be ignored',
    notes: 'Partner package checked',
    companyActor: { companyId: 'company-1' },
  });

  assert.equal(external.operationType, 'EXTERNAL_PACKAGE');
  assert.equal(external.supplierId, null);
  assert.equal(external.assignedTo, null);
  assert.equal(external.notes, 'Partner package checked');

  await assert.rejects(
    () =>
      service.updateBookingService('booking-1', 'day-1', 'service-external', {
        type: 'TRANSPORT',
        companyActor: { companyId: 'company-1' },
      }),
    /external package.*status and notes/i,
  );
});

test('booking operation service status validation and cross-company access are enforced', async () => {
  const service = createService({
    bookingDay: {
      findFirst: async ({ where }: any) => {
        assert.equal(where.booking.quote.clientCompanyId, 'company-b');
        return null;
      },
    },
  });

  await assert.rejects(
    () =>
      service.createBookingService('booking-1', 'day-1', {
        type: 'GUIDE',
        assignedTo: 'Samir',
        status: 'BROKEN',
        companyActor: { companyId: 'company-b' },
      }),
    /booking day not found/i,
  );

  const validationService = createService({
    bookingDay: {
      findFirst: async () => ({
        id: 'day-1',
        bookingId: 'booking-1',
        date: null,
        booking: { id: 'booking-1', adults: 1, children: 0 },
      }),
    },
  });

  await assert.rejects(
    () =>
      validationService.createBookingService('booking-1', 'day-1', {
        type: 'GUIDE',
        assignedTo: 'Samir',
        status: 'BROKEN',
        companyActor: { companyId: 'company-1' },
      }),
    /unsupported booking service status/i,
  );
});

test('guarantee letter PDF contains booking passenger transport and guide data without pricing', async () => {
  const service = createService({
    booking: {
      findFirst: async ({ where }: any) => {
        assert.equal(where.id, 'booking-1');
        assert.equal(where.quote.clientCompanyId, 'company-1');
        return {
          id: 'booking-1',
          bookingRef: 'BK-GL-001',
          pax: 2,
          adults: 2,
          children: 0,
          startDate: new Date('2026-10-01T00:00:00.000Z'),
          endDate: new Date('2026-10-05T00:00:00.000Z'),
          snapshotJson: { title: 'Jordan Guarantee Trip' },
          brandSnapshotJson: { name: 'DMC Jordan', city: 'Amman', country: 'Jordan' },
          quote: {
            clientCompany: { name: 'Client Co' },
            brandCompany: {
              name: 'DMC Jordan',
              website: 'https://dmc.example',
              branding: { email: 'ops@dmc.example', phone: '+9626000000' },
            },
            contact: { firstName: 'Rana', lastName: 'Ops' },
          },
          passengers: [
            {
              fullName: 'Lina Haddad',
              firstName: 'Lina',
              lastName: 'Haddad',
              nationality: 'Jordanian',
              dateOfBirth: new Date('1990-02-03T00:00:00.000Z'),
              passportNumber: 'P1234567',
              passportIssueDate: new Date('2024-01-01T00:00:00.000Z'),
              passportExpiryDate: new Date('2030-01-01T00:00:00.000Z'),
              arrivalFlight: 'RJ101',
              departureFlight: 'RJ102',
              entryPoint: 'QAIA',
            },
          ],
          days: [
            { dayNumber: 1, title: 'Arrival in Amman' },
            { dayNumber: 2, title: 'Petra visit' },
          ],
          services: [
            {
              operationType: 'TRANSPORT',
              serviceType: 'TRANSPORT',
              supplierName: 'Desert Transport',
              assignedTo: 'Driver Ali',
              guidePhone: '+962799999999',
              vehicle: { name: 'Bus 1234' },
              totalCost: 999,
              totalSell: 1200,
            },
            {
              operationType: 'GUIDE',
              serviceType: 'GUIDE',
              assignedTo: 'Guide Samir',
              guidePhone: '+962788888888',
            },
          ],
        };
      },
    },
  });
  capturePdfText(service as any);

  const buffer = await service.generateGuaranteeLetterPdf('booking-1', { companyId: 'company-1' });
  const text = buffer.toString('utf8');

  assert.match(text, /To whom it may concern/);
  assert.match(text, /Lina Haddad/);
  assert.match(text, /P1234567/);
  assert.match(text, /2026-10-01/);
  assert.match(text, /2026-10-05/);
  assert.match(text, /Desert Transport/);
  assert.match(text, /Driver Ali/);
  assert.match(text, /Bus 1234/);
  assert.match(text, /Guide Samir/);
  assert.match(text, /Day 1: Arrival in Amman/);
  assert.doesNotMatch(text, /totalCost/);
  assert.doesNotMatch(text, /totalSell/);
  assert.doesNotMatch(text, /margin/i);
  assert.doesNotMatch(text, /pricing/i);
});

test('guarantee letter cross-company access is blocked', async () => {
  const service = createService({
    booking: {
      findFirst: async ({ where }: any) => {
        assert.equal(where.quote.clientCompanyId, 'company-b');
        return null;
      },
    },
  });

  await assert.rejects(
    () => service.generateGuaranteeLetterPdf('booking-1', { companyId: 'company-b' }),
    /booking not found/i,
  );
});

test('service voucher generation creates one supplier voucher per transport service', async () => {
  const service = createService({
    bookingService: {
      findFirst: async ({ where }: any) => {
        assert.equal(where.booking.quote.clientCompanyId, 'company-1');
        return {
          id: 'service-1',
          bookingId: 'booking-1',
          operationType: 'TRANSPORT',
          serviceType: 'TRANSPORT',
          supplierId: 'supplier-1',
          referenceId: 'route-1',
          vehicleId: 'vehicle-1',
          pickupTime: '09:00',
          assignedTo: 'Driver Ali',
          notes: 'Airport pickup',
        };
      },
    },
    $transaction: async (callback: any) =>
      callback({
        voucher: {
          create: async ({ data }: any) => ({ id: 'voucher-1', ...data }),
        },
        bookingAuditLog: {
          create: async () => ({}),
        },
      }),
  });

  const voucher = await service.createServiceVoucher('booking-1', 'service-1', {
    companyActor: { companyId: 'company-1' },
  });

  assert.equal(voucher.bookingServiceId, 'service-1');
  assert.equal(voucher.type, 'TRANSPORT');
  assert.equal(voucher.supplierId, 'supplier-1');
  assert.equal(voucher.status, 'DRAFT');
});

test('service voucher generation validates supplier and required fields', async () => {
  const service = createService({
    bookingService: {
      findFirst: async () => ({
        id: 'service-1',
        bookingId: 'booking-1',
        operationType: 'HOTEL',
        serviceType: 'HOTEL',
        supplierId: 'supplier-1',
        confirmationNumber: null,
        supplierReference: null,
      }),
    },
  });

  await assert.rejects(
    () => service.createServiceVoucher('booking-1', 'service-1', { companyActor: { companyId: 'company-1' } }),
    /hotel voucher requires a confirmation number/i,
  );
});

test('service voucher PDF includes supplier-facing fields and no pricing leakage', async () => {
  const service = createService({
    route: {
      findUnique: async () => ({ name: 'QAIA to Dead Sea' }),
    },
    voucher: {
      findFirst: async ({ where }: any) => {
        assert.equal(where.booking.quote.clientCompanyId, 'company-1');
        return {
          id: 'voucher-1',
          type: 'TRANSPORT',
          status: 'DRAFT',
          notes: 'Meet at arrivals',
          supplier: { name: 'Desert Transport' },
          booking: {
            id: 'booking-1',
            bookingRef: 'BK-001',
            pax: 3,
            adults: 2,
            children: 1,
            roomCount: 1,
            startDate: new Date('2026-10-01T00:00:00.000Z'),
            endDate: new Date('2026-10-03T00:00:00.000Z'),
            snapshotJson: { title: 'Client Group' },
            brandSnapshotJson: { name: 'DMC Jordan' },
            clientSnapshotJson: { name: 'Client Co' },
            quote: {
              clientCompany: { name: 'Client Co' },
              brandCompany: { name: 'DMC Jordan', branding: null },
              contact: {},
            },
            passengers: [],
            days: [],
          },
          bookingService: {
            id: 'service-1',
            referenceId: 'route-1',
            description: 'Airport transfer',
            pickupTime: '09:00',
            startTime: null,
            assignedTo: 'Driver Ali',
            guidePhone: '+962799999999',
            vehicle: { name: 'Van' },
            totalCost: 500,
            totalSell: 700,
          },
        };
      },
    },
  });
  capturePdfText(service as any);

  const buffer = await service.generateServiceVoucherPdf('voucher-1', { companyId: 'company-1' });
  const text = buffer.toString('utf8');

  assert.match(text, /Transport Voucher/);
  assert.match(text, /Client Group/);
  assert.match(text, /QAIA to Dead Sea/);
  assert.match(text, /09:00/);
  assert.match(text, /Driver Ali/);
  assert.match(text, /Van/);
  assert.doesNotMatch(text, /totalCost/);
  assert.doesNotMatch(text, /totalSell/);
  assert.doesNotMatch(text, /margin/i);
});

test('voucher status transitions draft to issued and blocks cross-company access', async () => {
  const updatedRows: any[] = [];
  const service = createService({
    voucher: {
      findFirst: async ({ where }: any) => {
        assert.equal(where.booking.quote.clientCompanyId, 'company-1');
        return {
          id: 'voucher-1',
          bookingId: 'booking-1',
          bookingServiceId: 'service-1',
          status: 'DRAFT',
          issuedAt: null,
        };
      },
    },
    $transaction: async (callback: any) =>
      callback({
        voucher: {
          update: async ({ data }: any) => {
            updatedRows.push(data);
            return { id: 'voucher-1', ...data };
          },
        },
        bookingAuditLog: {
          create: async () => ({}),
        },
      }),
  });

  const updated = await service.updateVoucherStatus('voucher-1', 'ISSUED', undefined, { companyId: 'company-1' });

  assert.equal(updated.status, 'ISSUED');
  assert.ok(updatedRows[0].issuedAt instanceof Date);

  const blocked = createService({
    voucher: {
      findFirst: async ({ where }: any) => {
        assert.equal(where.booking.quote.clientCompanyId, 'company-b');
        return null;
      },
    },
  });

  await assert.rejects(
    () => blocked.updateVoucherStatus('voucher-1', 'ISSUED', undefined, { companyId: 'company-b' }),
    /voucher not found/i,
  );
});

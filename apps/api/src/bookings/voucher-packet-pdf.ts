import PDFDocument = require('pdfkit');

/**
 * Supplier Voucher Packet V2 — S4 pure PDF renderer.
 *
 * Renders a supplier-facing PDF from an already-generated packet's SNAPSHOT
 * only (VoucherPacket.snapshotJson + generatedAt) — never live service data.
 * PURE: no DB, no I/O beyond building the PDF buffer, no mutation. The snapshot
 * is PII-free and finance-free by construction, so the PDF is too.
 *
 * Content is built as structured lines (buildVoucherPacketLines) so it is
 * exact-testable independently of PDF text encoding/kerning; the renderer just
 * writes those lines at level-appropriate font sizes.
 */

type PacketForPdf = {
  id?: string | null;
  status?: string | null;
  generatedAt?: string | Date | null;
  snapshotJson?: any;
};

export type PacketPdfLine = { text: string; level: 'title' | 'meta' | 'section' | 'detail' };

function dateOnly(value: string | Date | null | undefined): string {
  if (!value) return '-';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

/** Pure content model for the packet PDF — one entry per rendered line. */
export function buildVoucherPacketLines(packet: PacketForPdf): PacketPdfLine[] {
  const snap = (packet?.snapshotJson || {}) as any;
  const services: any[] = Array.isArray(snap.services) ? snap.services : [];
  const range = (snap.dateRange || {}) as { start?: string | null; end?: string | null };
  const dates =
    range.start && range.end && range.start !== range.end
      ? `${range.start} to ${range.end}`
      : range.start ?? range.end ?? '-';

  const lines: PacketPdfLine[] = [
    { text: 'Supplier Voucher Packet', level: 'title' },
    { text: `Supplier: ${snap.supplierName ?? '-'}`, level: 'meta' },
    { text: `Booking reference: ${snap.bookingRef ?? '-'}`, level: 'meta' },
    { text: `Grouping: ${snap.groupingType ?? '-'} (${snap.groupingKey ?? '-'})`, level: 'meta' },
    { text: `Generated: ${dateOnly(packet?.generatedAt)}`, level: 'meta' },
    { text: `Services: ${snap.serviceCount ?? services.length}`, level: 'meta' },
    { text: `Dates: ${dates}`, level: 'meta' },
  ];

  if (services.length === 0) {
    lines.push({ text: 'No services included.', level: 'detail' });
  } else {
    services.forEach((service, index) => {
      lines.push({ text: `${index + 1}. ${service.label ?? service.serviceType ?? 'Service'}`, level: 'section' });
      lines.push({ text: `Type: ${service.serviceType ?? '-'}`, level: 'detail' });
      const dayPart = service.dayNumber != null ? `  ·  Day ${service.dayNumber}` : '';
      lines.push({ text: `Date: ${service.serviceDate ?? '-'}${dayPart}`, level: 'detail' });
    });
  }

  return lines;
}

const LEVEL_SIZE: Record<PacketPdfLine['level'], number> = { title: 18, meta: 11, section: 13, detail: 10 };

export function renderVoucherPacketPdf(packet: PacketForPdf): Promise<Buffer> {
  const lines = buildVoucherPacketLines(packet);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, compress: false });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    try {
      lines.forEach((line, index) => {
        doc.fontSize(LEVEL_SIZE[line.level]).text(line.text);
        if (line.level === 'title' || line.level === 'detail') doc.moveDown(0.5);
        // Small gap before each service section (except the first line).
        if (line.level === 'section' && index > 0) doc.moveDown(0.3);
      });
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

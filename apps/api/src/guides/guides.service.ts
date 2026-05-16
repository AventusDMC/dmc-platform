import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type GuideInput = {
  fullName: string;
  languages?: string[] | string | null;
  certifications?: string[] | string | null;
  regions?: string[] | string | null;
  specialties?: string[] | string | null;
  email?: string | null;
  phone?: string | null;
  active?: boolean | null;
  guideType?: string | null;
  notes?: string | null;
};

type GuideBlockInput = {
  startDate: string;
  endDate: string;
  reason?: string | null;
};

@Injectable()
export class GuidesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.guide.findMany({
      include: {
        blockedDates: {
          orderBy: [{ startDate: 'asc' }],
        },
        bookingServices: {
          where: {
            status: { not: 'cancelled' as any },
          },
          select: {
            id: true,
            bookingId: true,
            description: true,
            serviceDate: true,
            pickupTime: true,
            startTime: true,
            guideConfirmationStatus: true,
            guideRequiredLanguages: true,
            booking: {
              select: {
                bookingRef: true,
              },
            },
          },
          orderBy: [{ serviceDate: 'asc' }, { createdAt: 'asc' }],
        },
      },
      orderBy: [{ active: 'desc' }, { fullName: 'asc' }],
    });
  }

  create(data: GuideInput) {
    const fullName = this.normalizeRequiredText(data.fullName, 'Guide full name is required');
    return this.prisma.guide.create({
      data: {
        fullName,
        languages: this.parseList(data.languages),
        certifications: this.parseList(data.certifications),
        regions: this.parseList(data.regions),
        specialties: this.parseList(data.specialties),
        email: this.normalizeOptionalText(data.email),
        phone: this.normalizeOptionalText(data.phone),
        active: data.active === undefined || data.active === null ? true : Boolean(data.active),
        guideType: this.normalizeGuideType(data.guideType),
        notes: this.normalizeOptionalText(data.notes),
      },
    });
  }

  async update(id: string, data: Partial<GuideInput>) {
    await this.assertGuide(id);
    return this.prisma.guide.update({
      where: { id },
      data: {
        fullName: data.fullName === undefined ? undefined : this.normalizeRequiredText(data.fullName, 'Guide full name is required'),
        languages: data.languages === undefined ? undefined : this.parseList(data.languages),
        certifications: data.certifications === undefined ? undefined : this.parseList(data.certifications),
        regions: data.regions === undefined ? undefined : this.parseList(data.regions),
        specialties: data.specialties === undefined ? undefined : this.parseList(data.specialties),
        email: data.email === undefined ? undefined : this.normalizeOptionalText(data.email),
        phone: data.phone === undefined ? undefined : this.normalizeOptionalText(data.phone),
        active: data.active === undefined || data.active === null ? undefined : Boolean(data.active),
        guideType: data.guideType === undefined ? undefined : this.normalizeGuideType(data.guideType),
        notes: data.notes === undefined ? undefined : this.normalizeOptionalText(data.notes),
      },
    });
  }

  async blockDate(guideId: string, data: GuideBlockInput) {
    await this.assertGuide(guideId);
    const startDate = this.normalizeDate(data.startDate, 'Block start date is required');
    const endDate = this.normalizeDate(data.endDate, 'Block end date is required');
    if (endDate.getTime() < startDate.getTime()) {
      throw new BadRequestException('Block end date must be after start date');
    }
    return this.prisma.guideBlockedDate.create({
      data: {
        guideId,
        startDate,
        endDate,
        reason: this.normalizeOptionalText(data.reason),
      },
    });
  }

  async availability(guideId: string) {
    const guide = await this.prisma.guide.findUnique({
      where: { id: guideId },
      include: {
        blockedDates: true,
        bookingServices: {
          where: {
            status: { not: 'cancelled' as any },
          },
          select: {
            id: true,
            bookingId: true,
            description: true,
            serviceDate: true,
            pickupTime: true,
            startTime: true,
            guideConfirmationStatus: true,
            booking: { select: { bookingRef: true } },
          },
        },
      },
    });
    if (!guide) throw new NotFoundException('Guide not found');
    const assignments = guide.bookingServices || [];
    return {
      guide,
      assignedBookings: assignments,
      blockedDates: guide.blockedDates,
      overlappingAssignments: this.findOverlaps(assignments),
      availabilityStatus: guide.active ? 'available' : 'inactive',
    };
  }

  private findOverlaps(assignments: Array<{ id: string; serviceDate: Date | null }>) {
    const byDate = new Map<string, Array<{ id: string; serviceDate: Date | null }>>();
    for (const assignment of assignments) {
      if (!assignment.serviceDate) continue;
      const key = assignment.serviceDate.toISOString().slice(0, 10);
      byDate.set(key, [...(byDate.get(key) || []), assignment]);
    }
    return [...byDate.values()].filter((entries) => entries.length > 1).flat();
  }

  private async assertGuide(id: string) {
    const guide = await this.prisma.guide.findUnique({ where: { id } });
    if (!guide) throw new NotFoundException('Guide not found');
    return guide;
  }

  private normalizeGuideType(value?: string | null) {
    const normalized = this.normalizeOptionalText(value)?.toLowerCase() || 'licensed';
    if (!['licensed', 'freelance', 'staff'].includes(normalized)) {
      throw new BadRequestException('Guide type must be licensed, freelance, or staff');
    }
    return normalized;
  }

  private normalizeDate(value: string | null | undefined, message: string) {
    if (!value) throw new BadRequestException(message);
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) throw new BadRequestException('Invalid date value');
    return parsed;
  }

  private normalizeRequiredText(value: string | null | undefined, message: string) {
    const normalized = this.normalizeOptionalText(value);
    if (!normalized) throw new BadRequestException(message);
    return normalized;
  }

  private normalizeOptionalText(value: string | null | undefined) {
    const normalized = String(value || '').trim();
    return normalized || null;
  }

  private parseList(value: string[] | string | null | undefined) {
    if (Array.isArray(value)) return value.map((entry) => this.normalizeOptionalText(entry)).filter(Boolean) as string[];
    return String(value || '')
      .split(/\r?\n|,/)
      .map((entry) => this.normalizeOptionalText(entry))
      .filter(Boolean) as string[];
  }
}

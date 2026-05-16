import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type RestaurantInput = {
  name: string;
  city?: string | null;
  region?: string | null;
  cuisineType?: string | null;
  capacity?: number | string | null;
  email?: string | null;
  phone?: string | null;
  mealTypes?: string[] | string | null;
  active?: boolean | null;
  indoor?: boolean | null;
  outdoor?: boolean | null;
  halalSupport?: boolean | null;
  vegetarianSupport?: boolean | null;
  veganSupport?: boolean | null;
  notes?: string | null;
};

@Injectable()
export class RestaurantsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.restaurant.findMany({
      include: {
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
            participantCount: true,
            adultCount: true,
            childCount: true,
            mealTiming: true,
            mealConfirmationStatus: true,
            mealDietaryRequirements: true,
            booking: { select: { bookingRef: true } },
          },
          orderBy: [{ serviceDate: 'asc' }, { createdAt: 'asc' }],
        },
      },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
  }

  create(data: RestaurantInput) {
    return this.prisma.restaurant.create({
      data: {
        name: this.normalizeRequiredText(data.name, 'Restaurant name is required'),
        city: this.normalizeOptionalText(data.city),
        region: this.normalizeOptionalText(data.region),
        cuisineType: this.normalizeOptionalText(data.cuisineType),
        capacity: this.normalizeCapacity(data.capacity),
        email: this.normalizeOptionalText(data.email),
        phone: this.normalizeOptionalText(data.phone),
        mealTypes: this.parseList(data.mealTypes),
        active: data.active === undefined || data.active === null ? true : Boolean(data.active),
        indoor: data.indoor === undefined || data.indoor === null ? true : Boolean(data.indoor),
        outdoor: data.outdoor === undefined || data.outdoor === null ? false : Boolean(data.outdoor),
        halalSupport: data.halalSupport === undefined || data.halalSupport === null ? false : Boolean(data.halalSupport),
        vegetarianSupport: data.vegetarianSupport === undefined || data.vegetarianSupport === null ? false : Boolean(data.vegetarianSupport),
        veganSupport: data.veganSupport === undefined || data.veganSupport === null ? false : Boolean(data.veganSupport),
        notes: this.normalizeOptionalText(data.notes),
      },
    });
  }

  async update(id: string, data: Partial<RestaurantInput>) {
    await this.assertRestaurant(id);
    return this.prisma.restaurant.update({
      where: { id },
      data: this.normalizeRestaurantData(data, true),
    });
  }

  async availability(id: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id },
      include: {
        bookingServices: {
          where: { status: { not: 'cancelled' as any } },
          select: {
            id: true,
            bookingId: true,
            description: true,
            serviceDate: true,
            participantCount: true,
            adultCount: true,
            childCount: true,
            mealTiming: true,
            mealConfirmationStatus: true,
            mealDietaryRequirements: true,
            booking: { select: { bookingRef: true } },
          },
        },
      },
    });
    if (!restaurant) throw new NotFoundException('Restaurant not found');

    const assignedBookings = restaurant.bookingServices || [];
    return {
      restaurant,
      assignedBookings,
      capacityConflicts: assignedBookings.filter((service) => this.getPax(service) > Number(restaurant.capacity || 0) && Number(restaurant.capacity || 0) > 0),
      availabilityStatus: restaurant.active ? 'available' : 'inactive',
    };
  }

  private normalizeRestaurantData(data: Partial<RestaurantInput>, partial: boolean) {
    return {
      name: data.name === undefined && partial ? undefined : this.normalizeRequiredText(data.name, 'Restaurant name is required'),
      city: data.city === undefined ? undefined : this.normalizeOptionalText(data.city),
      region: data.region === undefined ? undefined : this.normalizeOptionalText(data.region),
      cuisineType: data.cuisineType === undefined ? undefined : this.normalizeOptionalText(data.cuisineType),
      capacity: data.capacity === undefined ? undefined : this.normalizeCapacity(data.capacity),
      email: data.email === undefined ? undefined : this.normalizeOptionalText(data.email),
      phone: data.phone === undefined ? undefined : this.normalizeOptionalText(data.phone),
      mealTypes: data.mealTypes === undefined ? undefined : this.parseList(data.mealTypes),
      active: data.active === undefined || data.active === null ? (partial ? undefined : true) : Boolean(data.active),
      indoor: data.indoor === undefined || data.indoor === null ? (partial ? undefined : true) : Boolean(data.indoor),
      outdoor: data.outdoor === undefined || data.outdoor === null ? (partial ? undefined : false) : Boolean(data.outdoor),
      halalSupport: data.halalSupport === undefined || data.halalSupport === null ? (partial ? undefined : false) : Boolean(data.halalSupport),
      vegetarianSupport:
        data.vegetarianSupport === undefined || data.vegetarianSupport === null ? (partial ? undefined : false) : Boolean(data.vegetarianSupport),
      veganSupport: data.veganSupport === undefined || data.veganSupport === null ? (partial ? undefined : false) : Boolean(data.veganSupport),
      notes: data.notes === undefined ? undefined : this.normalizeOptionalText(data.notes),
    };
  }

  private getPax(service: { participantCount?: number | null; adultCount?: number | null; childCount?: number | null }) {
    return Number(service.participantCount || 0) || Number(service.adultCount || 0) + Number(service.childCount || 0) || 1;
  }

  private async assertRestaurant(id: string) {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id } });
    if (!restaurant) throw new NotFoundException('Restaurant not found');
    return restaurant;
  }

  private normalizeCapacity(value: number | string | null | undefined) {
    if (value === null || value === undefined || value === '') return null;
    const capacity = Number(value);
    if (!Number.isInteger(capacity) || capacity < 0) throw new BadRequestException('Restaurant capacity must be a non-negative integer');
    return capacity;
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

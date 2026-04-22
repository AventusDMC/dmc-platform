import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type QuoteBlockType = 'ITINERARY_DAY' | 'SERVICE_BLOCK';

type CreateQuoteBlockInput = {
  name: string;
  type: QuoteBlockType;
  title: string;
  description?: string | null;
  defaultServiceId?: string | null;
  defaultServiceTypeId?: string | null;
  defaultCategory?: string | null;
  defaultCost?: number | null;
  defaultSell?: number | null;
};

type UpdateQuoteBlockInput = Partial<CreateQuoteBlockInput>;

@Injectable()
export class QuoteBlocksService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(type?: string) {
    const normalizedType = type === undefined ? undefined : this.normalizeType(type);

    return this.prisma.quoteBlock.findMany({
      where: normalizedType ? { type: normalizedType } : undefined,
      include: {
        defaultService: {
          include: {
            serviceType: true,
          },
        },
        defaultServiceType: true,
      },
      orderBy: [{ type: 'asc' }, { name: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async create(data: CreateQuoteBlockInput) {
    await this.assertDefaultReferences({
      defaultServiceId: data.defaultServiceId,
      defaultServiceTypeId: data.defaultServiceTypeId,
    });

    return this.prisma.quoteBlock.create({
      data: {
        name: this.normalizeRequiredText(data.name, 'Block name'),
        type: this.normalizeType(data.type),
        title: this.normalizeRequiredText(data.title, 'Block title'),
        description: this.normalizeOptionalText(data.description),
        defaultServiceId: this.normalizeOptionalId(data.defaultServiceId),
        defaultServiceTypeId: this.normalizeOptionalId(data.defaultServiceTypeId),
        defaultCategory: this.normalizeOptionalText(data.defaultCategory),
        defaultCost: this.normalizeOptionalAmount(data.defaultCost, 'Default cost'),
        defaultSell: this.normalizeOptionalAmount(data.defaultSell, 'Default sell'),
      },
      include: {
        defaultService: {
          include: {
            serviceType: true,
          },
        },
        defaultServiceType: true,
      },
    });
  }

  async update(id: string, data: UpdateQuoteBlockInput) {
    const existing = await this.prisma.quoteBlock.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new BadRequestException('Quote block not found');
    }

    const nextDefaultServiceId =
      data.defaultServiceId === undefined ? existing.defaultServiceId : this.normalizeOptionalId(data.defaultServiceId);
    const nextDefaultServiceTypeId =
      data.defaultServiceTypeId === undefined
        ? existing.defaultServiceTypeId
        : this.normalizeOptionalId(data.defaultServiceTypeId);

    await this.assertDefaultReferences({
      defaultServiceId: nextDefaultServiceId,
      defaultServiceTypeId: nextDefaultServiceTypeId,
    });

    return this.prisma.quoteBlock.update({
      where: { id },
      data: {
        name: data.name === undefined ? undefined : this.normalizeRequiredText(data.name, 'Block name'),
        type: data.type === undefined ? undefined : this.normalizeType(data.type),
        title: data.title === undefined ? undefined : this.normalizeRequiredText(data.title, 'Block title'),
        description: data.description === undefined ? undefined : this.normalizeOptionalText(data.description),
        defaultServiceId: data.defaultServiceId === undefined ? undefined : nextDefaultServiceId,
        defaultServiceTypeId: data.defaultServiceTypeId === undefined ? undefined : nextDefaultServiceTypeId,
        defaultCategory: data.defaultCategory === undefined ? undefined : this.normalizeOptionalText(data.defaultCategory),
        defaultCost:
          data.defaultCost === undefined ? undefined : this.normalizeOptionalAmount(data.defaultCost, 'Default cost'),
        defaultSell:
          data.defaultSell === undefined ? undefined : this.normalizeOptionalAmount(data.defaultSell, 'Default sell'),
      },
      include: {
        defaultService: {
          include: {
            serviceType: true,
          },
        },
        defaultServiceType: true,
      },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.quoteBlock.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new BadRequestException('Quote block not found');
    }

    await this.prisma.quoteBlock.delete({
      where: { id },
    });

    return { id };
  }

  private normalizeType(value: string): QuoteBlockType {
    if (value === 'ITINERARY_DAY' || value === 'SERVICE_BLOCK') {
      return value;
    }

    throw new BadRequestException('Invalid quote block type');
  }

  private normalizeRequiredText(value: string, label: string) {
    const normalized = value?.trim();

    if (!normalized) {
      throw new BadRequestException(`${label} is required`);
    }

    return normalized;
  }

  private normalizeOptionalText(value?: string | null) {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private normalizeOptionalId(value?: string | null) {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private normalizeOptionalAmount(value: number | null | undefined, label: string) {
    if (value === undefined || value === null) {
      return null;
    }

    if (!Number.isFinite(value) || value < 0) {
      throw new BadRequestException(`${label} must be a valid positive number`);
    }

    return value;
  }

  private async assertDefaultReferences(data: { defaultServiceId?: string | null; defaultServiceTypeId?: string | null }) {
    const [service, serviceType] = await Promise.all([
      data.defaultServiceId
        ? this.prisma.supplierService.findUnique({
            where: { id: data.defaultServiceId },
            select: { id: true, serviceTypeId: true },
          })
        : Promise.resolve(null),
      data.defaultServiceTypeId
        ? this.prisma.serviceType.findUnique({
            where: { id: data.defaultServiceTypeId },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);

    if (data.defaultServiceId && !service) {
      throw new BadRequestException('Default service not found');
    }

    if (data.defaultServiceTypeId && !serviceType) {
      throw new BadRequestException('Default service type not found');
    }

    if (
      service &&
      data.defaultServiceTypeId &&
      service.serviceTypeId &&
      service.serviceTypeId !== data.defaultServiceTypeId
    ) {
      throw new BadRequestException('Default service does not belong to the selected service type');
    }
  }
}

import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type SupportTextTemplateType = 'inclusions' | 'exclusions' | 'terms_notes';

type CreateSupportTextTemplateInput = {
  title: string;
  templateType: SupportTextTemplateType;
  content: string;
};

type UpdateSupportTextTemplateInput = Partial<CreateSupportTextTemplateInput>;

@Injectable()
export class SupportTextTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(templateType?: string) {
    const normalizedType = templateType === undefined ? undefined : this.normalizeTemplateType(templateType);

    return this.prisma.supportTextTemplate.findMany({
      where: normalizedType ? { templateType: normalizedType } : undefined,
      orderBy: [{ templateType: 'asc' }, { title: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async create(data: CreateSupportTextTemplateInput) {
    return this.prisma.supportTextTemplate.create({
      data: {
        title: this.normalizeTitle(data.title),
        templateType: this.normalizeTemplateType(data.templateType),
        content: this.normalizeContent(data.content),
      },
    });
  }

  async update(id: string, data: UpdateSupportTextTemplateInput) {
    const existing = await this.prisma.supportTextTemplate.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new BadRequestException('Support text template not found');
    }

    return this.prisma.supportTextTemplate.update({
      where: { id },
      data: {
        title: data.title === undefined ? undefined : this.normalizeTitle(data.title),
        templateType: data.templateType === undefined ? undefined : this.normalizeTemplateType(data.templateType),
        content: data.content === undefined ? undefined : this.normalizeContent(data.content),
      },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.supportTextTemplate.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new BadRequestException('Support text template not found');
    }

    await this.prisma.supportTextTemplate.delete({
      where: { id },
    });

    return { id };
  }

  private normalizeTemplateType(value: string): SupportTextTemplateType {
    if (value === 'inclusions' || value === 'exclusions' || value === 'terms_notes') {
      return value;
    }

    throw new BadRequestException('Invalid support text template type');
  }

  private normalizeTitle(value: string) {
    const normalized = value?.trim();

    if (!normalized) {
      throw new BadRequestException('Template title is required');
    }

    return normalized;
  }

  private normalizeContent(value: string) {
    const normalized = value?.trim();

    if (!normalized) {
      throw new BadRequestException('Template content is required');
    }

    return normalized;
  }
}

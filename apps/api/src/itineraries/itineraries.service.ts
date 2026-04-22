import { BadRequestException, Injectable } from '@nestjs/common';
import { throwIfNotFound } from '../common/crud.helpers';
import { PrismaService } from '../prisma/prisma.service';

type CreateItineraryInput = {
  quoteId: string;
  dayNumber: number;
  title: string;
  description?: string;
};

type UpdateItineraryInput = Partial<CreateItineraryInput>;

type AttachItineraryImageInput = {
  itineraryId: string;
  galleryImageId: string;
  sortOrder?: number;
};

type UpdateItineraryImageInput = {
  galleryImageId?: string;
  sortOrder?: number;
};

@Injectable()
export class ItinerariesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(quoteId?: string) {
    return this.prisma.itinerary.findMany({
      where: quoteId ? { quoteId } : undefined,
      orderBy: {
        dayNumber: 'asc',
      },
    });
  }

  findOne(id: string) {
    return this.prisma.itinerary.findUnique({
      where: { id },
    });
  }

  async create(data: CreateItineraryInput) {
    const quote = await this.prisma.quote.findUnique({
      where: { id: data.quoteId },
    });

    if (!quote) {
      throw new BadRequestException('Quote not found');
    }

    return this.prisma.itinerary.create({
      data: {
        quoteId: data.quoteId,
        dayNumber: data.dayNumber,
        title: data.title,
        description: data.description || null,
      },
    });
  }

  async update(id: string, data: UpdateItineraryInput) {
    const itinerary = throwIfNotFound(await this.findOne(id), 'Itinerary');
    const quoteId = data.quoteId ?? itinerary.quoteId;

    const quote = await this.prisma.quote.findUnique({
      where: { id: quoteId },
    });

    if (!quote) {
      throw new BadRequestException('Quote not found');
    }

    if (quoteId !== itinerary.quoteId) {
      const linkedQuoteItems = await this.prisma.quoteItem.count({
        where: { itineraryId: id },
      });

      if (linkedQuoteItems > 0) {
        throw new BadRequestException('Cannot move itinerary because linked quote items exist');
      }
    }

    return this.prisma.itinerary.update({
      where: { id },
      data: {
        quoteId,
        dayNumber: data.dayNumber,
        title: data.title,
        description: data.description === undefined ? undefined : data.description || null,
      },
    });
  }

  async remove(id: string) {
    const itinerary = throwIfNotFound(await this.findOne(id), 'Itinerary');

    const linkedQuoteItems = await this.prisma.quoteItem.count({
      where: { itineraryId: id },
    });

    if (linkedQuoteItems > 0) {
      throw new BadRequestException(
        `Cannot delete itinerary because ${linkedQuoteItems} linked quote items ${linkedQuoteItems === 1 ? 'exists' : 'exist'}`,
      );
    }

    return this.prisma.itinerary.delete({
      where: { id: itinerary.id },
    });
  }

  findImages(itineraryId: string) {
    return this.prisma.itineraryImage.findMany({
      where: { itineraryId },
      include: {
        galleryImage: true,
      },
      orderBy: [
        {
          sortOrder: 'asc',
        },
        {
          id: 'asc',
        },
      ],
    });
  }

  async findImage(itineraryId: string, imageId: string) {
    const image = await this.prisma.itineraryImage.findFirst({
      where: {
        id: imageId,
        itineraryId,
      },
      include: {
        galleryImage: true,
      },
    });

    return throwIfNotFound(image, 'Itinerary image attachment');
  }

  async attachImage(data: AttachItineraryImageInput) {
    const [itinerary, galleryImage, imageCount] = await Promise.all([
      this.prisma.itinerary.findUnique({
        where: { id: data.itineraryId },
      }),
      this.prisma.galleryImage.findUnique({
        where: { id: data.galleryImageId },
      }),
      this.prisma.itineraryImage.count({
        where: { itineraryId: data.itineraryId },
      }),
    ]);

    if (!itinerary) {
      throw new BadRequestException('Itinerary not found');
    }

    if (!galleryImage) {
      throw new BadRequestException('Gallery image not found');
    }

    return this.prisma.itineraryImage.create({
      data: {
        itineraryId: data.itineraryId,
        galleryImageId: data.galleryImageId,
        sortOrder: data.sortOrder ?? imageCount,
      },
      include: {
        galleryImage: true,
      },
    });
  }

  async updateImage(itineraryId: string, imageId: string, data: UpdateItineraryImageInput) {
    await this.findImage(itineraryId, imageId);

    if (data.galleryImageId) {
      const galleryImage = await this.prisma.galleryImage.findUnique({
        where: { id: data.galleryImageId },
      });

      if (!galleryImage) {
        throw new BadRequestException('Gallery image not found');
      }
    }

    return this.prisma.itineraryImage.update({
      where: { id: imageId },
      data: {
        galleryImageId: data.galleryImageId,
        sortOrder: data.sortOrder,
      },
      include: {
        galleryImage: true,
      },
    });
  }

  async removeImage(itineraryId: string, imageId: string) {
    await this.findImage(itineraryId, imageId);

    return this.prisma.itineraryImage.delete({
      where: { id: imageId },
    });
  }
}

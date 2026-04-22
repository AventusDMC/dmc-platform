import { BadRequestException, Injectable } from '@nestjs/common';
import { blockDelete, throwIfNotFound } from '../common/crud.helpers';
import { PrismaService } from '../prisma/prisma.service';

type CreateGalleryImageInput = {
  title: string;
  imageUrl: string;
  destination?: string;
  category?: string;
};

type UpdateGalleryImageInput = Partial<CreateGalleryImageInput>;

@Injectable()
export class GalleryService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.galleryImage.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string) {
    const image = await this.prisma.galleryImage.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            itineraryImages: true,
          },
        },
      },
    });

    return throwIfNotFound(image, 'Gallery image');
  }

  create(data: CreateGalleryImageInput) {
    const title = data.title.trim();
    const imageUrl = data.imageUrl.trim();

    if (!title || !imageUrl) {
      throw new BadRequestException('Title and imageUrl are required');
    }

    return this.prisma.galleryImage.create({
      data: {
        title,
        imageUrl,
        destination: data.destination?.trim() || null,
        category: data.category?.trim() || null,
      },
    });
  }

  async update(id: string, data: UpdateGalleryImageInput) {
    await this.findOne(id);

    const title = data.title === undefined ? undefined : data.title.trim();
    const imageUrl = data.imageUrl === undefined ? undefined : data.imageUrl.trim();

    if (title !== undefined && !title) {
      throw new BadRequestException('Title is required');
    }

    if (imageUrl !== undefined && !imageUrl) {
      throw new BadRequestException('imageUrl is required');
    }

    return this.prisma.galleryImage.update({
      where: { id },
      data: {
        title,
        imageUrl,
        destination: data.destination === undefined ? undefined : data.destination?.trim() || null,
        category: data.category === undefined ? undefined : data.category?.trim() || null,
      },
    });
  }

  async remove(id: string) {
    const image = await this.findOne(id);

    blockDelete('gallery image', 'itinerary image attachments', image._count.itineraryImages);

    return this.prisma.galleryImage.delete({
      where: { id },
    });
  }
}

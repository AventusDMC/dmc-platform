import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { ItinerariesService } from './itineraries.service';

type CreateItineraryBody = {
  quoteId: string;
  dayNumber: number;
  title: string;
  description?: string;
};

type UpdateItineraryBody = Partial<CreateItineraryBody>;

type AttachItineraryImageBody = {
  galleryImageId: string;
  sortOrder?: number;
};

type UpdateItineraryImageBody = Partial<AttachItineraryImageBody>;

@Controller('itineraries')
export class ItinerariesController {
  constructor(private readonly itinerariesService: ItinerariesService) {}

  @Get()
  findAll(@Query('quoteId') quoteId?: string) {
    return this.itinerariesService.findAll(quoteId);
  }

  @Post()
  create(@Body() body: CreateItineraryBody) {
    return this.itinerariesService.create({
      ...body,
      dayNumber: Number(body.dayNumber),
    });
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: UpdateItineraryBody) {
    const itinerary = await this.itinerariesService.findOne(id);

    if (!itinerary) {
      throw new NotFoundException('Itinerary not found');
    }

    return this.itinerariesService.update(id, {
      quoteId: body.quoteId,
      dayNumber: body.dayNumber === undefined ? undefined : Number(body.dayNumber),
      title: body.title,
      description: body.description,
    });
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const itinerary = await this.itinerariesService.findOne(id);

    if (!itinerary) {
      throw new NotFoundException('Itinerary not found');
    }

    return this.itinerariesService.remove(id);
  }

  @Get(':id/images')
  async findImages(@Param('id') id: string) {
    const itinerary = await this.itinerariesService.findOne(id);

    if (!itinerary) {
      throw new NotFoundException('Itinerary not found');
    }

    return this.itinerariesService.findImages(id);
  }

  @Post(':id/images')
  async attachImage(@Param('id') id: string, @Body() body: AttachItineraryImageBody) {
    const itinerary = await this.itinerariesService.findOne(id);

    if (!itinerary) {
      throw new NotFoundException('Itinerary not found');
    }

    return this.itinerariesService.attachImage({
      itineraryId: id,
      galleryImageId: body.galleryImageId,
      sortOrder: body.sortOrder === undefined ? undefined : Number(body.sortOrder),
    });
  }

  @Patch(':id/images/:imageId')
  async updateImage(
    @Param('id') id: string,
    @Param('imageId') imageId: string,
    @Body() body: UpdateItineraryImageBody,
  ) {
    const itinerary = await this.itinerariesService.findOne(id);

    if (!itinerary) {
      throw new NotFoundException('Itinerary not found');
    }

    return this.itinerariesService.updateImage(id, imageId, {
      galleryImageId: body.galleryImageId,
      sortOrder: body.sortOrder === undefined ? undefined : Number(body.sortOrder),
    });
  }

  @Delete(':id/images/:imageId')
  async removeImage(@Param('id') id: string, @Param('imageId') imageId: string) {
    const itinerary = await this.itinerariesService.findOne(id);

    if (!itinerary) {
      throw new NotFoundException('Itinerary not found');
    }

    return this.itinerariesService.removeImage(id, imageId);
  }
}

import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { GalleryService } from './gallery.service';

type CreateGalleryImageBody = {
  title: string;
  imageUrl: string;
  destination?: string;
  category?: string;
};

type UpdateGalleryImageBody = Partial<CreateGalleryImageBody>;

@Controller('gallery')
export class GalleryController {
  constructor(private readonly galleryService: GalleryService) {}

  @Get()
  findAll() {
    return this.galleryService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.galleryService.findOne(id);
  }

  @Post()
  create(@Body() body: CreateGalleryImageBody) {
    return this.galleryService.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateGalleryImageBody) {
    return this.galleryService.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.galleryService.remove(id);
  }
}

import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { SupportTextTemplatesService } from './support-text-templates.service';

type SupportTextTemplateBody = {
  title: string;
  templateType: 'inclusions' | 'exclusions' | 'terms_notes';
  content: string;
};

@Controller('support-text-templates')
export class SupportTextTemplatesController {
  constructor(private readonly supportTextTemplatesService: SupportTextTemplatesService) {}

  @Get()
  findAll(@Query('templateType') templateType?: string) {
    return this.supportTextTemplatesService.findAll(templateType);
  }

  @Post()
  create(@Body() body: SupportTextTemplateBody) {
    return this.supportTextTemplatesService.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Partial<SupportTextTemplateBody>) {
    return this.supportTextTemplatesService.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.supportTextTemplatesService.remove(id);
  }
}

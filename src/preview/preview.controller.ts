import { Controller, Post, Get, Delete, Param, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PreviewService } from './preview.service';
import { CreatePreviewDto } from './dto/create-preview.dto';
import { PreviewResponseDto } from './dto/preview-response.dto';

@ApiTags('Preview')
@Controller('preview/backends')
export class PreviewController {
  constructor(private readonly previewService: PreviewService) {}

  @Post()
  @ApiOperation({ summary: 'Create a preview backend for a Tenderly Virtual TestNet' })
  @ApiResponse({ status: 201, type: PreviewResponseDto })
  @ApiResponse({ status: 404, description: 'Tenderly vnet not found in the organization' })
  @ApiResponse({ status: 400, description: 'Network not supported' })
  @ApiResponse({ status: 409, description: 'Preview creation already in progress' })
  async create(@Body() dto: CreatePreviewDto): Promise<PreviewResponseDto> {
    return this.previewService.create(dto.tenderlyId);
  }

  @Get(':tenderlyId')
  @ApiOperation({ summary: 'Get status of a preview backend' })
  @ApiResponse({ status: 200, type: PreviewResponseDto })
  @ApiResponse({ status: 404, description: 'Preview backend not found' })
  async getStatus(@Param('tenderlyId') tenderlyId: string): Promise<PreviewResponseDto> {
    return this.previewService.getStatus(tenderlyId);
  }

  @Delete(':tenderlyId')
  @ApiOperation({ summary: 'Delete a preview backend' })
  @ApiResponse({ status: 200, description: 'Preview backend deleted' })
  @ApiResponse({ status: 404, description: 'Preview backend not found' })
  async delete(@Param('tenderlyId') tenderlyId: string): Promise<void> {
    return this.previewService.delete(tenderlyId);
  }
}

import { Controller, Post, Get, Delete, Param, Body } from '@nestjs/common';
import { CacheTTL } from '@nestjs/cache-manager';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { PreviewService } from './preview.service';
import { CreatePreviewDto } from './dto/create-preview.dto';
import { PreviewResponseDto } from './dto/preview-response.dto';

const previewResponseSchema: SchemaObject = {
  type: 'object',
  properties: {
    url: { type: 'string', example: 'https://carbon-prev-d64732df.fly.dev' },
    status: { type: 'string', enum: ['existing', 'creating', 'seeding', 'ready', 'error'] },
    deployment: { type: 'string', example: 'ethereum' },
    forkBlock: { type: 'number', example: 24677999 },
    currentBlock: { type: 'number', example: 24678050, nullable: true },
    rpcUrl: { type: 'string', example: 'https://rpc.vnet.tenderly.co/...' },
    createdAt: { type: 'string', example: '2026-03-23T10:00:00.000Z' },
  },
};

@ApiTags('Preview')
@Controller('preview/backends')
export class PreviewController {
  constructor(private readonly previewService: PreviewService) {}

  @Post()
  @ApiOperation({ summary: 'Create a preview backend for a Tenderly Virtual TestNet' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['tenderlyId'],
      properties: {
        tenderlyId: {
          type: 'string',
          description: 'Tenderly Virtual TestNet ID',
          example: 'd64732df-58d7-48c5-9408-71e77cfe99a4',
        },
      },
    },
  })
  @ApiResponse({ status: 201, schema: previewResponseSchema })
  @ApiResponse({ status: 404, description: 'Tenderly vnet not found in the organization' })
  @ApiResponse({ status: 400, description: 'Network not supported' })
  @ApiResponse({ status: 409, description: 'Preview creation already in progress' })
  async create(@Body() dto: CreatePreviewDto): Promise<PreviewResponseDto> {
    return this.previewService.create(dto.tenderlyId);
  }

  @Get(':tenderlyId')
  @CacheTTL(1000)
  @ApiOperation({ summary: 'Get status of a preview backend' })
  @ApiResponse({ status: 200, schema: previewResponseSchema })
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

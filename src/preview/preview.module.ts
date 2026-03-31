import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PreviewBackend } from './preview-backend.entity';
import { PreviewService } from './preview.service';
import { PreviewController } from './preview.controller';
import { TenderlyClient } from './tenderly.client';
import { GceProvider } from './gce.client';

@Module({
  imports: [TypeOrmModule.forFeature([PreviewBackend])],
  controllers: [PreviewController],
  providers: [PreviewService, TenderlyClient, GceProvider],
})
export class PreviewModule {}

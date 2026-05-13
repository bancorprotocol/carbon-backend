import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PreviewBackend } from './preview-backend.entity';
import { PreviewService } from './preview.service';
import { PreviewController } from './preview.controller';
import { PreviewProxyController } from './preview-proxy.controller';
import { TenderlyClient } from './tenderly.client';
import { GceProvider } from './gce.client';

@Module({
  imports: [TypeOrmModule.forFeature([PreviewBackend])],
  controllers: [PreviewController, PreviewProxyController],
  providers: [PreviewService, TenderlyClient, GceProvider],
})
export class PreviewModule {}

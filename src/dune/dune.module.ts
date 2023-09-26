import { Module } from '@nestjs/common';
import { DuneProvider } from './dune.provider';
import { ConfigService } from '@nestjs/config';
import { DuneService } from './dune.service';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [HttpModule],
  providers: [DuneProvider, ConfigService, DuneService],
  exports: [DuneProvider, DuneService],
})
export class DuneModule {}

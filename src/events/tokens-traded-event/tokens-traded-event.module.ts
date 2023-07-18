import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HarvesterModule } from '../../harvester/harvester.module';
import { TokensTradedEvent } from './tokens-traded-event.entity';
import { TokensTradedEventService } from './tokens-traded-event.service';

@Module({
  imports: [TypeOrmModule.forFeature([TokensTradedEvent]), HarvesterModule],
  providers: [ConfigService, TokensTradedEventService],
  exports: [
    TokensTradedEventService,
    TypeOrmModule.forFeature([TokensTradedEvent]),
  ],
})
export class TokensTradedEventModule {}

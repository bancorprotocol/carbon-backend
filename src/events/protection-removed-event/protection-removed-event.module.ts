import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProtectionRemovedEvent } from './protection-removed-event.entity';
import { ProtectionRemovedEventService } from './protection-removed-event.service';
import { HarvesterModule } from '../../harvester/harvester.module';

@Module({
  imports: [TypeOrmModule.forFeature([ProtectionRemovedEvent]), HarvesterModule],
  providers: [ProtectionRemovedEventService],
  exports: [ProtectionRemovedEventService],
})
export class ProtectionRemovedEventModule {}

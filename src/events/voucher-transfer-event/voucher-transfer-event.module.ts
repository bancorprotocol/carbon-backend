import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HarvesterModule } from '../../harvester/harvester.module';
import { VoucherTransferEvent } from './voucher-transfer-event.entity';
import { VoucherTransferEventService } from './voucher-transfer-event.service';

@Module({
  imports: [TypeOrmModule.forFeature([VoucherTransferEvent]), HarvesterModule],
  providers: [ConfigService, VoucherTransferEventService],
  exports: [VoucherTransferEventService, TypeOrmModule.forFeature([VoucherTransferEvent])],
})
export class VoucherTransferEventModule {}

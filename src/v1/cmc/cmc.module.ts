import { Module } from '@nestjs/common';
import { CmcController } from './cmc.controller';
import { StrategyModule } from '../../strategy/strategy.module';
import { TokensTradedEventModule } from 'src/events/tokens-traded-event/tokens-traded-event.module';

@Module({
  imports: [StrategyModule, TokensTradedEventModule],
  controllers: [CmcController],
})
export class CmcModule {}

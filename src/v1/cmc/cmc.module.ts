import { Module } from '@nestjs/common';
import { CmcController } from './cmc.controller';
import { StrategyModule } from '../../strategy/strategy.module';
import { TokensTradedEventModule } from '../../events/tokens-traded-event/tokens-traded-event.module';
import { PairModule } from '../../pair/pair.module';
import { DeploymentModule } from '../../deployment/deployment.module';

@Module({
  imports: [StrategyModule, TokensTradedEventModule, PairModule, DeploymentModule],
  controllers: [CmcController],
})
export class CmcModule {}

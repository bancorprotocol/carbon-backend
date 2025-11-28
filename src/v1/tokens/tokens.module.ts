import { Module } from '@nestjs/common';
import { TokensController } from './tokens.controller';
import { TokenModule } from '../../token/token.module';
import { DeploymentModule } from '../../deployment/deployment.module';
import { QuoteModule } from '../../quote/quote.module';
import { StrategyModule } from '../../strategy/strategy.module';
import { BlockModule } from '../../block/block.module';

@Module({
  imports: [TokenModule, DeploymentModule, QuoteModule, StrategyModule, BlockModule],
  controllers: [TokensController],
})
export class TokensModule {}

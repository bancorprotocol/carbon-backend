import { Module } from '@nestjs/common';
import { CodexService } from './codex.service';
import { ConfigModule } from '@nestjs/config';
import { DeploymentModule } from 'src/deployment/deployment.module';

@Module({
  imports: [ConfigModule, DeploymentModule],
  providers: [CodexService],
  exports: [CodexService],
})
export class CodexModule {}

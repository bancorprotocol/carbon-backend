import { Module } from '@nestjs/common';
import { CodexService } from './codex.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
  providers: [CodexService],
  exports: [CodexService],
})
export class CodexModule {}

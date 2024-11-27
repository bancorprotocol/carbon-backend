import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CodexService } from './codex.service';
import { CodexToken } from './codex-token.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CodexToken])],
  providers: [CodexService],
  exports: [CodexService],
})
export class CodexModule {}

import { Module } from '@nestjs/common';
import { RedisProvider } from './redis.provider';
import { ConfigService } from '@nestjs/config';

@Module({
  providers: [RedisProvider, ConfigService],
  exports: [RedisProvider],
})
export class RedisModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheInterceptor, CacheModule } from '@nestjs/cache-manager';
import { LastProcessedBlockModule } from './last-processed-block/last-processed-block.module';
import { BlockModule } from './block/block.module';
import { RedisModule } from './redis/redis.module';
import { ScheduleModule } from '@nestjs/schedule';
import { HarvesterModule } from './harvester/harvester.module';
import { UpdaterModule } from './updater/updater.module';
import { PairCreatedEventModule } from './events/pair-created-event/pair-created-event.module';
import { StrategyCreatedEventModule } from './events/strategy-created-event/strategy-created-event.module';
import { PairModule } from './pair/pair.module';
import { TokenModule } from './token/token.module';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { redisStore } from 'cache-manager-redis-yet';
import { V1Module } from './v1/v1.module';
import { HistoricQuoteModule } from './historic-quote/historic-quote.module';
import { ActivityModule } from './activity/activity.module';
import { VolumeModule } from './volume/volume.module';
import { TvlModule } from './tvl/tvl.module';
import { DeploymentModule } from './deployment/deployment.module';
import { CodexService } from './codex/codex.service';
import { CodexModule } from './codex/codex.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService): Promise<any> => {
        let ssl: any;
        const dbSync = configService.get('DB_SYNC') === '1' ? true : false;
        if (process.env.NODE_ENV === 'production') {
          ssl = {
            ca: configService.get('CARBON_BACKEND_SQL_CERTIFICATION'),
            ciphers: [
              'ECDHE-RSA-AES128-SHA256',
              'DHE-RSA-AES128-SHA256',
              'AES128-GCM-SHA256',
              '!RC4', // RC4 be gone
              'HIGH',
              '!MD5',
              '!aNULL',
            ].join(':'),
            honorCipherOrder: true,
          };
        }

        return {
          type: 'postgres',
          url: configService.get('DATABASE_URL'),
          entities: [__dirname + '/**/*.entity.js'],
          migrations: [__dirname + '/migrations/*.js'],
          cli: {
            migrationsDir: 'migrations',
          },
          synchronize: dbSync,
          ssl,
          // logging: true,
        };
      },
    }),
    CacheModule.registerAsync({
      imports: [ConfigModule],
      isGlobal: true,
      useFactory: async (configService: ConfigService) => {
        if (process.env.NODE_ENV === 'development') {
          return {
            ttl: 0, // Set TTL to 0 to effectively disable caching
          };
        }
        return {
          store: await redisStore({
            url: configService.get('REDIS_URL'),
          }),
          ttl: 300,
        };
      },
      inject: [ConfigService],
    }),
    ScheduleModule.forRoot(),
    RedisModule,
    LastProcessedBlockModule,
    BlockModule,
    HarvesterModule,
    PairCreatedEventModule,
    StrategyCreatedEventModule,
    PairModule,
    TokenModule,
    UpdaterModule,
    V1Module,
    HistoricQuoteModule,
    ActivityModule,
    VolumeModule,
    TvlModule,
    DeploymentModule,
    CodexModule,
  ],

  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: CacheInterceptor,
    },
    CodexService,
  ],
})
export class AppModule {}

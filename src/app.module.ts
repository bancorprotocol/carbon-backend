import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheInterceptor, CacheModule } from '@nestjs/cache-manager';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { LastProcessedBlockModule } from './last-processed-block/last-processed-block.module';
import { BlockModule } from './block/block.module';
import { RedisModule } from './redis/redis.module';
import { ScheduleModule } from '@nestjs/schedule';
import { HarvesterModule } from './harvester/harvester.module';
import { UpdaterModule } from './updater/updater.module';
import { PairCreatedEventModule } from './events/pair-created-event /pair-created-event.module';
import { StrategyCreatedEventModule } from './events/strategy-created-event/strategy-created-event.module';
import { PairModule } from './pair/pair.module';
import { TokenModule } from './token/token.module';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { redisStore } from 'cache-manager-redis-yet';
import { V1Module } from './v1/v1.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService): Promise<any> => {
        let url: string;
        let ssl: any;
        const dbSync = configService.get('DB_SYNC') === '1' ? true : false;
        if (process.env.NODE_ENV === 'production') {
          const secrets = new SecretManagerServiceClient();
          let [version] = await secrets.accessSecretVersion({
            name: configService.get('CARBON_SQL_URL'),
          });
          url = version.payload.data.toString();
          [version] = await secrets.accessSecretVersion({
            name: configService.get('CARBON_SQL_CERTIFICATION'),
          });
          ssl = {
            ca: version.payload.data.toString(),
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
        } else {
          url = configService.get('CARBON_SQL_URL');
        }
        return {
          type: 'postgres',
          url,
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
      useFactory: async (configService: ConfigService) => ({
        store: await redisStore({
          url: configService.get('CARBON_REDIS_URL'),
        }),
      }),
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
  ],

  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: CacheInterceptor,
    },
  ],
})
export class AppModule {}

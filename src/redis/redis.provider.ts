import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const RedisProvider = {
  provide: 'REDIS',
  useFactory: async (configService: ConfigService): Promise<any> => {
    const client: any = new Redis(configService.get('REDIS_URL'));
    return { client };
  },
  inject: [ConfigService],
};

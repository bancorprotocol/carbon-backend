import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

const ssl =
  process.env.DATABASE_SSL_ENABLED && process.env.DATABASE_SSL_ENABLED === '1'
    ? {
        ca: process.env.CARBON_BACKEND_SQL_CERTIFICATION,
        ciphers: [
          'ECDHE-RSA-AES128-SHA256',
          'DHE-RSA-AES128-SHA256',
          'AES128-GCM-SHA256',
          '!RC4',
          'HIGH',
          '!MD5',
          '!aNULL',
        ].join(':'),
        honorCipherOrder: true,
      }
    : null;

export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: ['**/*.entity.ts'],
  migrations: ['dist/migrations/*.js'],
  ssl,
  synchronize: false,
});

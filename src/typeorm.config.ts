import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: ['**/*.entity.ts'], // Adjust the path to your entities
  migrations: ['dist/migrations/*.js'], // Path to compiled migration files
});

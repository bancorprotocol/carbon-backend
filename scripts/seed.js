/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable @typescript-eslint/no-var-requires */
const { exec } = require('child_process');
const { Client } = require('pg');
const cliProgress = require('cli-progress');
require('dotenv').config({ path: '.env' });

const pgPath = '/opt/homebrew/opt/postgresql@16/bin/';
process.env.PATH = `${pgPath}:${process.env.PATH}`;

async function importExternalDatabase() {
  try {
    console.log('Starting database import...');
    const externalDbConfig = {
      username: process.env.EXTERNAL_DATABASE_USERNAME,
      password: process.env.EXTERNAL_DATABASE_PASSWORD,
      host: process.env.EXTERNAL_DATABASE_HOST,
      database: process.env.EXTERNAL_DATABASE_NAME,
    };

    const localDb = process.env.DATABASE_NAME;
    const pgClient = new Client({
      user: process.env.DATABASE_USERNAME,
      host: process.env.DATABASE_HOST,
      database: 'postgres',
      password: process.env.DATABASE_PASSWORD,
    });

    await pgClient.connect();
    console.log('Dropping existing local database if it exists...', localDb);
    await pgClient.query(`DROP DATABASE IF EXISTS "${localDb}"`);
    console.log('Creating new local database...');
    await pgClient.query(`CREATE DATABASE "${localDb}"`);
    await pgClient.end();

    console.log('Importing external database...');
    const externalDumpStructureCommand = `PGPASSWORD="${externalDbConfig.password}" ${pgPath}/pg_dump -U ${externalDbConfig.username} -h ${externalDbConfig.host} -p 27140 -d "${externalDbConfig.database}" --schema-only`;
    console.log(externalDumpStructureCommand);
    const localRestoreStructureCommand = `PGPASSWORD="${process.env.DATABASE_PASSWORD}" ${pgPath}/psql -U ${process.env.DATABASE_USERNAME} -h ${process.env.DATABASE_HOST} -d "${localDb}"`;
    await execPgCommand(externalDumpStructureCommand, localRestoreStructureCommand);

    const excludedTables = ['public."historic-quotes"', '_timescaledb_internal."_hyper_1_*"'];
    const excludeTablesFlags = excludedTables.map((table) => `--exclude-table-data=${table}`).join(' ');
    const externalDumpDataCommand = `PGPASSWORD="${externalDbConfig.password}" ${pgPath}/pg_dump -U ${externalDbConfig.username} -h ${externalDbConfig.host} -p 27140 -d ${externalDbConfig.database} ${excludeTablesFlags} --data-only`;
    const localRestoreDataCommand = `PGPASSWORD="${process.env.DATABASE_PASSWORD}" ${pgPath}/psql -U ${process.env.DATABASE_USERNAME} -h ${process.env.DATABASE_HOST} -d ${localDb}`;
    console.log(externalDumpDataCommand);

    await execPgCommand(externalDumpDataCommand, localRestoreDataCommand);

    console.log('External database imported successfully.');
  } catch (error) {
    console.error('Error importing external database:', error);
  }
}

function execPgCommand(dumpCommand, restoreCommand) {
  return new Promise((resolve, reject) => {
    const bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
    bar.start(100, 0);

    let progress = 0;
    const interval = setInterval(() => {
      if (progress < 90) {
        progress += 1;
        bar.update(progress);
      }
    }, 1000);

    const child = exec(`${dumpCommand} | ${restoreCommand}`, {
      env: process.env,
    });

    // Suppress unwanted output
    child.stdout.on('data', () => {});
    child.stderr.on('data', () => {});

    child.on('exit', (code) => {
      clearInterval(interval);
      bar.update(100);
      bar.stop();

      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Process exited with code ${code}`));
      }
    });
  });
}

importExternalDatabase();

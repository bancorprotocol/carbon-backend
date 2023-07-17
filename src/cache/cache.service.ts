import { Inject, Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { Pair } from '../pair/pair.entity';
import { Block } from '../block/block.entity';

export enum GroupBy {
  Pair = 'poolId',
  PoolCollection = 'poolCollectionId',
}

export enum Expiries {
  DAY = 86400,
  WEEK = 604800,
  MONTH = 2629800,
}

export enum GlobalCacheKeys {
  lastProcessedBlock = 'lastProcessedBlock',
}

interface SetSumDurationByPoolArgs {
  repository?: Repository<unknown>;
  table: string;
  fromInterval: string;
  toInterval: string;
  name?: string;
  additionalFields?: AddiotionalField[];
  expirySeconds?: number;
  includeTkn?: boolean;
  aggregates?: string[];
  field?: string;
  where?: string;
  groupByPool?: boolean;
}

interface SumDurationByPool {
  [poolId: number]: string;
}

interface Filter {
  column: string;
  value: any;
}

interface GetValuesArgs {
  pairs?: Pair[];
  keys: string[];
  pipe?: unknown;
  field?: string;
  symbolize?: boolean;
  includeTkn?: boolean;
}

interface setLatestValuesFromDbArgs {
  groupBy?: GroupBy;
  distinct?: boolean;
  expirySeconds?: number;
  toInterval?: string;
  repository?: Repository<unknown>;
  field?: string;
  symbolize?: boolean;
  includeTkn?: boolean;
  additionalFields?: AddiotionalField[];
  name?: string;
  exclude?: Filter;
  include?: Filter;
  aggregates?: string[];
}

interface FetchLatestValuesFromDbArgs {
  distinct: boolean;
  toInterval: string;
  repository: Repository<unknown>;
  groupBy: GroupBy;
  symbolize?: boolean;
  includeTkn?: boolean;
  exclude?: Filter;
  include?: Filter;
  field?: string;
}

interface AddiotionalField {
  field: string;
  name: string;
}

const QUERY_INTERVAL_PADDING = '1 month';

const getLatestValueKey = (
  entity: string,
  row: unknown,
  groupBy: string,
  name: string,
  symbol: string,
): string => {
  let key;
  if (groupBy) {
    key = `v3:${entity}:${row[groupBy]}:${name}`;
  } else {
    key = `v3:${name}`;
  }
  if (symbol) {
    key += `:${symbol}`;
  }
  return key;
};

@Injectable()
export class CacheService {
  constructor(
    private configService: ConfigService,
    @Inject('REDIS') private redis: any,
  ) {}

  // sum duration by pair
  async setSumDurationByPool(args: SetSumDurationByPoolArgs): Promise<void> {
    const {
      table,
      fromInterval,
      toInterval,
      additionalFields,
      includeTkn,
      repository,
      name,
      expirySeconds,
      aggregates,
      where,
      groupByPool,
      field,
    } = args;
    const symbols = this.getSymbols(includeTkn);
    const pipe = this.getPipe();
    const query = await this.sumDurationByPoolQuery(
      additionalFields,
      table,
      fromInterval,
      toInterval,
      field,
      includeTkn,
      where,
      groupByPool,
    );
    const data = await repository.query(query);

    data.forEach((d) => {
      const keyPrefix = groupByPool === false ? 'v3' : `v3:pair:${d.poolId}`;

      symbols.forEach((s) => {
        const column = field ? `${field}_${s.symbol}` : s.symbol;
        const key = `${keyPrefix}:${name}:${s.symbol}`;
        pipe.set(key, d[column]);
        if (expirySeconds) {
          pipe.expire(key, expirySeconds);
        }
      });

      if (additionalFields) {
        additionalFields.forEach((f) => {
          symbols.forEach((s) => {
            const key = `${keyPrefix}:${f.name}:${s.symbol}`;
            const column = `${f.field}_${s.symbol}`;
            pipe.set(key, d[column]);
            if (expirySeconds) {
              pipe.expire(key, expirySeconds);
            }
          });
        });
      }
    });

    if (aggregates) {
      this.proccessAggregates(data, pipe, args);
    }

    await this.exectuePipe(pipe);
  }

  sumDurationByPoolQuery(
    additionalFields: AddiotionalField[],
    table: string,
    fromInterval: string,
    toInterval: string,
    field: string,
    includeTkn?: boolean,
    where?: string,
    groupByPool = true,
  ): string {
    const symbols = this.getSymbols(includeTkn);
    let query = 'SELECT ';
    if (groupByPool) {
      query += '"poolId",';
    }

    symbols.forEach((s) => {
      const column = field ? `"${field}_${s.symbol}"` : `"${s.symbol}"`;
      query += `sum(${column}::decimal) AS ${column},`;
    });

    if (additionalFields) {
      additionalFields.forEach((f) => {
        symbols.forEach((s) => {
          const column = `"${f.field}_${s.symbol}"`;
          query += `sum(${column}::decimal) AS ${column},`;
        });
      });
    }

    query = `${query.slice(0, -1)} `;
    query += `FROM ${table} `;
    query += `WHERE "timestamp" >= NOW() - INTERVAL '${fromInterval}' `;
    query += `AND "timestamp" <= NOW() - INTERVAL '${toInterval}' `;
    if (where) {
      query += `AND ${where} `;
    }

    if (groupByPool) {
      query += `GROUP BY "poolId"`;
    }

    return query;
  }
  // latest values from db
  async setLatestValuesFromDb(args: setLatestValuesFromDbArgs): Promise<void> {
    const {
      toInterval,
      includeTkn,
      repository,
      name,
      expirySeconds,
      field,
      symbolize,
      additionalFields,
      exclude,
      include,
      groupBy,
      distinct,
      aggregates,
    } = args;
    const symbols = this.getSymbols(includeTkn);
    const pipe = this.getPipe();
    const rows = await this.fetchLatestValuesFromDb({
      toInterval,
      includeTkn,
      symbolize,
      field,
      repository,
      exclude,
      include,
      groupBy,
      distinct,
    });

    rows.forEach((row) => {
      const entity = groupBy ? groupBy.replace('Id', '') : null;
      if (symbolize) {
        symbols.forEach((s) => {
          const column = field ? `${field}_${s.symbol}` : s.symbol;

          const key = getLatestValueKey(entity, row, groupBy, name, s.symbol);
          pipe.set(key, row[column]);
          if (expirySeconds) {
            pipe.expire(key, expirySeconds);
          }
        });

        if (additionalFields) {
          additionalFields.forEach((f) => {
            symbols.forEach((s) => {
              const key = getLatestValueKey(
                entity,
                row,
                groupBy,
                f.name,
                s.symbol,
              );
              const column = `${f.field}_${s.symbol}`;
              pipe.set(key, row[column]);
              if (expirySeconds) {
                pipe.expire(key, expirySeconds);
              }
            });
          });
        }
      } else {
        const key = getLatestValueKey(entity, row, groupBy, name, undefined);
        pipe.set(key, row[field]);
        if (expirySeconds) {
          pipe.expire(key, expirySeconds);
        }
      }
    });

    if (aggregates) {
      this.proccessAggregates(rows, pipe, args);
    }

    await this.exectuePipe(pipe);
  }

  fetchLatestValuesFromDb(args: FetchLatestValuesFromDbArgs): Promise<any[]> {
    const {
      toInterval,
      includeTkn,
      symbolize,
      field,
      repository,
      exclude,
      include,
      groupBy,
      distinct,
    } = args;
    const symbols = this.getSymbols(includeTkn);
    let sqlFriendlyEntity;

    const fields = ['block.id'];

    if (symbolize) {
      const prefix = field ? `${field}_` : '';
      symbols.forEach((s) => fields.push(`"${prefix + s.symbol}"`));
    }
    if (toInterval) {
      fields.push('"d"."timestamp"');
    }
    if (field) {
      fields.push(`"d"."${field}"`);
    }
    if (groupBy) {
      sqlFriendlyEntity = `"d"."${groupBy}"`;
      fields.push(sqlFriendlyEntity);
    }

    const data = repository.createQueryBuilder('d').select(fields);
    data.leftJoinAndSelect('d.block', 'block');

    if (distinct) {
      data.distinctOn([sqlFriendlyEntity]);
    }

    if (toInterval) {
      data
        .where(
          `"d"."timestamp" > now() - INTERVAL '${toInterval}' - INTERVAL '${QUERY_INTERVAL_PADDING}'`,
        )
        .andWhere(`"d"."timestamp" <= now() - INTERVAL '${toInterval}'`);
      if (groupBy) {
        data.orderBy(`${sqlFriendlyEntity}, "d"."timestamp"`, 'DESC');
      }
    } else if (groupBy) {
      data.orderBy(`${sqlFriendlyEntity}, block.id`, 'DESC');
    }

    if (exclude) {
      data.andWhere(`"d"."${exclude.column}" != '${exclude.value}'`);
    }
    if (include) {
      data.andWhere(`"d"."${include.column}" = '${include.value}'`);
    }

    return data.execute();
  }

  proccessAggregates(
    data: unknown[],
    pipe: unknown,
    args: setLatestValuesFromDbArgs | SetSumDurationByPoolArgs,
  ): void {
    const { includeTkn, expirySeconds, field, additionalFields, aggregates } =
      args;
    // create totals object
    const prepareColumn = (field, s) =>
      field ? `${field}_${s.symbol}` : s.symbol;
    const symbols = this.getSymbols(includeTkn);
    const totals = {};
    symbols.forEach((s) => {
      const column = prepareColumn(field, s);
      totals[column] = new Decimal(0);
      data.forEach((row) => {
        if (row[column]) {
          totals[column] = totals[column].add(row[column]);
        }
      });

      if (additionalFields) {
        additionalFields.forEach((field) => {
          symbols.forEach((s) => {
            const column = prepareColumn(field.field, s);
            totals[column] = new Decimal(0);
            data.forEach((row) => {
              totals[column] = totals[column].add(row[column]);
            });
          });
        });
      }
    });
    // create redis commands
    symbols.forEach((s) => {
      const column = prepareColumn(field, s);
      const key = `v3:${aggregates[0]}:${s.symbol}`;
      pipe['set'](key, totals[column].toFixed(s.decimals));
      if (expirySeconds) {
        pipe['expire'](key, expirySeconds);
      }

      if (additionalFields) {
        additionalFields.forEach((field, i) => {
          if (!aggregates[i + 1]) return;

          symbols.forEach((s) => {
            const column = prepareColumn(field.field, s);
            const key = `v3:${aggregates[i + 1]}:${s.symbol}`;
            pipe['set'](key, totals[column].toFixed(s.decimals));
            if (expirySeconds) {
              pipe['expire'](key, expirySeconds);
            }
          });
        });
      }
    });
  }

  async getValuesByPool(
    args: GetValuesArgs,
  ): Promise<unknown | SumDurationByPool> {
    const { pairs, keys, symbolize, pipe, includeTkn } = args;
    const symbols = this.getSymbols(includeTkn);
    const _pipe = pipe || this.getPipe();

    pairs.forEach((pair) => {
      keys.forEach((key) => {
        if (symbolize) {
          symbols.forEach((s) =>
            _pipe.get(`v3:pair:${pair.id}:${key}:${s.symbol}`),
          );
        } else {
          _pipe.get(`v3:pair:${pair.id}:${key}`);
        }
      });
    });

    if (pipe) {
      return _pipe;
    }

    const data = await this.exectuePipe(_pipe);
    const result = {};
    let index = 0;
    pairs.forEach((p) => {
      result[p.id] = {};
      keys.forEach((name) => {
        if (symbolize) {
          result[p.id][name] = {};
          symbols.forEach(
            (s) => (result[p.id][name][s.symbol] = data[index++][1]),
          );
        } else {
          result[p.id][name] = data[index++][1];
        }
      });
    });
    return result;
  }

  async setValuesByPool(args: GetValuesArgs, values: any[]): Promise<unknown> {
    const { pairs, keys, symbolize, pipe, includeTkn } = args;
    const symbols = this.getSymbols(includeTkn);
    const _pipe = pipe || this.getPipe();

    pairs.forEach((pair, i) => {
      keys.forEach((key) => {
        if (symbolize) {
          symbols.forEach((s) =>
            _pipe.set(`v3:pair:${pair.id}:${key}:${s.symbol}`, values[i]),
          );
        } else {
          _pipe.set(`v3:pair:${pair.id}:${key}`, values[i]);
        }
      });
    });

    if (pipe) {
      return _pipe;
    }

    await this.exectuePipe(pipe);
  }

  async getValues(args: GetValuesArgs): Promise<unknown | SumDurationByPool> {
    const { keys, symbolize, pipe, includeTkn } = args;
    const symbols = this.getSymbols(includeTkn);
    const _pipe = pipe || this.getPipe();

    keys.forEach((key) => {
      if (symbolize) {
        symbols.forEach((s) => _pipe.get(`v3:${key}:${s.symbol}`));
      } else {
        _pipe.get(`v3:${key}`);
      }
    });

    if (pipe) {
      return _pipe;
    }

    const data = await this.exectuePipe(pipe);
    const result = [];
    let index = 0;
    keys.forEach((key) => {
      if (symbolize) {
        result[key] = {};
        symbols.forEach((s) => (result[key][s.symbol] = data[index++][1]));
      } else {
        result[key] = data[index++][1];
      }
    });
    return result;
  }

  populateSymbolsByPool(
    result: unknown,
    pairs: Pair[],
    rawCache: unknown,
    symbols: Array<any>,
    names: string[],
    skipTkn?: boolean,
  ): any {
    pairs.forEach((_p, i) => {
      names.forEach((name) => {
        result['pairs'][i][name] = {};
        symbols.forEach((s) => {
          if (s.symbol === 'tkn' && skipTkn) return;

          result['index'] += 1;
          result['pairs'][i][name][s.symbol] =
            rawCache[result['index']][1] || '0';
        });
      });
    });
    return result;
  }

  populateFieldsByPool(
    result: unknown,
    pairs: Pair[],
    rawCache: unknown,
    fields: string[],
  ): any {
    pairs.forEach((p, i) => {
      fields.forEach((f) => {
        result['index'] += 1;
        result['pairs'][i][f] = rawCache[result['index']][1] || '0';
      });
    });
    return result;
  }

  populateFields(
    result: unknown,
    rawCache: unknown,
    symbols: Array<any>,
    fields: string[],
    skipTkn?: boolean,
  ): any {
    fields.forEach((field) => {
      if (!symbols) {
        result['index'] += 1;
        result[field] = rawCache[result['index']][1] || '0';
      } else {
        result[field] = {};
        symbols.forEach((s) => {
          if (s.symbol === 'tkn' && skipTkn) return;

          result['index'] += 1;
          const i = result['index'];
          result[field][s.symbol] = rawCache[i][1] || '0';
        });
      }
    });
    return result;
  }

  async setLastV3ProcessedBlock(block: Block): Promise<void> {
    await this.redis.client.set(
      `v3:${GlobalCacheKeys.lastProcessedBlock}`,
      JSON.stringify({
        number: block.id,
        timestamp: block.timestamp.getTime(),
      }),
    );
  }

  // shared wrappers for testing accessibility
  getSymbols(includeTkn: boolean): any[] {
    const SYMBOLS_WITH_BNT = JSON.parse(
      this.configService.get('SYMBOLS_WITH_BNT'),
    );
    if (includeTkn) {
      return [...SYMBOLS_WITH_BNT, { symbol: 'tkn' }];
    }
    return SYMBOLS_WITH_BNT;
  }

  async exectuePipe(pipe: unknown): Promise<any> {
    return pipe['exec']();
  }

  getPipe(): any {
    return this.redis.client.pipeline();
  }
}

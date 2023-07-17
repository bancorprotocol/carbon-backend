import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { RedisModule } from '../../redis/redis.module';
import { Repository } from 'typeorm';
import { CacheService, Expiries, GroupBy } from './cache.service';
import { Pool } from '../pair/pair.entity';
import { TokensTradedCacheKeys } from '../tokens-traded-event/tokens-traded-event.service';

describe('CacheService', () => {
  let service: CacheService;
  let repository: Repository<unknown>;
  let get: jest.Mock;

  beforeEach(async () => {
    repository = new Repository(Pool, null);
    get = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      imports: [RedisModule],
      providers: [
        CacheService,
        {
          provide: ConfigService,
          useValue: { get },
        },
      ],
    }).compile();

    service = module.get<CacheService>(CacheService);
  });

  describe('getValuesByPool', () => {
    it('retrieves cached data by symbols', async () => {
      const pipe = { get: jest.fn() };
      service.getPipe = () => pipe;
      const exectuePipe = jest.fn();
      exectuePipe.mockResolvedValue([
        [0, 1],
        [0, 2],
      ]);
      service.exectuePipe = exectuePipe;
      get.mockReturnValue(JSON.stringify([{ symbol: 'bnt' }]));
      const pools = [<Pool>{ id: 1 }];
      const data = await service.getValuesByPool({
        pools,
        keys: ['volume:24h'],
        symbolize: true,
        includeTkn: true,
      });
      expect(data).toEqual({ '1': { 'volume:24h': { bnt: 1, tkn: 2 } } });
    });

    it('retrieves cached data by field', async () => {
      const pipe = { get: jest.fn() };
      service.getPipe = () => pipe;
      const exectuePipe = jest.fn();
      exectuePipe.mockResolvedValue([
        [0, true],
        [0, false],
      ]);
      service.exectuePipe = exectuePipe;
      get.mockReturnValue(JSON.stringify([{ symbol: 'bnt' }]));
      const pools = [<Pool>{ id: 1 }, <Pool>{ id: 2 }];
      const data = await service.getValuesByPool({
        pools,
        keys: ['enabled'],
        field: 'enabled',
      });
      expect(data).toEqual({ '1': { enabled: true }, '2': { enabled: false } });
    });
  });

  describe('sumDurationByPool', () => {
    it('sets the cache', async () => {
      const exectuePipe = jest.fn();
      service.exectuePipe = exectuePipe;

      get.mockReturnValue(JSON.stringify([{ symbol: 'bnt' }]));
      repository.query = <any>jest.fn(() => {
        return [{ poolId: 1, bnt: 1, fee: 2 }];
      });

      await service.setSumDurationByPool({
        table: '',
        repository: repository,
        fromInterval: '24 hours',
        toInterval: '1 minute',
        additionalFields: [{ field: 'fee', name: 'fees:24h' }],
        name: 'volume:24h',
        expirySeconds: Expiries.DAY,
        includeTkn: true,
      });

      const commands = exectuePipe.mock.calls[0][0]._queue.map(
        (c) => `${c.name}:${c.args[0]}:${c.args[1]}`,
      );

      expect(commands).toEqual([
        'set:v3:pool:1:volume:24h:bnt:1',
        'expire:v3:pool:1:volume:24h:bnt:86400',
        'set:v3:pool:1:volume:24h:tkn:',
        'expire:v3:pool:1:volume:24h:tkn:86400',
        'set:v3:pool:1:fees:24h:bnt:',
        'expire:v3:pool:1:fees:24h:bnt:86400',
        'set:v3:pool:1:fees:24h:tkn:',
        'expire:v3:pool:1:fees:24h:tkn:86400',
      ]);
    });

    it('sets the cache without grouping by pool', async () => {
      const exectuePipe = jest.fn();
      service.exectuePipe = exectuePipe;

      get.mockReturnValue(JSON.stringify([{ symbol: 'bnt' }]));
      repository.query = <any>jest.fn(() => {
        return [
          { poolId: 1, bnt: 1, fee: 2 },
          { poolId: 2, bnt: 3, fee: 4 },
        ];
      });

      await service.setSumDurationByPool({
        table: '',
        repository: repository,
        fromInterval: '24 hours',
        toInterval: '1 minute',
        additionalFields: [{ field: 'fee', name: 'fees:24h' }],
        name: 'volume:24h',
        expirySeconds: Expiries.DAY,
        includeTkn: true,
        groupByPool: false,
      });

      const commands = exectuePipe.mock.calls[0][0]._queue.map(
        (c) => `${c.name}:${c.args[0]}:${c.args[1]}`,
      );

      expect(commands).toEqual([
        'set:v3:volume:24h:bnt:1',
        'expire:v3:volume:24h:bnt:86400',
        'set:v3:volume:24h:tkn:',
        'expire:v3:volume:24h:tkn:86400',
        'set:v3:fees:24h:bnt:',
        'expire:v3:fees:24h:bnt:86400',
        'set:v3:fees:24h:tkn:',
        'expire:v3:fees:24h:tkn:86400',
        'set:v3:volume:24h:bnt:3',
        'expire:v3:volume:24h:bnt:86400',
        'set:v3:volume:24h:tkn:',
        'expire:v3:volume:24h:tkn:86400',
        'set:v3:fees:24h:bnt:',
        'expire:v3:fees:24h:bnt:86400',
        'set:v3:fees:24h:tkn:',
        'expire:v3:fees:24h:tkn:86400',
      ]);
    });

    it('generates query', () => {
      get.mockReturnValue(JSON.stringify([{ symbol: 'bnt' }]));
      const query = service.sumDurationByPoolQuery(
        [{ field: 'fee', name: 'fees:24h' }],
        '',
        '',
        '',
        '',
      );
      expect(query).toEqual(
        `SELECT \"poolId\",sum(\"bnt\"::decimal) AS \"bnt\",sum(\"fee_bnt\"::decimal) AS \"fee_bnt\" FROM  WHERE \"timestamp\" >= NOW() - INTERVAL '' AND \"timestamp\" <= NOW() - INTERVAL '' GROUP BY \"poolId\"`,
      );
    });
  });

  // describe('latestValuesFromEventsByPool', () => {
  //   it('sets the cache by symbols', async () => {
  //     const exectuePipe = jest.fn();
  //     service.exectuePipe = exectuePipe;
  //     get.mockReturnValue(JSON.stringify([{ symbol: 'bnt' }]));
  //     const events = [
  //       { pool: { id: 1 }, bnt: 1 },
  //       { pool: { id: 2 }, bnt: 2 },
  //     ];
  //     await service.setLatestValuesFromEventsByPool({
  //       events,
  //       name: 'rate:latest',
  //       expirySeconds: 1,
  //       symbolize: true,
  //       includeTkn: true,
  //     });
  //     const commands = exectuePipe.mock.calls[0][0]._queue.map(c => `${c.name}:${c.args[0]}:${c.args[1]}`);
  //     expect(commands).toEqual([
  //       'set:v3:pool:1:rate:latest:bnt:1',
  //       'expire:v3:pool:1:rate:latest:bnt:1',
  //       'set:v3:pool:1:rate:latest:tkn:',
  //       'expire:v3:pool:1:rate:latest:tkn:1',
  //       'set:v3:pool:2:rate:latest:bnt:2',
  //       'expire:v3:pool:2:rate:latest:bnt:1',
  //       'set:v3:pool:2:rate:latest:tkn:',
  //       'expire:v3:pool:2:rate:latest:tkn:1',
  //     ]);
  //   });

  //   it('sets the cache by a field', async () => {
  //     const exectuePipe = jest.fn();
  //     service.exectuePipe = exectuePipe;
  //     get.mockReturnValue(JSON.stringify([]));
  //     const events = [
  //       { pool: { id: 1 }, enabled: 1 },
  //       { pool: { id: 2 }, enabled: 0 },
  //     ];
  //     await service.setLatestValuesFromEventsByPool({ events, name: 'enabled', expirySeconds: 1, field: 'enabled' });
  //     const commands = exectuePipe.mock.calls[0][0]._queue.map(c => `${c.name}:${c.args[0]}:${c.args[1]}`);
  //     expect(commands).toEqual([
  //       'set:v3:pool:1:enabled:1',
  //       'expire:v3:pool:1:enabled:1',
  //       'set:v3:pool:2:enabled:0',
  //       'expire:v3:pool:2:enabled:1',
  //     ]);
  //   });
  // });

  describe('latestValuesFromDb', () => {
    it('sets the cache by symbols', async () => {
      const exectuePipe = jest.fn();
      service.exectuePipe = exectuePipe;
      get.mockReturnValue(JSON.stringify([{ symbol: 'bnt' }]));
      jest.spyOn(service, 'fetchLatestValuesFromDb').mockResolvedValue([
        { poolId: 1, bnt: 1, tkn: 1, fee_bnt: 1, fee_tkn: 1 },
        { poolId: 2, bnt: 2, fee_bnt: 2, fee_tkn: 2 },
      ]);

      await service.setLatestValuesFromDb({
        toInterval: '24 hours',
        repository,
        name: 'rate:24hago',
        expirySeconds: 1,
        symbolize: true,
        includeTkn: true,
        additionalFields: [{ field: 'fee', name: 'fees:24hago' }],
        groupBy: GroupBy.Pool,
      });
      const commands = exectuePipe.mock.calls[0][0]._queue.map(
        (c) => `${c.name}:${c.args[0]}:${c.args[1]}`,
      );
      expect(commands).toEqual([
        'set:v3:pool:1:rate:24hago:bnt:1',
        'expire:v3:pool:1:rate:24hago:bnt:1',
        'set:v3:pool:1:rate:24hago:tkn:1',
        'expire:v3:pool:1:rate:24hago:tkn:1',
        'set:v3:pool:1:fees:24hago:bnt:1',
        'expire:v3:pool:1:fees:24hago:bnt:1',
        'set:v3:pool:1:fees:24hago:tkn:1',
        'expire:v3:pool:1:fees:24hago:tkn:1',
        'set:v3:pool:2:rate:24hago:bnt:2',
        'expire:v3:pool:2:rate:24hago:bnt:1',
        'set:v3:pool:2:rate:24hago:tkn:',
        'expire:v3:pool:2:rate:24hago:tkn:1',
        'set:v3:pool:2:fees:24hago:bnt:2',
        'expire:v3:pool:2:fees:24hago:bnt:1',
        'set:v3:pool:2:fees:24hago:tkn:2',
        'expire:v3:pool:2:fees:24hago:tkn:1',
      ]);
    });

    it('sets the cache by symbols with field', async () => {
      const exectuePipe = jest.fn();
      service.exectuePipe = exectuePipe;
      get.mockReturnValue(JSON.stringify([{ symbol: 'bnt' }]));
      jest.spyOn(service, 'fetchLatestValuesFromDb').mockResolvedValue([
        { poolId: 1, field_bnt: 1, field_tkn: 1, fee_bnt: 1, fee_tkn: 1 },
        { poolId: 2, field_bnt: 2, fee_bnt: 2, fee_tkn: 2 },
      ]);

      await service.setLatestValuesFromDb({
        toInterval: '24 hours',
        repository,
        name: 'rate:24hago',
        expirySeconds: 1,
        symbolize: true,
        includeTkn: true,
        field: 'field',
        additionalFields: [{ field: 'fee', name: 'fees:24hago' }],
        groupBy: GroupBy.Pool,
      });

      const commands = exectuePipe.mock.calls[0][0]._queue.map(
        (c) => `${c.name}:${c.args[0]}:${c.args[1]}`,
      );
      expect(commands).toEqual([
        'set:v3:pool:1:rate:24hago:bnt:1',
        'expire:v3:pool:1:rate:24hago:bnt:1',
        'set:v3:pool:1:rate:24hago:tkn:1',
        'expire:v3:pool:1:rate:24hago:tkn:1',
        'set:v3:pool:1:fees:24hago:bnt:1',
        'expire:v3:pool:1:fees:24hago:bnt:1',
        'set:v3:pool:1:fees:24hago:tkn:1',
        'expire:v3:pool:1:fees:24hago:tkn:1',
        'set:v3:pool:2:rate:24hago:bnt:2',
        'expire:v3:pool:2:rate:24hago:bnt:1',
        'set:v3:pool:2:rate:24hago:tkn:',
        'expire:v3:pool:2:rate:24hago:tkn:1',
        'set:v3:pool:2:fees:24hago:bnt:2',
        'expire:v3:pool:2:fees:24hago:bnt:1',
        'set:v3:pool:2:fees:24hago:tkn:2',
        'expire:v3:pool:2:fees:24hago:tkn:1',
      ]);
    });

    it('sets the cache by a field', async () => {
      const exectuePipe = jest.fn();
      service.exectuePipe = exectuePipe;
      get.mockReturnValue(JSON.stringify([]));
      jest.spyOn(service, 'fetchLatestValuesFromDb').mockResolvedValue([
        { poolId: 1, tradingEnabled: 1 },
        { poolId: 2, tradingEnabled: 0 },
      ]);

      await service.setLatestValuesFromDb({
        toInterval: '24 hours',
        repository,
        name: 'tradingEnabled:24hago',
        expirySeconds: 1,
        field: 'tradingEnabled',
        groupBy: GroupBy.Pool,
      });
      const commands = exectuePipe.mock.calls[0][0]._queue.map(
        (c) => `${c.name}:${c.args[0]}:${c.args[1]}`,
      );
      expect(commands).toEqual([
        'set:v3:pool:1:tradingEnabled:24hago:1',
        'expire:v3:pool:1:tradingEnabled:24hago:1',
        'set:v3:pool:2:tradingEnabled:24hago:0',
        'expire:v3:pool:2:tradingEnabled:24hago:1',
      ]);
    });

    it('sets the cache by a field without grouping', async () => {
      const exectuePipe = jest.fn();
      service.exectuePipe = exectuePipe;
      get.mockReturnValue(JSON.stringify([]));
      jest.spyOn(service, 'fetchLatestValuesFromDb').mockResolvedValue([
        { poolId: 1, tradingEnabled: 1, bnt: 1, tkn: 2 },
        { poolId: 2, tradingEnabled: 0, bnt: 1, tkn: 2 },
      ]);

      await service.setLatestValuesFromDb({
        toInterval: '24 hours',
        repository,
        name: 'tradingEnabled:24hago',
        expirySeconds: 1,
        field: 'tradingEnabled',
      });
      const commands = exectuePipe.mock.calls[0][0]._queue.map(
        (c) => `${c.name}:${c.args[0]}:${c.args[1]}`,
      );
      expect(commands).toEqual([
        'set:v3:tradingEnabled:24hago:1',
        'expire:v3:tradingEnabled:24hago:1',
        'set:v3:tradingEnabled:24hago:0',
        'expire:v3:tradingEnabled:24hago:1',
      ]);
    });

    it('sets the cache per poolCollection', async () => {
      const exectuePipe = jest.fn();
      service.exectuePipe = exectuePipe;
      get.mockReturnValue(JSON.stringify([]));
      jest.spyOn(service, 'fetchLatestValuesFromDb').mockResolvedValue([
        { poolCollectionId: 1, tradingEnabled: 1 },
        { poolCollectionId: 2, tradingEnabled: 0 },
      ]);

      await service.setLatestValuesFromDb({
        repository,
        name: 'tradingEnabled:24hago',
        expirySeconds: 1,
        field: 'tradingEnabled',
        groupBy: GroupBy.PoolCollection,
      });
      const commands = exectuePipe.mock.calls[0][0]._queue.map(
        (c) => `${c.name}:${c.args[0]}:${c.args[1]}`,
      );
      expect(commands).toEqual([
        'set:v3:poolCollection:1:tradingEnabled:24hago:1',
        'expire:v3:poolCollection:1:tradingEnabled:24hago:1',
        'set:v3:poolCollection:2:tradingEnabled:24hago:0',
        'expire:v3:poolCollection:2:tradingEnabled:24hago:1',
      ]);
    });

    it('aggregates total values', async () => {
      const exectuePipe = jest.fn();
      service.exectuePipe = exectuePipe;
      get.mockReturnValue(JSON.stringify([{ symbol: 'bnt', decimals: 18 }]));
      jest.spyOn(service, 'fetchLatestValuesFromDb').mockResolvedValue([
        { poolId: 1, bnt: 1, tkn: 1, fee_bnt: 1, fee_tkn: 1 },
        { poolId: 2, bnt: 200, fee_bnt: 300, fee_tkn: 200 },
      ]);

      await service.setLatestValuesFromDb({
        repository,
        name: 'rate:24hago',
        expirySeconds: 1,
        symbolize: true,
        includeTkn: true,
        additionalFields: [{ field: 'fee', name: 'fees:24hago' }],
        groupBy: GroupBy.Pool,
        aggregates: [
          TokensTradedCacheKeys.totalVolume24h,
          TokensTradedCacheKeys.totalFees24h,
        ],
      });
      const commands = exectuePipe.mock.calls[0][0]._queue.map(
        (c) => `${c.name}:${c.args[0]}:${c.args[1]}`,
      );
      expect(commands).toEqual([
        'set:v3:pool:1:rate:24hago:bnt:1',
        'expire:v3:pool:1:rate:24hago:bnt:1',
        'set:v3:pool:1:rate:24hago:tkn:1',
        'expire:v3:pool:1:rate:24hago:tkn:1',
        'set:v3:pool:1:fees:24hago:bnt:1',
        'expire:v3:pool:1:fees:24hago:bnt:1',
        'set:v3:pool:1:fees:24hago:tkn:1',
        'expire:v3:pool:1:fees:24hago:tkn:1',
        'set:v3:pool:2:rate:24hago:bnt:200',
        'expire:v3:pool:2:rate:24hago:bnt:1',
        'set:v3:pool:2:rate:24hago:tkn:',
        'expire:v3:pool:2:rate:24hago:tkn:1',
        'set:v3:pool:2:fees:24hago:bnt:300',
        'expire:v3:pool:2:fees:24hago:bnt:1',
        'set:v3:pool:2:fees:24hago:tkn:200',
        'expire:v3:pool:2:fees:24hago:tkn:1',
        'set:v3:volume:24h:bnt:201.000000000000000000',
        'expire:v3:volume:24h:bnt:1',
        'set:v3:fees:24h:bnt:301.000000000000000000',
        'expire:v3:fees:24h:bnt:1',
        'set:v3:fees:24h:tkn:201',
        'expire:v3:fees:24h:tkn:1',
        'set:v3:volume:24h:tkn:1',
        'expire:v3:volume:24h:tkn:1',
        'set:v3:fees:24h:bnt:301.000000000000000000',
        'expire:v3:fees:24h:bnt:1',
        'set:v3:fees:24h:tkn:201',
        'expire:v3:fees:24h:tkn:1',
      ]);
    });

    it('sets the cache by symbols, without grouping', async () => {
      const exectuePipe = jest.fn();
      service.exectuePipe = exectuePipe;
      get.mockReturnValue(JSON.stringify([{ symbol: 'bnt', decimals: 18 }]));
      jest.spyOn(service, 'fetchLatestValuesFromDb').mockResolvedValue([
        { poolId: 1, bnt: 1, tkn: 1, fee_bnt: 1, fee_tkn: 1 },
        { poolId: 2, bnt: 200, fee_bnt: 300, fee_tkn: 200 },
      ]);

      await service.setLatestValuesFromDb({
        repository,
        name: 'rate:24hago',
        expirySeconds: 1,
        symbolize: true,
        includeTkn: true,
        additionalFields: [{ field: 'fee', name: 'fees:24hago' }],
      });
      const commands = exectuePipe.mock.calls[0][0]._queue.map(
        (c) => `${c.name}:${c.args[0]}:${c.args[1]}`,
      );
      expect(commands).toEqual([
        'set:v3:rate:24hago:bnt:1',
        'expire:v3:rate:24hago:bnt:1',
        'set:v3:rate:24hago:tkn:1',
        'expire:v3:rate:24hago:tkn:1',
        'set:v3:fees:24hago:bnt:1',
        'expire:v3:fees:24hago:bnt:1',
        'set:v3:fees:24hago:tkn:1',
        'expire:v3:fees:24hago:tkn:1',
        'set:v3:rate:24hago:bnt:200',
        'expire:v3:rate:24hago:bnt:1',
        'set:v3:rate:24hago:tkn:',
        'expire:v3:rate:24hago:tkn:1',
        'set:v3:fees:24hago:bnt:300',
        'expire:v3:fees:24hago:bnt:1',
        'set:v3:fees:24hago:tkn:200',
        'expire:v3:fees:24hago:tkn:1',
      ]);
    });
  });
});
